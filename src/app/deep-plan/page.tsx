'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import { getDepartureHub, getArrivalHub, CITY_ATTRACTIONS } from '@/data/mockData';
import { addDaysToDate, subtractMinutes, addMinutes, getBufferMinutes, parseDurationMinutes, formatTime12, formatTime24, parseTime } from '@/lib/timeUtils';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';
import { getDirections } from '@/lib/googleApi';
import FlightModal from '@/components/FlightModal';
import HotelModal from '@/components/HotelModal';
import TrainModal from '@/components/TrainModal';
import TransportModal from '@/components/TransportModal';
import WeatherBadge from '@/components/WeatherBadge';

interface DeepStop {
  id: string;
  name: string;
  type: 'home' | 'airport' | 'station' | 'hotel' | 'attraction' | 'destination';
  time: string | null;      // "HH:MM" or null
  transport: { icon: string; duration: string; distance: string } | null;
  destIndex?: number;
  legIndex?: number;
  note?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  isNextDay?: boolean;       // arrival is on the next day (overnight flight/train)
  /** Activity category for display (e.g., "museum", "park") */
  category?: string;
  /** Activity duration in minutes for display */
  durationMin?: number;
  /** Opening hours from AI */
  openingHours?: string;
  /** Ticket price from AI */
  ticketPrice?: string;
  /** Whether this stop was promoted from AI to custom ("pinned") */
  isPinned?: boolean;
}

interface DayPlan {
  day: number;
  date: string;
  stops: DeepStop[];
  type: 'travel' | 'explore' | 'departure';
  city: string;
  /** For travel days: the city the traveller departs from */
  departureCity?: string;
  /** Explore day index within this city (0-based), for day theme lookup */
  exploreDayIndex?: number;
  /** Cost for this day in INR */
  dayCost: number;
  /** Cost label */
  costLabel: string;
}

const TYPE_COLORS: Record<string, string> = {
  home: '#E8654A', airport: '#8b5cf6', station: '#f59e0b', hotel: '#ec4899', attraction: '#f59e0b', destination: '#E8654A',
};

const DAY_TYPE_STYLES: Record<DayPlan['type'], { bg: string; text: string; border: string; line: string; label: string }> = {
  travel: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', line: 'border-blue-300', label: 'Travel Day' },
  explore: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', line: 'border-emerald-400', label: 'Explore Day' },
  departure: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', line: 'border-orange-300', label: 'Departure Day' },
};

const TRANSPORT_ICONS: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  walk: 'M13 3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-1.5 18l-2.4-8.5 2.9-2v8.5h-1l.5 2zm3-18l-1 4 3 3v7h-2v-5l-3-3 1-4 5 2v-2z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01',
  publicTransit: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
};

/** Category icon SVG paths (14×14 viewBox 0 0 24 24) */
const CATEGORY_ICONS: Record<string, string> = {
  museum: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  park: 'M12 22V8M9 8a3 3 0 0 1 3-5 3 3 0 0 1 3 5M7 14a5 5 0 0 1 5-6 5 5 0 0 1 5 6M5 22h14',
  landmark: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  market: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  experience: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM14 2v6h6M12 18v-6M9 15l3-3 3 3',
  religious: 'M12 2v4M8 6h8M10 6v4a2 2 0 0 0 4 0V6M6 22V10a6 6 0 0 1 12 0v12M6 22h12M10 14h4',
  neighborhood: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM9 22V12h6v10',
  viewpoint: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

/** Convert DD-MM-YYYY to YYYY-MM-DD for WeatherBadge */
function toIsoDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return ddmmyyyy;
}

/** Format DD-MM-YYYY to "Sat, 17 Oct 2026" */
function formatDateNice(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return ddmmyyyy;
  const [dd, mm, yyyy] = parts;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  if (isNaN(d.getTime())) return ddmmyyyy;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dayNames[d.getDay()]}, ${parseInt(dd)} ${monthNames[d.getMonth()]} ${yyyy}`;
}

/** Google Maps search URL */
function mapsUrl(name: string, city: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(name + ' ' + city)}`;
}

/** Format duration minutes to human-readable "2h", "45 min", "1h 30 min" */
function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

/** Capitalize category for display */
const CATEGORY_LABELS: Record<string, string> = {
  landmark: 'Landmark', museum: 'Museum', park: 'Park', market: 'Market',
  experience: 'Experience', religious: 'Religious Site', neighborhood: 'Neighborhood',
  viewpoint: 'Viewpoint',
};

/** Get ISO date from trip departure + day offset (for weather) */
function getIsoDateFromOffset(departureDate: string, dayOffset: number): string {
  const d = new Date(departureDate);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function DeepPlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTripId = searchParams.get('id');
  const trip = useTrip();
  const { currency } = useCurrency();
  const [isRestoring, setIsRestoring] = useState(false);

  // Deep plan data from context (persisted to DB)
  const deepPlan = trip.deepPlanData || { customActivities: {}, dayNotes: {}, dayStartTimes: {} };
  const [dayStartTimes, setDayStartTimesLocal] = useState<Record<number, string>>(deepPlan.dayStartTimes || {});
  const [customActivities, setCustomActivitiesLocal] = useState<Record<number, Array<{name: string; time: string}>>>(deepPlan.customActivities || {});
  const [dayNotes, setDayNotesLocal] = useState<Record<number, string>>(deepPlan.dayNotes || {});
  // UI-only state (not persisted)
  const [showActivityInput, setShowActivityInput] = useState<Record<number, boolean>>({});
  const [activityInputText, setActivityInputText] = useState<Record<number, string>>({});
  const [activityInputTime, setActivityInputTime] = useState<Record<number, string>>({});
  const [showDayNotes, setShowDayNotes] = useState<Record<number, boolean>>({});
  // AI activity loading state (Record<string, boolean> — not Set, avoids downlevelIteration)
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const aiFetchedRef = useRef<Record<string, boolean>>({});
  // Inter-activity travel times: key = "stopId1→stopId2", value = { duration, distance, mode }
  const [travelBetween, setTravelBetween] = useState<Record<string, { duration: string; distance: string; mode: string }>>({});
  const travelFetchedRef = useRef<Record<string, boolean>>({});
  // Drag-reorder: overridden activity order per day (day number → ordered stop IDs)
  const [activityOrder, setActivityOrder] = useState<Record<number, string[]>>({});
  const [dragState, setDragState] = useState<{ dayNum: number; stopId: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Wrappers that update both local state and context
  const setDayStartTimes = (updater: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => {
    setDayStartTimesLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ dayStartTimes: next });
      return next;
    });
  };
  const setCustomActivities = (updater: Record<number, Array<{name: string; time: string}>> | ((prev: Record<number, Array<{name: string; time: string}>>) => Record<number, Array<{name: string; time: string}>>)) => {
    setCustomActivitiesLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ customActivities: next });
      return next;
    });
  };
  const setDayNotes = (updater: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => {
    setDayNotesLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ dayNotes: next });
      return next;
    });
  };

  // Restore trip from URL param, context, or sessionStorage on page reload
  useEffect(() => {
    if (trip.destinations.length > 0) return;
    const idToLoad = urlTripId || trip.tripId || (() => { try { return sessionStorage.getItem('currentTripId'); } catch { return null; } })();
    if (idToLoad) {
      setIsRestoring(true);
      trip.loadTrip(idToLoad).catch(() => {}).finally(() => setIsRestoring(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local state when trip context loads deep plan data
  useEffect(() => {
    if (deepPlan.customActivities && Object.keys(deepPlan.customActivities).length > 0) setCustomActivitiesLocal(deepPlan.customActivities);
    if (deepPlan.dayNotes && Object.keys(deepPlan.dayNotes).length > 0) setDayNotesLocal(deepPlan.dayNotes);
    if (deepPlan.dayStartTimes && Object.keys(deepPlan.dayStartTimes).length > 0) setDayStartTimesLocal(deepPlan.dayStartTimes);
  }, [trip.tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch AI activities for cities not in static CITY_ATTRACTIONS and not already cached
  const fetchAiActivities = useCallback(async (cityName: string, country: string, days: number, userPlaces: string[]) => {
    if (aiFetchedRef.current[cityName]) return;
    aiFetchedRef.current[cityName] = true;
    setAiLoading(prev => ({ ...prev, [cityName]: true }));
    try {
      const monthName = trip.departureDate
        ? new Date(trip.departureDate).toLocaleString('en', { month: 'long' })
        : undefined;
      const res = await fetch('/api/ai/itinerary-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: cityName, country, days, userPlaces, month: monthName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.activities?.length > 0) {
          const existingAct = trip.deepPlanData?.cityActivities || {};
          const updates: Record<string, any> = { cityActivities: { ...existingAct, [cityName]: data.activities } };
          if (data.dayThemes?.length > 0) {
            const existingThemes = trip.deepPlanData?.dayThemes || {};
            updates.dayThemes = { ...existingThemes, [cityName]: data.dayThemes };
          }
          trip.updateDeepPlanData(updates);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch AI activities for ${cityName}:`, err);
    } finally {
      setAiLoading(prev => ({ ...prev, [cityName]: false }));
    }
  }, [trip.departureDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount / trip load: fetch AI activities for cities that need them
  useEffect(() => {
    if (trip.destinations.length === 0) return;
    for (const dest of trip.destinations) {
      const cityName = dest.city.parentCity || dest.city.name;
      if (!cityName) continue;
      // Skip if already cached in deepPlanData
      if (trip.deepPlanData?.cityActivities?.[cityName]?.length) continue;
      // Skip if in static data
      if (CITY_ATTRACTIONS[cityName]) continue;
      // Skip 0-night layovers (no explore days)
      if (dest.nights <= 1) continue;
      const exploreDays = Math.max(0, dest.nights - 1);
      const userPlaces = dest.places?.map(p => p.name) || [];
      fetchAiActivities(cityName, dest.city.country || '', exploreDays, userPlaces);
    }
  }, [trip.destinations.length, trip.tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh AI suggestions for a specific city
  const refreshAiActivities = useCallback((cityName: string, country: string, days: number, userPlaces: string[]) => {
    aiFetchedRef.current[cityName] = false;
    // Clear cached data for this city
    const existing = trip.deepPlanData?.cityActivities || {};
    const updated = { ...existing };
    delete updated[cityName];
    trip.updateDeepPlanData({ cityActivities: updated });
    fetchAiActivities(cityName, country, days, userPlaces);
  }, [fetchAiActivities]); // eslint-disable-line react-hooks/exhaustive-deps

  const [flightModal, setFlightModal] = useState<{ legIndex: number } | null>(null);
  const [trainModal, setTrainModal] = useState<{ legIndex: number } | null>(null);
  const [hotelModal, setHotelModal] = useState<{ destIndex: number } | null>(null);
  const [transportModal, setTransportModal] = useState<{ legIndex: number } | null>(null);

  // Real travel times fetched from Google Directions API
  const [realTimes, setRealTimes] = useState<Record<string, { duration: string; distance: string }>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // Fetch real directions for key segments on mount
  useEffect(() => {
    const segments: Array<{ key: string; from: string; to: string; mode: 'driving' | 'transit' | 'walking' }> = [];

    // Home to departure airport/station
    const firstDest = trip.destinations[0];
    const firstLeg = trip.transportLegs[0];
    if (firstDest && firstLeg) {
      const hub = getDepartureHub(trip.from, firstLeg.type);
      if (hub) {
        segments.push({ key: `home-to-hub-0`, from: trip.fromAddress, to: hub.name, mode: 'driving' });
      }
    }

    // Arrival hub to hotel/center for each destination
    trip.destinations.forEach((dest, i) => {
      const leg = trip.transportLegs[i];
      if (leg) {
        const arrHub = getArrivalHub(dest.city, leg.type);
        if (arrHub) {
          const hotelName = dest.selectedHotel?.name || dest.city.name;
          segments.push({
            key: `hub-to-hotel-${i}`,
            from: arrHub.name + ', ' + dest.city.name,
            to: hotelName + ', ' + dest.city.name,
            mode: leg.type === 'flight' ? 'driving' : 'walking',
          });
        }
      }
    });

    // Fetch each segment
    segments.forEach(seg => {
      if (fetchedRef.current.has(seg.key)) return;
      fetchedRef.current.add(seg.key);
      getDirections(seg.from, seg.to, seg.mode).then(result => {
        if (result) {
          setRealTimes(prev => ({ ...prev, [seg.key]: { duration: result.durationText, distance: result.distanceText } }));
        }
      });
    });
  }, [trip.fromAddress, trip.destinations, trip.transportLegs]);

  // Detect local stay (all destinations in same city as origin)
  const isLocalStay = useMemo(() => {
    if (trip.destinations.length === 0) return false;
    const originNames = [trip.from.parentCity, trip.from.name].filter(Boolean).map(n => n!.toLowerCase());
    const addrLower = (trip.from.fullName || trip.fromAddress || '').toLowerCase();
    return trip.destinations.every(d => {
      const dNames = [d.city.parentCity, d.city.name].filter(Boolean).map(n => n!.toLowerCase());
      return dNames.some(dn => originNames.some(on => on === dn)) || dNames.some(dn => dn.length >= 3 && addrLower.includes(dn));
    });
  }, [trip.from.name, trip.from.parentCity, trip.from.fullName, trip.fromAddress, trip.destinations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate day-by-day itinerary from trip state ──────────────────────────
  const days: DayPlan[] = useMemo(() => {
    const result: DayPlan[] = [];
    let dayNum = 0;
    let sc = 0; // stop counter

    for (let destIdx = 0; destIdx < trip.destinations.length; destIdx++) {
      const dest = trip.destinations[destIdx];
      const leg = trip.transportLegs[destIdx];
      const prevDest = destIdx > 0 ? trip.destinations[destIdx - 1] : null;
      const fromCity = destIdx === 0 ? trip.from : prevDest!.city;
      const toCity = dest.city;

      // Calculate travel day cost (include children + infants at 15%)
      const transportPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
      let travelDayCost = 0;
      let travelCostLabel = '';
      if (leg) {
        if (leg.selectedFlight) {
          travelDayCost = leg.selectedFlight.pricePerAdult * transportPax;
          travelCostLabel = 'Flight';
        } else if (leg.selectedTrain) {
          travelDayCost = leg.selectedTrain.price * transportPax;
          travelCostLabel = 'Train';
        }
      }

      // ── TRAVEL DAY to this destination ──
      const departureCityName = destIdx === 0 ? (trip.from.parentCity || trip.from.name) : (prevDest!.city.parentCity || prevDest!.city.name);
      const travelDay: DayPlan = {
        day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
        type: 'travel', city: toCity.name, departureCity: departureCityName, dayCost: travelDayCost, costLabel: travelCostLabel,
      };

      if (leg) {
        const depHub = getDepartureHub(fromCity, leg.type);
        const arrHub = getArrivalHub(toCity, leg.type);
        const depTime = leg.departureTime; // from selected flight/train
        const arrTime = leg.arrivalTime;

        // How long to get from starting point to departure hub
        const isFirstLeg = destIdx === 0;
        // Bug fix #3: Use short city name for home, not full address
        const fromCityName = fromCity.parentCity || fromCity.name;
        const startName = isFirstLeg ? (fromCityName || trip.fromAddress) : (prevDest?.selectedHotel?.name || `Stay in ${fromCityName}`);
        const startType = isFirstLeg ? 'home' as const : 'hotel' as const;

        // Travel to terminal: use real Google Directions data if available
        const homeToHubKey = isFirstLeg ? `home-to-hub-0` : '';
        const realHomeToHub = homeToHubKey ? realTimes[homeToHubKey] : null;
        let toTerminalMin = depHub?.transitToCenter.durationMin || 20;
        let toTerminalDist = depHub?.transitToCenter.distance || '~';
        if (realHomeToHub) {
          toTerminalMin = parseDurationMinutes(realHomeToHub.duration) || toTerminalMin;
          toTerminalDist = realHomeToHub.distance;
        } else if (isFirstLeg && fromCity.homeToAirportMin && leg.type === 'flight') {
          toTerminalMin = fromCity.homeToAirportMin;
        } else if (isFirstLeg && fromCity.homeToStationMin && leg.type === 'train') {
          toTerminalMin = fromCity.homeToStationMin;
        }

        const bufferMin = getBufferMinutes(leg.type === 'bus' ? 'bus' : leg.type === 'train' ? 'train' : leg.type === 'flight' ? 'flight' : 'drive', fromCity.country, toCity.country);

        // Calculate leave-by time
        let leaveTime: string | null = null;
        let arriveAtTerminalTime: string | null = null;
        if (depTime) {
          arriveAtTerminalTime = subtractMinutes(depTime, bufferMin);
          leaveTime = subtractMinutes(arriveAtTerminalTime, toTerminalMin);
        }

        if (leg.type === 'flight' || leg.type === 'train' || leg.type === 'bus') {
          // Step 1: Leave starting point
          travelDay.stops.push({
            id: `dp${sc++}`, name: startName, type: startType, time: leaveTime,
            transport: { icon: 'drive', duration: realHomeToHub?.duration || `${toTerminalMin} min`, distance: toTerminalDist },
            destIndex: !isFirstLeg ? destIdx - 1 : undefined,
            note: leaveTime && depTime ? `Leave by ${formatTime12(parseTime(leaveTime))} to reach on time` : undefined,
          });

          // Step 2: Departure terminal — use resolvedAirports data when available (bug fix #1)
          const terminalType = leg.type === 'flight' ? 'airport' as const : 'station' as const;
          const resolvedInfo = leg.resolvedAirports;
          const terminalName = depHub?.name
            || (resolvedInfo?.fromCity ? `${resolvedInfo.fromCity} Airport` : null)
            || `${fromCityName} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
          travelDay.stops.push({
            id: `dp${sc++}`, name: terminalName, type: terminalType, time: arriveAtTerminalTime,
            transport: { icon: leg.type, duration: leg.duration, distance: leg.distance },
            legIndex: destIdx,
            note: leg.type === 'flight'
              ? `Check-in ${bufferMin >= 120 ? '2.5h' : '1.5h'} before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`
              : `Board ${bufferMin}min before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`,
          });

          // Detect overnight/multi-day arrival (bug fix #4)
          // Only split into separate days if flight ACTUALLY arrives next day, not just based on duration
          const sel = leg.selectedFlight || leg.selectedTrain;
          let transitDays = 0;
          if (sel && depTime && arrTime) {
            const depH = parseInt(depTime.split(':')[0] || '0');
            const arrH = parseInt(arrTime.split(':')[0] || '0');
            const durMatch = (sel as any).duration?.match(/(\d+)h/);
            const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
            // Check if explicitly marked as next-day, OR duration clearly crosses midnight
            const arrivesNextDay = (sel as any).isNextDay || (arrH < depH && durHrs > 2) || durHrs >= 20;
            if (arrivesNextDay) {
              // 1 transit day for overnight, +1 for each additional 24h
              transitDays = durHrs >= 36 ? Math.ceil(durHrs / 24) : 1;
            }
          }

          // If overnight: push departure day, add transit days, create arrival day
          if (transitDays > 0) {
            // Push departure day (stops so far: home + airport + flight departs)
            result.push(travelDay);
            dayNum++;

            // Add "In Transit" days for flights > 24h
            for (let td = 1; td < transitDays; td++) {
              const transitDay: DayPlan = {
                day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
                type: 'travel', city: '', dayCost: 0, costLabel: 'In Transit',
              };
              transitDay.stops.push({
                id: `dp${sc++}`, name: `In transit — ${leg.type === 'flight' ? 'flight' : 'train'} ${leg.duration || ''}`,
                type: 'airport', time: null, transport: null,
                note: `${fromCityName} > ${toCity.name}`,
              });
              result.push(transitDay);
              dayNum++;
            }

            // Create arrival day
            const arrivalDay: DayPlan = {
              day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
              type: 'travel', city: toCity.name, dayCost: 0, costLabel: 'Arrival',
            };

            // Arrival terminal
            const arrTerminalType2 = leg.type === 'flight' ? 'airport' as const : 'station' as const;
            const arrTerminalName2 = arrHub?.name || `${toCity.name} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
            const hubToHotelKey2 = `hub-to-hotel-${destIdx}`;
            const realHubToHotel2 = realTimes[hubToHotelKey2];
            const fromArrTerminalMin2 = realHubToHotel2 ? parseDurationMinutes(realHubToHotel2.duration) : (arrHub?.transitToCenter.durationMin || 15);
            const fromArrTerminalDist2 = realHubToHotel2?.distance || arrHub?.transitToCenter.distance || '~';

            arrivalDay.stops.push({
              id: `dp${sc++}`, name: arrTerminalName2, type: arrTerminalType2, time: arrTime,
              transport: { icon: arrHub?.transitToCenter.type || 'drive', duration: realHubToHotel2?.duration || `${fromArrTerminalMin2} min`, distance: fromArrTerminalDist2 },
            });

            const hotelArriveTime2 = arrTime ? addMinutes(arrTime, fromArrTerminalMin2) : null;
            const hotelArriveMin2 = hotelArriveTime2 ? parseTime(hotelArriveTime2) : null;
            if (dest.nights > 0) {
              const stdCheckIn2 = 15 * 60;
              const checkInNote2 = hotelArriveMin2 !== null
                ? (hotelArriveMin2 < stdCheckIn2 ? 'Arriving before standard check-in (3 PM) — request early check-in or leave luggage' : null)
                : null;
              arrivalDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArriveTime2, transport: null, destIndex: destIdx,
                note: checkInNote2 || undefined,
              });

              // Add activities if arriving before 6 PM
              const dinnerTime2 = 19 * 60;
              const sleepTime2 = 22 * 60;
              if (hotelArriveMin2 !== null && hotelArriveMin2 < dinnerTime2 - 60) {
                const freeStart2 = hotelArriveMin2 + 30;
                const freeHrs2 = (sleepTime2 - freeStart2) / 60;
                const evCityKey2 = toCity.parentCity || toCity.name;
                const cityAttr2 = dest.places?.length
                  ? dest.places.map(p => p.name)
                  : (trip.deepPlanData?.cityActivities?.[evCityKey2]?.map(a => a.name)
                    || (CITY_ATTRACTIONS[evCityKey2] || CITY_ATTRACTIONS[toCity.name])?.map(a => a.name) || []);
                if (cityAttr2.length > 0 && freeHrs2 >= 1) {
                  const count2 = freeHrs2 >= 5 ? 3 : freeHrs2 >= 3 ? 2 : 1;
                  arrivalDay.stops.push({
                    id: `dp${sc++}`, name: `Free time — ${Math.round(freeHrs2)} hours to explore ${toCity.name}`,
                    type: 'attraction', time: formatTime24(freeStart2),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    note: 'Evening exploration (optional)',
                  });
                  cityAttr2.slice(0, count2).forEach((attr, ei) => {
                    arrivalDay.stops.push({
                      id: `dp${sc++}`, name: attr, type: 'attraction',
                      time: formatTime24(freeStart2 + 30 + ei * 90),
                      transport: null,
                    });
                  });
                }
                arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00', transport: null, mealType: 'dinner' });
                arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null, note: 'Default sleep time' });
              }
            } else {
              arrivalDay.stops.push({
                id: `dp${sc++}`, name: `${toCity.name} Center`, type: 'destination',
                time: hotelArriveTime2, transport: null,
              });
            }
            result.push(arrivalDay);
            // Don't increment dayNum here — it's done below after explore days
          } else {
            // Same-day arrival — keep everything on the travel day
            const arrTerminalType = leg.type === 'flight' ? 'airport' as const : 'station' as const;
            const arrTerminalName = arrHub?.name || `${toCity.name} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
            const hubToHotelKey = `hub-to-hotel-${destIdx}`;
            const realHubToHotel = realTimes[hubToHotelKey];
            const fromArrTerminalMin = realHubToHotel ? parseDurationMinutes(realHubToHotel.duration) : (arrHub?.transitToCenter.durationMin || 15);
            const fromArrTerminalDist = realHubToHotel?.distance || arrHub?.transitToCenter.distance || '~';
            travelDay.stops.push({
              id: `dp${sc++}`, name: arrTerminalName, type: arrTerminalType, time: arrTime,
              transport: { icon: arrHub?.transitToCenter.type || 'drive', duration: realHubToHotel?.duration || `${fromArrTerminalMin} min`, distance: fromArrTerminalDist },
            });

            const hotelArriveTime = arrTime ? addMinutes(arrTime, fromArrTerminalMin) : null;
            const hotelArriveMin = hotelArriveTime ? parseTime(hotelArriveTime) : null;
            if (dest.nights > 0) {
              // Check-in note
              const stdCheckIn = 15 * 60; // 3:00 PM standard
              const checkInNote = hotelArriveMin !== null
                ? (hotelArriveMin < stdCheckIn ? 'Arriving before standard check-in (3 PM) — request early check-in or leave luggage' : null)
                : null;
              travelDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArriveTime, transport: null, destIndex: destIdx,
                note: checkInNote || undefined,
              });

              // Add evening activities if arriving before 6 PM (have 1+ hours before dinner)
              const dinnerTime = 19 * 60; // 7 PM
              const sleepTime = 22 * 60; // 10 PM
              if (hotelArriveMin !== null && hotelArriveMin < dinnerTime - 60) {
                const freeStartMin = hotelArriveMin + 30; // 30 min to settle in
                const totalFreeHours = (sleepTime - freeStartMin) / 60; // Total evening free time until sleep

                // Get attractions for this city (AI cache > static > empty)
                const evCityKey = toCity.parentCity || toCity.name;
                const cityAttractions = dest.places && dest.places.length > 0
                  ? dest.places.map(p => p.name)
                  : (trip.deepPlanData?.cityActivities?.[evCityKey]?.map(a => a.name)
                    || (CITY_ATTRACTIONS[evCityKey] || CITY_ATTRACTIONS[toCity.name])?.map(a => a.name) || []);

                if (cityAttractions.length > 0 && totalFreeHours >= 1) {
                  // Suggest activities: 1 for <3h, 2 for 3-5h, 3 for 5h+
                  const eveningCount = totalFreeHours >= 5 ? 3 : totalFreeHours >= 3 ? 2 : 1;
                  const eveningAttractions = cityAttractions.slice(0, eveningCount);

                  travelDay.stops.push({
                    id: `dp${sc++}`, name: `Free time — ${Math.round(totalFreeHours)} hours to explore ${toCity.name}`,
                    type: 'attraction', time: formatTime24(freeStartMin),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    note: 'Evening exploration (optional)',
                  });

                  eveningAttractions.forEach((attr, ei) => {
                    travelDay.stops.push({
                      id: `dp${sc++}`, name: attr, type: 'attraction',
                      time: formatTime24(freeStartMin + 30 + ei * 90),
                      transport: ei < eveningAttractions.length - 1 ? { icon: 'walk', duration: '', distance: '' } : null,
                    });
                  });
                }

                // Dinner
                travelDay.stops.push({
                  id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00',
                  transport: null, mealType: 'dinner',
                });

                // Sleep
                travelDay.stops.push({
                  id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00',
                  transport: null, note: 'Default sleep time — adjust as needed',
                });
              }
            } else {
              travelDay.stops.push({
                id: `dp${sc++}`, name: `${toCity.name} Center`, type: 'destination',
                time: hotelArriveTime, transport: null,
              });
            }
          }
        } else {
          // DRIVE: direct from start to destination
          travelDay.stops.push({
            id: `dp${sc++}`, name: startName, type: startType, time: null,
            transport: { icon: 'drive', duration: leg.duration, distance: leg.distance },
            destIndex: !isFirstLeg ? destIdx - 1 : undefined,
          });
          if (dest.nights > 0) {
            travelDay.stops.push({
              id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
              time: null, transport: null, destIndex: destIdx,
            });
          } else {
            travelDay.stops.push({
              id: `dp${sc++}`, name: `${toCity.name} Center`, type: 'destination',
              time: null, transport: null,
            });
          }
        }
      }
      // Only push travelDay if it wasn't already pushed (overnight flights push it early)
      if (!result.includes(travelDay)) {
        result.push(travelDay);
        dayNum++;
      }

      // ── EXPLORE DAYS at this destination ──
      const exploreDays = Math.max(0, dest.nights - 1);

      // Build typed activity list with durations from multiple sources
      type TypedActivity = { name: string; category: string; durationMin: number; bestTime: string; note?: string; openingHours?: string; ticketPrice?: string; dayIndex?: number };
      const typedActivities: TypedActivity[] = [];
      const usedNames = new Set<string>();

      // Priority 1: user-added places (wrapped with default 90min)
      if (dest.places && dest.places.length > 0) {
        for (const p of dest.places) {
          if (!usedNames.has(p.name.toLowerCase())) {
            typedActivities.push({ name: p.name, category: 'landmark', durationMin: 90, bestTime: 'anytime' });
            usedNames.add(p.name.toLowerCase());
          }
        }
      }

      // Priority 2: AI-cached activities from deepPlanData
      const cityKey = toCity.parentCity || toCity.name;
      const aiCached = trip.deepPlanData?.cityActivities?.[cityKey];
      if (aiCached && aiCached.length > 0) {
        for (const a of aiCached) {
          if (!usedNames.has(a.name.toLowerCase())) {
            typedActivities.push({ name: a.name, category: a.category || 'landmark', durationMin: a.durationMin || 60, bestTime: a.bestTime || 'anytime', note: a.note, openingHours: a.openingHours, ticketPrice: a.ticketPrice, dayIndex: a.dayIndex });
            usedNames.add(a.name.toLowerCase());
          }
        }
      }

      // Priority 3: static CITY_ATTRACTIONS (check both name and parentCity)
      const staticAttr = CITY_ATTRACTIONS[cityKey] || CITY_ATTRACTIONS[toCity.name];
      if (staticAttr) {
        for (const a of staticAttr) {
          if (!usedNames.has(a.name.toLowerCase())) {
            typedActivities.push({ name: a.name, category: a.category, durationMin: a.durationMin, bestTime: a.bestTime });
            usedNames.add(a.name.toLowerCase());
          }
        }
      }

      // Priority 4: generic fallback
      if (typedActivities.length === 0) {
        typedActivities.push(
          { name: `${toCity.name} Walking Tour`, category: 'experience', durationMin: 120, bestTime: 'morning' },
          { name: `${toCity.name} Local Market`, category: 'market', durationMin: 60, bestTime: 'morning' },
          { name: `${toCity.name} Old Town`, category: 'neighborhood', durationMin: 90, bestTime: 'afternoon' },
        );
      }

      for (let n = 0; n < exploreDays; n++) {
        const roomsNeeded = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
        const hotelCostForNight = dest.selectedHotel ? dest.selectedHotel.pricePerNight * roomsNeeded : 0;
        const expDay: DayPlan = {
          day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
          type: 'explore', city: toCity.name, dayCost: hotelCostForNight, costLabel: 'Hotel',
          exploreDayIndex: n,
        };
        const hotelName = dest.selectedHotel?.name || `Stay in ${toCity.name}`;

        // Distribute activities: use dayIndex assignment if present, fall back to even split
        const hasDayIndexes = typedActivities.some(a => typeof a.dayIndex === 'number');
        let dayActivities: TypedActivity[];
        if (hasDayIndexes) {
          // Activities assigned to this explore day index, plus unassigned extras distributed evenly
          const assigned = typedActivities.filter(a => a.dayIndex === n);
          const unassigned = typedActivities.filter(a => typeof a.dayIndex !== 'number');
          const unassignedPerDay = Math.ceil(unassigned.length / exploreDays);
          const unassignedSlice = unassigned.slice(n * unassignedPerDay, (n + 1) * unassignedPerDay);
          dayActivities = [...assigned, ...unassignedSlice];
        } else {
          const perDay = Math.ceil(typedActivities.length / exploreDays);
          const startIdx = n * perDay;
          dayActivities = typedActivities.slice(startIdx, startIdx + perDay);
        }
        if (dayActivities.length === 0 && typedActivities.length > 0) dayActivities.push(typedActivities[0]);

        // Smart scheduling: fit activities into morning + afternoon windows
        const dayStartMin = 9 * 60; // 09:00
        const lunchStart = 12 * 60 + 30; // 12:30
        const afternoonStart = 13 * 60 + 15; // 13:15 (after 45min lunch)
        const dinnerStart = 19 * 60; // 19:00
        const travelGap = 30; // 30min between activities

        // Sort: morning-preferred first, then anytime, then afternoon/evening
        const morningPref = dayActivities.filter(a => a.bestTime === 'morning');
        const anytimePref = dayActivities.filter(a => a.bestTime === 'anytime');
        const afternoonPref = dayActivities.filter(a => a.bestTime === 'afternoon' || a.bestTime === 'evening');

        // Fill morning block (09:00 → 12:00)
        const morningPool = [...morningPref, ...anytimePref, ...afternoonPref];
        const morningScheduled: Array<{ act: TypedActivity; startMin: number }> = [];
        let cursor = dayStartMin;
        const morningEnd = lunchStart;
        const scheduledSet = new Set<string>();

        for (const act of morningPool) {
          if (cursor + act.durationMin > morningEnd) break;
          morningScheduled.push({ act, startMin: cursor });
          scheduledSet.add(act.name);
          cursor += act.durationMin + travelGap;
        }

        // Fill afternoon block (13:15 → 18:30)
        const afternoonPool = [...afternoonPref, ...anytimePref, ...morningPref].filter(a => !scheduledSet.has(a.name));
        const afternoonScheduled: Array<{ act: TypedActivity; startMin: number }> = [];
        cursor = afternoonStart;
        const afternoonEnd = dinnerStart - 30; // stop 30min before dinner

        for (const act of afternoonPool) {
          if (cursor + act.durationMin > afternoonEnd) continue; // skip too-long, try shorter ones
          afternoonScheduled.push({ act, startMin: cursor });
          scheduledSet.add(act.name);
          cursor += act.durationMin + travelGap;
        }

        // Breakfast meal slot
        expDay.stops.push({
          id: `dp${sc++}`, name: 'Breakfast', type: 'hotel', time: '08:00',
          transport: null, mealType: 'breakfast',
        });

        // Leave hotel
        expDay.stops.push({ id: `dp${sc++}`, name: hotelName, type: 'hotel', time: '09:00', transport: { icon: 'walk', duration: '', distance: '' } });

        // Morning activities
        for (const { act, startMin } of morningScheduled) {
          expDay.stops.push({
            id: `dp${sc++}`, name: act.name, type: 'attraction', time: formatTime24(startMin),
            transport: { icon: 'walk', duration: '', distance: '' },
            note: act.note || undefined,
            category: act.category, durationMin: act.durationMin,
            openingHours: act.openingHours, ticketPrice: act.ticketPrice,
          });
        }

        // Lunch
        expDay.stops.push({
          id: `dp${sc++}`, name: 'Lunch', type: 'attraction', time: '12:30',
          transport: null, mealType: 'lunch',
        });

        // Afternoon activities
        for (const { act, startMin } of afternoonScheduled) {
          expDay.stops.push({
            id: `dp${sc++}`, name: act.name, type: 'attraction', time: formatTime24(startMin),
            transport: { icon: 'walk', duration: '', distance: '' },
            note: act.note || undefined,
            category: act.category, durationMin: act.durationMin,
            openingHours: act.openingHours, ticketPrice: act.ticketPrice,
          });
        }

        // Dinner meal slot
        expDay.stops.push({
          id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00',
          transport: null, mealType: 'dinner',
        });

        expDay.stops.push({ id: `dp${sc++}`, name: hotelName, type: 'hotel', time: '20:00', transport: null, destIndex: destIdx });
        expDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null, note: 'Default sleep time' });
        result.push(expDay);
        dayNum++;
      }

      // If 0 nights, still advance a day
      if (dest.nights === 0 && destIdx < trip.destinations.length - 1) {
        // No explore day, next travel day picks up
      }
    }

    // ── RETURN DAY (round trip) ──
    if (trip.tripType === 'roundTrip' && trip.destinations.length > 0) {
      const lastDest = trip.destinations[trip.destinations.length - 1];
      const returnLeg = trip.transportLegs[trip.transportLegs.length - 1];

      const returnTransportPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
      let returnDayCost = 0;
      let returnCostLabel = '';
      if (returnLeg) {
        if (returnLeg.selectedFlight) {
          returnDayCost = returnLeg.selectedFlight.pricePerAdult * returnTransportPax;
          returnCostLabel = 'Flight';
        } else if (returnLeg.selectedTrain) {
          returnDayCost = returnLeg.selectedTrain.price * returnTransportPax;
          returnCostLabel = 'Train';
        }
      }

      const returnDay: DayPlan = {
        day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
        type: 'departure', city: trip.from.name, departureCity: lastDest.city.parentCity || lastDest.city.name, dayCost: returnDayCost, costLabel: returnCostLabel,
      };

      if (returnLeg) {
        const fromCity = lastDest.city;
        const depHub = getDepartureHub(fromCity, returnLeg.type);
        const arrHub = getArrivalHub(trip.from, returnLeg.type);
        const depTime = returnLeg.departureTime;
        const arrTime = returnLeg.arrivalTime;
        const toTerminalMin = depHub?.transitToCenter.durationMin || 20;
        const bufferMin = getBufferMinutes(
          returnLeg.type === 'bus' ? 'bus' : returnLeg.type === 'train' ? 'train' : returnLeg.type === 'flight' ? 'flight' : 'drive',
          fromCity.country, trip.from.country
        );

        let leaveTime: string | null = null;
        if (depTime) leaveTime = subtractMinutes(depTime, bufferMin + toTerminalMin);

        const startName = lastDest.selectedHotel?.name || `Stay in ${fromCity.name}`;

        if (returnLeg.type === 'flight' || returnLeg.type === 'train') {
          // Add morning activities before departure if leaving after noon
          const leaveMin = leaveTime ? parseTime(leaveTime) : null;
          if (leaveMin !== null && leaveMin > 11 * 60) { // Leaving after 11 AM — morning free
            const stdCheckout = 11 * 60; // 11 AM standard checkout
            const checkoutNote = leaveMin > stdCheckout + 60
              ? 'Late flight — request late checkout or store luggage at reception'
              : null;

            // Breakfast
            returnDay.stops.push({ id: `dp${sc++}`, name: 'Breakfast', type: 'hotel', time: '08:00', transport: null, mealType: 'breakfast' as const });

            // Morning activities if > 2 hours free
            const morningFreeHrs = (leaveMin - 9 * 60) / 60; // hours from 9 AM to leave time
            if (morningFreeHrs >= 2) {
              const depCityKey = fromCity.parentCity || fromCity.name;
              const fromCityAttrNames = trip.deepPlanData?.cityActivities?.[depCityKey]?.map(a => a.name)
                || (CITY_ATTRACTIONS[depCityKey] || CITY_ATTRACTIONS[fromCity.name])?.map(a => a.name) || [];
              const morningCount = morningFreeHrs >= 4 ? 2 : 1;
              if (fromCityAttrNames.length > 0) {
                returnDay.stops.push({
                  id: `dp${sc++}`, name: `Morning in ${fromCity.name} — ${Math.round(morningFreeHrs)} hours before departure`,
                  type: 'attraction', time: '09:00',
                  transport: { icon: 'walk', duration: '', distance: '' },
                  note: 'Morning exploration before departure',
                });
                fromCityAttrNames.slice(-morningCount).forEach((attr, mi) => { // Use last attractions (earlier ones used on explore days)
                  returnDay.stops.push({
                    id: `dp${sc++}`, name: attr, type: 'attraction',
                    time: formatTime24(9 * 60 + 30 + mi * 90),
                    transport: null,
                  });
                });
              }
            }

            // Checkout note
            if (checkoutNote) {
              returnDay.stops.push({
                id: `dp${sc++}`, name: `Check out — ${startName}`, type: 'hotel',
                time: formatTime24(Math.min(leaveMin - 30, stdCheckout)),
                transport: null, note: checkoutNote,
              });
            }
          }

          returnDay.stops.push({
            id: `dp${sc++}`, name: startName, type: 'hotel', time: leaveTime,
            transport: { icon: 'drive', duration: `${toTerminalMin} min`, distance: depHub?.transitToCenter.distance || '~' },
          });
          // Bug fix #2: Use resolvedAirports for return leg terminal names
          const returnResolved = returnLeg.resolvedAirports;
          const depTerminalName = depHub?.name
            || (returnResolved?.fromCity ? `${returnResolved.fromCity} Airport` : null)
            || `${fromCity.parentCity || fromCity.name} ${returnLeg.type === 'flight' ? 'Airport' : 'Station'}`;
          const arrTerminalName = arrHub?.name
            || (returnResolved?.toCity ? `${returnResolved.toCity} Airport` : null)
            || `${trip.from.parentCity || trip.from.name} ${returnLeg.type === 'flight' ? 'Airport' : 'Station'}`;

          // Detect overnight return flight/train (same logic as outbound)
          const retSel = returnLeg.selectedFlight || returnLeg.selectedTrain;
          let returnTransitDays = 0;
          if (retSel && depTime && arrTime) {
            const retDepH = parseInt(depTime.split(':')[0] || '0');
            const retArrH = parseInt(arrTime.split(':')[0] || '0');
            const retDurMatch = (retSel as any).duration?.match(/(\d+)h/);
            const retDurHrs = retDurMatch ? parseInt(retDurMatch[1]) : 0;
            const retArrivesNextDay = (retSel as any).isNextDay || (retArrH < retDepH && retDurHrs > 2) || retDurHrs >= 20;
            if (retArrivesNextDay) {
              returnTransitDays = retDurHrs >= 36 ? Math.ceil(retDurHrs / 24) : 1;
            }
          }

          returnDay.stops.push({
            id: `dp${sc++}`, name: depTerminalName, type: returnLeg.type === 'flight' ? 'airport' : 'station',
            time: depTime ? subtractMinutes(depTime, bufferMin) : null,
            transport: { icon: returnLeg.type, duration: returnLeg.duration, distance: returnLeg.distance },
            legIndex: trip.transportLegs.length - 1,
          });

          if (returnTransitDays > 0) {
            // Overnight return: push departure day first
            result.push(returnDay);
            dayNum++;

            // Add transit days for very long flights
            for (let td = 1; td < returnTransitDays; td++) {
              const transitDay: DayPlan = {
                day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
                type: 'departure', city: '', dayCost: 0, costLabel: 'In Transit',
              };
              transitDay.stops.push({
                id: `dp${sc++}`, name: `In transit — ${returnLeg.type === 'flight' ? 'flight' : 'train'} ${returnLeg.duration || ''}`,
                type: 'airport', time: null, transport: null,
                note: `${fromCity.parentCity || fromCity.name} > ${trip.from.parentCity || trip.from.name}`,
              });
              result.push(transitDay);
              dayNum++;
            }

            // Arrival day
            const returnArrivalDay: DayPlan = {
              day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
              type: 'departure', city: trip.from.name, dayCost: 0, costLabel: 'Arrival',
            };
            returnArrivalDay.stops.push({
              id: `dp${sc++}`, name: arrTerminalName, type: returnLeg.type === 'flight' ? 'airport' : 'station',
              time: arrTime,
              transport: { icon: 'drive', duration: `${trip.from.homeToAirportMin || 27} min`, distance: '~' },
            });
            returnArrivalDay.stops.push({ id: `dp${sc++}`, name: trip.from.parentCity || trip.from.name || trip.fromAddress, type: 'home', time: null, transport: null });
            result.push(returnArrivalDay);
          } else {
            // Same-day return
            returnDay.stops.push({
              id: `dp${sc++}`, name: arrTerminalName, type: returnLeg.type === 'flight' ? 'airport' : 'station',
              time: arrTime,
              transport: { icon: 'drive', duration: `${trip.from.homeToAirportMin || 27} min`, distance: '~' },
            });
            returnDay.stops.push({ id: `dp${sc++}`, name: trip.from.parentCity || trip.from.name || trip.fromAddress, type: 'home', time: null, transport: null });
            result.push(returnDay);
          }
        } else {
          returnDay.stops.push({
            id: `dp${sc++}`, name: startName, type: 'hotel', time: null,
            transport: { icon: 'drive', duration: returnLeg.duration, distance: returnLeg.distance },
          });
          // Bug fix #3: Show city name, not full address
          returnDay.stops.push({ id: `dp${sc++}`, name: trip.from.parentCity || trip.from.name || trip.fromAddress, type: 'home', time: null, transport: null });
          result.push(returnDay);
        }
      } else {
        result.push(returnDay);
      }
    }

    // For local stays, remove travel and departure days — only keep explore days
    if (isLocalStay) {
      const exploreDays = result.filter(d => d.type === 'explore');
      // Re-number days
      exploreDays.forEach((d, i) => { d.day = i + 1; });
      return exploreDays;
    }

    return result;
  }, [trip, realTimes, isLocalStay]);

  // Recalculate explore day times: re-run scheduling algorithm with new start time
  const adjustedDays: DayPlan[] = useMemo(() => {
    return days.map(day => {
      if (day.type !== 'explore') return day;
      const startTime = dayStartTimes[day.day] || '09:00';
      const startMin = parseTime(startTime);

      // Extract activity stops from the base day (all non-meal attractions)
      // Exclude AI activities that have been pinned as custom (to avoid duplicates)
      const pinnedNames = new Set((customActivities[day.day] || []).map(c => c.name.trim().toLowerCase()));
      let activityStops = day.stops.filter(s => s.type === 'attraction' && !s.mealType && !pinnedNames.has(s.name.trim().toLowerCase()));
      // Non-activity structural stops (hotel leave, hotel return, sleep)
      const hotelLeave = day.stops.find(s => s.type === 'hotel' && s.transport?.icon === 'walk');
      const hotelReturn = day.stops.find(s => s.type === 'hotel' && !s.mealType && !s.transport && s.destIndex !== undefined);
      const sleepStop = day.stops.find(s => s.name === 'Rest / Sleep');

      // Apply user drag-reorder if present
      const userOrder = activityOrder[day.day];
      if (userOrder && userOrder.length > 0) {
        const ordered: DeepStop[] = [];
        for (const id of userOrder) {
          const found = activityStops.find(s => s.id === id);
          if (found) ordered.push(found);
        }
        // Append any stops not in the saved order (e.g., newly added)
        for (const s of activityStops) {
          if (!userOrder.includes(s.id)) ordered.push(s);
        }
        activityStops = ordered;
      }

      // Scheduling constants
      const lunchTime = 12 * 60 + 30;
      const afterLunch = 13 * 60 + 15;
      const dinnerTime = 19 * 60;
      const travelGap = 30;

      // If user has reordered, respect their sequence (no category-based sorting)
      // Otherwise, sort by category preference
      let orderedForScheduling: DeepStop[];
      if (userOrder && userOrder.length > 0) {
        orderedForScheduling = activityStops;
      } else {
        const morningActs = activityStops.filter(s => !s.category || s.category === 'museum' || s.category === 'religious' || s.category === 'market');
        const afternoonActs = activityStops.filter(s => s.category === 'park' || s.category === 'viewpoint' || s.category === 'neighborhood' || s.category === 'experience');
        const anytimeActs = activityStops.filter(s => !morningActs.includes(s) && !afternoonActs.includes(s));
        orderedForScheduling = [...morningActs, ...anytimeActs, ...afternoonActs];
      }

      // Fill morning block: startMin → lunchTime (skip if start is after lunch)
      const morningScheduled: Array<{ stop: DeepStop; time: number }> = [];
      let cursor = startMin;
      const scheduledIds = new Set<string>();

      if (startMin < lunchTime) {
        for (const s of orderedForScheduling) {
          const dur = s.durationMin || 60;
          if (cursor + dur > lunchTime) break;
          morningScheduled.push({ stop: s, time: cursor });
          scheduledIds.add(s.id);
          cursor += dur + travelGap;
        }
      }

      // Fill afternoon block: afterLunch → dinnerTime - 30 (or startMin if starting after lunch)
      const remainingForAfternoon = orderedForScheduling.filter(s => !scheduledIds.has(s.id));
      const afternoonScheduled: Array<{ stop: DeepStop; time: number }> = [];
      cursor = startMin >= lunchTime ? startMin : afterLunch;
      const afternoonEnd = dinnerTime - 30;

      for (const s of remainingForAfternoon) {
        const dur = s.durationMin || 60;
        if (cursor + dur > afternoonEnd) continue; // skip too-long, try shorter ones
        afternoonScheduled.push({ stop: s, time: cursor });
        scheduledIds.add(s.id);
        cursor += dur + travelGap;
      }

      // Rebuild stops array
      const newStops: DeepStop[] = [];
      const breakfastStop = day.stops.find(s => s.mealType === 'breakfast');
      const lunchStop = day.stops.find(s => s.mealType === 'lunch');
      const dinnerStop = day.stops.find(s => s.mealType === 'dinner');

      // Breakfast (clamp: no earlier than 6 AM, no later than start time)
      const breakfastMin = Math.max(6 * 60, startMin - 60);
      if (breakfastStop) newStops.push({ ...breakfastStop, time: formatTime24(breakfastMin) });

      // Leave hotel
      if (hotelLeave) newStops.push({ ...hotelLeave, time: formatTime24(startMin) });

      // Morning activities
      for (const { stop, time } of morningScheduled) {
        newStops.push({ ...stop, time: formatTime24(time) });
      }

      // Lunch (skip if starting after lunch time)
      if (lunchStop && startMin < lunchTime) newStops.push({ ...lunchStop, time: formatTime24(lunchTime) });

      // Afternoon activities
      for (const { stop, time } of afternoonScheduled) {
        newStops.push({ ...stop, time: formatTime24(time) });
      }

      // Dinner
      if (dinnerStop) newStops.push({ ...dinnerStop, time: formatTime24(dinnerTime) });

      // Hotel return + sleep
      if (hotelReturn) newStops.push({ ...hotelReturn, time: '20:00' });
      if (sleepStop) newStops.push({ ...sleepStop, time: '22:00' });

      // Inject custom activities before dinner
      const customs = customActivities[day.day] || [];
      if (customs.length > 0) {
        const dinnerIdx = newStops.findIndex(s => s.mealType === 'dinner');
        const insertIdx = dinnerIdx >= 0 ? dinnerIdx : newStops.length - 1;

        // Check which customs were pinned from AI (their name exists in the base day's AI stops)
        const baseAiNames = new Set(day.stops.filter(s => s.type === 'attraction' && !s.mealType).map(s => s.name.trim().toLowerCase()));
        const customStops: DeepStop[] = customs.map((activity, ci) => ({
          id: `custom-${day.day}-${ci}`,
          name: activity.name,
          type: 'attraction' as const,
          time: activity.time,
          transport: { icon: 'walk', duration: '', distance: '' },
          isPinned: baseAiNames.has(activity.name.trim().toLowerCase()),
        }));

        newStops.splice(insertIdx, 0, ...customStops);
      }

      return { ...day, stops: newStops };
    });
  }, [days, dayStartTimes, customActivities, activityOrder]);

  const totalNights = trip.destinations.reduce((s, d) => s + d.nights, 0);
  const summaryTransportPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
  const summaryRooms = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
  const flightCost = trip.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + l.selectedFlight!.pricePerAdult, 0) * summaryTransportPax;
  const trainCost = trip.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + l.selectedTrain!.price, 0) * summaryTransportPax;
  const hotelCost = trip.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => s + d.selectedHotel!.pricePerNight * d.nights * summaryRooms, 0);

  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? trip.from : trip.destinations[Math.min(legIdx - 1, trip.destinations.length - 1)]?.city;
    const toCity = legIdx < trip.destinations.length ? trip.destinations[legIdx]?.city : trip.from;
    return { fromCity, toCity };
  };

  // Fetch real travel times between consecutive attractions on explore days
  useEffect(() => {
    if (adjustedDays.length === 0) return;
    for (const day of adjustedDays) {
      if (day.type !== 'explore') continue;
      const attractions = day.stops.filter(s => s.type === 'attraction' && !s.mealType);
      // Also include hotel leave as the starting point
      const hotelStop = day.stops.find(s => s.type === 'hotel' && s.transport?.icon === 'walk');
      const allStops = hotelStop ? [hotelStop, ...attractions] : attractions;
      for (let j = 0; j < allStops.length - 1; j++) {
        const from = allStops[j];
        const to = allStops[j + 1];
        const key = `${from.name}→${to.name}@${day.city}`;
        if (travelFetchedRef.current[key]) continue;
        travelFetchedRef.current[key] = true;
        const fromQ = `${from.name}, ${day.city}`;
        const toQ = `${to.name}, ${day.city}`;
        getDirections(fromQ, toQ, 'walking').then(result => {
          if (result) {
            setTravelBetween(prev => ({ ...prev, [key]: { duration: result.durationText, distance: result.distanceText, mode: 'walk' } }));
          }
        }).catch(() => {});
      }
    }
  }, [adjustedDays.map(d => `${d.day}-${d.stops.length}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle travel mode between stops
  const toggleTravelMode = (fromName: string, toName: string, city: string) => {
    const key = `${fromName}→${toName}@${city}`;
    const current = travelBetween[key]?.mode || 'walk';
    const nextMode = current === 'walk' ? 'transit' : current === 'transit' ? 'driving' : 'walk';
    const modeLabel = nextMode === 'walk' ? 'walking' : nextMode === 'transit' ? 'transit' : 'driving';
    const fromQ = `${fromName}, ${city}`;
    const toQ = `${toName}, ${city}`;
    // Fetch new directions for the toggled mode
    travelFetchedRef.current[key] = false;
    getDirections(fromQ, toQ, modeLabel as any).then(result => {
      if (result) {
        setTravelBetween(prev => ({ ...prev, [key]: { duration: result.durationText, distance: result.distanceText, mode: nextMode } }));
      }
    }).catch(() => {});
  };

  const getDefaultActivityTime = (dayNumber: number): string => {
    const existing = customActivities[dayNumber] || [];
    // Use adjustedDays (not base days) so times reflect start time changes
    const dayData = adjustedDays.find(d => d.day === dayNumber);
    if (existing.length > 0) {
      // 2 hours after last custom activity
      const lastTime = existing[existing.length - 1].time;
      const lastMin = parseTime(lastTime);
      return formatTime24(lastMin + 120);
    }
    if (dayData) {
      // Find last non-meal attraction
      const lastAttr = dayData.stops.slice().reverse().find(s => s.type === 'attraction' && !s.mealType);
      if (lastAttr?.time) {
        return formatTime24(parseTime(lastAttr.time) + 120);
      }
    }
    return '16:00';
  };

  const handleAddActivity = (dayNumber: number) => {
    const text = activityInputText[dayNumber]?.trim();
    if (!text) return;
    const time = activityInputTime[dayNumber] || getDefaultActivityTime(dayNumber);
    setCustomActivities(prev => ({
      ...prev,
      [dayNumber]: [...(prev[dayNumber] || []), { name: text, time }],
    }));
    setActivityInputText(prev => ({ ...prev, [dayNumber]: '' }));
    setActivityInputTime(prev => ({ ...prev, [dayNumber]: '' }));
    setShowActivityInput(prev => ({ ...prev, [dayNumber]: false }));
  };

  const handleDeleteActivity = (dayNumber: number, activityIndex: number) => {
    setCustomActivities(prev => ({
      ...prev,
      [dayNumber]: (prev[dayNumber] || []).filter((_, i) => i !== activityIndex),
    }));
  };

  const handleDeleteStop = (dayNumber: number, stopName: string) => {
    // For built-in attractions, we don't modify the memo. Only custom activities can be deleted.
    const customs = customActivities[dayNumber] || [];
    const idx = customs.findIndex(c => c.name === stopName);
    if (idx >= 0) {
      handleDeleteActivity(dayNumber, idx);
    }
  };

  // Pin/save an AI-generated activity as a custom activity (survives refreshes)
  const handlePinActivity = (dayNumber: number, stop: DeepStop) => {
    const time = stop.time || getDefaultActivityTime(dayNumber);
    setCustomActivities(prev => ({
      ...prev,
      [dayNumber]: [...(prev[dayNumber] || []), { name: stop.name, time }],
    }));
  };

  // Drag-to-reorder handlers for explore day activities
  const handleDragStart = (dayNum: number, stopId: string) => {
    setDragState({ dayNum, stopId });
  };
  const handleDragOver = (e: React.DragEvent, stopId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(stopId);
  };
  const handleDragLeave = () => {
    setDragOverId(null);
  };
  const handleDrop = (e: React.DragEvent, targetStopId: string, dayNum: number) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragState || dragState.dayNum !== dayNum || dragState.stopId === targetStopId) {
      setDragState(null);
      return;
    }
    // Get current day's activity stops from the adjusted data
    const dayData = adjustedDays.find(d => d.day === dayNum);
    if (!dayData) { setDragState(null); return; }
    const actStops = dayData.stops.filter(s => s.type === 'attraction' && !s.mealType);
    const currentIds = actStops.map(s => s.id);
    const fromIdx = currentIds.indexOf(dragState.stopId);
    const toIdx = currentIds.indexOf(targetStopId);
    if (fromIdx < 0 || toIdx < 0) { setDragState(null); return; }
    // Move the dragged item to the target position
    const newOrder = [...currentIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragState.stopId);
    setActivityOrder(prev => ({ ...prev, [dayNum]: newOrder }));
    setDragState(null);
  };
  const handleDragEnd = () => {
    setDragState(null);
    setDragOverId(null);
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
    <div className="min-h-screen flex justify-center p-4 py-8 deep-plan-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[900px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          {/* Header with breadcrumb and print button */}
          <div className="print-hide flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/my-trips')} className="font-display text-lg font-bold hover:opacity-80 transition-opacity"><span className="text-accent-cyan">AI</span>Ezzy</button>
              <span className="text-text-muted text-xs">/</span>
              <button onClick={() => router.push(trip.tripId ? `/route?id=${trip.tripId}` : '/route')} className="text-text-secondary text-xs font-body hover:text-accent-cyan transition-colors">Route</button>
              <span className="text-text-muted text-xs">/</span>
              <span className="text-text-primary text-xs font-body font-semibold">Deep Plan</span>
            </div>
            <button
              onClick={() => window.print()}
              className="print-hide flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border-subtle rounded-lg text-xs font-body text-text-secondary hover:text-accent-cyan hover:border-accent-cyan transition-colors"
              aria-label="Print itinerary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print Itinerary
            </button>
          </div>
          <h1 className="font-display text-lg font-bold text-text-primary mb-6">Deep Plan</h1>

          {adjustedDays.map((day, dayIdx) => {
            const dayStyle = DAY_TYPE_STYLES[day.type];
            const isoDate = toIsoDate(day.date);
            const isCustomDeletable = (stopName: string) => (customActivities[day.day] || []).some(c => c.name === stopName);

            // Detect overnight bridge: previous day ends at a hotel and current day starts at the same place
            const prevDay = dayIdx > 0 ? adjustedDays[dayIdx - 1] : null;
            const prevLastHotelStop = prevDay?.stops.filter(s => s.type === 'hotel' && !s.mealType).slice(-1)[0];
            const currFirstHotelStop = day.stops.find(s => s.type === 'hotel' && !s.mealType);
            const overnightHotelName = prevLastHotelStop && currFirstHotelStop &&
              prevLastHotelStop.name === currFirstHotelStop.name ? prevLastHotelStop.name : null;

            return (
              <div key={day.day} className="mb-10 last:mb-0">
                {/* Overnight connector between days */}
                {overnightHotelName && (
                  <div className="flex items-center gap-2 py-2 px-4 -mt-8 mb-2">
                    <div className="flex-1 border-t border-dashed border-border-subtle" />
                    <span className="text-[10px] text-text-muted font-body italic flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                        <path d="M3 12h1m8-9v1m8 8h1M5.6 5.6l.7.7m12.1-.7-.7.7M9 16a5 5 0 1 1 6 0" />
                        <path d="M12 16v2m-3 0h6" />
                      </svg>
                      Overnight at {overnightHotelName}
                    </span>
                    <div className="flex-1 border-t border-dashed border-border-subtle" />
                  </div>
                )}
                {/* Day header */}
                <div className={`bg-bg-card border border-border-subtle rounded-xl px-4 py-3 mb-1`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display font-bold text-sm text-text-primary">Day {day.day} &mdash; {formatDateNice(day.date)}</h2>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-body ${dayStyle.bg} ${dayStyle.text} ${dayStyle.border} border`}>
                        {dayStyle.label}
                      </span>
                      {day.type === 'explore' && (() => {
                        // Try both city name and parentCity for theme lookup (themes cached by parentCity || name)
                        const themes = trip.deepPlanData?.dayThemes?.[day.city]
                          || trip.deepPlanData?.dayThemes?.[trip.destinations.find(d => d.city.name === day.city)?.city.parentCity || ''];
                        const theme = themes && typeof day.exploreDayIndex === 'number' ? themes[day.exploreDayIndex] : null;
                        return theme ? (
                          <span className="text-[10px] text-text-muted font-body italic">{theme}</span>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      {day.departureCity && day.departureCity !== day.city ? (
                        <>
                          <WeatherBadge city={day.departureCity} date={isoDate} />
                          <span className="text-text-muted text-[10px]">&rarr;</span>
                          <WeatherBadge city={day.city} date={isoDate} />
                        </>
                      ) : (
                        <WeatherBadge city={day.city} date={isoDate} />
                      )}
                    </div>
                  </div>

                  {/* Daily budget */}
                  {day.dayCost > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-text-muted font-body">{day.costLabel}:</span>
                      <span className="text-xs font-mono font-bold text-accent-cyan">{formatPrice(day.dayCost, currency)}</span>
                    </div>
                  )}
                </div>

                {/* Start time selector + AI loading for explore days */}
                {day.type === 'explore' && (
                  <div className="print-hide flex items-center gap-2 px-4 py-2 mb-1 flex-wrap">
                    <label className="text-[10px] text-text-muted font-body">Start time:</label>
                    <input
                      type="time"
                      value={dayStartTimes[day.day] || '09:00'}
                      onChange={e => setDayStartTimes(prev => ({ ...prev, [day.day]: e.target.value }))}
                      className="text-xs font-mono bg-bg-card border border-border-subtle rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-cyan"
                    />
                    {aiLoading[day.city] && (
                      <span className="flex items-center gap-1 text-[10px] text-accent-cyan font-body ml-2">
                        <span className="w-3 h-3 border border-accent-cyan border-t-transparent rounded-full animate-spin" />
                        Generating itinerary...
                      </span>
                    )}
                    {!aiLoading[day.city] && (() => {
                      const cityKey = day.city;
                      const dest = trip.destinations.find(d => (d.city.parentCity || d.city.name) === cityKey || d.city.name === cityKey);
                      if (!dest) return null;
                      const exploreDaysCount = Math.max(0, dest.nights - 1);
                      return (
                        <button
                          onClick={() => refreshAiActivities(cityKey, dest.city.country || '', exploreDaysCount, dest.places?.map(p => p.name) || [])}
                          className="text-[10px] text-text-muted hover:text-accent-cyan font-body ml-auto transition-colors flex items-center gap-1"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Refresh suggestions
                        </button>
                      );
                    })()}
                  </div>
                )}

                {/* Timeline */}
                <div className={`ml-4 border-l-2 ${dayStyle.line} pl-0`}>
                  {day.stops.map((stop, si) => {
                    const hasTransport = stop.transport !== null;
                    const isMeal = !!stop.mealType;
                    const isCustom = isCustomDeletable(stop.name);
                    const stopColor = TYPE_COLORS[stop.type] || '#E8654A';

                    // Meal slot rendering
                    if (isMeal) {
                      return (
                        <div key={stop.id} className="relative">
                          <div className="flex items-center gap-3 py-1.5 pl-4">
                            {/* Timeline dot for meals */}
                            <div className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-bg-surface border-2 border-border-subtle" />
                            <div className="flex items-center gap-2 flex-1">
                              {stop.time && (
                                <span className="text-text-muted text-[10px] font-mono">{formatTime12(parseTime(stop.time))}</span>
                              )}
                              <span className="text-text-muted text-xs font-body italic flex items-center gap-1">
                                <span className="text-sm">&#127869;</span> {stop.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Is this an attraction on an explore day that can be dragged?
                    const isDraggableActivity = day.type === 'explore' && stop.type === 'attraction' && !isMeal;

                    return (
                      <div
                        key={stop.id}
                        className={`relative${isDraggableActivity ? ' transition-all' : ''}${dragOverId === stop.id ? ' bg-accent-cyan/5 rounded-lg' : ''}`}
                        draggable={isDraggableActivity}
                        onDragStart={isDraggableActivity ? () => handleDragStart(day.day, stop.id) : undefined}
                        onDragOver={isDraggableActivity ? (e) => handleDragOver(e, stop.id) : undefined}
                        onDragLeave={isDraggableActivity ? handleDragLeave : undefined}
                        onDrop={isDraggableActivity ? (e) => handleDrop(e, stop.id, day.day) : undefined}
                        onDragEnd={isDraggableActivity ? handleDragEnd : undefined}
                      >
                        {/* Stop */}
                        <div className="flex items-start gap-3 pl-4 py-2">
                          {/* Timeline circle — category icon for attractions, plain dot otherwise */}
                          <div className="absolute -left-[7px] mt-1">
                            {stop.category && CATEGORY_ICONS[stop.category] ? (
                              <div className="w-4 h-4 rounded-full flex items-center justify-center relative z-10 border-2 border-white"
                                style={{ backgroundColor: stopColor }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d={CATEGORY_ICONS[stop.category]} />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-mono font-bold relative z-10 border-2 border-white"
                                style={{ backgroundColor: stopColor }}>
                              </div>
                            )}
                          </div>
                          {/* Drag handle for explore day activities */}
                          {isDraggableActivity && (
                            <div className="print-hide flex flex-col gap-[2px] opacity-25 hover:opacity-60 flex-shrink-0 cursor-grab active:cursor-grabbing mt-1 -mr-1" aria-label="Drag to reorder">
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {stop.time && (
                                <span className="text-accent-cyan text-[11px] font-mono font-bold">
                                  {formatTime12(parseTime(stop.time))}
                                  {stop.isNextDay && <span className="text-accent-cyan/60 text-[9px] ml-0.5">+1</span>}
                                </span>
                              )}
                              <h3 className="font-display font-bold text-sm text-text-primary leading-tight">{stop.name}</h3>
                              {/* Google Maps link for attractions and hotels */}
                              {(stop.type === 'attraction' || stop.type === 'hotel') && !isMeal && (
                                <a
                                  href={mapsUrl(stop.name, day.city)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="print-hide text-text-muted hover:text-accent-cyan transition-colors flex-shrink-0"
                                  aria-label={`View ${stop.name} on Google Maps`}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                </a>
                              )}
                              {/* Delete button for custom activities */}
                              {isCustom && (
                                <button
                                  onClick={() => handleDeleteStop(day.day, stop.name)}
                                  className="print-hide text-text-muted hover:text-red-500 transition-colors text-xs ml-1"
                                  aria-label={`Remove ${stop.name}`}
                                >
                                  &times;
                                </button>
                              )}
                              {/* Pin/save button for AI-generated activities on explore days */}
                              {day.type === 'explore' && stop.type === 'attraction' && !isMeal && !isCustom && !stop.isPinned && (
                                <button
                                  onClick={() => handlePinActivity(day.day, stop)}
                                  className="print-hide text-text-muted hover:text-accent-cyan transition-colors flex-shrink-0"
                                  aria-label={`Save ${stop.name} as custom activity`}
                                  title="Save — keeps this activity through refreshes"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                  </svg>
                                </button>
                              )}
                              {/* Pinned indicator */}
                              {stop.isPinned && (
                                <span className="text-accent-cyan flex-shrink-0" title="Saved activity">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            {stop.note && (
                              <p className="text-[11px] text-amber-600 font-body mt-0.5 flex items-start gap-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                {stop.note}
                              </p>
                            )}
                            {/* Opening hours + ticket price */}
                            {(stop.openingHours || stop.ticketPrice) && (
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {stop.openingHours && (
                                  <span className="text-[10px] text-text-muted font-body flex items-center gap-1">
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {stop.openingHours}
                                  </span>
                                )}
                                {stop.ticketPrice && (
                                  <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent(stop.name + ' ' + day.city + ' tickets')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-text-muted hover:text-accent-cyan font-body flex items-center gap-1 transition-colors"
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                    {stop.ticketPrice}
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Bug fix #6: Hotel card with rating, price, dates */}
                            {stop.type === 'hotel' && !hasTransport && stop.destIndex !== undefined && (() => {
                              const dest = trip.destinations[stop.destIndex!];
                              const hotel = dest?.selectedHotel;
                              if (!hotel) return (
                                <button onClick={() => setHotelModal({ destIndex: stop.destIndex! })} className="print-hide text-accent-cyan text-xs font-body mt-0.5 hover:underline">
                                  Select hotel
                                </button>
                              );
                              return (
                                <div className="mt-1.5 bg-rose-50/40 border border-rose-200/50 border-l-[3px] border-l-rose-400 rounded-lg p-2 space-y-0.5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                      {hotel.rating > 0 && <span className="px-1 py-0.5 rounded text-white font-mono font-bold text-[8px]" style={{ backgroundColor: hotel.ratingColor }}>{hotel.rating}</span>}
                                      <span className="text-[10px] font-body text-text-secondary">{formatPrice(hotel.pricePerNight, currency)}/night &times; {dest.nights}N</span>
                                    </div>
                                    <button onClick={() => setHotelModal({ destIndex: stop.destIndex! })} className="print-hide text-accent-cyan text-[9px] font-body hover:underline">Change</button>
                                  </div>
                                </div>
                              );
                            })()}

                            {stop.type === 'attraction' && !isMeal && !isCustom && (
                              <span className="text-xs text-text-muted font-body">
                                {stop.category ? (CATEGORY_LABELS[stop.category] || 'Sightseeing') : 'Sightseeing'}
                                {stop.durationMin ? ` · ${formatDuration(stop.durationMin)}` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bug fix #5: Rich transport card (flight/train details) */}
                        {hasTransport && stop.transport && (() => {
                          const legIdx = stop.legIndex;
                          const leg = legIdx !== undefined ? trip.transportLegs[legIdx] : null;
                          const flight = leg?.selectedFlight;
                          const train = leg?.selectedTrain;

                          // Rich flight card (blue themed)
                          if (flight && legIdx !== undefined) {
                            return (
                              <div className="pl-4 py-1">
                                <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                  <div className="bg-blue-50/50 border border-blue-200/60 border-l-[3px] border-l-blue-500 rounded-lg p-2.5 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-display font-bold text-text-primary flex items-center gap-1.5">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
                                        {flight.airline} {flight.flightNumber}
                                      </span>
                                      <div className="flex items-center gap-2 print-hide">
                                        <button onClick={() => setTransportModal({ legIndex: legIdx })} className="text-accent-cyan text-[9px] font-body hover:underline">Change</button>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                                      <span>{flight.departure} &rarr; {flight.arrival}</span>
                                      <span>{flight.duration} &middot; {flight.stops}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-text-secondary font-body">{formatPrice(flight.pricePerAdult, currency)}/pax &times; {trip.adults}</span>
                                      <span className="text-accent-cyan font-mono font-bold">{formatPrice(flight.pricePerAdult * trip.adults, currency)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Rich train/bus/drive card (amber/orange/slate themed)
                          if (train && legIdx !== undefined) {
                            const isBus = leg?.type === 'bus';
                            const isDrive = leg?.type === 'drive';
                            const cardStyle = isBus ? 'bg-orange-50/50 border border-orange-200/60 border-l-orange-500'
                              : isDrive ? 'bg-slate-50/50 border border-slate-200/60 border-l-slate-500'
                              : 'bg-amber-50/50 border border-amber-200/60 border-l-amber-500';
                            const iconColor = isBus ? '#f97316' : isDrive ? '#64748b' : '#f59e0b';
                            const iconPath = isBus ? 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01'
                              : isDrive ? 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2'
                              : 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8';
                            const hasTimes = train.departure && train.arrival;
                            return (
                              <div className="pl-4 py-1">
                                <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                  <div className={`${cardStyle} border-l-[3px] rounded-lg p-2.5 space-y-1`}>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-display font-bold text-text-primary flex items-center gap-1.5">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath}/></svg>
                                        {train.operator || train.trainName} {train.trainNumber}
                                      </span>
                                      <button onClick={() => setTransportModal({ legIndex: legIdx })} className="print-hide text-accent-cyan text-[9px] font-body hover:underline">Change</button>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                                      {hasTimes ? (
                                        <span>{train.departure} &rarr; {train.arrival}</span>
                                      ) : null}
                                      <span>{train.duration}{!hasTimes && leg?.distance && leg.distance !== '~' ? ` · ${leg.distance}` : ''}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px]">
                                      {train.price > 0 ? (
                                        <>
                                          <span className="text-text-secondary font-body">{formatPrice(train.price, currency)}/pax &times; {trip.adults}</span>
                                          <span className="text-accent-cyan font-mono font-bold">{formatPrice(train.price * trip.adults, currency)}</span>
                                        </>
                                      ) : (
                                        <span className="text-text-muted font-body italic">Price N/A</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Default: simple transport line (drive, walk, etc.)
                          const hasDurationInfo = stop.transport.duration && stop.transport.distance;
                          // Look up real travel time between this stop and next attraction
                          const nextAttrIdx = day.stops.findIndex((s, idx) => idx > si && s.type === 'attraction' && !s.mealType);
                          const nextAttr = nextAttrIdx >= 0 ? day.stops[nextAttrIdx] : null;
                          const travelKey = nextAttr ? `${stop.name}→${nextAttr.name}@${day.city}` : '';
                          const realTravel = travelKey ? travelBetween[travelKey] : null;
                          const modeIcon = realTravel?.mode === 'transit' ? 'publicTransit' : realTravel?.mode === 'driving' ? 'drive' : 'walk';
                          const modeLabel = realTravel?.mode === 'transit' ? 'Transit' : realTravel?.mode === 'driving' ? 'Drive' : 'Walk';

                          return (
                            <div className="pl-4 py-1">
                              <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                {legIdx !== undefined ? (
                                  <button
                                    onClick={() => setTransportModal({ legIndex: legIdx })}
                                    className="flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition-colors group"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-accent-cyan">
                                      <path d={TRANSPORT_ICONS[stop.transport.icon] || TRANSPORT_ICONS.drive} />
                                    </svg>
                                    {hasDurationInfo ? (
                                      <span className="text-xs font-mono">{stop.transport.duration} &middot; {stop.transport.distance}</span>
                                    ) : (
                                      <span className="text-xs font-body text-text-muted capitalize">{stop.transport.icon === 'walk' ? 'Walk' : stop.transport.icon}</span>
                                    )}
                                    <span className="text-[10px] text-text-muted font-body print-hide">Change</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => nextAttr && toggleTravelMode(stop.name, nextAttr.name, day.city)}
                                    className="print-hide flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition-colors group"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-accent-cyan">
                                      <path d={TRANSPORT_ICONS[modeIcon] || TRANSPORT_ICONS.walk} />
                                    </svg>
                                    {realTravel ? (
                                      <span className="text-xs font-mono">{realTravel.duration} &middot; {realTravel.distance}</span>
                                    ) : (
                                      <span className="text-xs font-body text-text-muted">{modeLabel}</span>
                                    )}
                                    <span className="text-[9px] text-text-muted/60 font-body">{realTravel ? modeLabel : ''}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Add Activity button (explore days only) */}
                {day.type === 'explore' && (
                  <div className="print-hide ml-4 pl-4 mt-2">
                    {!showActivityInput[day.day] ? (
                      <button
                        onClick={() => setShowActivityInput(prev => ({ ...prev, [day.day]: true }))}
                        className="flex items-center gap-1.5 text-xs font-body text-text-muted hover:text-accent-cyan transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Activity
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          placeholder="Activity name..."
                          value={activityInputText[day.day] || ''}
                          onChange={e => setActivityInputText(prev => ({ ...prev, [day.day]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddActivity(day.day); if (e.key === 'Escape') setShowActivityInput(prev => ({ ...prev, [day.day]: false })); }}
                          className="flex-1 min-w-[120px] text-xs font-body bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan"
                          autoFocus
                        />
                        <input
                          type="time"
                          value={activityInputTime[day.day] || getDefaultActivityTime(day.day)}
                          onChange={e => setActivityInputTime(prev => ({ ...prev, [day.day]: e.target.value }))}
                          className="text-xs font-mono bg-bg-card border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent-cyan w-[90px]"
                        />
                        <button
                          onClick={() => handleAddActivity(day.day)}
                          className="px-2.5 py-1.5 bg-accent-cyan text-white text-xs font-body font-semibold rounded-lg hover:opacity-90 transition-opacity"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setShowActivityInput(prev => ({ ...prev, [day.day]: false }))}
                          className="text-text-muted hover:text-text-primary text-xs"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Day Notes */}
                <div className="print-hide ml-4 pl-4 mt-2">
                  {!showDayNotes[day.day] ? (
                    <button
                      onClick={() => setShowDayNotes(prev => ({ ...prev, [day.day]: true }))}
                      className="flex items-center gap-1.5 text-xs font-body text-text-muted hover:text-accent-cyan transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {dayNotes[day.day] ? 'Edit note' : 'Add note'}
                    </button>
                  ) : (
                    <div className="mt-1">
                      <textarea
                        value={dayNotes[day.day] || ''}
                        onChange={e => setDayNotes(prev => ({ ...prev, [day.day]: e.target.value }))}
                        placeholder="Add notes for this day..."
                        rows={3}
                        className="w-full text-xs font-body bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan resize-none"
                      />
                      <button
                        onClick={() => setShowDayNotes(prev => ({ ...prev, [day.day]: false }))}
                        className="text-[10px] text-text-muted font-body hover:text-accent-cyan mt-1"
                      >
                        Collapse
                      </button>
                    </div>
                  )}
                  {/* Show note preview when collapsed */}
                  {!showDayNotes[day.day] && dayNotes[day.day] && (
                    <p className="text-[10px] text-text-muted font-body italic mt-0.5 truncate max-w-[300px]">{dayNotes[day.day]}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Trip Summary */}
          <div className="mt-6 p-4 bg-bg-card border border-border-subtle rounded-xl">
            <h3 className="font-display font-bold text-sm text-text-primary mb-3">Trip Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{adjustedDays.length}</p><p className="text-text-muted text-[10px] font-body">Days</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{trip.destinations.length}</p><p className="text-text-muted text-[10px] font-body">Cities</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{totalNights}</p><p className="text-text-muted text-[10px] font-body">Nights</p></div>
            </div>
            {(flightCost + trainCost + hotelCost) > 0 && (
              <div className="pt-3 border-t border-border-subtle space-y-2">
                {flightCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-text-muted font-body">Flights</span>
                    <span className="text-xs font-mono text-text-secondary">{formatPrice(flightCost, currency)}</span>
                  </div>
                )}
                {trainCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-text-muted font-body">Trains</span>
                    <span className="text-xs font-mono text-text-secondary">{formatPrice(trainCost, currency)}</span>
                  </div>
                )}
                {hotelCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-text-muted font-body">Hotels ({totalNights}N)</span>
                    <span className="text-xs font-mono text-text-secondary">{formatPrice(hotelCost, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border-subtle">
                  <span className="text-xs text-text-secondary font-body font-semibold">Estimated Total</span>
                  <span className="text-accent-cyan font-mono font-bold">{formatPrice(flightCost + trainCost + hotelCost, currency)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Flight Modal */}
      {flightModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(flightModal.legIndex);
        const leg = trip.transportLegs[flightModal.legIndex];
        if (!fromCity || !toCity) return null;
        return <FlightModal isOpen onClose={() => setFlightModal(null)}
          fromAirport={fromCity.airport?.name || fromCity.name} toAirport={toCity.airport?.name || toCity.name}
          fromCode={fromCity.airportCode || 'BOM'} toCode={toCity.airportCode || 'AMS'} date={trip.departureDate}
          selectedFlight={leg?.selectedFlight || null}
          onSelectFlight={f => { if (leg) trip.selectFlight(leg.id, f); setFlightModal(null); }} />;
      })()}

      {/* Train Modal */}
      {trainModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(trainModal.legIndex);
        const leg = trip.transportLegs[trainModal.legIndex];
        return <TrainModal isOpen onClose={() => setTrainModal(null)}
          fromCity={fromCity?.name || ''} toCity={toCity?.name || ''}
          selectedTrain={leg?.selectedTrain || null}
          onSelectTrain={t => { if (leg) trip.selectTrain(leg.id, t); setTrainModal(null); }} />;
      })()}

      {/* Hotel Modal */}
      {hotelModal !== null && (() => {
        const dest = trip.destinations[hotelModal.destIndex];
        if (!dest) return null;
        return <HotelModal isOpen onClose={() => setHotelModal(null)}
          cityName={dest.city.name} locationQuery={dest.city.fullName} nights={dest.nights} selectedHotel={dest.selectedHotel}
          onSelectHotel={h => { trip.updateDestinationHotel(dest.id, h); setHotelModal(null); }} />;
      })()}

      {/* Transport Modal */}
      {transportModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(transportModal.legIndex);
        const leg = trip.transportLegs[transportModal.legIndex];
        const hasTrains = true;
        return <TransportModal isOpen onClose={() => setTransportModal(null)} currentType={leg?.type || 'drive'}
          trainAvailable={hasTrains}
          onSelectType={type => {
            if (leg) {
              trip.changeTransportType(leg.id, type);
              setTransportModal(null);
              if (type === 'flight') setFlightModal({ legIndex: transportModal.legIndex });
              else if (type === 'train') setTrainModal({ legIndex: transportModal.legIndex });
            }
          }} />;
      })()}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 90% !important;
          }
          /* Hide all interactive elements */
          .print-hide {
            display: none !important;
          }
          /* Hide header navigation / breadcrumb (uses print-hide class) */
          /* Full width, no max-width constraint */
          .deep-plan-page {
            padding: 0 !important;
            max-width: 100% !important;
          }
          .deep-plan-page > div {
            max-width: 100% !important;
          }
          .deep-plan-page .card-warm-lg {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 16px !important;
            max-width: 100% !important;
          }
          /* Remove card shadows and rounded corners on day cards */
          .deep-plan-page .rounded-xl {
            border-radius: 4px !important;
            box-shadow: none !important;
          }
          .deep-plan-page .rounded-lg {
            border-radius: 2px !important;
            box-shadow: none !important;
          }
          .deep-plan-page .rounded-full {
            box-shadow: none !important;
          }
          /* Day type badges: remove background color, use border instead */
          .deep-plan-page .bg-blue-50 {
            background-color: transparent !important;
            border: 1px solid #93c5fd !important;
          }
          .deep-plan-page .bg-emerald-50 {
            background-color: transparent !important;
            border: 1px solid #6ee7b7 !important;
          }
          .deep-plan-page .bg-orange-50 {
            background-color: transparent !important;
            border: 1px solid #fdba74 !important;
          }
          /* Compact font size */
          .deep-plan-page h1 {
            font-size: 16px !important;
          }
          .deep-plan-page h2 {
            font-size: 12px !important;
          }
          .deep-plan-page h3 {
            font-size: 11px !important;
          }
          /* Avoid page breaks inside day cards */
          .deep-plan-page .mb-10 {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Force background colors where needed */
          .deep-plan-page [style*="backgroundColor"] {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function DeepPlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" /></div>}>
      <DeepPlanPageContent />
    </Suspense>
  );
}
