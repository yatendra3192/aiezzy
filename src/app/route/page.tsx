'use client';

import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useTrip } from '@/context/TripContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CITIES, City } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';
import { getDirections } from '@/lib/googleApi';
import { generateICS, downloadICS } from '@/lib/calendarExport';
import { exportTripPDFFromData } from '@/lib/pdfExport';
import { formatPrice, CURRENCIES, CurrencyCode } from '@/lib/currency';
import { getFlightBookingUrl, getHotelBookingUrl } from '@/lib/affiliateLinks';
import { getBookingFilesForCity } from '@/lib/bookingStore';
import { BookingDoc } from '@/context/TripContext';
import HotelModal from '@/components/HotelModal';
import TransportCompareModal from '@/components/TransportCompareModal';
import ShareTripModal from '@/components/ShareTripModal';
import ActivitySuggestions from '@/components/ActivitySuggestions';
import WeatherBadge from '@/components/WeatherBadge';
import PackingListModal from '@/components/PackingListModal';
import { getVisaInfo } from '@/data/visaRequirements';

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

function RoutePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTripId = searchParams.get('id');
  const { data: session } = useSession();
  const trip = useTrip();
  const { currency, setCurrency } = useCurrency();
  const [pdfLoading, setPdfLoading] = useState(false);

  // Restore trip from URL param, context, or sessionStorage on page reload
  const [isRestoring, setIsRestoring] = useState(false);
  // Tracks when the trip has fully loaded + settled — prevents date/nights effects from re-fetching
  const tripStableRef = useRef(false);

  useEffect(() => {
    if (trip.destinations.length > 0) {
      // Already have destinations in context (came from plan page) — mark stable
      if (!tripStableRef.current) setTimeout(() => { tripStableRef.current = true; }, 500);
      return;
    }

    // Try to reload from DB: prefer URL param, then context tripId, then sessionStorage
    const idToLoad = urlTripId || trip.tripId || (() => { try { return sessionStorage.getItem('currentTripId'); } catch { return null; } })();
    if (idToLoad) {
      setIsRestoring(true);
      trip.loadTrip(idToLoad).catch(() => {}).finally(() => {
        setIsRestoring(false);
        // Mark trip as stable after a short delay so date/nights effects don't fire on load
        setTimeout(() => { tripStableRef.current = true; }, 500);
      });
    } else {
      // No trip to load (new trip) — immediately stable
      tripStableRef.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: save 5s after any selection changes
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const mountedRef = useRef(false);
  const autoSelectLoadingRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle');

  // Count selected items to detect when data is ready
  const selectedCount = trip.transportLegs.filter(l => l.selectedFlight || l.selectedTrain).length +
    trip.destinations.filter(d => d.selectedHotel).length;

  useEffect(() => {
    // Skip first render and while trip is loading/settling
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (!tripStableRef.current) return;
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
        // Update URL with trip ID so the link is shareable/bookmarkable
        if (result) {
          router.replace(`/route?id=${result}`, { scroll: false });
        }
      } catch (e) {
        setAutoSaveStatus('error');
        console.error('[auto-save] failed:', e);
      }
      isSavingRef.current = false;
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedCount, trip.destinations.map(d => d.nights).join(','), trip.adults, trip.children, trip.infants, trip.departureDate, trip.tripType, trip.transportLegs.map(l => `${l.selectedFlight?.id || ''}-${l.selectedTrain?.id || ''}-${l.selectedFlight?.pricePerAdult || 0}`).join(','), trip.destinations.map(d => `${d.selectedHotel?.id || ''}-${d.selectedHotel?.pricePerNight || 0}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modal state
  const [transportModal, setTransportModal] = useState<{ legIndex: number } | null>(null);
  const [hotelModal, setHotelModal] = useState<{ destIndex: number; isAdditional?: boolean } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPackingList, setShowPackingList] = useState(false);
  const [viewingBooking, setViewingBooking] = useState<{ url: string; name: string; mimeType: string } | null>(null);

  // Find booking docs for a city, optionally filtered by type
  const getDocsForCity = (cityName: string, docType?: 'hotel' | 'transport'): BookingDoc[] => {
    if (!cityName || !trip.bookingDocs || trip.bookingDocs.length === 0) {
      const blobDocs = getBookingFilesForCity(cityName);
      return blobDocs.map(b => ({ id: b.name, name: b.name, storagePath: '', url: b.url, mimeType: b.mimeType, matchCities: [], uploadedAt: '' }));
    }
    const key = cityName.toLowerCase();
    // Filter by docType if specified, allow untyped docs to match either
    const typeFilter = (d: BookingDoc) => !docType || !d.docType || d.docType === docType || d.docType === 'general';
    // 1. Match by city + type
    const cityMatch = trip.bookingDocs.filter(d =>
      typeFilter(d) && d.matchCities.some(c => c.includes(key) || key.includes(c))
    );
    if (cityMatch.length > 0) return cityMatch;
    // 2. Match by filename + type
    const nameMatch = trip.bookingDocs.filter(d =>
      typeFilter(d) && d.name.toLowerCase().includes(key)
    );
    if (nameMatch.length > 0) return nameMatch;
    // 3. Untagged docs of matching type
    const untagged = trip.bookingDocs.filter(d =>
      typeFilter(d) && d.matchCities.length === 0
    );
    if (untagged.length > 0) return untagged;
    return [];
  };

  // Real hub-to-hotel distances (fetched from Google Directions)
  const hubToHotelRef = useRef<Record<string, { distance: string; duration: string }>>({});
  const [hubToHotelDistances, setHubToHotelDistances] = useState<Record<string, { distance: string; duration: string }>>({});
  const hubFetchedRef = useRef<Set<string>>(new Set());

  // Fetch arrival airport → hotel AND hotel → departure airport distances
  // Stored separately: "arr-{di}" for arrival, "dep-{di}" for departure
  useEffect(() => {
    trip.destinations.forEach((dest, di) => {
      if (!dest.selectedHotel) return;
      // Use precise address/coordinates if available (custom stays with Google Places), fall back to name + city
      const hotelQuery = dest.selectedHotel.address
        ? dest.selectedHotel.address
        : `${dest.selectedHotel.name}, ${dest.city.name}`;

      // ARRIVAL: previous leg's landing airport/station → hotel
      const arrLeg = trip.transportLegs[di];
      if (arrLeg) {
        const arrInfo = resolvedAirportsRef.current[di] || arrLeg.resolvedAirports;
        let arrHub = '';
        if (arrLeg.selectedFlight && arrInfo?.toCode) {
          arrHub = `${arrInfo.toCity || arrInfo.toCode} Airport`;
        } else if (arrLeg.selectedTrain) {
          arrHub = dest.city.trainStation?.name || `${dest.city.name} Station`;
        }
        if (arrHub) {
          const key = `arr-${di}-${dest.selectedHotel.name}-${arrInfo?.toCode || ''}`;
          if (!hubFetchedRef.current.has(key)) {
            hubFetchedRef.current.add(key);
            getDirections(`${arrHub}, ${dest.city.name}`, hotelQuery, 'driving').then(result => {
              if (result) {
                setHubToHotelDistances(prev => ({ ...prev, [`arr-${di}`]: { distance: result.distanceText, duration: result.durationText } }));
              }
            });
          }
        }
      }

      // DEPARTURE: hotel → next leg's departure airport/station
      const depLeg = trip.transportLegs[di + 1] || (trip.tripType === 'roundTrip' && di === trip.destinations.length - 1 ? trip.transportLegs[trip.transportLegs.length - 1] : null);
      if (depLeg) {
        const depInfo = resolvedAirportsRef.current[di + 1] || depLeg.resolvedAirports;
        let depHub = '';
        if (depLeg.selectedFlight && depInfo?.fromCode) {
          depHub = `${depInfo.fromCity || depInfo.fromCode} Airport`;
        } else if (depLeg.selectedTrain) {
          depHub = dest.city.trainStation?.name || `${dest.city.name} Station`;
        }
        if (depHub) {
          const key = `dep-${di}-${dest.selectedHotel.name}-${depInfo?.fromCode || depHub}`;
          if (!hubFetchedRef.current.has(key)) {
            hubFetchedRef.current.add(key);
            getDirections(hotelQuery, `${depHub}, ${dest.city.name}`, 'driving').then(result => {
              if (result) {
                setHubToHotelDistances(prev => ({ ...prev, [`dep-${di}`]: { distance: result.distanceText, duration: result.durationText } }));
              }
            });
          }
        }
      }
    });
  }, [trip.destinations.map(d => `${d.id}-${d.selectedHotel?.name || ''}`).join(','), trip.transportLegs.map(l => `${l.selectedFlight?.id || ''}-${l.selectedTrain?.id || ''}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch real road distance from home address to departure airport
  const homeToAirportRef = useRef<{ distance: string; duration: string } | null>(null);
  const [homeToAirportDist, setHomeToAirportDist] = useState<{ distance: string; duration: string } | null>(null);
  const homeAirportFetchedRef = useRef('');
  useEffect(() => {
    const firstLeg = trip.transportLegs[0];
    if (!firstLeg?.selectedFlight || !trip.fromAddress) return;
    const info = resolvedAirportsRef.current[0] || firstLeg.resolvedAirports;
    if (!info?.fromCode) return;
    const airportName = info.fromCity ? `${info.fromCity} Airport` : `${info.fromCode} Airport`;
    const key = `${trip.fromAddress}-${info.fromCode}`;
    if (homeAirportFetchedRef.current === key) return;
    homeAirportFetchedRef.current = key;
    getDirections(trip.fromAddress, airportName, 'driving').then(result => {
      if (result) {
        homeToAirportRef.current = { distance: result.distanceText, duration: result.durationText };
        setHomeToAirportDist({ distance: result.distanceText, duration: result.durationText });
      }
    });
  }, [trip.fromAddress, trip.transportLegs[0]?.selectedFlight, trip.transportLegs[0]?.resolvedAirports]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Cache resolved airport info per leg (codes, names, cities, distances)
  const resolvedAirportsRef = useRef<Record<number, {
    fromCode: string; toCode: string;
    fromAirport: string; toAirport: string;
    fromCity: string; toCity: string;
    fromDistance: number; toDistance: number;
    nearestFromCode?: string; nearestFromCity?: string; nearestFromDist?: number;
  }>>({});
  const pendingCountRef = useRef(0);

  // Restore resolvedAirportsRef from saved transport leg data on load
  useEffect(() => {
    trip.transportLegs.forEach((leg, i) => {
      if (leg.resolvedAirports && !resolvedAirportsRef.current[i]) {
        resolvedAirportsRef.current[i] = leg.resolvedAirports;
      }
    });
  }, [trip.transportLegs]);

  const trackPending = (delta: number) => {
    pendingCountRef.current += delta;
    if (pendingCountRef.current <= 0) {
      pendingCountRef.current = 0;
      autoSelectLoadingRef.current = false;
      setAutoSelectLoading(false);
    }
  };

  useEffect(() => {
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;

    // Ensure return leg exists for round trips
    if (trip.tripType === 'roundTrip') {
      const expectedLegs = trip.destinations.length + 1;
      if (trip.transportLegs.length < expectedLegs) {
        trip.setTripType('roundTrip'); // This adds the missing return leg
      }
    }

    // Check if anything needs auto-selecting
    const needsFlights = trip.transportLegs.some(l => !l.selectedFlight && !l.selectedTrain && (l.type === 'flight' || l.type === 'drive'));
    const needsHotels = trip.destinations.some(d => !d.selectedHotel && d.nights > 0);

    if (needsFlights || needsHotels) {
      autoSelectLoadingRef.current = true;
      setAutoSelectLoading(true);
    }

    // Auto-select best transport for each leg (flight OR train, whichever is cheaper/better)
    trip.transportLegs.forEach((leg, i) => {
      if (leg.selectedFlight || leg.selectedTrain) return; // Already selected

      const fromC = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
      const toC = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
      if (!fromC || !toC) return;
      // Use city names (not airport codes) so the API can do parallel nearby-airport search
      // This finds flights even when the city's own airport has no direct routes
      let fc = fromC.name || fromC.fullName || findAirportCode(fromC);
      let tc = toC.name || toC.fullName || findAirportCode(toC);

      // For return leg (last leg in round trip going back to origin),
      // reuse the resolved airport from leg 0 so we get the same airport
      const isReturnLeg = trip.tripType === 'roundTrip' && i === trip.transportLegs.length - 1 && i > 0;
      if (isReturnLeg && resolvedAirportsRef.current[0]) {
        // Return: swap the outgoing leg's airports (AMS→AMD instead of re-resolving Amsterdam→Mumbai)
        tc = resolvedAirportsRef.current[0].fromCode; // Origin airport (e.g., AMD)
      }
      // For any leg, if previous leg resolved the departure city's airport, reuse it
      if (i > 0 && resolvedAirportsRef.current[i - 1]?.toCode) {
        fc = resolvedAirportsRef.current[i - 1].toCode; // Previous leg's arrival = this leg's departure
      }

      const fromName = fromC.name || fromC.fullName || fc;
      const toName = toC.name || toC.fullName || tc;
      if (!fc || !tc || fc === tc) return;

      let dayOffset = 0;
      for (let d = 0; d < Math.min(i, trip.destinations.length); d++) {
        dayOffset += trip.destinations[d].nights ?? 0;
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

        // Store resolved airport info for display (airport codes, names, distances)
        const resolvedFrom = flightData.fromResolved || fc;
        const resolvedTo = flightData.toResolved || tc;
        // Cache resolved info per leg for display
        const nearestFrom = flightData.nearestFrom;
        const resolvedInfo = {
          fromCode: resolvedFrom, toCode: resolvedTo,
          fromAirport: flightData.fromAirport || '',
          toAirport: flightData.toAirport || '',
          fromCity: flightData.fromCity || '',
          toCity: flightData.toCity || '',
          fromDistance: flightData.fromDistance || 0,
          toDistance: flightData.toDistance || 0,
          nearestFromCode: nearestFrom?.code,
          nearestFromCity: nearestFrom?.city,
          nearestFromDist: nearestFrom?.distance,
        };
        resolvedAirportsRef.current[i] = resolvedInfo;
        // Persist resolved airport info on the transport leg for reload
        trip.updateTransportLeg(leg.id, { resolvedAirports: resolvedInfo });

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
              duration: cheapestFlight.duration, stops: cheapestFlight.stops, route: `${resolvedFrom}-${resolvedTo}`,
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
            duration: cheapestFlight.duration, stops: cheapestFlight.stops, route: `${resolvedFrom}-${resolvedTo}`,
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
      // Calculate proper check-in/check-out dates for this destination
      let hotelCheckInOffset = 0;
      for (let d = 0; d < i; d++) {
        hotelCheckInOffset += trip.destinations[d]?.nights ?? 0;
      }
      const checkInDate = new Date(trip.departureDate);
      checkInDate.setDate(checkInDate.getDate() + hotelCheckInOffset);
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setDate(checkOutDate.getDate() + (dest.nights ?? 1));
      const checkInStr = checkInDate.toISOString().split('T')[0];
      const checkOutStr = checkOutDate.toISOString().split('T')[0];
      fetch(`/api/nearby?location=${encodeURIComponent(dest.city.fullName || dest.city.name)}&checkIn=${checkInStr}&checkOut=${checkOutStr}`)
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

  // Track if date/nights changed since last fetch — show "Update" button instead of auto-refetching
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const savedDateRef = useRef('');
  const savedNightsRef = useRef('');
  const nightsKey = trip.destinations.map(d => d.nights).join(',');

  useEffect(() => {
    if (!tripStableRef.current) {
      savedDateRef.current = trip.departureDate;
      savedNightsRef.current = nightsKey;
      return;
    }
    if (savedDateRef.current === '' || savedNightsRef.current === '') {
      savedDateRef.current = trip.departureDate;
      savedNightsRef.current = nightsKey;
      return;
    }
    const dateChanged = savedDateRef.current !== trip.departureDate;
    const nightsChanged = savedNightsRef.current !== nightsKey;
    if (dateChanged || nightsChanged) {
      setNeedsRefresh(true);
      // Clear stale caches
      for (let li = 0; li < trip.transportLegs.length; li++) delete flightCacheRef.current[li];
    }
    // Detect switch to round trip with empty return leg
    if (trip.tripType === 'roundTrip' && trip.transportLegs.length > 0) {
      const returnLeg = trip.transportLegs[trip.transportLegs.length - 1];
      if (returnLeg && !returnLeg.selectedFlight && !returnLeg.selectedTrain && returnLeg.duration === '~') {
        setNeedsRefresh(true);
      }
    }
  }, [trip.departureDate, nightsKey, trip.tripType, trip.transportLegs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual refresh function — called by the "Update" button
  const refreshTransport = () => {
    setIsRefreshing(true);
    setNeedsRefresh(false);
    savedDateRef.current = trip.departureDate;
    savedNightsRef.current = nightsKey;

    const hasSelections = trip.transportLegs.filter(l => l.selectedFlight || l.selectedTrain).length;
    const emptyLegs = trip.transportLegs.filter(l => !l.selectedFlight && !l.selectedTrain).length;
    const total = hasSelections + emptyLegs;
    if (total > 0) setFlightUpdateToast(`${hasSelections > 0 ? 'Updating' : 'Searching'} ${total} transport option${total > 1 ? 's' : ''}...`);

    let pending = 0;
    const onDone = () => { pending--; if (pending <= 0) { setFlightUpdateToast(null); setIsRefreshing(false); } };

    trip.transportLegs.forEach((leg, i) => {

      const fromC = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
      const toC = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
      if (!fromC || !toC) return;

      const legDateStr = calcDepartureDate(i).toISOString().split('T')[0];

      if (leg.selectedFlight) {
        const info = resolvedAirportsRef.current[i] || leg.resolvedAirports;
        const fc = info?.fromCode || findAirportCode(fromC) || fromC.name;
        const tc = info?.toCode || findAirportCode(toC) || toC.name;
        if (!fc || !tc || fc === tc) return;

        pending++;
        fetch(`/api/flights?from=${encodeURIComponent(fc)}&to=${encodeURIComponent(tc)}&date=${legDateStr}&adults=${trip.adults}`)
          .then(r => r.json())
          .then(data => {
            if (data.flights?.length > 0) {
              const cheapest = data.flights.sort((a: any, b: any) => a.price - b.price)[0];
              trip.selectFlight(leg.id, {
                id: `auto-${cheapest.flightNumber}`, airline: cheapest.airline, airlineCode: cheapest.airlineCode,
                flightNumber: cheapest.flightNumber, departure: cheapest.departure, arrival: cheapest.arrival,
                duration: cheapest.duration, stops: cheapest.stops, route: `${data.fromResolved || fc}-${data.toResolved || tc}`,
                pricePerAdult: cheapest.price, color: AIRLINE_COLORS[cheapest.airlineCode] || '#6b7280',
              });
              flightCacheRef.current[i] = data.flights;
            }
            onDone();
          }).catch(() => onDone());
      } else if (leg.selectedTrain) {
        const fromName = fromC.name || fromC.fullName;
        const toName = toC.name || toC.fullName;
        pending++;
        fetch(`/api/trains?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${legDateStr}`)
          .then(r => r.json())
          .then(data => {
            if (data.trains?.length > 0) {
              const cheapest = data.trains.sort((a: any, b: any) => a.price - b.price)[0];
              trip.selectTrain(leg.id, {
                id: `auto-${cheapest.name}`, operator: cheapest.operator || '', trainName: cheapest.name || '',
                trainNumber: cheapest.trainNumber || '', departure: cheapest.departure, arrival: cheapest.arrival,
                duration: cheapest.duration, stops: cheapest.stops || 'Direct',
                fromStation: cheapest.fromStation || fromName, toStation: cheapest.toStation || toName,
                price: cheapest.price, color: '#f59e0b',
              });
            }
            onDone();
          }).catch(() => onDone());
      } else {
        // Empty leg (no selection yet) — search for cheapest flight using city names for better nearby airport coverage
        const fc = fromC.name || fromC.fullName || findAirportCode(fromC);
        const tc = toC.name || toC.fullName || findAirportCode(toC);
        if (!fc || !tc || fc === tc) return;
        pending++;
        fetch(`/api/flights?from=${encodeURIComponent(fc)}&to=${encodeURIComponent(tc)}&date=${legDateStr}&adults=${trip.adults}`)
          .then(r => r.json())
          .then(data => {
            if (data.flights?.length > 0) {
              const cheapest = data.flights.sort((a: any, b: any) => a.price - b.price)[0];
              trip.selectFlight(leg.id, {
                id: `auto-${cheapest.flightNumber}`, airline: cheapest.airline, airlineCode: cheapest.airlineCode,
                flightNumber: cheapest.flightNumber, departure: cheapest.departure, arrival: cheapest.arrival,
                duration: cheapest.duration, stops: cheapest.stops, route: `${data.fromResolved || fc}-${data.toResolved || tc}`,
                pricePerAdult: cheapest.price, color: AIRLINE_COLORS[cheapest.airlineCode] || '#6b7280',
              });
              flightCacheRef.current[i] = data.flights;
            }
            onDone();
          }).catch(() => onDone());
      }
    });
    if (pending === 0) { setFlightUpdateToast(null); setIsRefreshing(false); }
  };

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
  const rooms = Math.ceil((trip.adults + trip.children) / 2); // ~2 persons per room (infants share with adults)
  // Transport cost: adults + children (full fare) + infants (15% of adult fare)
  const transportPax = trip.adults + trip.children; // children pay full fare
  const infantMultiplier = trip.infants * 0.15; // infants pay 15% of adult fare
  const flightCost = trip.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + l.selectedFlight!.pricePerAdult * (transportPax + infantMultiplier), 0);
  const trainCost = trip.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + l.selectedTrain!.price * (transportPax + infantMultiplier), 0);
  const hotelCost = trip.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => {
    const extras = d.additionalHotels || [];
    const extraNights = extras.reduce((es, h) => es + h.nights, 0);
    const primaryNights = d.nights - extraNights;
    const primaryCost = d.selectedHotel!.pricePerNight * Math.max(0, primaryNights);
    const extraCost = extras.reduce((es, h) => es + h.hotel.pricePerNight * h.nights, 0);
    return s + (primaryCost + extraCost) * rooms;
  }, 0);
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
        d.setDate(d.getDate() + (trip.destinations[s - 1]?.nights ?? 0));
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
    // Use full name with country (e.g., "Barcelona, Spain" not just "Barcelona")
    // to avoid geocoding to wrong places (a "Barcelona" restaurant near Mumbai)
    return city.fullName || city.parentCity || city.name || '';
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

  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-text-secondary text-sm font-body">Loading your trip...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[760px]">
        <div id="trip-content" className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          {/* Nav */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/my-trips')} className="font-display text-lg font-bold hover:opacity-80 transition-opacity"><span className="text-accent-cyan">AI</span>Ezzy</button>
              <span className="text-text-muted text-xs">/</span>
              <button onClick={() => router.push(trip.tripId ? `/plan?id=${trip.tripId}` : '/plan')} className="text-text-secondary text-xs font-body hover:text-accent-cyan transition-colors">Edit Trip</button>
              <span className="text-text-muted text-xs">/</span>
              <span className="text-text-primary text-xs font-body font-semibold">Route</span>
            </div>
            {session?.user?.name && <span className="text-text-muted text-xs font-body">{session.user.name}</span>}
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="font-display text-lg font-bold text-text-primary">Plan Transport & Stay by City</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <input
                type="date"
                value={trip.departureDate}
                onChange={e => trip.setDepartureDate(e.target.value)}
                className="bg-transparent border border-border-subtle rounded-md px-1.5 py-0.5 text-text-muted text-xs font-mono outline-none focus:border-accent-cyan transition-colors [color-scheme:light] cursor-pointer"
              />
              <span className="text-text-muted text-xs">&middot;</span>
              <div className="flex items-center gap-1">
                <button onClick={() => trip.setAdults(Math.max(1, trip.adults - 1))}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">-</button>
                <span className="text-text-muted text-xs font-mono">{trip.adults} adult{trip.adults > 1 ? 's' : ''}</span>
                <button onClick={() => trip.setAdults(trip.adults + 1)}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">+</button>
              </div>
              <span className="text-text-muted text-xs">&middot;</span>
              <div className="flex items-center gap-1">
                <button onClick={() => trip.setChildren(Math.max(0, trip.children - 1))}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">-</button>
                <span className="text-text-muted text-xs font-mono">{trip.children} child</span>
                <button onClick={() => trip.setChildren(trip.children + 1)}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">+</button>
              </div>
              <span className="text-text-muted text-xs">&middot;</span>
              <div className="flex items-center gap-1">
                <button onClick={() => trip.setInfants(Math.max(0, trip.infants - 1))}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">-</button>
                <span className="text-text-muted text-xs font-mono">{trip.infants} infant</span>
                <button onClick={() => trip.setInfants(trip.infants + 1)}
                  className="w-4 h-4 rounded bg-bg-card border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[9px] flex items-center justify-center transition-colors">+</button>
              </div>
              <span className="text-text-muted text-xs">&middot;</span>
              <button
                onClick={() => trip.setTripType(trip.tripType === 'roundTrip' ? 'oneWay' : 'roundTrip')}
                className="text-xs font-mono text-text-muted hover:text-accent-cyan transition-colors border border-border-subtle rounded-md px-1.5 py-0.5 cursor-pointer"
              >
                {trip.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
              </button>
              {/* Update button — appears when date/nights changed */}
              {needsRefresh && (
                <button
                  onClick={refreshTransport}
                  disabled={isRefreshing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent-cyan text-white text-[10px] font-display font-bold hover:bg-accent-cyan/90 transition-all disabled:opacity-50 flex-shrink-0 animate-pulse"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  {isRefreshing ? 'Updating...' : 'Update Flights & Trains'}
                </button>
              )}
            </div>
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
                    d.setDate(d.getDate() + (trip.destinations[s - 1]?.nights ?? 0));
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-sm text-text-primary">{stop.name}</h3>
                        {stop.type === 'destination' && (
                          <WeatherBadge city={stop.name} date={arrivalDate.toISOString().split('T')[0]} />
                        )}
                      </div>
                      {/* Airport info — only for home stops (departure & return), not destinations */}
                      {(() => {
                        const curLeg = trip.transportLegs[i];
                        const prevLeg = i > 0 ? trip.transportLegs[i - 1] : null;
                        const info = resolvedAirportsRef.current[i] || curLeg?.resolvedAirports;
                        const prevInfo = i > 0 ? (resolvedAirportsRef.current[i - 1] || prevLeg?.resolvedAirports) : null;
                        const firstInfo = resolvedAirportsRef.current[0] || trip.transportLegs[0]?.resolvedAirports;
                        const isLastHome = stop.type === 'home' && i === stops.length - 1 && trip.tripType === 'roundTrip' && i > 0;

                        // Only show on home stops (first stop + return home)
                        if (stop.type === 'destination') return null;
                        if (i === 0 && !curLeg?.selectedFlight) return null;
                        if (isLastHome && !prevLeg?.selectedFlight) return null;
                        if (!i && !isLastHome) return null;

                        let airportCode: string | undefined, airportCity: string | undefined, airportDist: number | undefined;
                        if (i === 0) {
                          airportCode = info?.fromCode;
                          airportCity = info?.fromCity;
                          airportDist = info?.fromDistance;
                        } else if (isLastHome) {
                          airportCode = prevInfo?.toCode;
                          airportCity = prevInfo?.toCity;
                          if (prevInfo?.toCode && firstInfo?.nearestFromCode === prevInfo.toCode) {
                            airportDist = firstInfo.nearestFromDist;
                          } else if (prevInfo?.toCode && firstInfo?.fromCode === prevInfo.toCode) {
                            airportDist = firstInfo.fromDistance;
                          } else {
                            airportDist = undefined;
                          }
                        }

                        if (!airportCode) return null;

                        // Show nearest airport note for first stop
                        const nearest = i === 0 ? info : null;
                        if (nearest?.nearestFromCode && nearest.nearestFromCode !== airportCode && airportDist && airportDist >= 30) {
                          return (
                            <div className="text-[10px] font-body mt-0.5 space-y-0.5">
                              <p className="text-amber-600">
                                Flights from {airportCity || airportCode} ({airportCode}), {Math.round(airportDist)} km away
                              </p>
                              <p className="text-text-muted">
                                Nearest airport {nearest.nearestFromCity || nearest.nearestFromCode} ({nearest.nearestFromCode}) is {Math.round(nearest.nearestFromDist || 0)} km away but has no available flights
                              </p>
                            </div>
                          );
                        }

                        // Use real road distance for home stops when available
                        const realHome = homeToAirportDist;
                        const distStr = realHome ? `${realHome.distance} (${realHome.duration})` : (airportDist && airportDist >= 30 ? `${Math.round(airportDist)} km` : '');
                        const msg = i === 0
                          ? `Flights from ${airportCity || airportCode} (${airportCode})${distStr ? `, ${distStr} away` : ''}`
                          : `Flight will land in ${airportCity || airportCode} (${airportCode})${distStr ? `, ${distStr} away` : ''}`;

                        return (
                          <p className="text-[10px] text-amber-600 font-body mt-0.5">{msg}</p>
                        );
                      })()}
                      {/* Arrival hub → hotel distance (airport or station) */}
                      {stop.type === 'destination' && (() => {
                        const prevLeg = i > 0 ? trip.transportLegs[i - 1] : null;
                        const dest = stop.destIndex !== undefined ? trip.destinations[stop.destIndex] : null;
                        const destCity = dest?.city;
                        const hotelName = dest?.selectedHotel?.name;
                        const toLabel = hotelName || destCity?.parentCity || destCity?.name || '';
                        const di = stop.destIndex ?? -1;
                        // Real distance from Google Directions (hotel-specific)
                        const realDist = di >= 0 ? hubToHotelDistances[`arr-${di}`] : null;

                        // Flight arrival: use resolved airport info
                        if (prevLeg?.selectedFlight && i > 0) {
                          const prevInfo = resolvedAirportsRef.current[i - 1] || prevLeg?.resolvedAirports;
                          if (prevInfo?.toCode) {
                            const distLabel = realDist?.distance || (() => {
                              const hub = destCity?.airport;
                              return (hub && hub.code === prevInfo.toCode ? hub.transitToCenter.distance : null)
                                || (prevInfo.toDistance ? `${Math.round(prevInfo.toDistance)} km` : null);
                            })();
                            const durLabel = realDist?.duration || (() => {
                              const hub = destCity?.airport;
                              return hub && hub.code === prevInfo.toCode ? `~${hub.transitToCenter.durationMin} min` : null;
                            })();
                            return (
                              <p className="text-[10px] text-teal-600 font-body mt-0.5">
                                Arriving at {prevInfo.toCity || prevInfo.toCode} ({prevInfo.toCode}){distLabel ? `, ${distLabel}` : ''}{durLabel ? ` (${durLabel})` : ''} to {toLabel}
                              </p>
                            );
                          }
                        }

                        // Train/bus arrival: use station info from city data
                        if (prevLeg?.selectedTrain && i > 0) {
                          const station = destCity?.trainStation;
                          if (station) {
                            const distLabel = realDist?.distance || station.transitToCenter.distance;
                            const durLabel = realDist?.duration || `~${station.transitToCenter.durationMin} min`;
                            return (
                              <p className="text-[10px] text-teal-600 font-body mt-0.5">
                                Arriving at {station.name}, {distLabel} ({durLabel}) to {toLabel}
                              </p>
                            );
                          }
                        }

                        // First destination: show airport/station distance if flight/train was used to get here
                        if (i === 0) {
                          const firstLeg = trip.transportLegs[0];
                          if (firstLeg?.selectedFlight) {
                            const info = resolvedAirportsRef.current[0] || firstLeg?.resolvedAirports;
                            if (info?.toCode) {
                              const distLabel = realDist?.distance || (() => {
                                const hub = destCity?.airport;
                                return (hub && hub.code === info.toCode ? hub.transitToCenter.distance : null)
                                  || (info.toDistance ? `${Math.round(info.toDistance)} km` : null);
                              })();
                              const durLabel = realDist?.duration || (() => {
                                const hub = destCity?.airport;
                                return hub && hub.code === info.toCode ? `~${hub.transitToCenter.durationMin} min` : null;
                              })();
                              return (
                                <p className="text-[10px] text-teal-600 font-body mt-0.5">
                                  Arriving at {info.toCity || info.toCode} ({info.toCode}){distLabel ? `, ${distLabel}` : ''}{durLabel ? ` (${durLabel})` : ''} to {toLabel}
                                </p>
                              );
                            }
                          } else if (firstLeg?.selectedTrain) {
                            const station = destCity?.trainStation;
                            if (station) {
                              return (
                                <p className="text-[10px] text-teal-600 font-body mt-0.5">
                                  Arriving at {station.name}, {station.transitToCenter.distance} (~{station.transitToCenter.durationMin} min) to {toLabel}
                                </p>
                              );
                            }
                          }
                        }

                        return null;
                      })()}
                      {/* Visa requirement badge */}
                      {stop.type === 'destination' && (() => {
                        const dest = stop.destIndex !== undefined ? trip.destinations[stop.destIndex] : null;
                        if (!dest) return null;
                        const country = dest.city.country;
                        if (!country || country === 'India') return null;
                        const visa = getVisaInfo(country);
                        if (!visa) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: visa.color }} />
                            <span className="text-[10px] font-body" style={{ color: visa.color }}>{visa.label}{visa.duration ? ` (${visa.duration})` : ''}</span>
                            {visa.note && <span className="text-[10px] font-body text-text-muted">&middot; {visa.note}</span>}
                          </div>
                        );
                      })()}
                      {/* Places sub-list */}
                      {stop.type === 'destination' && (() => {
                        const dest = stop.destIndex !== undefined ? trip.destinations[stop.destIndex] : null;
                        if (!dest || !dest.places || dest.places.length === 0) return null;
                        // Don't show if all place names match the city name
                        const cityNameLower = dest.city.name.toLowerCase();
                        const meaningfulPlaces = dest.places.filter(p => p.name.toLowerCase() !== cityNameLower);
                        if (meaningfulPlaces.length === 0) return null;
                        return (
                          <div className="mt-1 space-y-0.5">
                            {dest.places.map(p => (
                              <div key={p.id} className="flex items-center gap-1.5 text-[10px] text-text-secondary font-body">
                                <span className="w-1 h-1 rounded-full bg-accent-cyan/50 flex-shrink-0" />
                                <span className="truncate">{p.name}</span>
                                <span className="text-text-muted">({p.nights}N)</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
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
                          // Primary hotel nights = total nights minus additional hotel nights
                          const extras = dest?.additionalHotels || [];
                          const extraNights = extras.reduce((s, h) => s + h.nights, 0);
                          const primaryNights = Math.max(1, nights - extraNights);
                          const totalPrice = hotel.pricePerNight * primaryNights * rooms;
                          const checkIn = new Date(arrivalDate);
                          const checkOut = new Date(arrivalDate);
                          checkOut.setDate(checkOut.getDate() + primaryNights);
                          const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                          return (
                            <div className="mt-1.5 bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-display font-bold text-text-primary">{hotel.name}</span>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  <a
                                    href={getHotelBookingUrl(
                                      hotel.name,
                                      stop.name,
                                      checkIn.toISOString().split('T')[0],
                                      checkOut.toISOString().split('T')[0]
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-accent-gold text-[10px] font-body hover:underline flex items-center gap-0.5"
                                  >
                                    Book
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </a>
                                  {(() => {
                                    const docs = getDocsForCity(stop.explore || stop.name, 'hotel');
                                    return docs.length > 0 ? (
                                      <button onClick={() => setViewingBooking(docs[0])}
                                        className="text-purple-600 text-[10px] font-body hover:underline flex items-center gap-0.5">
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                        Booking
                                      </button>
                                    ) : null;
                                  })()}
                                  <button onClick={() => stop.destIndex !== undefined && setHotelModal({ destIndex: stop.destIndex })}
                                    className="text-accent-cyan text-[10px] font-body hover:underline">Change</button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-[10px]">
                                {hotel.rating > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: hotel.ratingColor, fontSize: '9px' }}>{hotel.rating}</span>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => dest && trip.updateNights(dest.id, nights - 1)}
                                    aria-label="Decrease nights"
                                    className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">-</button>
                                  <span className="text-text-primary font-mono font-bold">{primaryNights}N</span>
                                  <button onClick={() => dest && trip.updateNights(dest.id, nights + 1)}
                                    aria-label="Increase nights"
                                    className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">+</button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                                <span>Check-in {fmtDate(checkIn)} &rarr; Check-out {fmtDate(checkOut)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-text-secondary font-body">{formatPrice(hotel.pricePerNight, currency)}/night &times; {primaryNights}{rooms > 1 && <> &times; {rooms} rooms</>}</span>
                                <span className="text-accent-cyan font-mono font-bold">{formatPrice(totalPrice, currency)}</span>
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
                      {/* Additional Hotels */}
                      {stop.type === 'destination' && stop.destIndex !== undefined && (() => {
                        const dest = trip.destinations[stop.destIndex!];
                        if (!dest || !dest.selectedHotel || dest.nights <= 0) return null;
                        const extras = dest.additionalHotels || [];
                        const primaryNights = dest.selectedHotel
                          ? dest.nights - extras.reduce((s, h) => s + h.nights, 0)
                          : dest.nights;
                        const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

                        return (
                          <div className="mt-1.5 space-y-1.5">
                            {/* Additional hotel cards */}
                            {extras.map((stay, idx) => {
                              const checkIn = new Date(arrivalDate);
                              checkIn.setDate(checkIn.getDate() + primaryNights + extras.slice(0, idx).reduce((s, h) => s + h.nights, 0));
                              const checkOut = new Date(checkIn);
                              checkOut.setDate(checkOut.getDate() + stay.nights);
                              const totalPrice = stay.hotel.pricePerNight * stay.nights * rooms;
                              return (
                                <div key={idx} className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-display font-bold text-text-primary">{stay.hotel.name}</span>
                                    <button onClick={() => trip.removeAdditionalHotel(dest.id, idx)}
                                      className="text-text-muted text-[10px] font-body hover:text-accent-cyan transition-colors">Remove</button>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    {stay.hotel.rating > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: stay.hotel.ratingColor, fontSize: '9px' }}>{stay.hotel.rating}</span>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => trip.updateAdditionalHotelNights(dest.id, idx, stay.nights - 1)}
                                        aria-label="Decrease nights"
                                        className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">-</button>
                                      <span className="text-text-primary font-mono font-bold">{stay.nights}N</span>
                                      <button onClick={() => trip.updateAdditionalHotelNights(dest.id, idx, stay.nights + 1)}
                                        aria-label="Increase nights"
                                        className="w-5 h-5 rounded bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-[10px] flex items-center justify-center transition-colors">+</button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                                    <span>Check-in {fmtDate(checkIn)} &rarr; Check-out {fmtDate(checkOut)}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-text-secondary font-body">{formatPrice(stay.hotel.pricePerNight, currency)}/night &times; {stay.nights}{rooms > 1 && <> &times; {rooms} rooms</>}</span>
                                    <span className="text-accent-cyan font-mono font-bold">{formatPrice(totalPrice, currency)}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Add another hotel button */}
                            <button
                              onClick={() => setHotelModal({ destIndex: stop.destIndex!, isAdditional: true })}
                              className="text-[10px] text-text-muted hover:text-accent-cyan font-body transition-colors flex items-center gap-1"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                              </svg>
                              Add another hotel
                            </button>
                          </div>
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
                          {(() => {
                            const info = resolvedAirportsRef.current[i] || leg.resolvedAirports;
                            const duration = leg.selectedFlight ? leg.selectedFlight.duration : leg.selectedTrain ? leg.selectedTrain.duration : leg.duration;

                            // Build route display: "Ahmedabad (AMD) - Amsterdam (AMS)"
                            let routeDisplay = leg.distance || '';
                            if (leg.selectedFlight && info) {
                              const fCity = info.fromCity || fromCity?.parentCity || fromCity?.name || info.fromCode;
                              const tCity = info.toCity || toCity?.parentCity || toCity?.name || info.toCode;
                              routeDisplay = `${fCity} (${info.fromCode}) - ${tCity} (${info.toCode})`;
                            } else if (leg.selectedFlight) {
                              // Fallback: extract airport codes from saved route (e.g., "BOM-NRT")
                              const route = leg.selectedFlight.route || '';
                              const parts = route.split('-');
                              if (parts.length === 2 && /^[A-Z]{3,4}$/.test(parts[0].trim()) && /^[A-Z]{3,4}$/.test(parts[1].trim())) {
                                const fCode = parts[0].trim();
                                const tCode = parts[1].trim();
                                const fCity = fromCity?.parentCity || fCode;
                                const tCity = toCity?.parentCity || tCode;
                                routeDisplay = `${fCity} (${fCode}) - ${tCity} (${tCode})`;
                              } else {
                                routeDisplay = `${fromCity?.parentCity || fromCity?.name || ''} - ${toCity?.parentCity || toCity?.name || ''}`;
                              }
                            } else if (leg.selectedTrain) {
                              routeDisplay = `${fromCity?.parentCity || fromCity?.name || ''} - ${toCity?.parentCity || toCity?.name || ''}`;
                            }

                            return (
                              <span className="text-xs font-mono">
                                {duration} {' '}&middot;{' '} {routeDisplay}
                              </span>
                            );
                          })()}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted"><path d="M6 9l6 6 6-6"/></svg>
                        </button>

                        {/* Airport distance info in transport section */}
                        {leg.selectedFlight && (() => {
                          const info = resolvedAirportsRef.current[i] || leg.resolvedAirports;
                          if (!info?.fromCode) return null;
                          const depDestIdx = i > 0 ? Math.min(i - 1, trip.destinations.length - 1) : -1;
                          const depDest = depDestIdx >= 0 ? trip.destinations[depDestIdx] : null;
                          const depCity = i === 0 ? trip.from : depDest?.city;
                          const hotelName = depDest?.selectedHotel?.name;
                          const fromLabel = hotelName || depCity?.parentCity || depCity?.name || '';
                          // Use real Google Directions distance (hotel-specific or home-to-airport), fall back to static data
                          const realDist = i === 0 ? homeToAirportDist : (depDestIdx >= 0 ? hubToHotelDistances[`dep-${depDestIdx}`] : null);
                          const distLabel = realDist?.distance || (() => {
                            const hub = depCity?.airport;
                            return (hub && hub.code === info.fromCode ? hub.transitToCenter.distance : null)
                              || (info.fromDistance ? `${Math.round(info.fromDistance)} km` : null);
                          })();
                          const durLabel = realDist?.duration || (() => {
                            const hub = depCity?.airport;
                            return hub && hub.code === info.fromCode ? `~${hub.transitToCenter.durationMin} min` : null;
                          })();
                          return (
                            <p className="text-[10px] text-amber-600 font-body mt-0.5">
                              Departing from {info.fromCity || info.fromCode} ({info.fromCode}){distLabel ? `, ${distLabel}` : ''}{durLabel ? ` (${durLabel})` : ''} from {fromLabel}
                            </p>
                          );
                        })()}

                        {/* Selected flight details card */}
                        {leg.selectedFlight && (
                          <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-display font-bold text-text-primary">{leg.selectedFlight.airline} {leg.selectedFlight.flightNumber}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <a
                                  href={(() => {
                                    const route = leg.selectedFlight!.route || '';
                                    const parts = route.split('-');
                                    const fCode = parts[0]?.trim() || '';
                                    const tCode = parts[1]?.trim() || '';
                                    return getFlightBookingUrl(fCode, tCode, legDate.toISOString().split('T')[0], trip.adults);
                                  })()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-accent-gold text-[10px] font-body hover:underline flex items-center gap-0.5"
                                >
                                  Book
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                </a>
                                {(() => {
                                  const info = resolvedAirportsRef.current[i] || leg.resolvedAirports;
                                  const fromCity = info?.fromCity || '';
                                  const toCity = info?.toCity || '';
                                  const docs = [
                                    ...getDocsForCity(fromCity, 'transport'),
                                    ...getDocsForCity(toCity, 'transport'),
                                  ].filter((d, idx, arr) => arr.findIndex(x => x.url === d.url) === idx);
                                  const flightDocs = docs.filter(d => d.mimeType.includes('pdf') || d.mimeType.includes('image'));
                                  return flightDocs.length > 0 ? (
                                    <button onClick={() => setViewingBooking(flightDocs[0])}
                                      className="text-purple-600 text-[10px] font-body hover:underline flex items-center gap-0.5">
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                      Booking
                                    </button>
                                  ) : null;
                                })()}
                                <button onClick={() => setTransportModal({ legIndex: i })} className="text-accent-cyan text-[10px] font-body hover:underline">Change</button>
                              </div>
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
                              <span className="text-text-secondary font-body">{formatPrice(leg.selectedFlight.pricePerAdult, currency)}/pax &times; {transportPax}{trip.infants > 0 ? ` + ${trip.infants} infant` : ''}</span>
                              <span className="text-accent-cyan font-mono font-bold">{formatPrice(Math.round(leg.selectedFlight.pricePerAdult * (transportPax + infantMultiplier)), currency)}</span>
                            </div>
                          </div>
                        )}
                        {/* Station distance info in transport section */}
                        {leg.selectedTrain && (() => {
                          const depDestIdx = i > 0 ? Math.min(i - 1, trip.destinations.length - 1) : -1;
                          const depDest = depDestIdx >= 0 ? trip.destinations[depDestIdx] : null;
                          const depCity = i === 0 ? trip.from : depDest?.city;
                          const hotelName = depDest?.selectedHotel?.name;
                          const fromLabel = hotelName || depCity?.parentCity || depCity?.name || '';
                          const station = depCity?.trainStation;
                          if (!station) return null;
                          const realDist = depDestIdx >= 0 ? hubToHotelDistances[`dep-${depDestIdx}`] : null;
                          const distLabel = realDist?.distance || station.transitToCenter.distance;
                          const durLabel = realDist?.duration || `~${station.transitToCenter.durationMin} min`;
                          return (
                            <p className="text-[10px] text-amber-600 font-body mt-0.5">
                              Departing from {station.name}{distLabel ? `, ${distLabel}` : ''}{durLabel ? ` (${durLabel})` : ''} from {fromLabel}
                            </p>
                          );
                        })()}
                        {/* Selected train details card */}
                        {leg.selectedTrain && (
                          <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-display font-bold text-text-primary">{leg.selectedTrain.operator} {leg.selectedTrain.trainNumber}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                {(() => {
                                  const trainDocs = [
                                    ...getDocsForCity(leg.selectedTrain!.fromStation || '', 'transport'),
                                    ...getDocsForCity(leg.selectedTrain!.toStation || '', 'transport'),
                                  ].filter((d, idx, arr) => arr.findIndex(x => x.url === d.url) === idx);
                                  return trainDocs.length > 0 ? (
                                    <button onClick={() => setViewingBooking(trainDocs[0])}
                                      className="text-purple-600 text-[10px] font-body hover:underline flex items-center gap-0.5">
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                      Booking
                                    </button>
                                  ) : null;
                                })()}
                                <button onClick={() => setTransportModal({ legIndex: i })} className="text-accent-cyan text-[10px] font-body hover:underline">Change</button>
                              </div>
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
                              <span className="text-text-secondary font-body">{formatPrice(leg.selectedTrain.price, currency)}/pax &times; {trip.adults}</span>
                              <span className="text-accent-cyan font-mono font-bold">{formatPrice(leg.selectedTrain.price * trip.adults, currency)}</span>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-xs text-accent-gold uppercase tracking-widest">Trip Estimate</h3>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                aria-label="Select currency"
                className="text-[10px] font-mono bg-bg-surface border border-border-subtle rounded px-1.5 py-0.5 text-text-primary focus:outline-none focus:border-accent-cyan cursor-pointer"
              >
                {Object.entries(CURRENCIES).map(([code]) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-body">
                <span className="text-text-secondary">{trip.destinations.length} cities &middot; {totalNights} nights</span>
                <span className="text-text-muted">{trip.adults} pax</span>
              </div>
              {/* Budget bar chart */}
              {totalCost > 0 && (
                <div className="h-2 rounded-full overflow-hidden flex bg-bg-surface">
                  {flightCost > 0 && <div className="bg-accent-cyan h-full" style={{ width: `${(flightCost / totalCost * 100)}%` }} />}
                  {trainCost > 0 && <div className="bg-accent-gold h-full" style={{ width: `${(trainCost / totalCost * 100)}%` }} />}
                  {hotelCost > 0 && <div className="bg-blue-400 h-full" style={{ width: `${(hotelCost / totalCost * 100)}%` }} />}
                </div>
              )}
              {flightCost > 0 && (
                <div className="flex justify-between text-xs font-body">
                  <span className="text-text-secondary flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-accent-cyan inline-block flex-shrink-0" />
                    Flights
                    {totalCost > 0 && <span className="text-text-muted text-[10px]">({Math.round(flightCost / totalCost * 100)}%)</span>}
                  </span>
                  <span className="text-text-primary font-mono">{formatPrice(flightCost, currency)}</span>
                </div>
              )}
              {trainCost > 0 && (
                <div className="flex justify-between text-xs font-body">
                  <span className="text-text-secondary flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-accent-gold inline-block flex-shrink-0" />
                    Trains
                    {totalCost > 0 && <span className="text-text-muted text-[10px]">({Math.round(trainCost / totalCost * 100)}%)</span>}
                  </span>
                  <span className="text-text-primary font-mono">{formatPrice(trainCost, currency)}</span>
                </div>
              )}
              {hotelCost > 0 && (
                <div className="flex justify-between text-xs font-body">
                  <span className="text-text-secondary flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-blue-400 inline-block flex-shrink-0" />
                    Hotels
                    {totalCost > 0 && <span className="text-text-muted text-[10px]">({Math.round(hotelCost / totalCost * 100)}%)</span>}
                  </span>
                  <span className="text-text-primary font-mono">{formatPrice(hotelCost, currency)}</span>
                </div>
              )}
              {totalCost > 0 ? (
                <>
                <div className="flex justify-between text-sm font-body pt-2 border-t border-border-subtle">
                  <span className="text-text-primary font-semibold">Estimated Total</span>
                  <span className="text-accent-cyan font-mono font-bold">{formatPrice(totalCost, currency)}</span>
                </div>
                <p className="text-text-muted text-[10px] font-body mt-2 leading-relaxed">
                  Want a detailed hour-by-hour itinerary with activities, meals, and a complete budget? Use <span className="text-accent-cyan font-semibold">Deep Plan</span> below.
                </p>
                </>
              ) : (
                <p className="text-text-muted text-xs font-body italic">Select flights/trains and hotels to see cost</p>
              )}
              <p className="text-text-muted text-[10px] font-body mt-2">Prices are estimates and may vary at booking</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 space-y-3">
            {autoSaveStatus === 'pending' && (
              <p role="status" aria-live="polite" className="text-center text-[10px] font-body text-text-muted py-1">Saving in a moment...</p>
            )}
            {autoSaveStatus === 'saved' && (
              <p role="status" aria-live="polite" className="text-center text-[10px] font-body text-green-600 py-1">Auto-saved</p>
            )}
            {autoSaveStatus === 'error' && (
              <p role="status" aria-live="polite" className="text-center text-[10px] font-body text-red-500 py-1">Save failed — try refreshing</p>
            )}
            {autoSaveStatus === 'idle' && trip.lastSavedAt && (
              <p role="status" aria-live="polite" className="text-center text-[10px] font-body text-text-muted/50 py-1">Auto-saved</p>
            )}
            {/* Add to Calendar — only show when at least one flight/train or hotel is selected */}
            {(trip.transportLegs.some(l => l.selectedFlight || l.selectedTrain) || trip.destinations.some(d => d.selectedHotel)) && (
              <button
                onClick={() => {
                  const ics = generateICS(trip);
                  if (ics) {
                    const cityNames = trip.destinations.map(d => d.city.name).join('-');
                    downloadICS(ics, `trip-${cityNames || 'plan'}.ics`);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 border border-border-subtle text-text-secondary font-display font-bold py-3 rounded-xl text-xs transition-all hover:text-accent-cyan hover:border-accent-cyan/40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Add to Calendar
              </button>
            )}
            {/* Share trip — only show if trip is saved */}
            {trip.tripId && (
              <button
                onClick={() => setShowShareModal(true)}
                className="w-full flex items-center justify-center gap-2 border border-border-subtle text-text-secondary font-display font-bold py-3 rounded-xl text-xs transition-all hover:text-accent-cyan hover:border-accent-cyan/40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share Trip
              </button>
            )}
            <button
              onClick={() => {
                setPdfLoading(true);
                try {
                  const cityNames = trip.destinations.map(d => d.city.name).join('-');
                  exportTripPDFFromData({
                    from: trip.from,
                    fromAddress: trip.fromAddress,
                    destinations: trip.destinations,
                    transportLegs: trip.transportLegs,
                    departureDate: trip.departureDate,
                    adults: trip.adults,
                    children: trip.children,
                    infants: trip.infants,
                    tripType: trip.tripType,
                    currency,
                    formatPrice: (amount: number) => formatPrice(amount, currency),
                  }, `AIEzzy-Trip${cityNames ? '-' + cityNames : ''}.pdf`);
                } catch (e) {
                  console.error('PDF export failed:', e);
                } finally {
                  setPdfLoading(false);
                }
              }}
              disabled={pdfLoading}
              className="w-full flex items-center justify-center gap-2 border border-border-subtle text-text-secondary font-display font-bold py-3 rounded-xl text-xs transition-all hover:text-accent-cyan hover:border-accent-cyan/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-text-muted/30 border-t-text-secondary rounded-full animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
            {/* Packing List — show when at least one destination exists */}
            {trip.destinations.length > 0 && (
              <button
                onClick={() => setShowPackingList(true)}
                className="w-full flex items-center justify-center gap-2 border border-border-subtle text-text-secondary font-display font-bold py-3 rounded-xl text-xs transition-all hover:text-accent-cyan hover:border-accent-cyan/40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 14l2 2 4-4" />
                </svg>
                Packing List
              </button>
            )}
            {/* My Documents */}
            {trip.bookingDocs?.length > 0 && (
              <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
                <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">My Documents</p>
                <div className="space-y-1.5">
                  {trip.bookingDocs.map(doc => (
                    <button key={doc.id} onClick={() => setViewingBooking(doc)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent-cyan/5 transition-colors text-left">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500 flex-shrink-0">
                        {doc.mimeType.includes('pdf')
                          ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                          : <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>
                        }
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-body text-text-primary truncate">{doc.name}</p>
                        {doc.matchCities.length > 0 && (
                          <p className="text-[8px] text-text-muted font-body truncate">{doc.matchCities.join(', ')}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push(trip.tripId ? `/deep-plan?id=${trip.tripId}` : '/deep-plan')}
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
            fromCode={resolvedAirportsRef.current[transportModal.legIndex]?.fromCode || leg?.resolvedAirports?.fromCode || findAirportCode(fromCity) || ''}
            toCode={resolvedAirportsRef.current[transportModal.legIndex]?.toCode || leg?.resolvedAirports?.toCode || findAirportCode(toCity) || ''}
            fromAirport={findAirportName(fromCity)}
            toAirport={findAirportName(toCity)}
            date={legDateStr}
            adults={trip.adults}
            children={trip.children}
            infants={trip.infants}
            currentType={leg?.type || 'drive'}
            selectedFlight={leg?.selectedFlight || null}
            selectedTrain={leg?.selectedTrain || null}
            cachedFlights={flightCacheRef.current[transportModal.legIndex] || null}
            onBookingDocUploaded={async (file, matchCities, docType) => {
              try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('tripId', trip.tripId || 'pending');
                fd.append('matchCities', matchCities.join(','));
                const res = await fetch('/api/booking-docs', { method: 'POST', body: fd });
                if (res.ok) {
                  const doc = await res.json();
                  doc.docType = docType;
                  trip.addBookingDoc(doc);
                }
              } catch { /* continue without saving doc */ }
            }}
            onSelectFlight={(flight, airportInfo) => {
              if (leg) {
                trip.selectFlight(leg.id, flight);
                // Update resolved airports (from custom entry or API selection)
                if (airportInfo) {
                  const existing = resolvedAirportsRef.current[transportModal.legIndex] || leg.resolvedAirports;
                  // For custom flights, extract toCode from route (e.g., "BOM-AMS")
                  const routeParts = flight.route?.split('-') || [];
                  const updated = {
                    fromCode: airportInfo.fromCode,
                    fromCity: airportInfo.fromCity,
                    fromDistance: airportInfo.fromDistance,
                    fromAirport: airportInfo.fromCity,
                    toCode: routeParts[1]?.trim() || existing?.toCode || '',
                    toCity: existing?.toCity || toCity?.name || '',
                    toAirport: existing?.toAirport || '',
                    toDistance: existing?.toDistance || 0,
                  };
                  resolvedAirportsRef.current[transportModal.legIndex] = updated;
                  trip.updateTransportLeg(leg.id, { resolvedAirports: updated });
                }
              }
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
            selectedHotel={hotelModal.isAdditional ? null : dest.selectedHotel}
            onUpdateNights={n => trip.updateNights(dest.id, n)}
            onSelectHotel={hotel => {
              if (hotelModal.isAdditional) {
                // Calculate remaining nights for additional hotel
                const primaryNights = dest.selectedHotel ? Math.ceil(dest.nights / 2) : dest.nights;
                const usedByAdditional = (dest.additionalHotels || []).reduce((s, h) => s + h.nights, 0);
                const remaining = Math.max(1, dest.nights - primaryNights - usedByAdditional);
                trip.addAdditionalHotel(dest.id, hotel, remaining);
              } else {
                trip.updateDestinationHotel(dest.id, hotel);
              }
              setHotelModal(null);
            }}
          />
        );
      })()}

      {/* Share Trip Modal */}
      {trip.tripId && (
        <ShareTripModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          tripId={trip.tripId}
        />
      )}

      {/* Packing List Modal */}
      <PackingListModal
        isOpen={showPackingList}
        onClose={() => setShowPackingList(false)}
        destinations={trip.destinations.map(d => ({ city: d.city, nights: d.nights }))}
        totalNights={totalNights}
        tripId={trip.tripId}
      />

      {/* Booking Document Viewer */}
      <AnimatePresence>
        {viewingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setViewingBooking(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-surface rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 flex-shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-sm font-display font-bold text-text-primary truncate">{viewingBooking.name}</span>
                </div>
                <button onClick={() => setViewingBooking(null)}
                  className="w-8 h-8 rounded-full bg-bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-gray-100">
                {viewingBooking.mimeType === 'application/pdf' ? (
                  <iframe src={viewingBooking.url} className="w-full h-full min-h-[70vh] rounded" title="Booking PDF" />
                ) : (
                  <img src={viewingBooking.url} alt="Booking document" className="max-w-full max-h-[80vh] object-contain rounded" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RoutePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4" suppressHydrationWarning>
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-text-secondary text-sm font-body">Loading your trip...</p>
        </div>
      </div>
    }>
      <RoutePageContent />
    </Suspense>
  );
}
