'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { timeStr12 } from '@/lib/timeUtils';
import { formatPrice } from '@/lib/currency';

const transportIcons: Record<string, string> = {
  drive: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2M7 14h.01M17 14h.01M6 3h12l1 5H5z',
  flight: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  train: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-16 0h16M8 22h8m-8-4h.01M16 18h.01M6 6h12v6H6z',
  bus: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01M5 6h14v5H5zM8 22h8',
};

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
}

export default function SharedTripClient({ trip }: { trip: SharedTrip }) {
  const router = useRouter();

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
          <div className="mb-6">
            <h1 className="font-display text-lg font-bold text-text-primary">{trip.title}</h1>
            <p className="text-text-muted text-xs font-mono mt-1">
              {trip.departureDate} &middot; {trip.adults} adult{trip.adults > 1 ? 's' : ''}
              {trip.children > 0 ? `, ${trip.children} children` : ''}
              &middot; {trip.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
            </p>
          </div>

          {/* Main content: timeline + sidebar */}
          <div className="md:grid md:grid-cols-[1fr_260px] md:gap-8">
          {/* Timeline */}
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
                              <span className="text-text-secondary font-body">{formatPrice(leg.selectedTrain.price, 'INR')}/pax &times; {trip.adults}</span>
                              <span className="text-accent-cyan font-mono font-bold">{formatPrice(leg.selectedTrain.price * trip.adults, 'INR')}</span>
                            </div>
                          </div>
                        )}

                        {/* Drive/bus leg without selection */}
                        {!leg.selectedFlight && !leg.selectedTrain && (
                          <p className="text-text-muted text-[10px] font-body">
                            {leg.type === 'drive' ? 'Driving' : leg.type === 'bus' ? 'Bus' : leg.type === 'flight' ? 'Flight' : leg.type === 'train' ? 'Train' : leg.type}
                            {leg.duration ? ` · ${leg.duration}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
