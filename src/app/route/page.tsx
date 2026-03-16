'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useTrip } from '@/context/TripContext';
import { CITIES, City } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';
import { getDirections } from '@/lib/googleApi';
import HotelModal from '@/components/HotelModal';
import TransportCompareModal from '@/components/TransportCompareModal';

const transportIcons: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2M7 14h.01M17 14h.01M6 3h12l1 5H5z',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-16 0h16M8 22h8m-8-4h.01M16 18h.01M6 6h12v6H6z',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01M5 6h14v5H5zM8 22h8',
};

const AIRLINE_COLORS: Record<string, string> = {
  '6E': '#4f46e5', 'AI': '#dc2626', 'IX': '#2563eb', 'UK': '#7c3aed', 'SG': '#f59e0b', 'QP': '#0d9488',
  'LH': '#00205b', 'KL': '#00a1de', 'AF': '#002157', 'BA': '#003366', 'VY': '#f7c600', 'FR': '#003580',
  'U2': '#ff6600', 'EW': '#a5027d', 'EK': '#d71921', 'EY': '#b5985a', 'QR': '#5c0632', 'TK': '#e31e24',
};

export default function RoutePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const trip = useTrip();

  // Auto-save: save 5s after any selection changes
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const mountedRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle');

  // Count selected items to detect when data is ready
  const selectedCount = trip.transportLegs.filter(l => l.selectedFlight || l.selectedTrain).length +
    trip.destinations.filter(d => d.selectedHotel).length;

  useEffect(() => {
    // Skip first render
    if (!mountedRef.current) { mountedRef.current = true; return; }
    // Only save when there's at least one selection
    if (selectedCount === 0) return;

    setAutoSaveStatus('pending');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        const result = await trip.saveTrip();
        setAutoSaveStatus(result ? 'saved' : 'error');
        console.log('[auto-save]', result ? `saved trip ${result}` : 'save returned null');
      } catch (e) {
        setAutoSaveStatus('error');
        console.error('[auto-save] failed:', e);
      }
      isSavingRef.current = false;
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedCount, trip.destinations.map(d => d.nights).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modal state
  const [transportModal, setTransportModal] = useState<{ legIndex: number } | null>(null);
  const [hotelModal, setHotelModal] = useState<{ destIndex: number } | null>(null);

  // Fetch real driving directions for legs that don't have flight/train selected
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    trip.transportLegs.forEach((leg, i) => {
      // Only fetch for drive/bus legs without real data yet, and not already fetched
      if ((leg.type === 'drive' || leg.type === 'bus') && !leg.selectedFlight && !leg.selectedTrain && !fetchedRef.current.has(leg.id)) {
        const fromCity = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
        const toCity = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
        if (fromCity && toCity) {
          fetchedRef.current.add(leg.id);
          getDirections(fromCity.fullName, toCity.fullName, 'driving').then(result => {
            if (result) {
              trip.updateTransportLeg(leg.id, {
                duration: result.durationText,
                distance: result.distanceText,
              });
            }
          });
        }
      }
    });
  }, [trip.transportLegs.map(l => `${l.id}-${l.type}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select cheapest flight and hotel for each leg/destination on first load
  const autoSelectedRef = useRef(false);
  const [autoSelectLoading, setAutoSelectLoading] = useState(false);
  // Cache flight results per leg so the modal doesn't re-fetch
  const flightCacheRef = useRef<Record<number, any[]>>({});
  const pendingCountRef = useRef(0);

  const trackPending = (delta: number) => {
    pendingCountRef.current += delta;
    if (pendingCountRef.current <= 0) {
      pendingCountRef.current = 0;
      setAutoSelectLoading(false);
    }
  };

  useEffect(() => {
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;

    // Check if anything needs auto-selecting
    const needsFlights = trip.transportLegs.some(l => !l.selectedFlight && !l.selectedTrain && (l.type === 'flight' || l.type === 'drive'));
    const needsHotels = trip.destinations.some(d => !d.selectedHotel && d.nights > 0);

    if (needsFlights || needsHotels) {
      setAutoSelectLoading(true);
    }

    // Auto-select best transport for each leg (flight OR train, whichever is cheaper/better)
    trip.transportLegs.forEach((leg, i) => {
      if (leg.selectedFlight || leg.selectedTrain) return; // Already selected

      const fromC = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
      const toC = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
      if (!fromC || !toC) return;
      const fc = findAirportCode(fromC) || fromC.name || fromC.fullName;
      const tc = findAirportCode(toC) || toC.name || toC.fullName;
      const fromName = fromC.name || fromC.fullName || fc;
      const toName = toC.name || toC.fullName || tc;
      if (!fc || !tc || fc === tc) return;

      let dayOffset = 0;
      for (let d = 0; d < Math.min(i, trip.destinations.length); d++) {
        dayOffset += trip.destinations[d].nights || 1;
      }
      const legDate = new Date(trip.departureDate);
      legDate.setDate(legDate.getDate() + dayOffset);
      const legDateStr = legDate.toISOString().split('T')[0];

      pendingCountRef.current++;

      // Fetch BOTH flights and trains in parallel, pick the best option
      const flightP = fetch(`/api/flights?from=${encodeURIComponent(fc)}&to=${encodeURIComponent(tc)}&date=${legDateStr}&adults=${trip.adults}`)
        .then(r => r.json()).catch(() => ({ flights: [] }));
      const trainP = fetch(`/api/trains?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${legDateStr}`)
        .then(r => r.json()).catch(() => ({ trains: [] }));

      Promise.all([flightP, trainP]).then(([flightData, trainData]) => {
        const flights = flightData.flights || [];
        const trains = trainData.trains || [];

        // Cache flights for the modal
        if (flights.length > 0) flightCacheRef.current[i] = flights;

        const cheapestFlight = flights.length > 0 ? flights.sort((a: any, b: any) => a.price - b.price)[0] : null;
        const cheapestTrain = trains.length > 0 ? trains.sort((a: any, b: any) => a.price - b.price)[0] : null;

        // Pick best: prefer train if it's cheaper OR similar price but faster
        // For short distances (<500km), trains are usually better
        if (cheapestTrain && cheapestFlight) {
          const trainPrice = cheapestTrain.price;
          const flightPrice = cheapestFlight.price;
          const trainDurSec = cheapestTrain.durationSeconds || 99999;
          const flightDurMatch = cheapestFlight.duration?.match(/(\d+)h\s*(\d+)?m?/);
          const flightDurSec = flightDurMatch ? (parseInt(flightDurMatch[1]) * 3600 + parseInt(flightDurMatch[2] || '0') * 60) : 99999;

          // Prefer train if: cheaper, or within 30% price AND faster/similar duration
          const preferTrain = trainPrice < flightPrice || (trainPrice < flightPrice * 1.3 && trainDurSec <= flightDurSec * 1.2);

          if (preferTrain) {
            const train = {
              id: `auto-${cheapestTrain.trainName}-${i}`, operator: cheapestTrain.operator,
              trainName: cheapestTrain.trainName, trainNumber: cheapestTrain.trainNumber,
              departure: cheapestTrain.departure, arrival: cheapestTrain.arrival,
              duration: cheapestTrain.duration, stops: cheapestTrain.stops,
              price: cheapestTrain.price, fromStation: cheapestTrain.fromStation, toStation: cheapestTrain.toStation,
              color: cheapestTrain.transitSteps?.[0]?.color || '#6b7280',
              transitSteps: cheapestTrain.transitSteps,
            };
            trip.selectTrain(leg.id, train);
          } else {
            const flight = {
              id: `auto-${cheapestFlight.flightNumber}`, airline: cheapestFlight.airline, airlineCode: cheapestFlight.airlineCode,
              flightNumber: cheapestFlight.flightNumber, departure: cheapestFlight.departure, arrival: cheapestFlight.arrival,
              duration: cheapestFlight.duration, stops: cheapestFlight.stops, route: `${fc}-${tc}`,
              pricePerAdult: cheapestFlight.price, color: AIRLINE_COLORS[cheapestFlight.airlineCode] || '#6b7280',
            };
            trip.selectFlight(leg.id, flight);
          }
        } else if (cheapestTrain) {
          const train = {
            id: `auto-${cheapestTrain.trainName}-${i}`, operator: cheapestTrain.operator,
            trainName: cheapestTrain.trainName, trainNumber: cheapestTrain.trainNumber,
            departure: cheapestTrain.departure, arrival: cheapestTrain.arrival,
            duration: cheapestTrain.duration, stops: cheapestTrain.stops,
            price: cheapestTrain.price, fromStation: cheapestTrain.fromStation, toStation: cheapestTrain.toStation,
            color: cheapestTrain.transitSteps?.[0]?.color || '#6b7280',
            transitSteps: cheapestTrain.transitSteps,
          };
          trip.selectTrain(leg.id, train);
        } else if (cheapestFlight) {
          const flight = {
            id: `auto-${cheapestFlight.flightNumber}`, airline: cheapestFlight.airline, airlineCode: cheapestFlight.airlineCode,
            flightNumber: cheapestFlight.flightNumber, departure: cheapestFlight.departure, arrival: cheapestFlight.arrival,
            duration: cheapestFlight.duration, stops: cheapestFlight.stops, route: `${fc}-${tc}`,
            pricePerAdult: cheapestFlight.price, color: AIRLINE_COLORS[cheapestFlight.airlineCode] || '#6b7280',
          };
          trip.selectFlight(leg.id, flight);
        }
        trackPending(-1);
      }).catch(() => trackPending(-1));
    });

    // Auto-select cheapest hotel for destinations without one
    trip.destinations.forEach((dest, i) => {
      if (dest.selectedHotel || dest.nights === 0) return;
      pendingCountRef.current++;
      fetch(`/api/nearby?location=${encodeURIComponent(dest.city.fullName || dest.city.name)}&checkIn=${trip.departureDate}&checkOut=${trip.departureDate}`)
        .then(r => r.json())
        .then(data => {
          const places = data.places || [];
          if (places.length > 0) {
            const h = places[0];
            const hotel = {
              id: `auto-${h.id || i}`,
              name: h.displayName?.text || h.name || 'Hotel',
              rating: h.rating || h.overall_rating || 0,
              pricePerNight: h.rateExtracted || (4000 + Math.abs((dest.city.name.charCodeAt(0) * 137) % 5000)),
              ratingColor: (h.rating || 0) >= 4 ? '#22c55e' : '#eab308',
            };
            trip.updateDestinationHotel(dest.id, hotel);
          }
          trackPending(-1);
        }).catch(() => trackPending(-1));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast notification for flight updates
  const [flightUpdateToast, setFlightUpdateToast] = useState<string | null>(null);

  // Re-fetch flights when nights change (dates shift for subsequent legs)
  const nightsKey = trip.destinations.map(d => d.nights).join(',');
  const prevNightsRef = useRef(nightsKey);
  useEffect(() => {
    if (prevNightsRef.current === nightsKey) return;
    prevNightsRef.current = nightsKey;
    // Clear flight cache for affected legs (dates have shifted)
    for (let li = 1; li < trip.transportLegs.length; li++) {
      delete flightCacheRef.current[li];
    }

    // Show toast
    const affectedLegs = trip.transportLegs.filter((l, i) => i > 0 && l.selectedFlight).length;
    if (affectedLegs > 0) {
      setFlightUpdateToast(`Updating ${affectedLegs} flight${affectedLegs > 1 ? 's' : ''} for new dates...`);
    }

    // Re-fetch flights for ALL legs after the first (their dates may have shifted)
    trip.transportLegs.forEach((leg, i) => {
      if (i === 0) return; // First leg date doesn't change with nights
      if (!leg.selectedFlight) return; // No flight to update
      if (leg.type !== 'flight' && leg.type !== 'drive') return;

      const fromC = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
      const toC = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
      if (!fromC || !toC) return;
      const fc = findAirportCode(fromC) || fromC.name || fromC.fullName;
      const tc = findAirportCode(toC) || toC.name || toC.fullName;
      if (!fc || !tc || fc === tc) return;

      const legDateStr = calcDepartureDate(i).toISOString().split('T')[0];

      fetch(`/api/flights?from=${encodeURIComponent(fc)}&to=${encodeURIComponent(tc)}&date=${legDateStr}&adults=${trip.adults}`)
        .then(r => r.json())
        .then(data => {
          if (data.flights?.length > 0) {
            const cheapest = data.flights.sort((a: any, b: any) => a.price - b.price)[0];
            const flight = {
              id: `auto-${cheapest.flightNumber}`, airline: cheapest.airline, airlineCode: cheapest.airlineCode,
              flightNumber: cheapest.flightNumber, departure: cheapest.departure, arrival: cheapest.arrival,
              duration: cheapest.duration, stops: cheapest.stops, route: `${fc}-${tc}`,
              pricePerAdult: cheapest.price, color: AIRLINE_COLORS[cheapest.airlineCode] || '#6b7280',
            };
            trip.selectFlight(leg.id, flight);
            flightCacheRef.current[i] = data.flights;
          }
          setFlightUpdateToast(null);
        }).catch(() => { setFlightUpdateToast(null); });
    });
  }, [nightsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build route stops
  const stops = useMemo(() => {
    const result: Array<{
      number: number; name: string; type: 'home' | 'destination';
      explore?: string; destIndex?: number; nights?: number;
    }> = [];
    result.push({ number: 1, name: trip.fromAddress, type: 'home' });
    trip.destinations.forEach((dest, i) => {
      result.push({ number: i + 2, name: dest.city.name, type: 'destination', explore: dest.city.name, destIndex: i, nights: dest.nights });
    });
    if (trip.tripType === 'roundTrip') {
      result.push({ number: result.length + 1, name: trip.fromAddress, type: 'home' });
    }
    return result;
  }, [trip.fromAddress, trip.destinations, trip.tripType]);

  // Cost calc
  const totalNights = trip.destinations.reduce((s, d) => s + d.nights, 0);
  const flightCost = trip.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + (l.selectedFlight!.pricePerAdult), 0) * trip.adults;
  const trainCost = trip.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + (l.selectedTrain!.price), 0) * trip.adults;
  const hotelCost = trip.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => s + d.selectedHotel!.pricePerNight * d.nights, 0);
  const totalCost = flightCost + trainCost + hotelCost;

  /** When user picks a type from TransportModal, either open sub-modal or just set type */
  // handleTransportTypeSelect removed - unified modal handles everything

  // Get cities for a leg index
  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? trip.from : trip.destinations[Math.min(legIdx - 1, trip.destinations.length - 1)]?.city;
    const toCity = legIdx < trip.destinations.length ? trip.destinations[legIdx]?.city : trip.from;
    return { fromCity, toCity };
  };

  // Calculate the departure date from a given stop (accounts for overnight flights + hotel nights)
  const calcDepartureDate = (stopIdx: number): Date => {
    const d = new Date(trip.departureDate);
    for (let s = 0; s < stopIdx; s++) {
      // Add nights at destination s (if it's a destination, not home)
      if (s > 0 && s - 1 < trip.destinations.length) {
        d.setDate(d.getDate() + (trip.destinations[s - 1]?.nights || 1));
      }
      // Add travel days for overnight transport from stop s
      const tLeg = s < trip.transportLegs.length ? trip.transportLegs[s] : null;
      if (tLeg) {
        const sel = tLeg.selectedFlight || tLeg.selectedTrain;
        if (sel) {
          const depH = parseInt(sel.departure?.split(':')[0] || '0');
          const arrH = parseInt(sel.arrival?.split(':')[0] || '0');
          const durMatch = sel.duration?.match(/(\d+)h/);
          const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
          if ((sel as any).isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2)) {
            d.setDate(d.getDate() + 1);
          }
        }
      }
    }
    // Add nights at the current stop
    if (stopIdx > 0 && stopIdx - 1 < trip.destinations.length) {
      d.setDate(d.getDate() + (trip.destinations[stopIdx - 1]?.nights || 0));
    }
    return d;
  };

  // Find nearest airport code for a city
  const findAirportCode = (city: City | undefined): string => {
    if (!city) return '';
    if (city.airportCode) return city.airportCode;
    // Use city name for API resolution — the Supabase-powered resolver handles everything
    // Just return the best city name; the flights API will geocode + find nearest airports
    return city.parentCity || city.name || '';
  };

  const findAirportName = (city: City | undefined): string => {
    if (!city) return '';
    if (city.airport?.name) return city.airport.name;
    const searchText = `${city.parentCity || ''} ${city.fullName || ''} ${city.name || ''}`.toLowerCase();
    const known = CITIES.find(c => c.airport && searchText.includes(c.name.toLowerCase()));
    if (known) return known.airport!.name;
    if (searchText.includes('maharashtra') || searchText.includes('thane') || searchText.includes('navi mumbai')) return 'Chhatrapati Shivaji Maharaj International Airport';
    return city.name;
  };

  return (
    <div className="min-h-screen flex justify-center p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[760px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          {/* Nav */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/my-trips')} className="font-display text-lg font-bold hover:opacity-80 transition-opacity"><span className="text-accent-cyan">AI</span>Ezzy</button>
              <span className="text-text-muted text-xs">/</span>
              <button onClick={() => router.push('/plan')} className="text-text-secondary text-xs font-body hover:text-accent-cyan transition-colors">Edit Trip</button>
              <span className="text-text-muted text-xs">/</span>
              <span className="text-text-primary text-xs font-body font-semibold">Route</span>
            </div>
            {session?.user?.name && <span className="text-text-muted text-xs font-body">{session.user.name}</span>}
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="font-display text-lg font-bold text-text-primary">Trip Overview</h1>
            <p className="text-text-muted text-xs font-mono mt-1">
              {trip.departureDate} &middot; {trip.adults} adult{trip.adults > 1 ? 's' : ''}
              {trip.children > 0 ? `, ${trip.children} children` : ''}
              &middot; {trip.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
            </p>
          </div>

          {/* Main content: timeline + sidebar on desktop */}
          <div className="md:grid md:grid-cols-[1fr_260px] md:gap-8">
          {/* Timeline */}
          <div>
            {stops.map((stop, i) => {
              const hasTransport = i < stops.length - 1;
              // For round trips, ensure return leg exists
              let leg = hasTransport && i < trip.transportLegs.length ? trip.transportLegs[i] : null;
              if (hasTransport && !leg && trip.tripType === 'roundTrip' && i === stops.length - 2) {
                // This is the return leg - create a placeholder
                leg = { id: `tl-return`, type: 'flight', duration: '~', distance: '~', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null };
              }
              const { fromCity, toCity } = hasTransport ? getLegCities(i) : { fromCity: null, toCity: null };

              // Calculate dates by walking through the trip day-by-day:
              // Each stop's arrival = previous stop's departure + travel days
              // Each stop's departure = arrival + nights at this stop
              // Travel days = 0 for same-day, +1 for overnight flights, etc.
              const calcArrivalDate = () => {
                const d = new Date(trip.departureDate);
                for (let s = 0; s < i; s++) {
                  // Add nights at destination s (if it's a destination, not home)
                  if (s > 0 && s - 1 < trip.destinations.length) {
                    d.setDate(d.getDate() + (trip.destinations[s - 1]?.nights || 1));
                  }
                  // Add travel days for the transport leg FROM stop s
                  // Check if the flight/train arriving at stop s+1 is overnight
                  const tLeg = s < trip.transportLegs.length ? trip.transportLegs[s] : null;
                  if (tLeg) {
                    const sel = tLeg.selectedFlight || tLeg.selectedTrain;
                    if (sel) {
                      const depH = parseInt(sel.departure?.split(':')[0] || '0');
                      const arrH = parseInt(sel.arrival?.split(':')[0] || '0');
                      const durMatch = sel.duration?.match(/(\d+)h/);
                      const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                      const isOvernight = (sel as any).isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2);
                      if (isOvernight) d.setDate(d.getDate() + 1);
                    }
                  }
                }
                return d;
              };

              const arrivalDate = calcArrivalDate();
              const thisNights = stop.destIndex !== undefined ? (trip.destinations[stop.destIndex]?.nights || 0) : 0;
              const legDate = new Date(arrivalDate);
              legDate.setDate(legDate.getDate() + thisNights);
              const legDateFormatted = legDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

              return (
                <div key={`stop-${i}`}>
                  {/* Stop pin + name */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-accent-cyan flex items-center justify-center text-white font-mono font-bold text-xs relative z-10">
                          {stop.number}
                        </div>
                        {i === 0 && <div className="absolute inset-0 rounded-full animate-pulse-glow" />}
                      </div>
                    </div>
                    <div className="flex-1 pb-2">
                      <h3 className="font-display font-bold text-sm text-text-primary">{stop.name}</h3>
                      {stop.type === 'destination' && (() => {
                        const dest = stop.destIndex !== undefined ? trip.destinations[stop.destIndex] : null;
                        const hotel = dest?.selectedHotel;
                        const nights = stop.nights || 0;

                        if (nights === 0) {
                          return (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-text-muted text-xs font-body italic">Pass through</span>
                              <button onClick={() => dest && trip.updateNights(dest.id, 1)}
                                className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] font-body transition-colors">+ Add night</button>
                            </div>
                          );
                        }

                        if (hotel) {
                          const totalPrice = hotel.pricePerNight * nights;
                          // Check-in = arrival date at this destination, Check-out = check-in + nights
                          const checkIn = new Date(arrivalDate);
                          const checkOut = new Date(arrivalDate);
                          checkOut.setDate(checkOut.getDate() + nights);
                          const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                          return (
                            <div className="mt-1.5 bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-display font-bold text-text-primary">{hotel.name}</span>
                                <button onClick={() => stop.destIndex !== undefined && setHotelModal({ destIndex: stop.destIndex })}
                                  className="text-accent-cyan text-[10px] font-body hover:underline flex-shrink-0 ml-2">Change</button>
                              </div>
                              <div className="flex items-center gap-2 text-[10px]">
                                {hotel.rating > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: hotel.ratingColor, fontSize: '9px' }}>{hotel.rating}</span>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => dest && trip.updateNights(dest.id, nights - 1)}
                                    className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">-</button>
                                  <span className="text-text-primary font-mono font-bold">{nights}N</span>
                                  <button onClick={() => dest && trip.updateNights(dest.id, nights + 1)}
                                    className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">+</button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                                <span>Check-in {fmtDate(checkIn)} &rarr; Check-out {fmtDate(checkOut)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-text-secondary font-body">&#8377;{hotel.pricePerNight.toLocaleString()}/night &times; {nights}</span>
                                <span className="text-accent-cyan font-mono font-bold">&#8377;{totalPrice.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <button onClick={() => stop.destIndex !== undefined && setHotelModal({ destIndex: stop.destIndex })}
                            className="text-accent-cyan text-xs font-body hover:underline mt-0.5 block">
                            Select a hotel in {stop.explore} &middot; <span className="text-text-muted">{nights}N</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Transport leg */}
                  {hasTransport && leg && (
                    <div className="flex items-start gap-4 ml-0">
                      <div className="flex flex-col items-center w-8">
                        <div className="w-px flex-1 border-l-2 border-dashed border-border-subtle min-h-[48px]" />
                      </div>
                      <div className="flex-1 py-2 space-y-1">
                        {/* Transport type + duration button */}
                        <button
                          onClick={() => setTransportModal({ legIndex: i })}
                          className="flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition-colors group"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-accent-cyan">
                            <path d={transportIcons[leg.type] || transportIcons.drive} />
                          </svg>
                          <span className="text-xs font-mono">
                            {leg.selectedFlight ? leg.selectedFlight.duration : leg.selectedTrain ? leg.selectedTrain.duration : leg.duration}
                            {' '}&middot;{' '}
                            {leg.selectedFlight ? leg.selectedFlight.route : leg.distance}
                          </span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted"><path d="M6 9l6 6 6-6"/></svg>
                        </button>

                        {/* Selected flight details card */}
                        {leg.selectedFlight && (
                          <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-display font-bold text-text-primary">{leg.selectedFlight.airline} {leg.selectedFlight.flightNumber}</span>
                              <button onClick={() => setTransportModal({ legIndex: i })} className="text-accent-cyan text-[10px] font-body hover:underline flex-shrink-0 ml-2">Change</button>
                            </div>
                            {(() => {
                              // Compute arrival date: check if flight arrives next day
                              const depH = parseInt(leg.selectedFlight!.departure?.split(':')[0] || '0');
                              const arrH = parseInt(leg.selectedFlight!.arrival?.split(':')[0] || '0');
                              const durMatch = leg.selectedFlight!.duration?.match(/(\d+)h/);
                              const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                              const isNextDay = (leg.selectedFlight as any)?.isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2);
                              const arrDate = new Date(legDate);
                              if (isNextDay) arrDate.setDate(arrDate.getDate() + 1);
                              const arrDateFmt = arrDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              return (
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedFlight!.color, fontSize: '9px' }}>{leg.selectedFlight!.airlineCode}</span>
                                  <span className="text-text-secondary font-mono">{legDateFormatted} {timeStr12(leg.selectedFlight!.departure)} &rarr; {arrDateFmt} {timeStr12(leg.selectedFlight!.arrival)}</span>
                                  <span className="text-text-muted font-mono">{leg.selectedFlight!.duration}</span>
                                  <span className="text-text-muted font-mono">{leg.selectedFlight!.stops === 'Nonstop' ? 'Direct' : leg.selectedFlight!.stops.split(' · ')[0]}</span>
                                </div>
                              );
                            })()}
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-text-secondary font-body">&#8377;{leg.selectedFlight.pricePerAdult.toLocaleString()}/pax &times; {trip.adults}</span>
                              <span className="text-accent-cyan font-mono font-bold">&#8377;{(leg.selectedFlight.pricePerAdult * trip.adults).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                        {/* Selected train details card */}
                        {leg.selectedTrain && (
                          <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-display font-bold text-text-primary">{leg.selectedTrain.operator} {leg.selectedTrain.trainNumber}</span>
                              <button onClick={() => setTransportModal({ legIndex: i })} className="text-accent-cyan text-[10px] font-body hover:underline flex-shrink-0 ml-2">Change</button>
                            </div>
                            {(() => {
                              const depH = parseInt(leg.selectedTrain!.departure?.split(':')[0] || '0');
                              const arrH = parseInt(leg.selectedTrain!.arrival?.split(':')[0] || '0');
                              const durMatch = leg.selectedTrain!.duration?.match(/(\d+)h/);
                              const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                              const isNext = durHrs >= 12 || (arrH < depH && durHrs > 2);
                              const arrDate = new Date(legDate);
                              if (isNext) arrDate.setDate(arrDate.getDate() + 1);
                              const arrDateFmt = arrDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              return (
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedTrain!.color, fontSize: '9px' }}>{leg.selectedTrain!.operator.split(' ')[0].slice(0,3)}</span>
                                  <span className="text-text-secondary font-mono">{legDateFormatted} {timeStr12(leg.selectedTrain!.departure)} &rarr; {arrDateFmt} {timeStr12(leg.selectedTrain!.arrival)}</span>
                                  <span className="text-text-muted font-mono">{leg.selectedTrain!.duration}</span>
                                </div>
                              );
                            })()}
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-text-secondary font-body">&#8377;{leg.selectedTrain.price.toLocaleString()}/pax &times; {trip.adults}</span>
                              <span className="text-accent-cyan font-mono font-bold">&#8377;{(leg.selectedTrain.price * trip.adults).toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* Departure/arrival hubs based on type */}
                        {!leg.selectedFlight && !leg.selectedTrain && leg.type !== 'drive' && fromCity && toCity && (
                          <div className="ml-5 text-[10px] text-text-muted font-body">
                            {leg.type === 'flight' && (findAirportCode(fromCity) || findAirportCode(toCity)) && (
                              <p>{findAirportName(fromCity)} &rarr; {findAirportName(toCity)}</p>
                            )}
                            {leg.type === 'train' && fromCity.trainStation && toCity.trainStation && (
                              <p>{fromCity.trainStation.name} &rarr; {toCity.trainStation.name}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar: Cost + Actions */}
          <div className="md:sticky md:top-8 md:self-start">
          {/* Cost Summary */}
          <div className="mt-6 p-4 bg-bg-card border border-border-subtle rounded-xl">
            <h3 className="font-display font-bold text-xs text-accent-gold uppercase tracking-widest mb-3">Trip Estimate</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-body">
                <span className="text-text-secondary">{trip.destinations.length} cities &middot; {totalNights} nights</span>
                <span className="text-text-muted">{trip.adults} pax</span>
              </div>
              {flightCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Flights</span><span className="text-text-primary font-mono">&#8377;{flightCost.toLocaleString()}</span></div>}
              {trainCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Trains</span><span className="text-text-primary font-mono">&#8377;{trainCost.toLocaleString()}</span></div>}
              {hotelCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Hotels</span><span className="text-text-primary font-mono">&#8377;{hotelCost.toLocaleString()}</span></div>}
              {totalCost > 0 ? (
                <>
                <div className="flex justify-between text-sm font-body pt-2 border-t border-border-subtle">
                  <span className="text-text-primary font-semibold">Estimated Total</span>
                  <span className="text-accent-cyan font-mono font-bold">&#8377;{totalCost.toLocaleString()}</span>
                </div>
                <p className="text-text-muted text-[10px] font-body mt-2 leading-relaxed">
                  Want a detailed hour-by-hour itinerary with activities, meals, and a complete budget? Use <span className="text-accent-cyan font-semibold">Deep Plan</span> below.
                </p>
                </>
              ) : (
                <p className="text-text-muted text-xs font-body italic">Select flights/trains and hotels to see cost</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 space-y-3">
            {autoSaveStatus === 'pending' && (
              <p className="text-center text-[10px] font-body text-text-muted py-1">Saving in a moment...</p>
            )}
            {autoSaveStatus === 'saved' && (
              <p className="text-center text-[10px] font-body text-green-600 py-1">Auto-saved</p>
            )}
            {autoSaveStatus === 'error' && (
              <p className="text-center text-[10px] font-body text-red-500 py-1">Save failed — try refreshing</p>
            )}
            {autoSaveStatus === 'idle' && trip.lastSavedAt && (
              <p className="text-center text-[10px] font-body text-text-muted/50 py-1">Auto-saved</p>
            )}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/deep-plan')}
              className="w-full bg-text-primary text-white font-display font-bold py-4 rounded-xl text-sm transition-all hover:bg-text-primary/90 hover:shadow-lg">
              Deep Plan
            </motion.button>
          </div>
          </div>{/* end sidebar */}
          </div>{/* end grid */}
        </div>
      </motion.div>

      {/* Auto-selection loading overlay */}
      {autoSelectLoading && (
        <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-8 text-center max-w-[320px]">
            <div className="w-12 h-12 border-3 border-accent-cyan/20 border-t-accent-cyan rounded-full animate-spin mx-auto mb-4" />
            <p className="font-display font-bold text-text-primary text-base mb-1">Setting up your trip</p>
            <p className="text-text-secondary text-xs font-body">Finding the best flights and hotels for you...</p>
          </div>
        </div>
      )}

      {/* Flight update toast */}
      <AnimatePresence>
        {flightUpdateToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-text-primary text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm font-body">{flightUpdateToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified Transport Compare Modal */}
      {transportModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(transportModal.legIndex);
        const leg = trip.transportLegs[transportModal.legIndex];
        // Calculate correct date for this leg using the same logic as the route cards
        const legD = calcDepartureDate(transportModal.legIndex);
        const legDateStr = legD.toISOString().split('T')[0];
        return (
          <TransportCompareModal
            isOpen
            onClose={() => setTransportModal(null)}
            fromCity={fromCity?.name || ''}
            toCity={toCity?.name || ''}
            fromCode={findAirportCode(fromCity) || ''}
            toCode={findAirportCode(toCity) || ''}
            fromAirport={findAirportName(fromCity)}
            toAirport={findAirportName(toCity)}
            date={legDateStr}
            adults={trip.adults}
            currentType={leg?.type || 'drive'}
            selectedFlight={leg?.selectedFlight || null}
            selectedTrain={leg?.selectedTrain || null}
            cachedFlights={flightCacheRef.current[transportModal.legIndex] || null}
            onSelectFlight={flight => {
              if (leg) trip.selectFlight(leg.id, flight);
              setTransportModal(null);
            }}
            onSelectTrain={train => {
              if (leg) trip.selectTrain(leg.id, train);
              setTransportModal(null);
            }}
            onSelectDrive={() => {
              if (leg) trip.changeTransportType(leg.id, 'drive');
              setTransportModal(null);
            }}
            onSelectBus={() => {
              if (leg) trip.changeTransportType(leg.id, 'bus');
              setTransportModal(null);
            }}
          />
        );
      })()}

      {/* Hotel Modal */}
      {hotelModal !== null && (() => {
        const dest = trip.destinations[hotelModal.destIndex];
        if (!dest) return null;
        return (
          <HotelModal
            isOpen
            onClose={() => setHotelModal(null)}
            cityName={dest.city.name}
            locationQuery={dest.city.fullName}
            nights={dest.nights}
            checkInDate={trip.departureDate}
            checkOutDate={(() => { const d = new Date(trip.departureDate); d.setDate(d.getDate() + dest.nights); return d.toISOString().split('T')[0]; })()}
            selectedHotel={dest.selectedHotel}
            onSelectHotel={hotel => { trip.updateDestinationHotel(dest.id, hotel); setHotelModal(null); }}
          />
        );
      })()}
    </div>
  );
}
