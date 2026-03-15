'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flight, getFlightsForRoute } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fromAirport: string;
  toAirport: string;
  fromCode: string;
  toCode: string;
  date: string;
  selectedFlight: Flight | null;
  onSelectFlight: (flight: Flight) => void;
  adults?: number;
}

// Airline brand colors
const AIRLINE_COLORS: Record<string, string> = {
  '6E': '#4f46e5', 'AI': '#dc2626', 'IX': '#2563eb', 'UK': '#7c3aed', 'SG': '#f59e0b', 'QP': '#0d9488',
  'LH': '#00205b', 'KL': '#00a1de', 'AF': '#002157', 'BA': '#003366', 'VY': '#f7c600', 'FR': '#003580',
  'U2': '#ff6600', 'EW': '#a5027d', 'EK': '#d71921', 'EY': '#b5985a', 'QR': '#5c0632', 'TK': '#e31e24',
  'SQ': '#f0ab00', 'TG': '#4a1a6b', 'CX': '#006564',
};

export default function FlightModal({
  isOpen, onClose, fromAirport, toAirport, fromCode, toCode, date, selectedFlight, onSelectFlight, adults = 1,
}: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'shortest'>('price');
  const [liveFlights, setLiveFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'live' | 'estimated' | 'mock'>('mock');

  // Fetch flights from API when modal opens
  useEffect(() => {
    if (isOpen && fromCode && toCode && date) {
      setLoading(true);
      fetch(`/api/flights?from=${fromCode}&to=${toCode}&date=${date}&adults=${adults}`)
        .then(res => res.json())
        .then(data => {
          if (data.flights && data.flights.length > 0) {
            const mapped: Flight[] = data.flights.map((f: any, i: number) => ({
              id: `live-${i}-${f.flightNumber}`,
              airline: f.airline,
              airlineCode: f.airlineCode,
              flightNumber: f.flightNumber,
              departure: f.departure,
              arrival: f.arrival,
              duration: f.duration,
              stops: f.stops,
              route: `${fromCode}-${toCode}`,
              pricePerAdult: f.price,
              color: AIRLINE_COLORS[f.airlineCode] || '#6b7280',
            }));
            setLiveFlights(mapped);
            setSource(data.source === 'live' ? 'live' : 'estimated');
          }
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          setSource('mock');
        });
    }
  }, [isOpen, fromCode, toCode, date, adults]);

  // Use live flights if available, otherwise fall back to mock
  const mockFlights = getFlightsForRoute(fromCode, toCode);
  const flights = liveFlights.length > 0 ? liveFlights : mockFlights;

  const sorted = [...flights].sort((a, b) =>
    sortBy === 'price' ? a.pricePerAdult - b.pricePerAdult : a.duration.localeCompare(b.duration)
  );

  const current = selectedFlight || sorted[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[430px] md:max-w-[560px] max-h-[85vh] bg-bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-border-subtle">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-display font-bold text-sm text-text-primary">
                    Flights &mdash; {fromAirport} &rarr; {toAirport}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    {current && (
                      <p className="text-xs text-text-secondary font-mono">
                        {current.airline} {current.flightNumber} &middot; &#8377;{current.pricePerAdult.toLocaleString()} &middot; {date}
                      </p>
                    )}
                    {source !== 'mock' && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        source === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {source === 'live' ? 'LIVE' : 'EST'}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl transition-colors ml-4">&times;</button>
              </div>

              {/* Sort tabs */}
              <div className="flex mt-4 rounded-xl overflow-hidden border border-border-subtle">
                <button
                  onClick={() => setSortBy('price')}
                  className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                    sortBy === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                  }`}
                >
                  &#8595; Lowest Price
                </button>
                <button
                  onClick={() => setSortBy('shortest')}
                  className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                    sortBy === 'shortest' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                  }`}
                >
                  &#9201; Shortest
                </button>
              </div>
            </div>

            {/* Flight list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                  <span className="text-text-muted text-sm ml-3 font-body">Searching flights...</span>
                </div>
              ) : (
                sorted.map(flight => {
                  const isSelected = current?.id === flight.id;
                  return (
                    <motion.button
                      key={flight.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => onSelectFlight(flight)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-accent-cyan/10 border-accent-cyan shadow-[0_0_15px_rgba(0,229,199,0.15)]'
                          : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-mono font-bold"
                            style={{ backgroundColor: flight.color }}
                          >
                            {flight.airlineCode}
                          </div>
                          <div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono font-bold text-text-primary">{timeStr12(flight.departure)}</span>
                              <div className="text-center">
                                <p className="text-[10px] text-text-muted font-mono">{flight.duration}</p>
                                <div className="w-16 h-px bg-border-subtle relative my-0.5">
                                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
                                    <span className="text-[9px] text-accent-cyan bg-bg-card px-1">{flight.stops === 'Nonstop' ? 'Nonstop' : flight.stops.split(' · ')[0]}</span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-text-muted font-mono">{flight.route}</p>
                              </div>
                              <span className="font-mono font-bold text-text-primary">{timeStr12(flight.arrival)}</span>
                            </div>
                            <p className="text-[10px] text-text-muted mt-0.5">{flight.airline} &middot; {flight.flightNumber}</p>
                            {flight.stops !== 'Nonstop' && (
                              <p className="text-[9px] text-text-muted">{flight.stops}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-accent-cyan">&#8377;{flight.pricePerAdult.toLocaleString()}</p>
                          <p className="text-[10px] text-text-muted">per adult</p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
