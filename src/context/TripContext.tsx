'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { City, Destination, TransportLeg, Hotel, HotelStay, Flight, TrainOption, Place, CITIES, DEFAULT_TRANSPORT_LEGS } from '@/data/mockData';

export interface BookingDoc {
  id: string;
  name: string;
  storagePath: string;
  url: string;
  mimeType: string;
  matchCities: string[];
  docType?: 'hotel' | 'transport' | 'general';
  uploadedAt: string;
}

export interface CityActivityCached {
  name: string;
  category: string;
  durationMin: number;
  bestTime: string;
  note?: string;
  openingHours?: string;
  ticketPrice?: string;
  dayIndex?: number;
}

export interface DeepPlanData {
  customActivities: Record<number, Array<{ name: string; time: string }>>;
  dayNotes: Record<number, string>;
  dayStartTimes: Record<number, string>;
  cityActivities?: Record<string, CityActivityCached[]>;
  /** AI-suggested day themes per city (e.g., ["Historic & Cultural", "Outdoor & Nature"]) */
  dayThemes?: Record<string, string[]>;
  /** Persisted drag-reorder: day number → ordered stop IDs */
  activityOrder?: Record<number, string[]>;
  /** AI-generated meal costs per city: { currency, breakfast, lunch, dinner } */
  mealCosts?: Record<string, { currency: string; breakfast: number; lunch: number; dinner: number }>;
  /** AI-generated local transport costs per city */
  localTransport?: Record<string, { currency: string; metroSingleRide: number; busSingleRide: number; taxiPerKm: number; dailyPass: number }>;
  /** Activities user explicitly removed — never show again unless user re-adds */
  removedActivities?: Record<string, string[]>; // cityKey → list of removed activity names
  /** User-edited times for meals, return to hotel, overnight per day */
  editedTimes?: Record<string, string>; // "day_3_breakfast" | "day_3_dinner" | "day_3_Return_to_hotel" → "19:30"
  /** Date when AI activities were last generated (YYYY-MM-DD) — used to invalidate stale caches per trip */
  cacheGeneratedAt?: string;
}

interface TripState {
  tripId: string | null;
  from: City;
  fromAddress: string;
  destinations: Destination[];
  userPlaces: Place[];
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  tripType: 'roundTrip' | 'oneWay';
  transportLegs: TransportLeg[];
  bookingDocs: BookingDoc[];
  deepPlanData: DeepPlanData;
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
}

interface TripActions {
  setFrom: (city: City) => void;
  setFromAddress: (address: string) => void;
  addDestination: (city: City, nights?: number, hotel?: Hotel, transport?: { flight?: Flight; train?: TrainOption; resolvedAirports?: any }) => void;
  removeDestination: (id: string) => void;
  updateNights: (id: string, nights: number) => void;
  updateDestinationNotes: (destId: string, notes: string) => void;
  addPlace: (place: Place) => void;
  removePlace: (placeId: string) => void;
  reorderPlaces: (newOrder: Place[]) => void;
  updatePlaceNights: (placeId: string, nights: number) => void;
  groupPlacesIntoCities: () => void;
  setDepartureDate: (date: string) => void;
  setAdults: (n: number) => void;
  setChildren: (n: number) => void;
  setInfants: (n: number) => void;
  setTripType: (type: 'roundTrip' | 'oneWay') => void;
  updateTransportLeg: (id: string, updates: Partial<TransportLeg>) => void;
  changeTransportType: (id: string, type: TransportLeg['type']) => void;
  selectFlight: (legId: string, flight: Flight) => void;
  selectTrain: (legId: string, train: TrainOption) => void;
  updateDestinationHotel: (destId: string, hotel: Hotel) => void;
  addAdditionalHotel: (destId: string, hotel: Hotel, nights: number) => void;
  removeAdditionalHotel: (destId: string, hotelIndex: number) => void;
  updateAdditionalHotelNights: (destId: string, hotelIndex: number, nights: number) => void;
  moveDestination: (id: string, direction: 'left' | 'right') => void;
  reorderDestinations: (newOrder: Destination[]) => void;
  addBookingDoc: (doc: BookingDoc) => void;
  removeBookingDoc: (docId: string) => void;
  setBookingDocs: (docs: BookingDoc[]) => void;
  updateDeepPlanData: (data: Partial<DeepPlanData>) => void;
  buildFullTrip: (config: {
    from: City; fromAddress: string;
    departureDate: string; adults: number; children: number; infants: number;
    tripType: 'roundTrip' | 'oneWay';
    destinations: Array<{ city: City; nights: number; hotel?: Hotel }>;
    transports: Array<{ flight?: Flight; train?: TrainOption; resolvedAirports?: any } | null>;
  }) => void;
  saveTrip: () => Promise<string | null>;
  loadTrip: (tripId: string) => Promise<void>;
  resetTrip: () => void;
  clearTripId: () => void;
}

// Combined type for backward compatibility with useTrip()
interface TripContextType extends TripState, TripActions {}

const defaultState: TripState = {
  tripId: null,
  from: { name: '', country: '', fullName: '' },
  fromAddress: '',
  destinations: [],
  userPlaces: [],
  departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
  adults: 1,
  children: 0,
  infants: 0,
  tripType: 'roundTrip',
  transportLegs: [],
  bookingDocs: [],
  deepPlanData: { customActivities: {}, dayNotes: {}, dayStartTimes: {} },
  isSaving: false,
  isDirty: false,
  lastSavedAt: null,
};

// Split into two contexts: state changes frequently, actions are stable references
const TripStateContext = createContext<TripState | null>(null);
const TripActionsContext = createContext<TripActions | null>(null);
// Legacy combined context for backward compatibility
const TripContext = createContext<TripContextType | null>(null);

function dirty(s: TripState): TripState {
  return { ...s, isDirty: true };
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TripState>(defaultState);

  // Ref always holds the latest state — used by saveTrip to avoid stale closures
  const stateRef = useRef<TripState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Mutex: queues saves sequentially so concurrent calls don't race
  const saveMutexRef = useRef<Promise<string | null>>(Promise.resolve(null));

  const setFrom = useCallback((city: City) => setState(s => dirty({ ...s, from: city })), []);
  const setFromAddress = useCallback((address: string) => setState(s => dirty({ ...s, fromAddress: address })), []);

  const addDestination = useCallback((city: City, nights = 2, hotel?: Hotel, transport?: { flight?: Flight; train?: TrainOption; resolvedAirports?: any }) => {
    const newDest: Destination = { id: `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, city, nights, selectedHotel: hotel || null, places: [] };
    const newLeg = transport?.flight ? {
      id: `tl${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'flight' as const, duration: transport.flight.duration, distance: transport.flight.route,
      selectedFlight: transport.flight, selectedTrain: null,
      departureTime: transport.flight.departure, arrivalTime: transport.flight.arrival,
      resolvedAirports: transport.resolvedAirports || null,
    } : transport?.train ? {
      id: `tl${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'train' as const, duration: transport.train.duration, distance: '~',
      selectedFlight: null, selectedTrain: transport.train,
      departureTime: transport.train.departure, arrivalTime: transport.train.arrival,
    } : { id: `tl${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'drive' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null };
    setState(s => {
      const newDests = [...s.destinations, newDest];
      const newLegs = [...s.transportLegs, newLeg];
      // For round trips, ensure there's always a return leg
      // Expected: destinations.length + 1 legs (one between each pair + return)
      const expectedLegs = s.tripType === 'roundTrip' ? newDests.length + 1 : newDests.length;
      while (newLegs.length < expectedLegs) {
        newLegs.push({ id: `tl-ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'flight' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null });
      }
      return dirty({ ...s, destinations: newDests, transportLegs: newLegs });
    });
  }, []);

  const removeDestination = useCallback((id: string) => {
    setState(s => {
      const idx = s.destinations.findIndex(d => d.id === id);
      if (idx < 0) return s;
      const newDests = s.destinations.filter(d => d.id !== id);
      const newLegs = [...s.transportLegs];
      if (idx < newLegs.length) {
        newLegs.splice(idx, 1);
        // The leg that now occupies position idx has wrong from/to cities — clear its selections
        if (idx < newLegs.length) {
          newLegs[idx] = { ...newLegs[idx], selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null, duration: '~', distance: '~' };
        }
        // Also clear the leg before the removed position — its "to" city changed
        if (idx > 0 && idx - 1 < newLegs.length) {
          newLegs[idx - 1] = { ...newLegs[idx - 1], selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null, duration: '~', distance: '~' };
        }
      }
      // Trim excess legs for round trips (should have newDests.length + 1 max)
      const expectedLegs = s.tripType === 'roundTrip' ? newDests.length + 1 : newDests.length;
      while (newLegs.length > expectedLegs && expectedLegs > 0) {
        newLegs.pop();
      }
      return dirty({ ...s, destinations: newDests, transportLegs: newLegs });
    });
  }, []);

  const updateNights = useCallback((id: string, nights: number) => {
    setState(s => dirty({ ...s, destinations: s.destinations.map(d => d.id === id ? { ...d, nights: Math.max(0, nights) } : d) }));
  }, []);

  const moveDestination = useCallback((id: string, direction: 'left' | 'right') => {
    setState(s => {
      const idx = s.destinations.findIndex(d => d.id === id);
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= s.destinations.length) return s;
      const newDests = [...s.destinations];
      [newDests[idx], newDests[swapIdx]] = [newDests[swapIdx], newDests[idx]];
      // Swap corresponding transport legs and clear their selections (cities changed)
      const newLegs = [...s.transportLegs];
      if (idx < newLegs.length && swapIdx < newLegs.length) {
        [newLegs[idx], newLegs[swapIdx]] = [newLegs[swapIdx], newLegs[idx]];
        // Clear selections on swapped legs + the adjacent leg after the pair (its "from" city changed)
        const clearLeg = (i: number) => { if (i >= 0 && i < newLegs.length) newLegs[i] = { ...newLegs[i], selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null, duration: '~', distance: '~' }; };
        clearLeg(idx);
        clearLeg(swapIdx);
        clearLeg(Math.max(idx, swapIdx) + 1);
      }
      return dirty({ ...s, destinations: newDests, transportLegs: newLegs });
    });
  }, []);

  const reorderDestinations = useCallback((newOrder: Destination[]) => {
    setState(s => {
      // Clear all transport leg selections — city pairs changed after reorder
      const clearedLegs = s.transportLegs.map(l => ({
        ...l, selectedFlight: null, selectedTrain: null,
        departureTime: null, arrivalTime: null, duration: '~', distance: '~',
      }));
      return dirty({ ...s, destinations: newOrder, transportLegs: clearedLegs });
    });
  }, []);

  // ─── Booking Documents ──────────────────────────────────────────────────
  const addBookingDoc = useCallback((doc: BookingDoc) => {
    setState(s => dirty({ ...s, bookingDocs: [...s.bookingDocs, doc] }));
  }, []);

  const removeBookingDoc = useCallback((docId: string) => {
    setState(s => dirty({ ...s, bookingDocs: s.bookingDocs.filter(d => d.id !== docId) }));
  }, []);

  const setBookingDocs = useCallback((docs: BookingDoc[]) => {
    setState(s => dirty({ ...s, bookingDocs: docs }));
  }, []);

  const updateDeepPlanData = useCallback((data: Partial<DeepPlanData>) => {
    setState(s => {
      const prev = s.deepPlanData || { customActivities: {}, dayNotes: {}, dayStartTimes: {} };
      // Deep merge nested Record objects so parallel updates don't overwrite each other
      const merged = { ...prev, ...data };
      if (data.cityActivities) merged.cityActivities = { ...prev.cityActivities, ...data.cityActivities };
      if (data.dayThemes) merged.dayThemes = { ...prev.dayThemes, ...data.dayThemes };
      if (data.mealCosts) merged.mealCosts = { ...prev.mealCosts, ...data.mealCosts };
      if (data.localTransport) merged.localTransport = { ...prev.localTransport, ...data.localTransport };
      if (data.removedActivities) merged.removedActivities = { ...prev.removedActivities, ...data.removedActivities };
      if (data.editedTimes) merged.editedTimes = { ...prev.editedTimes, ...data.editedTimes };
      if (data.activityOrder) merged.activityOrder = { ...prev.activityOrder, ...data.activityOrder };
      return dirty({ ...s, deepPlanData: merged });
    });
  }, []);

  // Build entire trip in one atomic setState (no stale state issues)
  const buildFullTrip = useCallback((config: {
    from: City; fromAddress: string;
    departureDate: string; adults: number; children: number; infants: number;
    tripType: 'roundTrip' | 'oneWay';
    destinations: Array<{ city: City; nights: number; hotel?: Hotel }>;
    transports: Array<{ flight?: Flight; train?: TrainOption; resolvedAirports?: any } | null>;
  }) => {
    const dests: Destination[] = config.destinations.map((d, i) => ({
      id: `d${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      city: d.city, nights: d.nights, selectedHotel: d.hotel || null, places: [],
    }));

    const makeLeg = (t: { flight?: Flight; train?: TrainOption; resolvedAirports?: any } | null, idx: number) => {
      const id = `tl${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      if (t?.flight) return { id, type: 'flight' as const, duration: t.flight.duration, distance: t.flight.route, selectedFlight: t.flight, selectedTrain: null, departureTime: t.flight.departure, arrivalTime: t.flight.arrival, resolvedAirports: t.resolvedAirports || null };
      if (t?.train) return { id, type: 'train' as const, duration: t.train.duration, distance: '~', selectedFlight: null, selectedTrain: t.train, departureTime: t.train.departure, arrivalTime: t.train.arrival };
      return { id, type: 'drive' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null };
    };

    // Create legs: one per destination + optional return
    const expectedLegs = config.tripType === 'roundTrip' ? dests.length + 1 : dests.length;
    const legs: any[] = [];
    for (let i = 0; i < expectedLegs; i++) {
      legs.push(makeLeg(config.transports[i] || null, i));
    }

    setState({
      ...defaultState,
      from: config.from, fromAddress: config.fromAddress,
      departureDate: config.departureDate,
      adults: config.adults, children: config.children, infants: config.infants,
      tripType: config.tripType,
      destinations: dests, transportLegs: legs,
      bookingDocs: [], deepPlanData: { customActivities: {}, dayNotes: {}, dayStartTimes: {} },
      isDirty: true, tripId: null,
    });
    try { sessionStorage.removeItem('currentTripId'); } catch {}
  }, []);

  // ─── Places (user-selected attractions) ──────────────────────────────────
  const addPlace = useCallback((place: Place) => {
    setState(s => dirty({ ...s, userPlaces: [...s.userPlaces, place] }));
  }, []);

  const removePlace = useCallback((placeId: string) => {
    setState(s => dirty({ ...s, userPlaces: s.userPlaces.filter(p => p.id !== placeId) }));
  }, []);

  const reorderPlaces = useCallback((newOrder: Place[]) => {
    setState(s => dirty({ ...s, userPlaces: newOrder }));
  }, []);

  const updatePlaceNights = useCallback((placeId: string, nights: number) => {
    setState(s => dirty({ ...s, userPlaces: s.userPlaces.map(p => p.id === placeId ? { ...p, nights: Math.max(0, nights) } : p) }));
  }, []);

  const groupPlacesIntoCities = useCallback(() => {
    setState(s => {
      if (s.userPlaces.length === 0) return s;

      // First pass: normalize parentCity using fullName cross-reference
      // When Place Details API fails, parentCity falls back to place name.
      // Detect this by checking if parentCity appears in another place's fullName
      // and vice versa — then unify them under the same city key.
      const normalizedPlaces = s.userPlaces.map(place => {
        let pc = place.parentCity;
        // If parentCity equals place name (likely API fallback), try to extract
        // actual city from fullName (e.g., "Notre Dame, Paris, France" → "Paris")
        // But skip if the place itself IS a city (name matches first part of fullName)
        const pcLower = pc.toLowerCase();
        const nameLower = place.name.toLowerCase();
        // Also detect when parentCity contains the place name or vice versa
        // e.g., parentCity="Louvre Museum" and name="Louvre", or parentCity="Louvre" and name="Louvre Museum"
        const parentCityLooksLikePlaceName = pc === place.name ||
          pcLower.includes(nameLower) || nameLower.includes(pcLower);
        if (parentCityLooksLikePlaceName && place.fullName) {
          const parts = place.fullName.split(',').map(s => s.trim());
          const nameIsCity = parts[0]?.toLowerCase() === place.name.toLowerCase();
          if (parts.length >= 3 && !nameIsCity) {
            // Try matching a known city in the fullName parts
            const knownPart = parts.find(p => CITIES.some(c => c.name.toLowerCase() === p.toLowerCase()));
            if (knownPart) pc = knownPart;
            else pc = parts[1]; // Second part is usually the city
          } else if (parts.length === 2 && !nameIsCity) {
            // "Place, Country" — check if any other place has this in its fullName
            pc = parts[0]; // Keep as-is, but this is a city-level entry
          }
        }
        return { ...place, parentCity: pc };
      });

      // Second pass: merge places that share the same city in their fullName
      // e.g., if "Louvre Museum" has parentCity "Paris" and "Notre Dame" has
      // parentCity "Notre Dame" but fullName "Notre Dame, Paris, France",
      // detect "Paris" in the fullName and merge
      const cityKeysList = Array.from(new Set(normalizedPlaces.map(p => p.parentCity.toLowerCase())));
      const finalPlaces = normalizedPlaces.map(place => {
        const pc = place.parentCity.toLowerCase();
        // Check if this place's parentCity is already a real city group
        if (CITIES.some(c => c.name.toLowerCase() === pc)) return place;
        // If not, check if a known city key appears in this place's fullName
        for (let ki = 0; ki < cityKeysList.length; ki++) {
          const key = cityKeysList[ki];
          if (key !== pc && place.fullName.toLowerCase().includes(key)) {
            // Check if the key is a real city (not another place name)
            const isRealCity = CITIES.some(c => c.name.toLowerCase() === key) ||
              normalizedPlaces.some(p => p.parentCity.toLowerCase() === key && p.parentCity !== p.name);
            if (isRealCity) {
              const match = normalizedPlaces.find(p => p.parentCity.toLowerCase() === key);
              if (match) return { ...place, parentCity: match.parentCity };
            }
          }
        }
        return place;
      });

      // Group places by parentCity (case-insensitive), preserving first-seen order
      const cityGroups = new Map<string, Place[]>();
      const cityOrder: string[] = [];
      for (const place of finalPlaces) {
        const key = place.parentCity.toLowerCase();
        if (!cityGroups.has(key)) {
          cityGroups.set(key, []);
          cityOrder.push(key);
        }
        cityGroups.get(key)!.push(place);
      }

      const newDests: Destination[] = cityOrder.map(key => {
        const places = cityGroups.get(key)!;
        const first = places[0];
        const totalNights = places.reduce((sum, p) => sum + p.nights, 0);
        // Resolve city from first place — try matching a known city
        const knownCity = CITIES.find(c => c.name.toLowerCase() === first.parentCity.toLowerCase());
        const city: City = knownCity || {
          name: first.parentCity,
          country: first.country,
          fullName: `${first.parentCity}, ${first.country}`,
        };
        return {
          id: `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          city,
          nights: totalNights,
          selectedHotel: null,
          places,
        };
      });

      // Build transport legs
      const expectedLegs = s.tripType === 'roundTrip' ? newDests.length + 1 : newDests.length;
      const newLegs: TransportLeg[] = [];
      for (let i = 0; i < expectedLegs; i++) {
        newLegs.push({
          id: `tl${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
          type: 'drive' as const,
          duration: '~',
          distance: '~',
          selectedFlight: null,
          selectedTrain: null,
          departureTime: null,
          arrivalTime: null,
        });
      }

      return dirty({ ...s, destinations: newDests, transportLegs: newLegs });
    });
  }, []);

  const setDepartureDate = useCallback((date: string) => setState(s => dirty({ ...s, departureDate: date })), []);
  const setAdults = useCallback((n: number) => setState(s => dirty({ ...s, adults: Math.max(1, n) })), []);
  const setChildren = useCallback((n: number) => setState(s => dirty({ ...s, children: Math.max(0, n) })), []);
  const setInfants = useCallback((n: number) => setState(s => dirty({ ...s, infants: Math.max(0, n) })), []);
  // Store removed return leg so it can be restored when switching back to round trip
  const removedReturnLegRef = useRef<TransportLeg | null>(null);

  const setTripType = useCallback((type: 'roundTrip' | 'oneWay') => setState(s => {
    const newLegs = [...s.transportLegs];
    const expectedLegs = type === 'roundTrip' ? s.destinations.length + 1 : s.destinations.length;
    // Add return leg if switching to round trip — restore saved leg if available
    while (newLegs.length < expectedLegs) {
      if (removedReturnLegRef.current) {
        newLegs.push(removedReturnLegRef.current);
        removedReturnLegRef.current = null;
      } else {
        newLegs.push({ id: `tl-ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'flight' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null });
      }
    }
    // Remove extra leg if switching to one way — save it for restoration
    while (newLegs.length > expectedLegs && newLegs.length > 0) {
      removedReturnLegRef.current = newLegs.pop()!;
    }
    return dirty({ ...s, tripType: type, transportLegs: newLegs });
  }), []);

  const updateTransportLeg = useCallback((id: string, updates: Partial<TransportLeg>) => {
    setState(s => dirty({ ...s, transportLegs: s.transportLegs.map(l => l.id === id ? { ...l, ...updates } : l) }));
  }, []);

  const changeTransportType = useCallback((id: string, type: TransportLeg['type']) => {
    setState(s => dirty({
      ...s,
      transportLegs: s.transportLegs.map(l =>
        l.id === id ? { ...l, type, selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null } : l
      ),
    }));
  }, []);

  const selectFlight = useCallback((legId: string, flight: Flight) => {
    setState(s => dirty({
      ...s,
      transportLegs: s.transportLegs.map(l =>
        l.id === legId ? { ...l, type: 'flight' as const, selectedFlight: flight, selectedTrain: null, departureTime: flight.departure, arrivalTime: flight.arrival, duration: flight.duration, distance: flight.route } : l
      ),
    }));
  }, []);

  const selectTrain = useCallback((legId: string, train: TrainOption) => {
    setState(s => dirty({
      ...s,
      transportLegs: s.transportLegs.map(l =>
        l.id === legId ? { ...l, type: 'train' as const, selectedFlight: null, selectedTrain: train, departureTime: train.departure, arrivalTime: train.arrival, duration: train.duration } : l
      ),
    }));
  }, []);

  const updateDestinationHotel = useCallback((destId: string, hotel: Hotel) => {
    setState(s => dirty({ ...s, destinations: s.destinations.map(d => d.id === destId ? { ...d, selectedHotel: hotel } : d) }));
  }, []);

  const addAdditionalHotel = useCallback((destId: string, hotel: Hotel, nights: number) => {
    setState(s => dirty({
      ...s,
      destinations: s.destinations.map(d => {
        if (d.id !== destId) return d;
        const existing = d.additionalHotels || [];
        return { ...d, additionalHotels: [...existing, { hotel, nights }] };
      }),
    }));
  }, []);

  const removeAdditionalHotel = useCallback((destId: string, hotelIndex: number) => {
    setState(s => dirty({
      ...s,
      destinations: s.destinations.map(d => {
        if (d.id !== destId) return d;
        const existing = d.additionalHotels || [];
        return { ...d, additionalHotels: existing.filter((_, i) => i !== hotelIndex) };
      }),
    }));
  }, []);

  const updateAdditionalHotelNights = useCallback((destId: string, hotelIndex: number, nights: number) => {
    setState(s => dirty({
      ...s,
      destinations: s.destinations.map(d => {
        if (d.id !== destId) return d;
        const existing = d.additionalHotels || [];
        return { ...d, additionalHotels: existing.map((h, i) => i === hotelIndex ? { ...h, nights: Math.max(1, nights) } : h) };
      }),
    }));
  }, []);

  const updateDestinationNotes = useCallback((destId: string, notes: string) => {
    setState(s => dirty({ ...s, destinations: s.destinations.map(d => d.id === destId ? { ...d, notes } : d) }));
  }, []);

  // ─── Save trip to database ──────────────────────────────────────────────────
  const saveTrip = useCallback(async (): Promise<string | null> => {
    const doSave = async (): Promise<string | null> => {
      // Read the latest state from ref — no stale closure or setState hack needed
      const s = stateRef.current;
      const saveTripId = s.tripId; // Capture tripId at save start for staleness check

      setState(prev => ({ ...prev, isSaving: true }));

      const hasDeepPlanData = Object.keys(s.deepPlanData.customActivities || {}).length > 0 || Object.keys(s.deepPlanData.dayNotes || {}).length > 0 || Object.keys(s.deepPlanData.dayStartTimes || {}).length > 0 || Object.keys(s.deepPlanData.cityActivities || {}).length > 0 || Object.keys(s.deepPlanData.mealCosts || {}).length > 0 || Object.keys(s.deepPlanData.localTransport || {}).length > 0 || Object.keys(s.deepPlanData.removedActivities || {}).length > 0 || Object.keys(s.deepPlanData.editedTimes || {}).length > 0 || Object.keys(s.deepPlanData.activityOrder || {}).length > 0 || Object.keys(s.deepPlanData.dayThemes || {}).length > 0;

      const payload: Record<string, any> = {
        from: s.from,
        fromAddress: s.fromAddress,
        bookingDocs: s.bookingDocs.length > 0 ? s.bookingDocs : undefined,
        deepPlanData: hasDeepPlanData ? s.deepPlanData : undefined,
        destinations: s.destinations.map(d => ({ city: d.city, nights: d.nights, selectedHotel: d.selectedHotel, additionalHotels: d.additionalHotels || [], notes: d.notes, places: d.places || [] })),
        transportLegs: s.transportLegs.map(l => ({
          type: l.type, duration: l.duration, distance: l.distance,
          departureTime: l.departureTime, arrivalTime: l.arrivalTime,
          selectedFlight: l.selectedFlight ? { ...l.selectedFlight, _resolvedAirports: l.resolvedAirports || undefined } : null,
          selectedTrain: l.selectedTrain,
        })),
        departureDate: s.departureDate,
        adults: s.adults,
        children: s.children,
        infants: s.infants,
        tripType: s.tripType,
      };
      // Optimistic locking: send last known server timestamp to detect multi-tab conflicts
      if (s.tripId && s.lastSavedAt) {
        payload.expectedUpdatedAt = s.lastSavedAt instanceof Date ? s.lastSavedAt.toISOString() : s.lastSavedAt;
      }

      try {
        const method = s.tripId ? 'PUT' : 'POST';
        const url = s.tripId ? `/api/trips/${s.tripId}` : '/api/trips';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();

        // Handle stale save conflict (another tab saved first)
        if (res.status === 409) {
          console.warn('[saveTrip] Stale save detected — another tab modified this trip');
          setState(prev => ({ ...prev, isSaving: false, isDirty: true }));
          return saveTripId;
        }

        if (!res.ok) throw new Error(data.error || 'Save failed');

        const tripId = data.id || s.tripId;
        // Use server timestamp for optimistic locking (not local clock)
        const serverUpdatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
        setState(prev => {
          // If a different trip was loaded while we were saving, don't overwrite it
          if (prev.tripId && saveTripId && prev.tripId !== saveTripId) {
            return { ...prev, isSaving: false };
          }
          // Only clear isDirty if state hasn't changed since we started saving
          const stateChangedDuringSave = stateRef.current !== s;
          return {
            ...prev,
            tripId,
            isSaving: false,
            isDirty: stateChangedDuringSave ? prev.isDirty : false,
            lastSavedAt: serverUpdatedAt,
          };
        });
        try { sessionStorage.setItem('currentTripId', tripId); } catch {}
        return tripId;
      } catch (e) {
        setState(prev => ({ ...prev, isSaving: false }));
        console.error('Save trip failed:', e);
        return null;
      }
    };

    // Mutex: queue saves sequentially — prevents concurrent save races
    saveMutexRef.current = saveMutexRef.current.then(doSave, doSave);
    return saveMutexRef.current;
  }, []);

  // ─── Load trip from database ────────────────────────────────────────────────
  const loadTrip = useCallback(async (tripId: string) => {
    removedReturnLegRef.current = null; // Clear stale ref from previous trip
    const res = await fetch(`/api/trips/${tripId}`);
    if (!res.ok) throw new Error('Failed to load trip');
    const data = await res.json();

    const loadedDests = (data.destinations || []).map((d: any) => ({
      id: d.id || `d${Date.now()}-${Math.random()}`,
      city: d.city,
      nights: d.nights,
      selectedHotel: d.selectedHotel,
      additionalHotels: d.additionalHotels || [],
      notes: d.notes || '',
      places: d.places || [],
    }));
    // Reconstruct userPlaces from all destinations' places for Plan page editing
    const reconstructedPlaces: Place[] = loadedDests.flatMap((d: any) => d.places || []);

    // Read deepPlanData/bookingDocs from top-level fields (new), fall back to from_city embedding (old trips)
    const { _bookingDocs, _deepPlanData, ...fromCity } = data.from || {};
    const loadedBookingDocs = data.bookingDocs || _bookingDocs || [];
    const loadedDeepPlanData = data.deepPlanData || _deepPlanData || { customActivities: {}, dayNotes: {}, dayStartTimes: {} };

    // If from city name is empty but address exists, extract city name from address
    let resolvedFrom = fromCity.name ? fromCity : CITIES[0];
    const loadedFromAddress = data.fromAddress || '';
    if (!fromCity.name && loadedFromAddress) {
      const parts = loadedFromAddress.split(',').map((s: string) => s.trim());
      // Try to find a known city in the address parts, or use second-to-last part as city
      const cityPart = parts.length >= 3 ? parts[parts.length - 2] : parts.length >= 2 ? parts[parts.length - 1] : parts[0];
      resolvedFrom = { name: cityPart, country: parts[parts.length - 1] || '', fullName: loadedFromAddress, parentCity: cityPart };
    }

    setState({
      tripId: data.tripId,
      from: resolvedFrom,
      fromAddress: loadedFromAddress,
      destinations: loadedDests,
      userPlaces: reconstructedPlaces,
      transportLegs: (data.transportLegs || []).map((l: any) => {
        // Extract _resolvedAirports from selectedFlight JSONB (stored together to avoid DB migration)
        const { _resolvedAirports, ...flightData } = l.selectedFlight || {};
        return {
          id: l.id || `tl${Date.now()}-${Math.random()}`,
          type: l.type,
          duration: l.duration,
          distance: l.distance,
          departureTime: l.departureTime,
          arrivalTime: l.arrivalTime,
          selectedFlight: l.selectedFlight ? flightData : null,
          selectedTrain: l.selectedTrain,
          resolvedAirports: _resolvedAirports || null,
        };
      }),
      departureDate: data.departureDate,
      adults: data.adults,
      children: data.children,
      infants: data.infants,
      tripType: data.tripType,
      bookingDocs: loadedBookingDocs,
      deepPlanData: loadedDeepPlanData,
      isSaving: false,
      isDirty: false,
      lastSavedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    });
    try { sessionStorage.setItem('currentTripId', tripId); } catch {}
  }, []);

  // ─── Reset to new trip ──────────────────────────────────────────────────────
  const resetTrip = useCallback(() => {
    removedReturnLegRef.current = null; // Clear stale ref
    setState({
      ...defaultState,
      destinations: [],
      userPlaces: [],
      transportLegs: [],
      tripId: null,
      isDirty: false,
      lastSavedAt: null,
    });
    try { sessionStorage.removeItem('currentTripId'); } catch {}
  }, []);

  // ─── Clear trip ID (for duplicating a trip as a new one) ──────────────────
  const clearTripId = useCallback(() => {
    setState(s => dirty({ ...s, tripId: null, lastSavedAt: null }));
    try { sessionStorage.removeItem('currentTripId'); } catch {}
  }, []);

  // Memoize actions object — all callbacks have [] deps so this never changes
  const actions = useMemo<TripActions>(() => ({
    setFrom, setFromAddress, addDestination, removeDestination, updateNights,
    updateDestinationNotes,
    addPlace, removePlace, reorderPlaces, updatePlaceNights, groupPlacesIntoCities,
    setDepartureDate, setAdults, setChildren, setInfants, setTripType,
    updateTransportLeg, changeTransportType, selectFlight, selectTrain,
    updateDestinationHotel, addAdditionalHotel, removeAdditionalHotel, updateAdditionalHotelNights,
    moveDestination, reorderDestinations,
    addBookingDoc, removeBookingDoc, setBookingDocs, updateDeepPlanData, buildFullTrip,
    saveTrip, loadTrip, resetTrip, clearTripId,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Combined value for backward-compatible useTrip()
  const combined = useMemo<TripContextType>(() => ({ ...state, ...actions }), [state, actions]);

  return (
    <TripActionsContext.Provider value={actions}>
      <TripStateContext.Provider value={state}>
        <TripContext.Provider value={combined}>
          {children}
        </TripContext.Provider>
      </TripStateContext.Provider>
    </TripActionsContext.Provider>
  );
}

/** Returns both state + actions (re-renders on any state change). Backward compatible. */
export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}

/** Returns only trip state (re-renders on state change). Use when you don't need actions. */
export function useTripState() {
  const ctx = useContext(TripStateContext);
  if (!ctx) throw new Error('useTripState must be used within TripProvider');
  return ctx;
}

/** Returns only trip actions (never re-renders). Use for callbacks/handlers that don't read state. */
export function useTripActions() {
  const ctx = useContext(TripActionsContext);
  if (!ctx) throw new Error('useTripActions must be used within TripProvider');
  return ctx;
}

export type { TripState, TripActions };
