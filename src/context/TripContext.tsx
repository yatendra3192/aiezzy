'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { City, Destination, TransportLeg, Hotel, Flight, TrainOption, CITIES, DEFAULT_TRANSPORT_LEGS } from '@/data/mockData';

interface TripState {
  tripId: string | null;
  from: City;
  fromAddress: string;
  destinations: Destination[];
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
    const newDest: Destination = { id: `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, city, nights, selectedHotel: null };
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
      destinations: s.destinations.map(d => ({ city: d.city, nights: d.nights, selectedHotel: d.selectedHotel, notes: d.notes })),
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

    setState({
      tripId: data.tripId,
      from: data.from || CITIES[0],
      fromAddress: data.fromAddress || '',
      destinations: (data.destinations || []).map((d: any) => ({
        id: d.id || `d${Date.now()}-${Math.random()}`,
        city: d.city,
        nights: d.nights,
        selectedHotel: d.selectedHotel,
        notes: d.notes || '',
      })),
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
      setDepartureDate, setAdults, setChildren, setInfants, setTripType,
      updateTransportLeg, changeTransportType, selectFlight, selectTrain,
      updateDestinationHotel, moveDestination, reorderDestinations,
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
