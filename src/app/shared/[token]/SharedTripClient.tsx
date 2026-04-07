'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { addDaysToDate, formatTime12, formatTime24, parseTime, parseDurationMinutes, timeStr12 } from '@/lib/timeUtils';
import { formatPrice, getForeignToINR } from '@/lib/currency';

/* ────────── CONSTANTS ────────── */

const TRANSPORT_ICONS: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  walk: 'M13 3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-1.5 18l-2.4-8.5 2.9-2v8.5h-1l.5 2zm3-18l-1 4 3 3v7h-2v-5l-3-3 1-4 5 2v-2z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01',
  publicTransit: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
};

const transportIcons: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2M7 14h.01M17 14h.01M6 3h12l1 5H5z',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-16 0h16M8 22h8m-8-4h.01M16 18h.01M6 6h12v6H6z',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01M5 6h14v5H5zM8 22h8',
};

interface DayPlan {
  day: number;
  date: string;
  type: 'travel' | 'explore' | 'departure' | 'arrival';
  city: string;
  departureCity?: string;
  exploreDayIndex?: number;
  dayCost: number;
  costLabel: string;
  stops: DayStop[];
}

interface DayStop {
  id: string;
  name: string;
  type: 'home' | 'airport' | 'station' | 'hotel' | 'attraction' | 'destination';
  time: string | null;
  transport: { icon: string; duration: string; distance: string } | null;
  destIndex?: number;
  legIndex?: number;
  note?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  isNextDay?: boolean;
  category?: string;
  durationMin?: number;
  openingHours?: string;
  ticketPrice?: string;
}

const DAY_TYPE_STYLES: Record<string, { bg: string; text: string; border: string; line: string; label: string }> = {
  travel: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', line: 'border-blue-300', label: 'Travel Day' },
  explore: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', line: 'border-emerald-400', label: 'Explore Day' },
  departure: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', line: 'border-orange-300', label: 'Departure Day' },
  arrival: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', line: 'border-violet-300', label: 'Arrival & Explore' },
};

const TYPE_COLORS: Record<string, string> = {
  home: '#E8654A', airport: '#8b5cf6', station: '#f59e0b', hotel: '#ec4899', attraction: '#f59e0b', destination: '#E8654A',
};

const CATEGORY_CARD_STYLES: Record<string, { bg: string; border: string; pill: string }> = {
  museum: { bg: 'bg-blue-50/60', border: 'border-blue-200/50', pill: 'bg-blue-100 text-blue-700' },
  park: { bg: 'bg-emerald-50/60', border: 'border-emerald-200/50', pill: 'bg-emerald-100 text-emerald-700' },
  landmark: { bg: 'bg-amber-50/60', border: 'border-amber-200/50', pill: 'bg-amber-100 text-amber-700' },
  market: { bg: 'bg-orange-50/60', border: 'border-orange-200/50', pill: 'bg-orange-100 text-orange-700' },
  experience: { bg: 'bg-violet-50/60', border: 'border-violet-200/50', pill: 'bg-violet-100 text-violet-700' },
  religious: { bg: 'bg-rose-50/60', border: 'border-rose-200/50', pill: 'bg-rose-100 text-rose-700' },
  neighborhood: { bg: 'bg-teal-50/60', border: 'border-teal-200/50', pill: 'bg-teal-100 text-teal-700' },
  viewpoint: { bg: 'bg-sky-50/60', border: 'border-sky-200/50', pill: 'bg-sky-100 text-sky-700' },
};
const DEFAULT_CARD_STYLE = { bg: 'bg-slate-50/40', border: 'border-slate-200/30', pill: 'bg-slate-100 text-slate-600' };

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

const CATEGORY_LABELS: Record<string, string> = {
  landmark: 'Landmark', museum: 'Museum', park: 'Park', market: 'Market',
  experience: 'Experience', religious: 'Religious Site', neighborhood: 'Neighborhood',
  viewpoint: 'Viewpoint',
};

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

/** Format duration minutes to human-readable */
function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m} min` : `${h}h`;
}

/* ────────── TYPES ────────── */

export interface SharedTrip {
  title: string;
  from: any;
  fromAddress: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  tripType: string;
  destinations: any[];
  transportLegs: any[];
  totalNights: number;
  flightCost: number;
  trainCost: number;
  hotelCost: number;
  totalCost: number;
  deepPlanData?: any;
}

/* ────────── COMPONENT ────────── */

export default function SharedTripClient({ trip, initialView = 'route' }: { trip: SharedTrip; initialView?: 'route' | 'deepplan' }) {
  const router = useRouter();
  const hasDeepPlan = !!(trip.deepPlanData?.cityActivities && Object.keys(trip.deepPlanData.cityActivities).length > 0);
  const [view, setView] = useState<'route' | 'deepplan'>(hasDeepPlan && initialView === 'deepplan' ? 'deepplan' : 'route');

  const convRates: Record<string, number> = getForeignToINR();

  // ── Build stops for route view ──
  const stops = useMemo(() => {
    const result: Array<{
      type: 'home' | 'destination';
      name: string;
      explore: string;
      number: number;
      nights: number;
      destIndex?: number;
    }> = [];
    const homeName = trip.fromAddress?.split(',')[0] || trip.from?.name || 'Home';
    result.push({ type: 'home', name: homeName, explore: homeName, number: 1, nights: 0 });
    trip.destinations.forEach((d: any, i: number) => {
      result.push({
        type: 'destination',
        name: d.city?.parentCity || d.city?.name || `City ${i + 1}`,
        explore: d.city?.name || `City ${i + 1}`,
        number: i + 2,
        nights: d.nights || 0,
        destIndex: i,
      });
    });
    if (trip.tripType === 'roundTrip') {
      result.push({ type: 'home', name: homeName, explore: homeName, number: result.length + 1, nights: 0 });
    }
    return result;
  }, [trip]);

  const calcArrivalDate = (stopIdx: number): Date => {
    const d = new Date(trip.departureDate);
    for (let s = 0; s < stopIdx; s++) {
      if (s > 0 && s - 1 < trip.destinations.length) {
        d.setDate(d.getDate() + (trip.destinations[s - 1]?.nights || 1));
      }
      const tLeg = s < trip.transportLegs.length ? trip.transportLegs[s] : null;
      if (tLeg) {
        const sel = tLeg.selectedFlight || tLeg.selectedTrain;
        if (sel) {
          const depH = parseInt(sel.departure?.split(':')[0] || '0');
          const arrH = parseInt(sel.arrival?.split(':')[0] || '0');
          const durMatch = sel.duration?.match(/(\d+)h/);
          const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
          const isOvernight = sel.isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2);
          if (isOvernight) d.setDate(d.getDate() + 1);
        }
      }
    }
    return d;
  };

  // ── Build full day-by-day itinerary (same logic as deep plan page) ──
  const days: DayPlan[] = useMemo(() => {
    if (!trip.deepPlanData?.cityActivities) return [];
    const cityActivities = trip.deepPlanData.cityActivities as Record<string, any[]>;
    const dayThemes = (trip.deepPlanData.dayThemes || {}) as Record<string, string[]>;
    const mealCosts = (trip.deepPlanData.mealCosts || {}) as Record<string, any>;
    const customActs = (trip.deepPlanData.customActivities || {}) as Record<number, Array<{ name: string; time: string }>>;
    const removedActs = (trip.deepPlanData.removedActivities || {}) as Record<string, string[]>;
    const result: DayPlan[] = [];
    let dayNum = 0;
    let sc = 0;

    for (let destIdx = 0; destIdx < trip.destinations.length; destIdx++) {
      const dest = trip.destinations[destIdx];
      const leg = trip.transportLegs[destIdx];
      const toCity = dest.city;
      const cityName = toCity?.parentCity || toCity?.name || `City ${destIdx + 1}`;
      const prevDest = destIdx > 0 ? trip.destinations[destIdx - 1] : null;
      const fromCityName = destIdx === 0
        ? (trip.from?.parentCity || trip.from?.name || 'Home')
        : (prevDest?.city?.parentCity || prevDest?.city?.name || '');

      // Transport pricing
      const flightPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
      const trainPax = trip.adults + (trip.children || 0);
      let travelDayCost = 0;
      let travelCostLabel = '';
      if (leg) {
        if (leg.selectedFlight) {
          travelDayCost = leg.selectedFlight.pricePerAdult * flightPax;
          travelCostLabel = 'Flight';
        } else if (leg.selectedTrain) {
          travelDayCost = leg.selectedTrain.price * trainPax;
          travelCostLabel = 'Train';
        }
      }

      // ── TRAVEL DAY ──
      const travelDay: DayPlan = {
        day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
        type: 'travel', city: cityName, departureCity: fromCityName, dayCost: travelDayCost, costLabel: travelCostLabel,
      };

      if (leg) {
        const sel = leg.selectedFlight || leg.selectedTrain;
        const depTime = leg.departureTime || sel?.departure;
        const arrTime = leg.arrivalTime || sel?.arrival;

        // Starting point
        const isFirstLeg = destIdx === 0;
        const startName = isFirstLeg ? (trip.fromAddress?.split(',')[0] || fromCityName) : (prevDest?.selectedHotel?.name || `Stay in ${fromCityName}`);
        const startType = isFirstLeg ? 'home' as const : 'hotel' as const;

        if (leg.type === 'flight' || leg.type === 'train' || leg.type === 'bus') {
          // Leave starting point
          travelDay.stops.push({
            id: `dp${sc++}`, name: startName, type: startType, time: null,
            transport: { icon: 'drive', duration: '', distance: '' },
            destIndex: !isFirstLeg ? destIdx - 1 : undefined,
            note: depTime ? `Leave early to reach on time` : undefined,
          });

          // Departure terminal
          const termType = leg.type === 'flight' ? 'airport' as const : 'station' as const;
          const termName = `${fromCityName} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
          travelDay.stops.push({
            id: `dp${sc++}`, name: termName, type: termType, time: null,
            transport: { icon: leg.type, duration: leg.duration || sel?.duration || '', distance: leg.distance || '' },
            legIndex: destIdx,
            note: leg.type === 'flight'
              ? `Check-in before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`
              : `Board before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`,
          });

          // Detect overnight
          let transitDays = 0;
          if (sel && depTime && arrTime) {
            const depH = parseInt(depTime.split(':')[0] || '0');
            const arrH = parseInt(arrTime.split(':')[0] || '0');
            const durMatch = (sel as any).duration?.match(/(\d+)h/);
            const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
            const hasReliableDate = (sel as any).arrDate && (sel as any).depDate && (sel as any).arrDate !== (sel as any).depDate;
            const arrivesNextDay = hasReliableDate || (arrH < depH && durHrs > 2) || (durHrs >= 24);
            if (arrivesNextDay) {
              transitDays = durHrs >= 36 ? Math.ceil(durHrs / 24) : 1;
            }
          }

          if (transitDays > 0) {
            result.push(travelDay);
            dayNum++;

            // Transit days for very long flights
            for (let td = 1; td < transitDays; td++) {
              const transitDay: DayPlan = {
                day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
                type: 'travel', city: '', dayCost: 0, costLabel: 'In Transit',
              };
              transitDay.stops.push({
                id: `dp${sc++}`, name: `In transit -- ${leg.type === 'flight' ? 'flight' : 'train'} ${leg.duration || ''}`,
                type: 'airport', time: null, transport: null,
                note: `${fromCityName} > ${toCity.name}`,
              });
              result.push(transitDay);
              dayNum++;
            }

            // Arrival day (overnight)
            const arrivalDay: DayPlan = {
              day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
              type: 'arrival', city: cityName, dayCost: 0, costLabel: 'Arrival',
            };

            // Arrival terminal
            const arrTermName = `${toCity.name} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
            arrivalDay.stops.push({
              id: `dp${sc++}`, name: arrTermName, type: termType, time: arrTime,
              transport: { icon: 'drive', duration: '', distance: '' },
            });

            // Hotel check-in
            const hotelArrMin = arrTime ? parseTime(arrTime) + 30 : null;
            if (dest.nights > 0) {
              const stdCheckIn = 15 * 60;
              const lateCheckIn = 21 * 60;
              const checkInNote = hotelArrMin !== null
                ? (hotelArrMin < stdCheckIn ? 'Arriving before standard check-in (3 PM) -- request early check-in or leave luggage'
                  : hotelArrMin >= lateCheckIn ? 'Late arrival -- confirm late check-in with hotel'
                  : null)
                : null;
              arrivalDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArrMin ? formatTime24(hotelArrMin) : null, transport: null, destIndex: destIdx,
                note: checkInNote || undefined,
              });

              // Evening activities on arrival
              const dinnerTime = 19 * 60;
              const earliestActivity = 7 * 60;
              if (hotelArrMin !== null && hotelArrMin >= earliestActivity && hotelArrMin < dinnerTime - 60) {
                arrivalDay.type = 'arrival';
                const freeStart = hotelArrMin + 30;
                const aiActs = cityActivities[cityName] || [];
                let evCursor = freeStart + 30;
                for (const act of aiActs) {
                  if (evCursor + (act.durationMin || 60) > dinnerTime) break;
                  arrivalDay.stops.push({
                    id: `dp${sc++}`, name: act.name, type: 'attraction',
                    time: formatTime24(evCursor),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    category: act.category || 'landmark', durationMin: act.durationMin || 60,
                    note: act.note, openingHours: act.openingHours, ticketPrice: act.ticketPrice,
                  });
                  evCursor += (act.durationMin || 60) + 30;
                }
              }
            }

            // Dinner + sleep
            if (!arrivalDay.stops.some(s => s.mealType === 'dinner')) {
              arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00', transport: null, mealType: 'dinner' });
            }
            arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
            result.push(arrivalDay);
            dayNum++;
          } else {
            // Same-day arrival
            const arrTermName = `${toCity.name} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
            travelDay.stops.push({
              id: `dp${sc++}`, name: arrTermName, type: termType, time: arrTime,
              transport: { icon: 'drive', duration: '', distance: '' },
            });

            const hotelArrMin = arrTime ? parseTime(arrTime) + 30 : null;
            if (dest.nights > 0) {
              const stdCheckIn = 15 * 60;
              const lateCheckIn = 21 * 60;
              const checkInNote = hotelArrMin !== null
                ? (hotelArrMin < stdCheckIn ? 'Arriving before standard check-in (3 PM) -- request early check-in or leave luggage'
                  : hotelArrMin >= lateCheckIn ? 'Late arrival -- confirm late check-in with hotel'
                  : null)
                : null;
              travelDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArrMin ? formatTime24(hotelArrMin) : null, transport: null, destIndex: destIdx,
                note: checkInNote || undefined,
              });

              // Evening activities if arriving early
              const dinnerTime = 19 * 60;
              const earliestActivity = 7 * 60;
              if (hotelArrMin !== null && hotelArrMin >= earliestActivity && hotelArrMin < dinnerTime - 60) {
                travelDay.type = 'arrival';
                const freeStart = hotelArrMin + 30;
                const aiActs = cityActivities[cityName] || [];
                let evCursor = freeStart + 30;
                for (const act of aiActs) {
                  if (evCursor + (act.durationMin || 60) > dinnerTime) break;
                  travelDay.stops.push({
                    id: `dp${sc++}`, name: act.name, type: 'attraction',
                    time: formatTime24(evCursor),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    category: act.category || 'landmark', durationMin: act.durationMin || 60,
                    note: act.note, openingHours: act.openingHours, ticketPrice: act.ticketPrice,
                  });
                  evCursor += (act.durationMin || 60) + 30;
                }
              }
            } else {
              travelDay.stops.push({
                id: `dp${sc++}`, name: `${toCity.name} Center`, type: 'destination',
                time: hotelArrMin ? formatTime24(hotelArrMin) : null, transport: null,
              });
            }

            // Dinner + sleep for same-day arrival
            travelDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00', transport: null, mealType: 'dinner' });
            travelDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
            result.push(travelDay);
            dayNum++;
          }
        } else {
          // DRIVE: direct
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
          }
          travelDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00', transport: null, mealType: 'dinner' });
          travelDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
          result.push(travelDay);
          dayNum++;
        }
      } else {
        result.push(travelDay);
        dayNum++;
      }

      // Only push travelDay if not already pushed (overnight flights push it early)
      // (handled above)

      // ── EXPLORE DAYS ──
      const usedArrivalActivities = new Set<string>();
      const prevDay = result[result.length - 1];
      if (prevDay) {
        for (const s of prevDay.stops) {
          if (s.type === 'attraction' && !s.mealType) usedArrivalActivities.add(s.name.toLowerCase());
        }
      }

      const exploreDays = Math.max(0, (dest.nights || 0) - 1);
      const aiActs = (cityActivities[cityName] || []).filter((a: any) => !usedArrivalActivities.has(a.name.toLowerCase()));
      const cityRemoved = new Set((removedActs[cityName] || []).map(n => n.toLowerCase()));
      const themes = dayThemes[cityName] || [];
      const perDay = exploreDays > 0 ? Math.max(1, Math.ceil(aiActs.length / exploreDays)) : 0;

      for (let n = 0; n < exploreDays; n++) {
        const roomsNeeded = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
        const hotelCostForNight = dest.selectedHotel ? dest.selectedHotel.pricePerNight * roomsNeeded : 0;
        const expDay: DayPlan = {
          day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
          type: 'explore', city: cityName, dayCost: hotelCostForNight, costLabel: 'Hotel',
          exploreDayIndex: n,
        };
        const hotelName = dest.selectedHotel?.name || `Stay in ${toCity.name}`;

        // Distribute activities
        const dayActivities = aiActs.slice(n * perDay, (n + 1) * perDay)
          .filter((a: any) => !cityRemoved.has(a.name.toLowerCase()));

        // Smart scheduling
        const dayStartMin = 9 * 60;
        const lunchStart = 12 * 60 + 30;
        const afternoonStart = 13 * 60 + 15;
        const dinnerStart = 19 * 60;
        const travelGap = 30;

        // Breakfast
        expDay.stops.push({ id: `dp${sc++}`, name: 'Breakfast', type: 'hotel', time: '08:00', transport: null, mealType: 'breakfast' });
        // Leave hotel
        expDay.stops.push({ id: `dp${sc++}`, name: hotelName, type: 'hotel', time: '09:00', transport: { icon: 'walk', duration: '', distance: '' } });

        // Morning activities
        let cursor = dayStartMin;
        let lunchAdded = false;
        for (const act of dayActivities) {
          const dur = act.durationMin || 60;
          if (!lunchAdded && cursor + dur > lunchStart) {
            expDay.stops.push({ id: `dp${sc++}`, name: 'Lunch', type: 'attraction', time: formatTime24(lunchStart), transport: null, mealType: 'lunch' });
            lunchAdded = true;
            cursor = Math.max(cursor, afternoonStart);
          }
          if (cursor + dur > dinnerStart - 30) continue;
          expDay.stops.push({
            id: `dp${sc++}`, name: act.name, type: 'attraction', time: formatTime24(cursor),
            transport: { icon: 'walk', duration: '', distance: '' },
            category: act.category || 'landmark', durationMin: dur,
            note: act.note, openingHours: act.openingHours, ticketPrice: act.ticketPrice,
          });
          cursor += dur + travelGap;
        }

        if (!lunchAdded) {
          expDay.stops.push({ id: `dp${sc++}`, name: 'Lunch', type: 'attraction', time: formatTime24(lunchStart), transport: null, mealType: 'lunch' });
        }

        // Dinner
        expDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00', transport: null, mealType: 'dinner' });
        expDay.stops.push({ id: `dp${sc++}`, name: 'Return to hotel', type: 'hotel', time: '20:00', transport: null, destIndex: destIdx });
        expDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
        result.push(expDay);
        dayNum++;
      }
    }

    // ── RETURN/DEPARTURE DAY ──
    if (trip.tripType === 'roundTrip' && trip.destinations.length > 0) {
      const lastDest = trip.destinations[trip.destinations.length - 1];
      const returnLeg = trip.transportLegs[trip.transportLegs.length - 1];
      const lastCityName = lastDest.city?.parentCity || lastDest.city?.name || '';
      const homeName = trip.from?.parentCity || trip.from?.name || 'Home';

      const returnFlightPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
      const returnTrainPax = trip.adults + (trip.children || 0);
      let returnDayCost = 0;
      let returnCostLabel = '';
      if (returnLeg) {
        if (returnLeg.selectedFlight) {
          returnDayCost = returnLeg.selectedFlight.pricePerAdult * returnFlightPax;
          returnCostLabel = 'Flight';
        } else if (returnLeg.selectedTrain) {
          returnDayCost = returnLeg.selectedTrain.price * returnTrainPax;
          returnCostLabel = 'Train';
        }
      }

      const depDay: DayPlan = {
        day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
        type: 'departure', city: homeName, departureCity: lastCityName, dayCost: returnDayCost, costLabel: returnCostLabel,
      };

      depDay.stops.push({ id: `dp${sc++}`, name: 'Breakfast', type: 'hotel', time: '08:00', transport: null, mealType: 'breakfast' });

      if (returnLeg) {
        const sel = returnLeg.selectedFlight || returnLeg.selectedTrain;
        const startName = lastDest.selectedHotel?.name || `Stay in ${lastCityName}`;
        depDay.stops.push({
          id: `dp${sc++}`, name: startName, type: 'hotel', time: null,
          transport: { icon: 'drive', duration: '', distance: '' },
        });
        const termType = returnLeg.type === 'flight' ? 'airport' as const : 'station' as const;
        const depTermName = `${lastCityName} ${returnLeg.type === 'flight' ? 'Airport' : 'Station'}`;
        depDay.stops.push({
          id: `dp${sc++}`, name: depTermName, type: termType, time: null,
          transport: { icon: returnLeg.type || 'drive', duration: returnLeg.duration || sel?.duration || '', distance: returnLeg.distance || '' },
          legIndex: trip.transportLegs.length - 1,
        });

        // Detect overnight return
        const depTime = returnLeg.departureTime || sel?.departure;
        const arrTime = returnLeg.arrivalTime || sel?.arrival;
        let returnTransitDays = 0;
        if (sel && depTime && arrTime) {
          const retDepH = parseInt(depTime.split(':')[0] || '0');
          const retArrH = parseInt(arrTime.split(':')[0] || '0');
          const retDurMatch = (sel as any).duration?.match(/(\d+)h/);
          const retDurHrs = retDurMatch ? parseInt(retDurMatch[1]) : 0;
          const retHasReliableDate = (sel as any).arrDate && (sel as any).depDate && (sel as any).arrDate !== (sel as any).depDate;
          const retArrivesNextDay = retHasReliableDate || (retArrH < retDepH && retDurHrs > 2) || retDurHrs >= 20;
          if (retArrivesNextDay) {
            returnTransitDays = retDurHrs >= 36 ? Math.ceil(retDurHrs / 24) : 1;
          }
        }

        if (returnTransitDays > 0) {
          result.push(depDay);
          dayNum++;
          // Arrival home day
          const returnArrDay: DayPlan = {
            day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
            type: 'departure', city: homeName, dayCost: 0, costLabel: 'Arrival',
          };
          const arrTermName = `${homeName} ${returnLeg.type === 'flight' ? 'Airport' : 'Station'}`;
          returnArrDay.stops.push({
            id: `dp${sc++}`, name: arrTermName, type: returnLeg.type === 'flight' ? 'airport' : 'station',
            time: arrTime, transport: { icon: 'drive', duration: '', distance: '' },
          });
          returnArrDay.stops.push({ id: `dp${sc++}`, name: homeName, type: 'home', time: null, transport: null });
          result.push(returnArrDay);
        } else {
          // Same-day return
          const arrTermName = `${homeName} ${returnLeg.type === 'flight' ? 'Airport' : 'Station'}`;
          depDay.stops.push({
            id: `dp${sc++}`, name: arrTermName, type: returnLeg.type === 'flight' ? 'airport' : 'station',
            time: arrTime, transport: { icon: 'drive', duration: '', distance: '' },
          });
          depDay.stops.push({ id: `dp${sc++}`, name: homeName, type: 'home', time: null, transport: null });
          result.push(depDay);
        }
      } else {
        result.push(depDay);
      }
    }

    return result;
  }, [trip]);

  // Helper: get from/to cities for a transport leg
  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? trip.from : trip.destinations[Math.min(legIdx - 1, trip.destinations.length - 1)]?.city;
    const toCity = legIdx < trip.destinations.length ? trip.destinations[legIdx]?.city : trip.from;
    return { fromCity, toCity };
  };

  /* ────────── ITINERARY VIEW ────────── */

  const renderItineraryView = () => {
    if (days.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm font-body">No itinerary data available for this trip.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Day navigation chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
          {days.map((day) => {
            const style = DAY_TYPE_STYLES[day.type] || DAY_TYPE_STYLES.explore;
            const cityLabel = day.city ? (day.city.length > 9 ? day.city.slice(0, 7) + '\u2026' : day.city) : '';
            return (
              <a key={day.day} href={`#day-${day.day}`}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-body font-semibold border ${style.bg} ${style.text} ${style.border} hover:opacity-80 transition-opacity whitespace-nowrap`}>
                {day.day}{cityLabel ? ` \u00B7 ${cityLabel}` : ''}
              </a>
            );
          })}
        </div>

        {/* Day cards */}
        {days.map((day, dayIdx) => {
          const dayStyle = DAY_TYPE_STYLES[day.type] || DAY_TYPE_STYLES.explore;

          // City chapter header: show when entering a new city
          const prevDay = dayIdx > 0 ? days[dayIdx - 1] : null;
          const isNewCity = !!(day.city && day.city !== '' && day.city !== prevDay?.city && day.type !== 'departure');
          const cityDest = isNewCity ? trip.destinations.find((d: any) => d.city.name === day.city || (d.city.parentCity || d.city.name) === day.city) : null;
          const cityDisplayName = cityDest ? (cityDest.city.parentCity || cityDest.city.name) : day.city;
          const cityCountry = cityDest?.city.country;
          const cityNights = cityDest?.nights || 0;
          const cityHotel = cityDest?.selectedHotel;

          // Overnight connector
          const prevLastHotelStop = prevDay?.stops.filter(s => s.type === 'hotel' && !s.mealType).slice(-1)[0];
          const currFirstHotelStop = day.stops.find(s => s.type === 'hotel' && !s.mealType);
          const overnightHotelName = prevLastHotelStop && currFirstHotelStop &&
            prevLastHotelStop.name === currFirstHotelStop.name ? prevLastHotelStop.name : null;

          return (
            <div key={day.day} id={`day-${day.day}`} className="scroll-mt-[60px]">
              {/* Overnight connector */}
              {overnightHotelName && (
                <div className="flex items-center gap-2 py-1.5 px-4 mb-1">
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

              {/* City chapter header */}
              {isNewCity && (
                <div className="mb-3">
                  <div className="bg-bg-surface border border-border-subtle rounded-xl shadow-sm overflow-hidden flex">
                    <div className="flex-1 px-4 py-3 min-w-0">
                      {cityCountry && <p className="text-[10px] text-accent-gold font-body font-bold uppercase tracking-widest mb-0.5">{cityCountry}</p>}
                      <h2 className="font-display text-[20px] font-bold text-text-primary tracking-tight leading-tight">{cityDisplayName}</h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-text-secondary font-body">
                        <span className="flex items-center gap-1">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          {formatDateNice(day.date)}
                        </span>
                        {cityNights > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100/70 text-teal-700 font-body">{cityNights}N</span>
                        )}
                      </div>
                      {cityHotel && (
                        <div className="mt-1">
                          <p className="flex items-center gap-1 text-[11px] text-text-muted font-body truncate">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 flex-shrink-0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            {cityHotel.name}
                          </p>
                          {((cityHotel.rating || 0) > 0 || (cityHotel.pricePerNight || 0) > 0) && (
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted font-body">
                              {(cityHotel.rating || 0) > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                  <span className="font-mono font-medium">{cityHotel.rating}</span>
                                </span>
                              )}
                              {(cityHotel.pricePerNight || 0) > 0 && (
                                <span className="font-mono">{formatPrice(cityHotel.pricePerNight, 'INR')}/night</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Gradient visual panel (desktop only) */}
                    <div className="hidden md:flex items-center justify-center w-[120px] bg-gradient-to-br from-teal-100 via-cyan-100 to-blue-100 flex-shrink-0 overflow-hidden">
                      <span className="text-[48px] font-display font-black text-white/30 tracking-tighter select-none">{cityDisplayName.slice(0, 3).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Day card */}
              <div className="bg-bg-surface border border-border-subtle rounded-xl shadow-sm overflow-visible mb-4">
                {/* Day header */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <h2 className="font-display font-bold text-[16px] text-text-primary whitespace-nowrap">Day {day.day} &mdash; {formatDateNice(day.date)}</h2>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-body ${dayStyle.bg} ${dayStyle.text} ${dayStyle.border} border`}>
                        {dayStyle.label}
                      </span>
                      {day.type === 'explore' && (() => {
                        const themes = trip.deepPlanData?.dayThemes?.[day.city];
                        const theme = themes && typeof day.exploreDayIndex === 'number' ? themes[day.exploreDayIndex] : null;
                        return theme ? (
                          <span className="hidden md:inline text-[10px] text-text-muted font-body italic">{theme}</span>
                        ) : null;
                      })()}
                    </div>
                    {day.dayCost > 0 && (
                      <span className="text-[13px] font-mono font-bold text-accent-cyan whitespace-nowrap">{formatPrice(day.dayCost, 'INR')}</span>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="border-t border-border-subtle/50 px-4 pb-4 mt-1">
                  <div className={`ml-4 border-l-2 ${dayStyle.line} pl-0 mt-2`}>
                    {day.stops.map((stop, si) => {
                      const hasTransport = stop.transport !== null;
                      const isMeal = !!stop.mealType;
                      const stopColor = TYPE_COLORS[stop.type] || '#E8654A';
                      const isAttractionCard = stop.type === 'attraction' && !isMeal && !stop.name.startsWith('Free time') && !stop.name.startsWith('Morning in');
                      const cardStyle = isAttractionCard ? (CATEGORY_CARD_STYLES[stop.category || ''] || DEFAULT_CARD_STYLE) : null;

                      // Meal slot rendering
                      if (isMeal) {
                        const mealHint = stop.mealType === 'breakfast' ? 'Start your day fresh'
                          : stop.mealType === 'lunch' ? 'Near your next stop'
                          : stop.mealType === 'dinner' ? 'Local cuisine experience' : '';
                        return (
                          <div key={stop.id} className="relative">
                            <div className="flex items-center gap-3 py-1 pl-4">
                              <div className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-bg-surface border-2 border-orange-200" />
                              <div className="inline-flex flex-col">
                                <div className="inline-flex items-center gap-1.5 bg-orange-50/60 border border-orange-100/60 rounded-full px-3 py-0.5">
                                  {stop.time && (
                                    <span className="text-orange-400 text-[10px] font-mono">
                                      {formatTime12(parseTime(stop.time))}
                                    </span>
                                  )}
                                  <span className="text-orange-600 text-[11px] font-body font-medium flex items-center gap-1">
                                    <span className="text-xs">{stop.mealType === 'breakfast' ? '\u2615' : stop.mealType === 'dinner' ? '\uD83C\uDF19' : '\uD83C\uDF7D\uFE0F'}</span> {stop.name}
                                  </span>
                                  {(() => {
                                    const mc = (trip.deepPlanData?.mealCosts || {})[day.city] || (trip.deepPlanData?.mealCosts || {})[day.departureCity || ''];
                                    if (!mc || !stop.mealType) return null;
                                    const cost = mc[stop.mealType as 'breakfast' | 'lunch' | 'dinner'];
                                    if (!cost) return null;
                                    const rate = convRates[mc.currency?.toUpperCase()] || convRates[mc.currency] || 1;
                                    return <span className="text-orange-400 text-[10px] font-mono ml-1">~{formatPrice(Math.round(cost * rate), 'INR')}/person</span>;
                                  })()}
                                </div>
                                {mealHint && <span className="text-[9px] text-orange-400/70 font-body ml-3 mt-0.5">{mealHint}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={stop.id} className="relative">
                          {/* Stop */}
                          <div className="flex items-start gap-3 pl-4 py-1.5">
                            {/* Timeline circle */}
                            <div className="absolute -left-[7px] mt-1">
                              {stop.category && CATEGORY_ICONS[stop.category] ? (
                                <div className="w-4 h-4 rounded-full flex items-center justify-center relative z-10 border-2 border-white"
                                  style={{ backgroundColor: stopColor }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d={CATEGORY_ICONS[stop.category]} />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center relative z-10 border-2 border-white"
                                  style={{ backgroundColor: stopColor }} />
                              )}
                            </div>

                            <div className={`flex-1${cardStyle ? ` ${cardStyle.bg} ${cardStyle.border} border rounded-xl p-2.5` : ''}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {stop.time && (
                                    <span className="text-accent-cyan text-[13px] font-mono font-bold flex-shrink-0">
                                      {formatTime12(parseTime(stop.time))}
                                      {stop.isNextDay && <span className="text-accent-cyan/60 text-[9px] ml-0.5">+1</span>}
                                    </span>
                                  )}
                                  <h3 className="font-display font-bold text-[15px] text-text-primary leading-tight line-clamp-2 min-w-0">
                                    {stop.name === 'Rest / Sleep' ? (
                                      <span className="flex items-center gap-1.5">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400 flex-shrink-0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                                        Overnight
                                      </span>
                                    ) : stop.name}
                                  </h3>
                                </div>

                                {/* Note with urgency styling */}
                                {stop.note && (() => {
                                  const isUrgent = /Leave |Board |Check-in /i.test(stop.note);
                                  return isUrgent ? (
                                    <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200/60 border-l-[3px] border-l-red-500 rounded-lg mt-1">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                      <span className="text-[12px] text-red-700 font-body font-medium">{stop.note}</span>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-amber-700 font-body mt-0.5 flex items-start gap-1">
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      {stop.note}
                                    </p>
                                  );
                                })()}

                                {/* Opening hours + ticket price for activities */}
                                {(stop.openingHours || stop.ticketPrice) && (
                                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                    {stop.openingHours && (
                                      <span className="text-[10px] text-text-muted font-body flex items-center gap-1">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                        {stop.openingHours}
                                      </span>
                                    )}
                                    {stop.ticketPrice && (
                                      <span className={`text-[10px] font-body font-semibold flex items-center gap-1 ${stop.ticketPrice.toLowerCase().includes('free') ? 'text-emerald-600' : 'text-violet-600'}`}>
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                        {stop.ticketPrice}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Hotel card with rating/price */}
                                {stop.type === 'hotel' && !hasTransport && stop.destIndex !== undefined && stop.destIndex < trip.destinations.length && (() => {
                                  const dest = trip.destinations[stop.destIndex!];
                                  const hotel = dest?.selectedHotel;
                                  if (!hotel) return null;
                                  const roomsNeeded = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
                                  return (
                                    <div className="mt-2 bg-rose-50/40 border border-rose-200/50 border-l-[3px] border-l-rose-400 rounded-xl p-3 space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                        {hotel.rating > 0 && <span className="px-1 py-0.5 rounded text-white font-mono font-bold text-[8px]" style={{ backgroundColor: hotel.ratingColor || '#9ca3af' }}>{hotel.rating}</span>}
                                        <span className="text-[11px] font-body text-text-secondary">{formatPrice(hotel.pricePerNight, 'INR')}/night &times; {dest.nights}N{roomsNeeded > 1 ? ` &times; ${roomsNeeded} rooms` : ''}</span>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Category + duration pills for activities */}
                                {stop.type === 'attraction' && !isMeal && (stop.category || stop.durationMin) && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    {stop.category && (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-body ${cardStyle?.pill || 'bg-slate-100 text-slate-600'}`}>
                                        {CATEGORY_LABELS[stop.category] || 'Sightseeing'}
                                      </span>
                                    )}
                                    {stop.durationMin && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-gray-100 text-gray-500">
                                        {formatDuration(stop.durationMin)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Rich transport card (flight/train) with vertical stepper */}
                          {hasTransport && stop.transport && (() => {
                            const legIdx = stop.legIndex;
                            const leg = legIdx !== undefined ? trip.transportLegs[legIdx] : null;
                            const flight = leg?.selectedFlight;
                            const train = leg?.selectedTrain;

                            // Rich flight card
                            if (flight && legIdx !== undefined) {
                              const { fromCity: legFromCity, toCity: legToCity } = getLegCities(legIdx);
                              const flightToName = legToCity?.parentCity || legToCity?.name || '';
                              const depHour = parseInt((flight.departure || '').split(':')[0] || '0');
                              const arrHour = parseInt((flight.arrival || '').split(':')[0] || '0');
                              const durH = parseInt(((flight.duration || '').match(/(\d+)h/) || ['', '0'])[1]);
                              const hasReliableDates = (flight as any).arrDate && (flight as any).depDate && (flight as any).arrDate !== (flight as any).depDate;
                              const isNextDayArr = hasReliableDates || (arrHour < depHour && durH > 2) || durH >= 24;
                              return (
                                <div className="pl-4 py-1">
                                  <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                    <div className="bg-blue-50/50 border border-blue-200/60 border-l-[3px] border-l-blue-500 rounded-xl p-3">
                                      {/* Header */}
                                      <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[13px] font-display font-bold text-text-primary flex items-center gap-1.5">
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
                                          Flight to {flightToName}
                                        </span>
                                      </div>
                                      {/* Vertical route stepper */}
                                      <div className="relative ml-1 mb-2.5">
                                        <div className="absolute left-[5px] top-[10px] bottom-[10px] w-[2px] bg-blue-300" />
                                        {/* Departure */}
                                        <div className="flex items-start gap-3 relative pb-3">
                                          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white flex-shrink-0 mt-0.5 relative z-10" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                              <span className="text-[10px] text-blue-500 font-body font-bold uppercase tracking-wider">DEP</span>
                                              <span className="text-[13px] font-mono font-bold text-text-primary">{flight.departure || '--:--'}</span>
                                              <span className="text-[9px] text-text-muted font-body">{formatDateNice(day.date).split(',').slice(1).join(',').trim()}</span>
                                            </div>
                                            <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{stop.name || 'Departure Airport'}</p>
                                          </div>
                                        </div>
                                        {/* Journey info */}
                                        <div className="flex items-center gap-2 pl-6 pb-3">
                                          <span className="text-[10px] text-text-muted font-mono">{flight.duration || ''}</span>
                                          <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                          <span className="text-[10px] text-text-secondary font-body">{flight.airline} {flight.flightNumber}</span>
                                          {flight.stops && flight.stops !== 'Direct' && flight.stops !== '0 stops' && flight.stops !== 'Nonstop' && (
                                            <>
                                              <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                              <span className="text-[10px] text-amber-600 font-body font-medium">{flight.stops}</span>
                                            </>
                                          )}
                                          {(flight.stops === 'Nonstop' || flight.stops === 'Direct') && (
                                            <>
                                              <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                              <span className="text-[10px] text-emerald-600 font-body font-medium">Direct</span>
                                            </>
                                          )}
                                        </div>
                                        {/* Arrival */}
                                        <div className="flex items-start gap-3 relative">
                                          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white flex-shrink-0 mt-0.5 relative z-10" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                              <span className="text-[10px] text-blue-500 font-body font-bold uppercase tracking-wider">ARR</span>
                                              <span className="text-[13px] font-mono font-bold text-text-primary">{flight.arrival || '--:--'}</span>
                                              {isNextDayArr && <span className="text-[9px] text-accent-cyan font-mono font-bold">+1</span>}
                                              <span className="text-[9px] text-text-muted font-body">{isNextDayArr ? formatDateNice(addDaysToDate(day.date.split('-').reverse().join('-'), 1)).split(',').slice(1).join(',').trim() : formatDateNice(day.date).split(',').slice(1).join(',').trim()}</span>
                                            </div>
                                            <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{day.stops[si + 1]?.name || flightToName + ' Airport'}</p>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Price footer */}
                                      <div className="flex items-center justify-between text-[10px] pt-2 border-t border-blue-200/60">
                                        <span className="text-text-secondary font-body">{formatPrice(flight.pricePerAdult, 'INR')}/pax &times; {trip.adults}</span>
                                        <span className="text-accent-cyan font-mono font-bold text-[12px]">Total: {formatPrice(flight.pricePerAdult * trip.adults, 'INR')}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // Rich train/bus/drive card
                            if (train && legIdx !== undefined) {
                              const isBus = leg?.type === 'bus';
                              const isDrive = leg?.type === 'drive';
                              const transportStyle = isBus ? 'bg-orange-50/50 border border-orange-200/60 border-l-orange-500'
                                : isDrive ? 'bg-slate-50/50 border border-slate-200/60 border-l-slate-500'
                                : 'bg-amber-50/50 border border-amber-200/60 border-l-amber-500';
                              const iconColor = isBus ? '#f97316' : isDrive ? '#64748b' : '#f59e0b';
                              const dotColor = isBus ? 'bg-orange-500' : isDrive ? 'bg-slate-500' : 'bg-amber-500';
                              const lineColor = isBus ? 'bg-orange-300' : isDrive ? 'bg-slate-300' : 'bg-amber-300';
                              const labelColor = isBus ? 'text-orange-500' : isDrive ? 'text-slate-500' : 'text-amber-500';
                              const borderColor = isBus ? 'border-orange-200/60' : isDrive ? 'border-slate-200/60' : 'border-amber-200/60';
                              const iconPath = isBus ? TRANSPORT_ICONS.bus : isDrive ? TRANSPORT_ICONS.drive : TRANSPORT_ICONS.train;
                              const hasTimes = train.departure && train.arrival;
                              const { toCity: legToCity2 } = getLegCities(legIdx);
                              const trainToName = legToCity2?.parentCity || legToCity2?.name || '';
                              const transportLabel = isBus ? 'Bus' : isDrive ? 'Drive' : 'Train';
                              return (
                                <div className="pl-4 py-1">
                                  <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                    <div className={`${transportStyle} border-l-[3px] rounded-xl p-3`}>
                                      {/* Header */}
                                      <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[13px] font-display font-bold text-text-primary flex items-center gap-1.5">
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath}/></svg>
                                          {transportLabel} to {trainToName}
                                        </span>
                                      </div>
                                      {/* Vertical route stepper */}
                                      {hasTimes ? (
                                        <div className="relative ml-1 mb-2.5">
                                          <div className={`absolute left-[5px] top-[10px] bottom-[10px] w-[2px] ${lineColor}`} />
                                          <div className="flex items-start gap-3 relative pb-3">
                                            <div className={`w-3 h-3 rounded-full ${dotColor} border-2 border-white flex-shrink-0 mt-0.5 relative z-10`} />
                                            <div className="flex-1 min-w-0">
                                              <span className={`text-[10px] ${labelColor} font-body font-bold uppercase tracking-wider`}>DEP</span>
                                              <span className="text-[13px] font-mono font-bold text-text-primary ml-2">{train.departure}</span>
                                              <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{train.fromStation || stop.name || 'Departure Station'}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 pl-6 pb-3">
                                            <span className="text-[10px] text-text-muted font-mono">{train.duration || ''}</span>
                                            <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                            <span className="text-[10px] text-text-secondary font-body">{train.operator || train.trainName} {train.trainNumber}</span>
                                          </div>
                                          <div className="flex items-start gap-3 relative">
                                            <div className={`w-3 h-3 rounded-full ${dotColor} border-2 border-white flex-shrink-0 mt-0.5 relative z-10`} />
                                            <div className="flex-1 min-w-0">
                                              <span className={`text-[10px] ${labelColor} font-body font-bold uppercase tracking-wider`}>ARR</span>
                                              <span className="text-[13px] font-mono font-bold text-text-primary ml-2">{train.arrival}</span>
                                              <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{train.toStation || trainToName + ' Station'}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 mb-2.5 text-[11px] text-text-secondary font-mono">
                                          <span>{train.duration}{leg?.distance && leg.distance !== '~' ? ` \u00B7 ${leg.distance}` : ''}</span>
                                          <span className="text-text-muted">&middot;</span>
                                          <span className="font-body">{train.operator || train.trainName} {train.trainNumber}</span>
                                        </div>
                                      )}
                                      {/* Price footer */}
                                      <div className={`flex items-center justify-between text-[10px] pt-2 border-t ${borderColor}`}>
                                        {train.price > 0 ? (
                                          <>
                                            <span className="text-text-secondary font-body">{formatPrice(train.price, 'INR')}/pax &times; {trip.adults + (trip.children || 0)}</span>
                                            <span className="text-accent-cyan font-mono font-bold text-[12px]">Total: {formatPrice(train.price * (trip.adults + (trip.children || 0)), 'INR')}</span>
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

                            // Default: simple transport line
                            if (stop.transport && (stop.transport.duration || stop.transport.distance)) {
                              return (
                                <div className="pl-4 py-1">
                                  <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                    <div className="flex items-center gap-2 text-text-secondary">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d={TRANSPORT_ICONS[stop.transport.icon] || TRANSPORT_ICONS.walk} />
                                      </svg>
                                      <span className="text-xs font-mono">{stop.transport.duration}{stop.transport.distance ? ` \u00B7 ${stop.transport.distance}` : ''}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ────────── ROUTE VIEW ────────── */

  const renderRouteView = () => (
    <div>
      {stops.map((stop, i) => {
        const hasTransport = i < stops.length - 1;
        const leg = hasTransport && i < trip.transportLegs.length ? trip.transportLegs[i] : null;
        const arrivalDate = calcArrivalDate(i);
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

                {/* Destination: hotel + nights */}
                {stop.type === 'destination' && (() => {
                  const dest = stop.destIndex !== undefined ? trip.destinations[stop.destIndex] : null;
                  const hotel = dest?.selectedHotel;
                  const nights = stop.nights || 0;

                  if (nights === 0) {
                    return <span className="text-text-muted text-xs font-body italic">Pass through</span>;
                  }

                  if (hotel) {
                    const roomsNeeded = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
                    const totalPrice = hotel.pricePerNight * nights * roomsNeeded;
                    const checkIn = new Date(arrivalDate);
                    const checkOut = new Date(arrivalDate);
                    checkOut.setDate(checkOut.getDate() + nights);
                    const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    return (
                      <div className="mt-1.5 bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1">
                        <span className="text-xs font-display font-bold text-text-primary">{hotel.name}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          {hotel.rating > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: hotel.ratingColor, fontSize: '9px' }}>{hotel.rating}</span>
                          )}
                          <span className="text-text-primary font-mono font-bold">{nights}N</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                          <span>Check-in {fmtDate(checkIn)} &rarr; Check-out {fmtDate(checkOut)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-text-secondary font-body">{formatPrice(hotel.pricePerNight, 'INR')}/night &times; {nights}{roomsNeeded > 1 ? ` &times; ${roomsNeeded} rooms` : ''}</span>
                          <span className="text-accent-cyan font-mono font-bold">{formatPrice(totalPrice, 'INR')}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <p className="text-text-muted text-xs font-body mt-0.5">{nights} night{nights > 1 ? 's' : ''}</p>
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
                  {/* Transport type + duration */}
                  <div className="flex items-center gap-2 text-text-secondary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={transportIcons[leg.type] || transportIcons.drive} />
                    </svg>
                    <span className="text-xs font-mono">
                      {leg.selectedFlight ? leg.selectedFlight.duration : leg.selectedTrain ? leg.selectedTrain.duration : leg.duration}
                      {' '}&middot;{' '}
                      {leg.selectedFlight
                        ? (() => {
                            const route = leg.selectedFlight.route || '';
                            const parts = route.split('-');
                            if (parts.length === 2 && /^[A-Z]{3,4}$/.test(parts[0]?.trim()) && /^[A-Z]{3,4}$/.test(parts[1]?.trim())) {
                              return `${parts[0].trim()} - ${parts[1].trim()}`;
                            }
                            return route || leg.distance || '';
                          })()
                        : leg.selectedTrain
                          ? (leg.distance || '')
                          : (leg.distance || '')}
                    </span>
                  </div>

                  {/* Selected flight details */}
                  {leg.selectedFlight && (
                    <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                      <span className="text-xs font-display font-bold text-text-primary">{leg.selectedFlight.airline} {leg.selectedFlight.flightNumber}</span>
                      {(() => {
                        const depH = parseInt(leg.selectedFlight.departure?.split(':')[0] || '0');
                        const arrH = parseInt(leg.selectedFlight.arrival?.split(':')[0] || '0');
                        const durMatch = leg.selectedFlight.duration?.match(/(\d+)h/);
                        const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                        const isNextDay = leg.selectedFlight.isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2);
                        const arrDate = new Date(legDate);
                        if (isNextDay) arrDate.setDate(arrDate.getDate() + 1);
                        const arrDateFmt = arrDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                        return (
                          <div className="flex items-center gap-2 text-[10px] flex-wrap">
                            {leg.selectedFlight.color && (
                              <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedFlight.color, fontSize: '9px' }}>{leg.selectedFlight.airlineCode}</span>
                            )}
                            <span className="text-text-secondary font-mono">{legDateFormatted} {timeStr12(leg.selectedFlight.departure)} &rarr; {arrDateFmt} {timeStr12(leg.selectedFlight.arrival)}</span>
                            <span className="text-text-muted font-mono">{leg.selectedFlight.duration}</span>
                            <span className="text-text-muted font-mono">{leg.selectedFlight.stops === 'Nonstop' ? 'Direct' : leg.selectedFlight.stops?.split(' \u00B7 ')[0]}</span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary font-body">{formatPrice(leg.selectedFlight.pricePerAdult, 'INR')}/pax &times; {trip.adults}</span>
                        <span className="text-accent-cyan font-mono font-bold">{formatPrice(leg.selectedFlight.pricePerAdult * trip.adults, 'INR')}</span>
                      </div>
                    </div>
                  )}

                  {/* Selected train details */}
                  {leg.selectedTrain && (
                    <div className="bg-bg-card border border-border-subtle rounded-lg p-2.5 space-y-1 mt-1">
                      <span className="text-xs font-display font-bold text-text-primary">{leg.selectedTrain.operator} {leg.selectedTrain.trainNumber}</span>
                      {(() => {
                        const depH = parseInt(leg.selectedTrain.departure?.split(':')[0] || '0');
                        const arrH = parseInt(leg.selectedTrain.arrival?.split(':')[0] || '0');
                        const durMatch = leg.selectedTrain.duration?.match(/(\d+)h/);
                        const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                        const isNext = durHrs >= 12 || (arrH < depH && durHrs > 2);
                        const arrDate = new Date(legDate);
                        if (isNext) arrDate.setDate(arrDate.getDate() + 1);
                        const arrDateFmt = arrDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                        return (
                          <div className="flex items-center gap-2 text-[10px] flex-wrap">
                            {leg.selectedTrain.color && (
                              <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedTrain.color, fontSize: '9px' }}>{leg.selectedTrain.operator?.split(' ')[0]?.slice(0,3)}</span>
                            )}
                            <span className="text-text-secondary font-mono">{legDateFormatted} {timeStr12(leg.selectedTrain.departure)} &rarr; {arrDateFmt} {timeStr12(leg.selectedTrain.arrival)}</span>
                            <span className="text-text-muted font-mono">{leg.selectedTrain.duration}</span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary font-body">{formatPrice(leg.selectedTrain.price, 'INR')}/pax &times; {trip.adults + (trip.children || 0)}</span>
                        <span className="text-accent-cyan font-mono font-bold">{formatPrice(leg.selectedTrain.price * (trip.adults + (trip.children || 0)), 'INR')}</span>
                      </div>
                    </div>
                  )}

                  {/* Drive/bus leg without selection */}
                  {!leg.selectedFlight && !leg.selectedTrain && (
                    <p className="text-text-muted text-[10px] font-body">
                      {leg.type === 'drive' ? 'Driving' : leg.type === 'bus' ? 'Bus' : leg.type === 'flight' ? 'Flight' : leg.type === 'train' ? 'Train' : leg.type}
                      {leg.duration ? ` \u00B7 ${leg.duration}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  /* ────────── MAIN RENDER ────────── */

  return (
    <div className="min-h-screen flex justify-center p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[760px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          {/* Nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.push('/')} className="font-display text-lg font-bold hover:opacity-80 transition-opacity">
              <span className="text-accent-cyan">AI</span>Ezzy
            </button>
            <span className="text-[10px] font-body text-text-muted bg-bg-card border border-border-subtle px-2.5 py-1 rounded-full">
              Shared Trip
            </span>
          </div>

          {/* Title */}
          <div className="mb-4">
            <h1 className="font-display text-lg font-bold text-text-primary">{trip.title}</h1>
            <p className="text-text-muted text-xs font-mono mt-1">
              {trip.departureDate} &middot; {trip.adults} adult{trip.adults > 1 ? 's' : ''}
              {trip.children > 0 ? `, ${trip.children} children` : ''}
              &middot; {trip.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
            </p>
          </div>

          {/* View tabs */}
          {hasDeepPlan && (
            <div className="flex gap-1 mb-6 bg-bg-card border border-border-subtle rounded-xl p-1">
              <button
                onClick={() => setView('route')}
                className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                  view === 'route'
                    ? 'bg-accent-cyan text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}>
                Route
              </button>
              <button
                onClick={() => setView('deepplan')}
                className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                  view === 'deepplan'
                    ? 'bg-accent-cyan text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}>
                Itinerary
              </button>
            </div>
          )}

          {/* Main content: timeline + sidebar */}
          <div className="md:grid md:grid-cols-[1fr_260px] md:gap-8">
          {/* Timeline / Itinerary */}
          <div>
            {view === 'deepplan' ? renderItineraryView() : renderRouteView()}
          </div>

          {/* Sidebar: Cost Summary */}
          <div className="md:sticky md:top-8 md:self-start">
          <div className="mt-6 p-4 bg-bg-card border border-border-subtle rounded-xl">
            <h3 className="font-display font-bold text-xs text-accent-gold uppercase tracking-widest mb-3">Trip Estimate</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-body">
                <span className="text-text-secondary">{trip.destinations.length} cities &middot; {trip.totalNights} nights</span>
                <span className="text-text-muted">{trip.adults} pax</span>
              </div>
              {trip.flightCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Flights</span><span className="text-text-primary font-mono">{formatPrice(trip.flightCost, 'INR')}</span></div>}
              {trip.trainCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Trains</span><span className="text-text-primary font-mono">{formatPrice(trip.trainCost, 'INR')}</span></div>}
              {trip.hotelCost > 0 && <div className="flex justify-between text-xs font-body"><span className="text-text-secondary">Hotels</span><span className="text-text-primary font-mono">{formatPrice(trip.hotelCost, 'INR')}</span></div>}
              {trip.totalCost > 0 ? (
                <div className="flex justify-between text-sm font-body pt-2 border-t border-border-subtle">
                  <span className="text-text-primary font-semibold">Estimated Total</span>
                  <span className="text-accent-cyan font-mono font-bold">{formatPrice(trip.totalCost, 'INR')}</span>
                </div>
              ) : (
                <p className="text-text-muted text-xs font-body italic">No cost data available</p>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-4 space-y-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/signup')}
              className="w-full bg-accent-cyan text-white font-display font-bold py-4 rounded-xl text-sm transition-all hover:bg-accent-cyan/90 hover:shadow-lg">
              Plan Your Own Trip
            </motion.button>
            <p className="text-center text-[10px] font-body text-text-muted">
              Create your own multi-city trip with <span className="text-accent-cyan font-semibold">AIEzzy</span>
            </p>
          </div>
          </div>{/* end sidebar */}
          </div>{/* end grid */}
        </div>
      </motion.div>
    </div>
  );
}
