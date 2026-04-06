'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { timeStr12, addDaysToDate, formatTime12, parseTime } from '@/lib/timeUtils';
import { formatPrice } from '@/lib/currency';

const transportIcons: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2M7 14h.01M17 14h.01M6 3h12l1 5H5z',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-16 0h16M8 22h8m-8-4h.01M16 18h.01M6 6h12v6H6z',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01M5 6h14v5H5zM8 22h8',
};

const DAY_TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  travel: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Travel Day' },
  explore: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Explore Day' },
  departure: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'Departure Day' },
  arrival: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'Arrival & Explore' },
};

const CATEGORY_COLORS: Record<string, string> = {
  museum: '#8b5cf6', park: '#10b981', landmark: '#f59e0b', food: '#ef4444',
  market: '#f97316', temple: '#ec4899', beach: '#06b6d4', nightlife: '#6366f1',
  shopping: '#d946ef', nature: '#22c55e', adventure: '#0ea5e9', culture: '#a855f7',
};

const MEAL_EMOJIS: Record<string, string> = { breakfast: '\u2615', lunch: '\uD83C\uDF7D\uFE0F', dinner: '\uD83C\uDF19' };

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

interface SharedItineraryDay {
  day: number;
  date: string;
  type: 'travel' | 'explore' | 'departure' | 'arrival';
  city: string;
  departureCity?: string;
  stops: Array<{
    name: string;
    time: string | null;
    type: 'activity' | 'meal' | 'transport' | 'hotel' | 'sleep';
    category?: string;
    durationMin?: number;
    note?: string;
    ticketPrice?: string;
    transportType?: string;
    transportDuration?: string;
    transportDetail?: string;
  }>;
  hotel?: string;
}

export default function SharedTripClient({ trip, initialView = 'route' }: { trip: SharedTrip; initialView?: 'route' | 'deepplan' }) {
  const router = useRouter();
  const hasDeepPlan = !!(trip.deepPlanData?.cityActivities && Object.keys(trip.deepPlanData.cityActivities).length > 0);
  const [view, setView] = useState<'route' | 'deepplan'>(hasDeepPlan && initialView === 'deepplan' ? 'deepplan' : 'route');

  // Build the stops list (same logic as route page)
  const stops = useMemo(() => {
    const result: Array<{
      type: 'home' | 'destination';
      name: string;
      explore: string;
      number: number;
      nights: number;
      destIndex?: number;
    }> = [];

    // First stop: home
    const homeName = trip.fromAddress?.split(',')[0] || trip.from?.name || 'Home';
    result.push({ type: 'home', name: homeName, explore: homeName, number: 1, nights: 0 });

    // Destinations
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

    // Return home for round trips
    if (trip.tripType === 'roundTrip') {
      result.push({ type: 'home', name: homeName, explore: homeName, number: result.length + 1, nights: 0 });
    }

    return result;
  }, [trip]);

  // Calculate arrival date for a stop
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

  // ── Build itinerary days from deepPlanData ──
  const itineraryDays: SharedItineraryDay[] = useMemo(() => {
    if (!trip.deepPlanData?.cityActivities) return [];
    const cityActivities = trip.deepPlanData.cityActivities as Record<string, any[]>;
    const dayThemes = (trip.deepPlanData.dayThemes || {}) as Record<string, string[]>;
    const mealCosts = (trip.deepPlanData.mealCosts || {}) as Record<string, any>;
    const result: SharedItineraryDay[] = [];
    let dayNum = 0;

    for (let destIdx = 0; destIdx < trip.destinations.length; destIdx++) {
      const dest = trip.destinations[destIdx];
      const leg = trip.transportLegs[destIdx];
      const toCity = dest.city;
      const cityName = toCity?.parentCity || toCity?.name || `City ${destIdx + 1}`;
      const prevDest = destIdx > 0 ? trip.destinations[destIdx - 1] : null;
      const fromCityName = destIdx === 0
        ? (trip.from?.parentCity || trip.from?.name || 'Home')
        : (prevDest?.city?.parentCity || prevDest?.city?.name || '');

      // ── Travel day ──
      const travelDay: SharedItineraryDay = {
        day: dayNum + 1,
        date: addDaysToDate(trip.departureDate, dayNum),
        type: 'travel',
        city: cityName,
        departureCity: fromCityName,
        stops: [],
      };

      // Add transport info
      if (leg) {
        const sel = leg.selectedFlight || leg.selectedTrain;
        const tType = leg.selectedFlight ? 'flight' : leg.selectedTrain ? (leg.selectedTrain.type === 'bus' ? 'bus' : 'train') : (leg.type || 'drive');
        const depTime = leg.departureTime;
        const arrTime = leg.arrivalTime;
        const detail = leg.selectedFlight
          ? `${leg.selectedFlight.airline || ''} ${leg.selectedFlight.flightNumber || ''}`.trim()
          : leg.selectedTrain
            ? `${leg.selectedTrain.operator || ''} ${leg.selectedTrain.trainNumber || ''}`.trim()
            : '';

        travelDay.stops.push({
          name: `${fromCityName} to ${cityName}`,
          time: depTime || null,
          type: 'transport',
          transportType: tType,
          transportDuration: sel?.duration || leg.duration || '',
          transportDetail: detail,
        });

        // Check if overnight
        let isOvernight = false;
        if (sel && depTime && arrTime) {
          const depH = parseInt(depTime.split(':')[0] || '0');
          const arrH = parseInt(arrTime.split(':')[0] || '0');
          const durMatch = sel.duration?.match(/(\d+)h/);
          const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
          isOvernight = sel.isNextDay || (arrH < depH && durHrs > 2) || durHrs >= 24;
        }

        if (isOvernight) {
          // Push travel day, increment, create arrival day
          result.push(travelDay);
          dayNum++;

          const arrivalDay: SharedItineraryDay = {
            day: dayNum + 1,
            date: addDaysToDate(trip.departureDate, dayNum),
            type: 'arrival',
            city: cityName,
            stops: [],
            hotel: dest.selectedHotel?.name,
          };
          if (arrTime) {
            arrivalDay.stops.push({ name: `Arrive in ${cityName}`, time: arrTime, type: 'activity' });
          }
          if (dest.selectedHotel) {
            arrivalDay.stops.push({ name: `Check in: ${dest.selectedHotel.name}`, time: null, type: 'hotel' });
          }
          // Arrival evening activities from AI cache
          const aiActs = cityActivities[cityName] || [];
          const arrMin = arrTime ? parseTime(arrTime) : 15 * 60;
          let cursor = arrMin + 45; // settle in time
          const dinnerMin = 19 * 60;
          let actCount = 0;
          for (const act of aiActs) {
            if (cursor + (act.durationMin || 60) > dinnerMin || actCount >= 3) break;
            arrivalDay.stops.push({
              name: act.name, time: formatTime12(cursor), type: 'activity',
              category: act.category, durationMin: act.durationMin,
              note: act.note, ticketPrice: act.ticketPrice,
            });
            cursor += (act.durationMin || 60) + 30;
            actCount++;
          }
          arrivalDay.stops.push({ name: 'Dinner', time: formatTime12(dinnerMin), type: 'meal' });
          result.push(arrivalDay);
          dayNum++;
        } else {
          // Same-day arrival — mark as arrival if time allows activities
          const arrMin = arrTime ? parseTime(arrTime) : null;
          if (arrMin !== null && arrMin < 18 * 60) {
            travelDay.type = 'arrival';
          }
          if (dest.selectedHotel) {
            travelDay.stops.push({ name: `Check in: ${dest.selectedHotel.name}`, time: arrTime || null, type: 'hotel' });
          }
          travelDay.hotel = dest.selectedHotel?.name;
          // Same-day evening activities
          if (arrMin !== null && arrMin < 17 * 60) {
            const aiActs = cityActivities[cityName] || [];
            let cursor = arrMin + 45;
            const dinnerMin = 19 * 60;
            let actCount = 0;
            for (const act of aiActs) {
              if (cursor + (act.durationMin || 60) > dinnerMin || actCount >= 2) break;
              travelDay.stops.push({
                name: act.name, time: formatTime12(cursor), type: 'activity',
                category: act.category, durationMin: act.durationMin,
                note: act.note, ticketPrice: act.ticketPrice,
              });
              cursor += (act.durationMin || 60) + 30;
              actCount++;
            }
          }
          travelDay.stops.push({ name: 'Dinner', time: formatTime12(19 * 60), type: 'meal' });
          result.push(travelDay);
          dayNum++;
        }
      } else {
        // No transport leg (shouldn't happen, but handle gracefully)
        result.push(travelDay);
        dayNum++;
      }

      // ── Explore days ──
      const exploreDays = Math.max(0, (dest.nights || 0) - 1);
      const aiActs = cityActivities[cityName] || [];
      const themes = dayThemes[cityName] || [];
      // Skip activities already used on arrival day
      const arrivalUsed = new Set<string>();
      const arrDay = result[result.length - 1];
      if (arrDay) {
        for (const s of arrDay.stops) {
          if (s.type === 'activity') arrivalUsed.add(s.name.toLowerCase());
        }
      }
      const availableActs = aiActs.filter((a: any) => !arrivalUsed.has(a.name.toLowerCase()));

      const perDay = exploreDays > 0 ? Math.max(1, Math.ceil(availableActs.length / exploreDays)) : 0;

      for (let n = 0; n < exploreDays; n++) {
        const expDay: SharedItineraryDay = {
          day: dayNum + 1,
          date: addDaysToDate(trip.departureDate, dayNum),
          type: 'explore',
          city: cityName,
          stops: [],
          hotel: dest.selectedHotel?.name,
        };

        // Breakfast
        expDay.stops.push({ name: 'Breakfast', time: '8:00 AM', type: 'meal' });

        // Morning + afternoon activities
        const dayActivities = availableActs.slice(n * perDay, (n + 1) * perDay);
        let cursor = 9 * 60; // 09:00
        const lunchStart = 12 * 60 + 30;
        const afternoonStart = 13 * 60 + 15;
        const dinnerStart = 19 * 60;
        const travelGap = 30;
        let lunchAdded = false;

        for (const act of dayActivities) {
          const dur = act.durationMin || 60;
          // Switch to afternoon after lunch time
          if (!lunchAdded && cursor + dur > lunchStart) {
            expDay.stops.push({ name: 'Lunch', time: formatTime12(lunchStart), type: 'meal' });
            lunchAdded = true;
            cursor = Math.max(cursor, afternoonStart);
          }
          if (cursor + dur > dinnerStart - 30) continue;
          expDay.stops.push({
            name: act.name, time: formatTime12(cursor), type: 'activity',
            category: act.category, durationMin: dur,
            note: act.note, ticketPrice: act.ticketPrice,
          });
          cursor += dur + travelGap;
        }

        if (!lunchAdded) {
          expDay.stops.push({ name: 'Lunch', time: formatTime12(lunchStart), type: 'meal' });
        }

        // Dinner
        expDay.stops.push({ name: 'Dinner', time: formatTime12(dinnerStart), type: 'meal' });

        result.push(expDay);
        dayNum++;
      }
    }

    // ── Return/departure day for round trips ──
    if (trip.tripType === 'roundTrip' && trip.destinations.length > 0) {
      const lastDest = trip.destinations[trip.destinations.length - 1];
      const returnLeg = trip.transportLegs[trip.transportLegs.length - 1];
      const lastCityName = lastDest.city?.parentCity || lastDest.city?.name || '';
      const homeName = trip.from?.parentCity || trip.from?.name || 'Home';

      const depDay: SharedItineraryDay = {
        day: dayNum + 1,
        date: addDaysToDate(trip.departureDate, dayNum),
        type: 'departure',
        city: homeName,
        departureCity: lastCityName,
        stops: [],
      };

      depDay.stops.push({ name: 'Breakfast', time: '8:00 AM', type: 'meal' });

      if (returnLeg) {
        const sel = returnLeg.selectedFlight || returnLeg.selectedTrain;
        const tType = returnLeg.selectedFlight ? 'flight' : returnLeg.selectedTrain ? (returnLeg.selectedTrain.type === 'bus' ? 'bus' : 'train') : (returnLeg.type || 'drive');
        const detail = returnLeg.selectedFlight
          ? `${returnLeg.selectedFlight.airline || ''} ${returnLeg.selectedFlight.flightNumber || ''}`.trim()
          : returnLeg.selectedTrain
            ? `${returnLeg.selectedTrain.operator || ''} ${returnLeg.selectedTrain.trainNumber || ''}`.trim()
            : '';
        depDay.stops.push({
          name: `${lastCityName} to ${homeName}`,
          time: returnLeg.departureTime || null,
          type: 'transport',
          transportType: tType,
          transportDuration: sel?.duration || returnLeg.duration || '',
          transportDetail: detail,
        });
      }
      result.push(depDay);
    }

    return result;
  }, [trip]);

  // ── Render helpers ──
  const renderTransportIcon = (type: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={transportIcons[type] || transportIcons.drive} />
    </svg>
  );

  const renderItineraryView = () => {
    if (itineraryDays.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm font-body">No itinerary data available for this trip.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Day navigation chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {itineraryDays.map((day) => {
            const style = DAY_TYPE_STYLES[day.type] || DAY_TYPE_STYLES.explore;
            return (
              <a key={day.day} href={`#day-${day.day}`}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border ${style.bg} ${style.text} ${style.border} hover:opacity-80 transition-opacity`}>
                Day {day.day}
              </a>
            );
          })}
        </div>

        {/* Day cards */}
        {itineraryDays.map((day) => {
          const style = DAY_TYPE_STYLES[day.type] || DAY_TYPE_STYLES.explore;
          return (
            <div key={day.day} id={`day-${day.day}`} className={`border ${style.border} rounded-xl overflow-hidden`}>
              {/* Day header */}
              <div className={`${style.bg} px-4 py-3 flex items-center justify-between`}>
                <div>
                  <span className={`text-xs font-mono font-bold ${style.text}`}>
                    Day {day.day} &middot; {day.date}
                  </span>
                  <h3 className="font-display font-bold text-sm text-text-primary mt-0.5">
                    {day.type === 'travel' || day.type === 'departure'
                      ? `${day.departureCity || ''} \u2192 ${day.city}`
                      : day.city}
                  </h3>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                  {style.label}
                </span>
              </div>

              {/* Stops */}
              <div className="p-4 space-y-2.5">
                {day.hotel && day.type === 'explore' && (
                  <div className="flex items-center gap-2 text-[10px] text-text-muted font-body mb-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M3 7v14M21 7v14M6 11h4v4H6zM14 11h4v4h-4zM10 3h4v4h-4z"/></svg>
                    <span>{day.hotel}</span>
                  </div>
                )}

                {day.stops.map((stop, si) => (
                  <div key={si} className="flex items-start gap-3">
                    {/* Time column */}
                    <div className="w-[58px] flex-shrink-0 text-right">
                      {stop.time ? (
                        <span className="text-[10px] font-mono text-text-secondary">{stop.time}</span>
                      ) : (
                        <span className="text-[10px] font-mono text-text-muted">--:--</span>
                      )}
                    </div>

                    {/* Content */}
                    {stop.type === 'meal' ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-full">
                        <span className="text-xs">{MEAL_EMOJIS[stop.name.toLowerCase()] || '\uD83C\uDF7D\uFE0F'}</span>
                        <span className="text-xs font-body font-medium text-orange-700">{stop.name}</span>
                      </div>
                    ) : stop.type === 'transport' ? (
                      <div className={`flex-1 p-2.5 rounded-lg border ${
                        stop.transportType === 'flight' ? 'bg-blue-50 border-blue-200' :
                        stop.transportType === 'train' ? 'bg-amber-50 border-amber-200' :
                        stop.transportType === 'bus' ? 'bg-orange-50 border-orange-200' :
                        'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          {renderTransportIcon(stop.transportType || 'drive')}
                          <span className="text-xs font-display font-bold text-text-primary">{stop.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-secondary font-mono">
                          {stop.transportDetail && <span>{stop.transportDetail}</span>}
                          {stop.transportDuration && <span>&middot; {stop.transportDuration}</span>}
                        </div>
                      </div>
                    ) : stop.type === 'hotel' ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.5"><path d="M3 21h18M3 7v14M21 7v14M6 11h4v4H6zM14 11h4v4h-4zM10 3h4v4h-4z"/></svg>
                        <span className="text-xs font-body text-rose-700">{stop.name}</span>
                      </div>
                    ) : stop.type === 'sleep' ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full">
                        <span className="text-xs">{'\uD83D\uDE34'}</span>
                        <span className="text-xs font-body text-slate-600">{stop.name}</span>
                      </div>
                    ) : (
                      /* Activity */
                      <div className="flex-1 p-2.5 bg-bg-card border border-border-subtle rounded-lg">
                        <div className="flex items-center gap-2">
                          {stop.category && (
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[stop.category] || '#f59e0b' }} />
                          )}
                          <span className="text-xs font-display font-bold text-text-primary">{stop.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {stop.durationMin && (
                            <span className="text-[10px] font-mono text-text-muted">{stop.durationMin} min</span>
                          )}
                          {stop.category && (
                            <span className="text-[10px] font-mono text-text-muted capitalize">{stop.category}</span>
                          )}
                          {stop.ticketPrice && (
                            <span className="text-[10px] font-mono text-accent-gold">{stop.ticketPrice}</span>
                          )}
                        </div>
                        {stop.note && (
                          <p className="text-[10px] font-body text-text-muted mt-1">{stop.note}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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
                    const totalPrice = hotel.pricePerNight * nights;
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
                          <span className="text-text-secondary font-body">{formatPrice(hotel.pricePerNight, 'INR')}/night &times; {nights}</span>
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
                            <span className="text-text-muted font-mono">{leg.selectedFlight.stops === 'Nonstop' ? 'Direct' : leg.selectedFlight.stops?.split(' · ')[0]}</span>
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
