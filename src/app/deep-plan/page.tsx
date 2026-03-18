'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import { getDepartureHub, getArrivalHub, CITY_ATTRACTIONS } from '@/data/mockData';
import { addDaysToDate, subtractMinutes, addMinutes, getBufferMinutes, parseDurationMinutes, formatTime12, parseTime } from '@/lib/timeUtils';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';
import { getDirections } from '@/lib/googleApi';
import FlightModal from '@/components/FlightModal';
import HotelModal from '@/components/HotelModal';
import TrainModal from '@/components/TrainModal';
import TransportModal from '@/components/TransportModal';

interface DeepStop {
  id: string;
  name: string;
  type: 'home' | 'airport' | 'station' | 'hotel' | 'attraction' | 'destination';
  time: string | null;      // "HH:MM" or null
  transport: { icon: string; duration: string; distance: string } | null;
  destIndex?: number;
  legIndex?: number;
  note?: string;             // e.g. "Check-in 2.5h before flight"
}

interface DayPlan {
  day: number;
  date: string;
  stops: DeepStop[];
}

const TYPE_COLORS: Record<string, string> = {
  home: '#E8654A', airport: '#8b5cf6', station: '#f59e0b', hotel: '#ec4899', attraction: '#f59e0b', destination: '#E8654A',
};

const TRANSPORT_ICONS: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  walk: 'M13 3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-1.5 18l-2.4-8.5 2.9-2v8.5h-1l.5 2zm3-18l-1 4 3 3v7h-2v-5l-3-3 1-4 5 2v-2z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01',
  publicTransit: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8',
};

export default function DeepPlanPage() {
  const router = useRouter();
  const trip = useTrip();
  const { currency } = useCurrency();
  const [isRestoring, setIsRestoring] = useState(false);

  // Restore trip from sessionStorage on page reload
  useEffect(() => {
    if (trip.destinations.length > 0) return; // Already have destinations in context

    const idToLoad = trip.tripId || (() => { try { return sessionStorage.getItem('currentTripId'); } catch { return null; } })();
    if (idToLoad) {
      setIsRestoring(true);
      trip.loadTrip(idToLoad).catch(() => {}).finally(() => setIsRestoring(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      // ── TRAVEL DAY to this destination ──
      const travelDay: DayPlan = { day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [] };

      if (leg) {
        const depHub = getDepartureHub(fromCity, leg.type);
        const arrHub = getArrivalHub(toCity, leg.type);
        const depTime = leg.departureTime; // from selected flight/train
        const arrTime = leg.arrivalTime;

        // How long to get from starting point to departure hub
        const isFirstLeg = destIdx === 0;
        const startName = isFirstLeg ? trip.fromAddress : (prevDest?.selectedHotel?.name || `Stay in ${fromCity.name}`);
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

          // Step 2: Departure terminal
          const terminalType = leg.type === 'flight' ? 'airport' as const : 'station' as const;
          const terminalName = depHub?.name || `${fromCity.name} ${leg.type === 'flight' ? 'Airport' : 'Station'}`;
          travelDay.stops.push({
            id: `dp${sc++}`, name: terminalName, type: terminalType, time: arriveAtTerminalTime,
            transport: { icon: leg.type, duration: leg.duration, distance: leg.distance },
            legIndex: destIdx,
            note: leg.type === 'flight'
              ? `Check-in ${bufferMin >= 120 ? '2.5h' : '1.5h'} before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`
              : `Board ${bufferMin}min before departure at ${depTime ? formatTime12(parseTime(depTime)) : '~'}`,
          });

          // Step 3: Arrival terminal - use real directions if available
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

          // Step 4: Arrive at hotel/destination
          const hotelArriveTime = arrTime ? addMinutes(arrTime, fromArrTerminalMin) : null;
          if (dest.nights > 0) {
            travelDay.stops.push({
              id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
              time: hotelArriveTime, transport: null, destIndex: destIdx,
            });
          } else {
            travelDay.stops.push({
              id: `dp${sc++}`, name: `${toCity.name} Center`, type: 'destination',
              time: hotelArriveTime, transport: null,
            });
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
      result.push(travelDay);
      dayNum++;

      // ── EXPLORE DAYS at this destination ──
      const exploreDays = Math.max(0, dest.nights - 1);
      const attractions = CITY_ATTRACTIONS[toCity.name] || [`${toCity.name} Center`, `${toCity.name} Park`];

      for (let n = 0; n < exploreDays; n++) {
        const expDay: DayPlan = { day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [] };
        const hotelName = dest.selectedHotel?.name || `Stay in ${toCity.name}`;

        expDay.stops.push({ id: `dp${sc++}`, name: hotelName, type: 'hotel', time: '09:00', transport: { icon: 'walk', duration: '15 min', distance: '0.8 mi' } });

        const dayAttractions = attractions.slice((n * 2) % attractions.length, ((n * 2) % attractions.length) + 2);
        if (dayAttractions.length === 0) dayAttractions.push(attractions[0]);

        dayAttractions.forEach((attr, ai) => {
          expDay.stops.push({
            id: `dp${sc++}`, name: attr, type: 'attraction', time: `${10 + ai * 2}:00`,
            transport: ai < dayAttractions.length - 1
              ? { icon: 'walk', duration: `${15 + ai * 5} min`, distance: `${(0.5 + ai * 0.3).toFixed(1)} mi` }
              : { icon: 'walk', duration: '12 min', distance: '0.6 mi' },
          });
        });

        expDay.stops.push({ id: `dp${sc++}`, name: hotelName, type: 'hotel', time: '17:00', transport: null, destIndex: destIdx });
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
      const returnDay: DayPlan = { day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [] };

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
          returnDay.stops.push({
            id: `dp${sc++}`, name: startName, type: 'hotel', time: leaveTime,
            transport: { icon: 'drive', duration: `${toTerminalMin} min`, distance: depHub?.transitToCenter.distance || '~' },
          });
          returnDay.stops.push({
            id: `dp${sc++}`, name: depHub?.name || `${fromCity.name} Terminal`, type: returnLeg.type === 'flight' ? 'airport' : 'station',
            time: depTime ? subtractMinutes(depTime, bufferMin) : null,
            transport: { icon: returnLeg.type, duration: returnLeg.duration, distance: returnLeg.distance },
            legIndex: trip.transportLegs.length - 1,
          });
          returnDay.stops.push({
            id: `dp${sc++}`, name: arrHub?.name || `${trip.from.name} Terminal`, type: returnLeg.type === 'flight' ? 'airport' : 'station',
            time: arrTime,
            transport: { icon: 'drive', duration: `${trip.from.homeToAirportMin || 27} min`, distance: '~' },
          });
        } else {
          returnDay.stops.push({
            id: `dp${sc++}`, name: startName, type: 'hotel', time: null,
            transport: { icon: 'drive', duration: returnLeg.duration, distance: returnLeg.distance },
          });
        }

        returnDay.stops.push({ id: `dp${sc++}`, name: trip.fromAddress, type: 'home', time: null, transport: null });
      }
      result.push(returnDay);
    }

    return result;
  }, [trip, realTimes]);

  const totalNights = trip.destinations.reduce((s, d) => s + d.nights, 0);
  const flightCost = trip.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + l.selectedFlight!.pricePerAdult, 0) * trip.adults;
  const trainCost = trip.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + l.selectedTrain!.price, 0) * trip.adults;
  const hotelCost = trip.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => s + d.selectedHotel!.pricePerNight * d.nights, 0);

  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? trip.from : trip.destinations[Math.min(legIdx - 1, trip.destinations.length - 1)]?.city;
    const toCity = legIdx < trip.destinations.length ? trip.destinations[legIdx]?.city : trip.from;
    return { fromCity, toCity };
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[900px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => router.push('/my-trips')} className="font-display text-lg font-bold hover:opacity-80 transition-opacity"><span className="text-accent-cyan">AI</span>Ezzy</button>
            <span className="text-text-muted text-xs">/</span>
            <button onClick={() => router.push('/route')} className="text-text-secondary text-xs font-body hover:text-accent-cyan transition-colors">Route</button>
            <span className="text-text-muted text-xs">/</span>
            <span className="text-text-primary text-xs font-body font-semibold">Deep Plan</span>
          </div>
          <h1 className="font-display text-lg font-bold text-text-primary mb-6">Deep Plan</h1>

          {days.map(day => (
            <div key={day.day} className="mb-8 last:mb-0">
              <div className="bg-bg-card border border-border-subtle rounded-xl px-4 py-3 mb-5">
                <h2 className="font-display font-bold text-sm text-text-primary">Day {day.day} &mdash; {day.date}</h2>
              </div>

              <div className="stagger-children">
                {day.stops.map((stop, si) => {
                  const hasTransport = stop.transport !== null;
                  return (
                    <div key={stop.id}>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold relative z-10"
                            style={{ backgroundColor: TYPE_COLORS[stop.type] || '#E8654A', color: '#FFFFFF' }}>
                            {si + 1}
                          </div>
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2">
                            {stop.time && (
                              <span className="text-accent-cyan text-[11px] font-mono font-bold">{formatTime12(parseTime(stop.time))}</span>
                            )}
                            <h3 className="font-display font-bold text-sm text-text-primary leading-tight">{stop.name}</h3>
                          </div>
                          {stop.note && <p className="text-[10px] text-text-muted font-body mt-0.5 italic">{stop.note}</p>}
                          {stop.type === 'hotel' && !hasTransport && stop.destIndex !== undefined && (
                            <button onClick={() => setHotelModal({ destIndex: stop.destIndex! })} className="text-accent-cyan text-xs font-body mt-0.5 hover:underline">
                              Change stay
                            </button>
                          )}
                          {stop.type === 'attraction' && <span className="text-xs text-text-muted font-body">Sightseeing</span>}
                        </div>
                      </div>

                      {hasTransport && stop.transport && (
                        <div className="flex items-start gap-4 ml-0">
                          <div className="flex flex-col items-center w-8">
                            <div className="w-px flex-1 border-l-2 border-dashed border-border-subtle min-h-[40px]" />
                          </div>
                          <div className="flex-1 py-2">
                            <button
                              onClick={() => {
                                if (stop.legIndex !== undefined) {
                                  if (stop.transport?.icon === 'flight') setFlightModal({ legIndex: stop.legIndex });
                                  else if (stop.transport?.icon === 'train') setTrainModal({ legIndex: stop.legIndex });
                                  else setTransportModal({ legIndex: stop.legIndex });
                                }
                              }}
                              className="flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition-colors group"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-accent-cyan">
                                <path d={TRANSPORT_ICONS[stop.transport.icon] || TRANSPORT_ICONS.drive} />
                              </svg>
                              <span className="text-xs font-mono">{stop.transport.duration} &middot; {stop.transport.distance}</span>
                              {stop.legIndex !== undefined && (
                                <>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted"><path d="M6 9l6 6 6-6"/></svg>
                                  <span className="text-[10px] text-text-muted font-body">Change</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="mt-6 p-4 bg-bg-card border border-border-subtle rounded-xl">
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{days.length}</p><p className="text-text-muted text-[10px] font-body">Days</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{trip.destinations.length}</p><p className="text-text-muted text-[10px] font-body">Cities</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-lg">{totalNights}</p><p className="text-text-muted text-[10px] font-body">Nights</p></div>
            </div>
            {(flightCost + trainCost + hotelCost) > 0 && (
              <div className="pt-3 border-t border-border-subtle flex justify-between items-center">
                <span className="text-xs text-text-secondary font-body">Estimated Total</span>
                <span className="text-accent-cyan font-mono font-bold">{formatPrice(flightCost + trainCost + hotelCost, currency)}</span>
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
    </div>
  );
}
