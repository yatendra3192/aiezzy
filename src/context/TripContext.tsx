'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { City, Destination, TransportLeg, Hotel, HotelStay, Flight, TrainOption, Place, CITIES, DEFAULT_TRANSPORT_LEGS } from '@/data/mockData';

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
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
}

interface TripContextType extends TripState {
  setFrom: (city: City) => void;
  setFromAddress: (address: string) => void;
  addDestination: (city: City, nights?: number) => void;
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
  saveTrip: () => Promise<string | null>;
  loadTrip: (tripId: string) => Promise<void>;
  resetTrip: () => void;
  clearTripId: () => void;
}

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
  isSaving: false,
  isDirty: false,
  lastSavedAt: null,
};

const TripContext = createContext<TripContextType | null>(null);

function dirty(s: TripState): TripState {
  return { ...s, isDirty: true };
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TripState>(defaultState);

  const setFrom = useCallback((city: City) => setState(s => dirty({ ...s, from: city })), []);
  const setFromAddress = useCallback((address: string) => setState(s => dirty({ ...s, fromAddress: address })), []);

  const addDestination = useCallback((city: City, nights = 2) => {
    const newDest: Destination = { id: `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, city, nights, selectedHotel: null, places: [] };
    const newLeg = { id: `tl${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'drive' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null };
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
      if (idx < newLegs.length) newLegs.splice(idx, 1);
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
      return dirty({ ...s, destinations: newDests });
    });
  }, []);

  const reorderDestinations = useCallback((newOrder: Destination[]) => {
    setState(s => dirty({ ...s, destinations: newOrder }));
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
        if (pc === place.name && place.fullName) {
          const parts = place.fullName.split(',').map(s => s.trim());
          if (parts.length >= 3) {
            // Try matching a known city in the fullName parts
            const knownPart = parts.find(p => CITIES.some(c => c.name.toLowerCase() === p.toLowerCase()));
            if (knownPart) pc = knownPart;
            else pc = parts[1]; // Second part is usually the city
          } else if (parts.length === 2) {
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
  const setTripType = useCallback((type: 'roundTrip' | 'oneWay') => setState(s => {
    const newLegs = [...s.transportLegs];
    const expectedLegs = type === 'roundTrip' ? s.destinations.length + 1 : s.destinations.length;
    // Add return leg if switching to round trip
    while (newLegs.length < expectedLegs) {
      newLegs.push({ id: `tl-ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'flight' as const, duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null });
    }
    // Remove extra leg if switching to one way
    while (newLegs.length > expectedLegs && newLegs.length > 0) {
      newLegs.pop();
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
    // Get the LATEST state using a ref-like pattern via setState
    let currentState: TripState | null = null;
    setState(s => { currentState = s; return { ...s, isSaving: true }; });

    // Wait a tick for setState to complete
    await new Promise(r => setTimeout(r, 0));

    if (!currentState) return null;
    const s = currentState as TripState;

    const payload = {
      from: s.from,
      fromAddress: s.fromAddress,
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

    try {
      const method = s.tripId ? 'PUT' : 'POST';
      const url = s.tripId ? `/api/trips/${s.tripId}` : '/api/trips';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Save failed');

      const tripId = data.id || s.tripId;
      setState(prev => ({ ...prev, tripId, isSaving: false, isDirty: false, lastSavedAt: new Date() }));
      try { sessionStorage.setItem('currentTripId', tripId); } catch {}
      return tripId;
    } catch (e) {
      setState(prev => ({ ...prev, isSaving: false }));
      console.error('Save trip failed:', e);
      return null;
    }
  }, []);

  // ─── Load trip from database ────────────────────────────────────────────────
  const loadTrip = useCallback(async (tripId: string) => {
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

    setState({
      tripId: data.tripId,
      from: data.from || CITIES[0],
      fromAddress: data.fromAddress || '',
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
      isSaving: false,
      isDirty: false,
      lastSavedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    });
    try { sessionStorage.setItem('currentTripId', tripId); } catch {}
  }, []);

  // ─── Reset to new trip ──────────────────────────────────────────────────────
  const resetTrip = useCallback(() => {
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

  return (
    <TripContext.Provider value={{
      ...state,
      setFrom, setFromAddress, addDestination, removeDestination, updateNights,
      updateDestinationNotes,
      addPlace, removePlace, reorderPlaces, updatePlaceNights, groupPlacesIntoCities,
      setDepartureDate, setAdults, setChildren, setInfants, setTripType,
      updateTransportLeg, changeTransportType, selectFlight, selectTrain,
      updateDestinationHotel, addAdditionalHotel, removeAdditionalHotel, updateAdditionalHotelNights,
      moveDestination, reorderDestinations,
      saveTrip, loadTrip, resetTrip, clearTripId,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
