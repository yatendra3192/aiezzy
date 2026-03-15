'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
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

    // Auto-select flights for legs that don't have one
    trip.transportLegs.forEach((leg, i) => {
      if (leg.selectedFlight || leg.selectedTrain) return; // Already selected
      if (leg.type !== 'flight' && leg.type !== 'drive') return;

      const fromC = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
      const toC = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
      if (!fromC || !toC) return;
      // Use airport code if available, otherwise use city/place name (API resolves it server-side)
      const fc = findAirportCode(fromC) || fromC.name || fromC.fullName;
      const tc = findAirportCode(toC) || toC.name || toC.fullName;
      if (!fc || !tc || fc === tc) return;

      // Calculate the correct date for this leg
      // Leg 0: departure date, Leg 1: departure + dest[0].nights, Leg 2: + dest[0].nights + dest[1].nights, etc.
      let dayOffset = 0;
      for (let d = 0; d < Math.min(i, trip.destinations.length); d++) {
        dayOffset += trip.destinations[d].nights || 1;
      }
      const legDate = new Date(trip.departureDate);
      legDate.setDate(legDate.getDate() + dayOffset);
      const legDateStr = legDate.toISOString().split('T')[0];

      pendingCountRef.current++;
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

  // Find nearest airport code for a city
  const findAirportCode = (city: City | undefined): string => {
    if (!city) return '';
    if (city.airportCode) return city.airportCode;
    // Include parentCity (from Google locality) in search — critical for places like "Vijay Nagar" in Indore
    const searchText = `${city.parentCity || ''} ${city.fullName || ''} ${city.name || ''}`.toLowerCase();
    const known = CITIES.find(c => c.airportCode && searchText.includes(c.name.toLowerCase()));
    if (known) return known.airportCode!;
    // Regional patterns (state → nearest airport)
    if (searchText.includes('maharashtra') || searchText.includes('thane') || searchText.includes('navi mumbai')) return 'BOM';
    if (searchText.includes('karnataka') || searchText.includes('bengaluru')) return 'BLR';
    if (searchText.includes('tamil nadu') || searchText.includes('chennai')) return 'MAA';
    if (searchText.includes('west bengal') || searchText.includes('kolkata')) return 'CCU';
    if (searchText.includes('telangana') || searchText.includes('hyderabad')) return 'HYD';
    // If parentCity exists, use it directly for API resolution (e.g., "Indore" → API resolves to IDR)
    if (city.parentCity) return city.parentCity;
    return '';
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
                          return <span className="text-text-muted text-xs font-body italic mt-0.5 block">Pass through (0 nights)</span>;
                        }

                        if (hotel) {
                          const totalPrice = hotel.pricePerNight * nights;
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
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedFlight.color, fontSize: '9px' }}>{leg.selectedFlight.airlineCode}</span>
                              <span className="text-text-secondary font-mono">{timeStr12(leg.selectedFlight.departure)} &rarr; {timeStr12(leg.selectedFlight.arrival)}</span>
                              <span className="text-text-muted font-mono">{leg.selectedFlight.duration}</span>
                              <span className="text-text-muted font-mono">{leg.selectedFlight.stops === 'Nonstop' ? 'Direct' : leg.selectedFlight.stops.split(' · ')[0]}</span>
                            </div>
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
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded text-white font-mono font-bold" style={{ backgroundColor: leg.selectedTrain.color, fontSize: '9px' }}>{leg.selectedTrain.operator.split(' ')[0].slice(0,3)}</span>
                              <span className="text-text-secondary font-mono">{timeStr12(leg.selectedTrain.departure)} &rarr; {timeStr12(leg.selectedTrain.arrival)}</span>
                              <span className="text-text-muted font-mono">{leg.selectedTrain.duration}</span>
                            </div>
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
            {session && (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => trip.saveTrip()}
                disabled={trip.isSaving}
                className={`w-full font-display font-bold py-3 rounded-xl text-sm transition-all ${
                  trip.isDirty
                    ? 'bg-accent-cyan text-white hover:shadow-[0_0_20px_rgba(232,101,74,0.3)]'
                    : 'bg-bg-card border border-border-subtle text-text-secondary'
                } disabled:opacity-50`}>
                {trip.isSaving ? 'Saving...' : trip.isDirty ? 'Save Trip' : trip.lastSavedAt ? 'Saved' : 'Save Trip'}
              </motion.button>
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

      {/* Unified Transport Compare Modal */}
      {transportModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(transportModal.legIndex);
        const leg = trip.transportLegs[transportModal.legIndex];
        // Calculate correct date for this leg
        let legDayOffset = 0;
        for (let d = 0; d < Math.min(transportModal.legIndex, trip.destinations.length); d++) {
          legDayOffset += trip.destinations[d].nights || 1;
        }
        const legD = new Date(trip.departureDate);
        legD.setDate(legD.getDate() + legDayOffset);
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
