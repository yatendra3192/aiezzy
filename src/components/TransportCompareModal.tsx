'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flight, TrainOption } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fromCity: string;
  toCity: string;
  fromCode: string;
  toCode: string;
  fromAirport: string;
  toAirport: string;
  date: string;
  adults: number;
  currentType: string;
  selectedFlight: Flight | null;
  selectedTrain: TrainOption | null;
  onSelectFlight: (flight: Flight) => void;
  onSelectTrain: (train: TrainOption) => void;
  onSelectDrive: () => void;
  onSelectBus: () => void;
  cachedFlights?: any[] | null;
}

// Airport timezone abbreviations (UTC offset labels)
const AIRPORT_TZ: Record<string, string> = {
  // India
  'BOM': 'IST', 'DEL': 'IST', 'BLR': 'IST', 'MAA': 'IST', 'CCU': 'IST', 'HYD': 'IST',
  'GOI': 'IST', 'COK': 'IST', 'AMD': 'IST', 'PNQ': 'IST', 'JAI': 'IST', 'IDR': 'IST',
  'LKO': 'IST', 'GAU': 'IST', 'TRV': 'IST', 'VNS': 'IST', 'NAG': 'IST', 'BHO': 'IST',
  // Europe
  'LHR': 'GMT', 'LGW': 'GMT', 'STN': 'GMT', 'MAN': 'GMT', 'EDI': 'GMT', 'DUB': 'GMT', 'LIS': 'WET',
  'CDG': 'CET', 'ORY': 'CET', 'AMS': 'CET', 'FRA': 'CET', 'MUC': 'CET', 'BER': 'CET',
  'MAD': 'CET', 'BCN': 'CET', 'FCO': 'CET', 'MXP': 'CET', 'VCE': 'CET', 'ZRH': 'CET',
  'VIE': 'CET', 'BRU': 'CET', 'CPH': 'CET', 'ARN': 'CET', 'OSL': 'CET', 'HEL': 'EET',
  'ATH': 'EET', 'IST': 'TRT', 'PRG': 'CET', 'BUD': 'CET', 'WAW': 'CET', 'HAM': 'CET',
  'GVA': 'CET', 'KEF': 'GMT',
  // Middle East
  'DXB': 'GST', 'AUH': 'GST', 'DOH': 'AST', 'BAH': 'AST', 'MCT': 'GST',
  'JED': 'AST', 'RUH': 'AST', 'AMM': 'EET', 'CAI': 'EET',
  // Asia
  'SIN': 'SGT', 'BKK': 'ICT', 'HKG': 'HKT', 'NRT': 'JST', 'HND': 'JST',
  'ICN': 'KST', 'PEK': 'CST', 'PVG': 'CST', 'KUL': 'MYT', 'CGK': 'WIB',
  'DPS': 'WITA', 'MNL': 'PHT', 'TPE': 'CST', 'CMB': 'IST', 'KTM': 'NPT',
  'DAC': 'BST', 'HAN': 'ICT', 'SGN': 'ICT',
  // Americas
  'JFK': 'EST', 'EWR': 'EST', 'LAX': 'PST', 'SFO': 'PST', 'ORD': 'CST',
  'ATL': 'EST', 'DFW': 'CST', 'DEN': 'MST', 'SEA': 'PST', 'MIA': 'EST',
  'BOS': 'EST', 'IAD': 'EST', 'PHL': 'EST', 'IAH': 'CST', 'YYZ': 'EST', 'YVR': 'PST',
  'MEX': 'CST', 'GRU': 'BRT', 'EZE': 'ART', 'BOG': 'COT', 'SCL': 'CLT', 'LIM': 'PET',
  // Africa
  'JNB': 'SAST', 'CPT': 'SAST', 'NBO': 'EAT', 'ADD': 'EAT', 'DAR': 'EAT',
  'RAK': 'WET', 'CMN': 'WET', 'LOS': 'WAT',
  // Oceania
  'SYD': 'AEST', 'MEL': 'AEST', 'AKL': 'NZST', 'NAN': 'FJT',
};

const getTimezone = (code: string): string => AIRPORT_TZ[code] || '';

const AIRLINE_COLORS: Record<string, string> = {
  '6E': '#4f46e5', 'AI': '#dc2626', 'IX': '#2563eb', 'UK': '#7c3aed', 'SG': '#f59e0b', 'QP': '#0d9488',
  'LH': '#00205b', 'KL': '#00a1de', 'AF': '#002157', 'BA': '#003366', 'VY': '#f7c600', 'FR': '#003580',
  'U2': '#ff6600', 'EW': '#a5027d', 'EK': '#d71921', 'EY': '#b5985a', 'QR': '#5c0632', 'TK': '#e31e24',
  'SQ': '#f0ab00', 'TG': '#4a1a6b', 'CX': '#006564', 'LX': '#c4002e', 'OS': '#e20a16',
};

type TabType = 'flight' | 'train' | 'bus' | 'drive' | 'walk' | 'cycle' | 'boat' | 'tram';

function padTime(t: string): string {
  // "5:31 AM" → "05:31 AM"
  const parts = t.match(/^(\d{1,2})(:\d{2}.*)$/);
  if (parts && parts[1].length === 1) return `0${parts[1]}${parts[2]}`;
  return t;
}

export default function TransportCompareModal({
  isOpen, onClose, fromCity, toCity, fromCode, toCode, fromAirport, toAirport,
  date, adults, currentType, selectedFlight, selectedTrain,
  onSelectFlight, onSelectTrain, onSelectDrive, onSelectBus, cachedFlights,
}: Props) {
  const [tab, setTab] = useState<TabType>(currentType as TabType || 'flight');
  const [flights, setFlights] = useState<(Flight & {
    depAirportCode?: string; arrAirportCode?: string;
    layovers?: Array<{ airport: string; airportCode: string; duration: number; overnight: boolean }>;
    isNextDay?: boolean; co2Kg?: number | null; co2Diff?: number | null; travelClass?: string; durationMin?: number;
  })[]>([]);
  const [trains, setTrains] = useState<any[]>([]);
  const [driveInfo, setDriveInfo] = useState<{ duration: string; distance: string } | null>(null);
  const [walkInfo, setWalkInfo] = useState<{ duration: string; distance: string } | null>(null);
  const [cycleInfo, setCycleInfo] = useState<{ duration: string; distance: string } | null>(null);
  const [busRoutes, setBusRoutes] = useState<any[]>([]);
  const [busLoading, setBusLoading] = useState(false);
  const [busNotFound, setBusNotFound] = useState(false);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [loadingTrains, setLoadingTrains] = useState(false);
  const [nearbyAirportPrompt, setNearbyAirportPrompt] = useState<{ fromNearby: string; toNearby: string; fromCity: string; toCity: string } | null>(null);
  const [userAcceptedNearby, setUserAcceptedNearby] = useState(false);
  const [flightSort, setFlightSort] = useState<'price' | 'shortest'>('price');
  const [trainSort, setTrainSort] = useState<'price' | 'shortest'>('shortest');
  // Flight filters
  const [flightStopsFilter, setFlightStopsFilter] = useState<'all' | 'direct' | '1stop' | '2plus'>('all');
  const [flightPriceFilter, setFlightPriceFilter] = useState<'all' | '10k' | '20k' | '50k'>('all');
  const [connectingTrainPrompt, setConnectingTrainPrompt] = useState(false);
  const [userAcceptedConnecting, setUserAcceptedConnecting] = useState(false);

  // Reset state on open — MUST be before fetch effects so fetches see clean state
  useEffect(() => {
    if (isOpen) {
      setTab(currentType as TabType || 'flight');
      setTrains([]); setDriveInfo(null); setWalkInfo(null); setCycleInfo(null); setBusRoutes([]); setBusNotFound(false);
      setNearbyAirportPrompt(null); setUserAcceptedNearby(false);
      setConnectingTrainPrompt(false); setUserAcceptedConnecting(false);
      setFlightStopsFilter('all'); setFlightPriceFilter('all');
      // Pre-populate flights from cache if available (avoids re-fetching)
      if (cachedFlights && cachedFlights.length > 0) {
        setFlights(cachedFlights.map((f: any, i: number) => ({
          id: `f-${i}-${f.flightNumber}`, airline: f.airline, airlineCode: f.airlineCode, flightNumber: f.flightNumber,
          departure: f.departure, arrival: f.arrival, duration: f.duration, stops: f.stops,
          route: `${f.depAirportCode || fromCode}-${f.arrAirportCode || toCode}`, pricePerAdult: f.price, color: AIRLINE_COLORS[f.airlineCode] || '#6b7280',
          depAirportCode: f.depAirportCode, arrAirportCode: f.arrAirportCode,
          layovers: f.layovers, isNextDay: f.isNextDay,
          co2Kg: f.co2Kg, co2Diff: f.co2Diff, travelClass: f.travelClass, durationMin: f.durationMin,
        })));
      } else {
        // No cache (e.g., after page reload) — seed with the currently selected flight
        // so prices stay consistent while fresh results load
        setFlights(selectedFlight ? [{
          ...selectedFlight,
          id: `selected-${selectedFlight.flightNumber}`,
        }] : []);
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch flights - check if nearby airport needed first
  const fetchFlights = () => {
    setLoadingFlights(true);
    setNearbyAirportPrompt(null);
    const searchFrom = fromCode || fromCity;
    const searchTo = toCode || toCity;
    fetch(`/api/flights?from=${encodeURIComponent(searchFrom)}&to=${encodeURIComponent(searchTo)}&date=${date}&adults=${adults}`)
      .then(r => r.json())
      .then(data => {
        if (data.flights?.length > 0) {
          const resolvedRoute = data.fromResolved && data.toResolved
            ? `${data.fromResolved}-${data.toResolved}`
            : `${data.fromResolved || fromCode}-${data.toResolved || toCode}`;
          const mapped = data.flights.map((f: any, i: number) => ({
            id: `f-${i}-${f.flightNumber}`, airline: f.airline, airlineCode: f.airlineCode, flightNumber: f.flightNumber,
            departure: f.departure, arrival: f.arrival, duration: f.duration, stops: f.stops,
            route: resolvedRoute, pricePerAdult: f.price, color: AIRLINE_COLORS[f.airlineCode] || '#6b7280',
            depAirportCode: f.depAirportCode, arrAirportCode: f.arrAirportCode,
            layovers: f.layovers, isNextDay: f.isNextDay,
            co2Kg: f.co2Kg, co2Diff: f.co2Diff, travelClass: f.travelClass, durationMin: f.durationMin,
          }));
          // Include the currently selected flight if it's not in the new results
          // (preserves the original price the user selected at)
          if (selectedFlight && !mapped.some((f: any) => f.flightNumber === selectedFlight.flightNumber)) {
            mapped.unshift({ ...selectedFlight, id: `selected-${selectedFlight.flightNumber}` });
          }
          // Check if nearby airport was used
          if ((data.fromIsNearby || data.toIsNearby) && !userAcceptedNearby) {
            setNearbyAirportPrompt({
              fromNearby: data.fromIsNearby ? data.fromResolved : '',
              toNearby: data.toIsNearby ? data.toResolved : '',
              fromCity: fromCity,
              toCity: toCity,
            });
          }
          setFlights(mapped);
        }
        setLoadingFlights(false);
      }).catch(() => setLoadingFlights(false));
  };

  useEffect(() => {
    if (!isOpen || tab !== 'flight') return;
    // Fetch if no flights, or only the seeded selected flight (no cache)
    if (flights.length > 0 && !(!cachedFlights && flights.length === 1 && flights[0]?.id?.startsWith('selected-'))) return;
    fetchFlights();
  }, [isOpen, tab]);

  // Fetch trains
  useEffect(() => {
    if (!isOpen || tab !== 'train' || trains.length > 0) return;
    setLoadingTrains(true);
    fetch(`/api/trains?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${date}`)
      .then(r => r.json())
      .then(data => {
        setTrains(data.trains || []);
        setLoadingTrains(false);
      })
      .catch(() => setLoadingTrains(false));
  }, [isOpen, tab]);

  // Prefetch driving distance on open (needed for availability check)
  useEffect(() => {
    if (!isOpen || driveInfo) return;
    fetch(`/api/directions?origin=${encodeURIComponent(fromCity)}&destination=${encodeURIComponent(toCity)}&mode=driving`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
          const leg = data.routes[0].legs[0];
          setDriveInfo({ duration: leg.duration.text, distance: leg.distance.text });
        }
      }).catch(() => {});
  }, [isOpen]);

  // Fetch walk/cycle on tab switch
  useEffect(() => {
    if (!isOpen) return;
    const fetchMode = (mode: string, setter: (v: any) => void) => {
      fetch(`/api/directions?origin=${encodeURIComponent(fromCity)}&destination=${encodeURIComponent(toCity)}&mode=${mode}`)
        .then(r => r.json())
        .then(data => {
          if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
            const leg = data.routes[0].legs[0];
            setter({ duration: leg.duration.text, distance: leg.distance.text });
          }
        }).catch(() => {});
    };
    if (tab === 'walk' && !walkInfo) fetchMode('walking', setWalkInfo);
    if (tab === 'cycle' && !cycleInfo) fetchMode('bicycling', setCycleInfo);
    // Bus uses the trains API (which fetches all transit) — we filter for BUS vehicles
    if (tab === 'bus' && busRoutes.length === 0 && !busLoading && !busNotFound) {
      setBusLoading(true);
      fetch(`/api/trains?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${date}`)
        .then(r => r.json())
        .then(data => {
          // allTransit contains all routes including buses
          const allRoutes = data.allTransit || data.trains || [];
          // Filter to routes that have at least one BUS vehicle
          const busOnly = allRoutes.filter((t: any) =>
            t.transitSteps?.some((s: any) => s.vehicle === 'BUS')
          );
          if (busOnly.length > 0) {
            setBusRoutes(busOnly);
          } else {
            setBusNotFound(true);
          }
          setBusLoading(false);
        }).catch(() => { setBusNotFound(true); setBusLoading(false); });
    }
  }, [isOpen, tab]);


  const sortedFlights = useMemo(() => {
    let filtered = [...flights];
    // Stops filter
    if (flightStopsFilter === 'direct') filtered = filtered.filter(f => f.stops === 'Nonstop');
    else if (flightStopsFilter === '1stop') filtered = filtered.filter(f => f.stops === '1 stop');
    else if (flightStopsFilter === '2plus') filtered = filtered.filter(f => f.stops !== 'Nonstop' && f.stops !== '1 stop');
    // Price filter
    if (flightPriceFilter === '10k') filtered = filtered.filter(f => f.pricePerAdult < 10000);
    else if (flightPriceFilter === '20k') filtered = filtered.filter(f => f.pricePerAdult < 20000);
    else if (flightPriceFilter === '50k') filtered = filtered.filter(f => f.pricePerAdult < 50000);
    return filtered.sort((a, b) =>
      flightSort === 'price' ? a.pricePerAdult - b.pricePerAdult : a.duration.localeCompare(b.duration)
    );
  }, [flights, flightSort, flightStopsFilter, flightPriceFilter]);

  const sortedTrains = useMemo(() => [...trains].sort((a, b) =>
    trainSort === 'price' ? a.price - b.price : (a.durationSeconds || 0) - (b.durationSeconds || 0)
  ), [trains, trainSort]);

  // Find best value flight (cheapest nonstop or cheapest overall)
  const bestFlightId = useMemo(() => {
    if (flights.length === 0) return '';
    const nonstop = flights.filter(f => f.stops === 'Nonstop').sort((a, b) => a.pricePerAdult - b.pricePerAdult);
    return (nonstop[0] || flights.sort((a, b) => a.pricePerAdult - b.pricePerAdult)[0])?.id || '';
  }, [flights]);

  const handleSelectTrain = (t: any) => {
    onSelectTrain({
      id: t.id, operator: t.operator, trainName: t.trainName, trainNumber: t.trainNumber,
      departure: t.departure, arrival: t.arrival, duration: t.duration, stops: t.stops,
      fromStation: t.fromStation, toStation: t.toStation, price: t.price,
      color: t.transitSteps?.[0]?.color || '#6b7280',
    });
  };

  // Determine availability based on real driving distance
  const driveDistKm = driveInfo ? parseFloat(driveInfo.distance.replace(/[^0-9.]/g, '')) || 0 : null;

  const availability = useMemo<Record<TabType, boolean>>(() => {
    return {
      flight: true,
      train: true,
      bus: true,
      drive: true,
      walk: true,
      cycle: true,
      boat: true,
      tram: true,
    };
  }, []);

  const PRIMARY_TABS: { id: TabType; label: string; emoji: string }[] = [
    { id: 'flight', label: 'Flights', emoji: '✈️' },
    { id: 'train', label: 'Trains', emoji: '🚆' },
    { id: 'bus', label: 'Bus', emoji: '🚌' },
    { id: 'drive', label: 'Drive', emoji: '🚗' },
  ];

  const SECONDARY_TABS: { id: TabType; label: string; emoji: string }[] = [
    { id: 'walk', label: 'Walk', emoji: '🚶' },
    { id: 'cycle', label: 'Cycle', emoji: '🚲' },
    { id: 'boat', label: 'Boat', emoji: '⛵' },
    { id: 'tram', label: 'Tram', emoji: '🚊' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}>
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[430px] md:max-w-[750px] max-h-[92vh] bg-bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col">

            {/* Header */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-text-primary">{fromCity} &rarr; {toCity}</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary hover:border-accent-cyan transition-all text-sm">&times;</button>
              </div>

              {/* Transport tabs — single scrollable row */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {[...PRIMARY_TABS, ...SECONDARY_TABS].map(t => {
                  const avail = availability[t.id];
                  const isActive = tab === t.id;
                  const isPrimary = PRIMARY_TABS.some(p => p.id === t.id);
                  return (
                    <button key={t.id} onClick={() => avail && setTab(t.id)}
                      className={`flex flex-col items-center gap-0.5 rounded-xl transition-all flex-shrink-0 ${
                        isPrimary ? 'py-2.5 px-4 min-w-[70px]' : 'py-2 px-3 min-w-[58px]'
                      } ${
                        isActive
                          ? 'bg-accent-cyan text-white shadow-md'
                          : avail
                          ? 'bg-bg-card border border-border-subtle text-text-primary hover:border-accent-cyan/40 hover:shadow-sm'
                          : 'bg-bg-card border border-border-subtle text-text-muted/60 cursor-not-allowed'
                      }`}>
                      <span className={`${isPrimary ? 'text-lg' : 'text-sm'} ${!avail && !isActive ? 'grayscale opacity-70' : ''}`}>{t.emoji}</span>
                      <span className={`font-display font-bold ${isPrimary ? 'text-[10px]' : 'text-[9px]'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto border-t border-border-subtle">

              {/* ── FLIGHTS ── */}
              {tab === 'flight' && (
                <div className="p-4">
                  {/* Nearby airport prompt - skip if user already has a flight selected */}
                  {nearbyAirportPrompt && !userAcceptedNearby && !selectedFlight && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                      <p className="text-sm font-display font-bold text-text-primary mb-1">No airport in {nearbyAirportPrompt.toNearby ? nearbyAirportPrompt.toCity : nearbyAirportPrompt.fromCity}</p>
                      <p className="text-xs text-text-secondary font-body mb-3">
                        We found flights via nearby airport{' '}
                        <span className="font-mono font-bold text-accent-cyan">
                          {nearbyAirportPrompt.toNearby || nearbyAirportPrompt.fromNearby}
                        </span>
                        . Would you like to see these flights?
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => { setUserAcceptedNearby(true); setNearbyAirportPrompt(null); }}
                          className="flex-1 bg-accent-cyan text-white font-display font-bold text-xs py-2 rounded-lg transition-all hover:bg-accent-cyan/90">
                          Yes, show flights
                        </button>
                        <button onClick={() => { setNearbyAirportPrompt(null); setFlights([]); }}
                          className="flex-1 bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-xs py-2 rounded-lg transition-all hover:border-accent-cyan/30">
                          No thanks
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sort toggle */}
                  {(flights.length > 0 && (userAcceptedNearby || !nearbyAirportPrompt)) && (
                  <div className="flex rounded-xl overflow-hidden border border-border-subtle mb-3">
                    <button onClick={() => setFlightSort('price')} className={`flex-1 py-2 text-xs font-display font-bold transition-all ${flightSort === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Cheapest</button>
                    <button onClick={() => setFlightSort('shortest')} className={`flex-1 py-2 text-xs font-display font-bold transition-all ${flightSort === 'shortest' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Fastest</button>
                  </div>
                  )}

                  {/* Flight filters — only show when 3+ flights */}
                  {flights.length >= 3 && (userAcceptedNearby || !nearbyAirportPrompt) && (
                    <div className="mb-3 space-y-2">
                      <div>
                        <p className="text-[10px] font-body text-text-muted mb-1">Stops</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {([['all', 'All'], ['direct', 'Direct'], ['1stop', '1 stop'], ['2plus', '2+ stops']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setFlightStopsFilter(val)}
                              className={`px-2 py-1 rounded-full border text-[10px] font-body transition-all ${
                                flightStopsFilter === val
                                  ? 'bg-accent-cyan text-white border-accent-cyan'
                                  : 'border-border-subtle text-text-secondary hover:border-accent-cyan/40'
                              }`}>{label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-body text-text-muted mb-1">Max Price</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {([['all', 'All'], ['10k', 'Under \u20B910K'], ['20k', 'Under \u20B920K'], ['50k', 'Under \u20B950K']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setFlightPriceFilter(val)}
                              className={`px-2 py-1 rounded-full border text-[10px] font-body transition-all ${
                                flightPriceFilter === val
                                  ? 'bg-accent-cyan text-white border-accent-cyan'
                                  : 'border-border-subtle text-text-secondary hover:border-accent-cyan/40'
                              }`}>{label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {nearbyAirportPrompt && !userAcceptedNearby && !selectedFlight ? null : loadingFlights ? (
                    <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" /><span className="text-text-muted text-sm ml-3">Searching flights...</span></div>
                  ) : flights.length === 0 ? (
                    <p className="text-text-muted text-sm text-center py-12">No flights found for this route</p>
                  ) : sortedFlights.length === 0 ? (
                    <p className="text-text-muted text-sm text-center py-8">No flights match your filters. Try adjusting the filters above.</p>
                  ) : (
                    <>
                      <p className="text-text-muted text-[10px] font-body mb-2">{sortedFlights.length} of {flights.length} flights</p>
                      <div className="space-y-2">
                        {sortedFlights.map(f => {
                          const isBest = f.id === bestFlightId;
                          const isSelected = selectedFlight?.id === f.id;
                          return (
                            <button key={f.id} onClick={() => onSelectFlight(f)}
                              className={`w-full text-left p-4 rounded-xl border transition-all relative ${
                                isSelected ? 'bg-accent-cyan/10 border-accent-cyan' : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'
                              }`}>
                              {/* Best value badge */}
                              {isBest && !isSelected && (
                                <span className="absolute -top-2 left-3 px-2 py-0.5 bg-accent-gold text-white text-[9px] font-display font-bold rounded-full">Best Value</span>
                              )}
                              {/* Row 1: Airline + price */}
                              <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-mono font-bold" style={{ backgroundColor: f.color }}>{f.airlineCode}</div>
                                  <div>
                                    <p className="text-sm font-display font-bold text-text-primary">{f.airline} {f.flightNumber}</p>
                                    <p className="text-[10px] text-text-muted">{f.travelClass || 'Economy'}</p>
                                  </div>
                                </div>
                                <span className="font-mono font-bold text-accent-cyan text-base">&#8377; {f.pricePerAdult.toLocaleString()}</span>
                              </div>
                              {/* Row 2: Time + timezone, timeline, arrival */}
                              {(() => {
                                // Compute if flight arrives next day from times + duration
                                const depH = parseInt(f.departure?.split(':')[0] || '0');
                                const arrH = parseInt(f.arrival?.split(':')[0] || '0');
                                const durMatch = f.duration?.match(/(\d+)h/);
                                const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
                                const isOvernight = f.isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2);
                                const depDate = new Date(date);
                                const arrDate = new Date(date);
                                if (isOvernight) arrDate.setDate(arrDate.getDate() + 1);
                                const depDateStr = depDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                                const arrDateStr = arrDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                                return (
                              <div className="flex items-center gap-1 mb-2">
                                <div className="text-left min-w-[85px]">
                                  <p className="font-mono font-bold text-base text-text-primary">
                                    {padTime(timeStr12(f.departure))}
                                    {getTimezone(f.depAirportCode || fromCode) && <span className="text-[10px] text-text-secondary font-normal ml-1">{getTimezone(f.depAirportCode || fromCode)}</span>}
                                  </p>
                                  <p className="text-[10px] text-text-secondary font-mono">{f.depAirportCode || fromCode} &middot; {depDateStr}</p>
                                </div>
                                <div className="flex-1 relative h-[2px] bg-border-subtle mx-2">
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                                  {f.layovers && f.layovers.length > 0 && f.layovers.map((_: any, li: number) => (
                                    <div key={li} className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 border border-white" style={{ left: `${((li + 1) / (f.layovers!.length + 1)) * 100}%` }} />
                                  ))}
                                </div>
                                <div className="text-right min-w-[85px]">
                                  <p className="font-mono font-bold text-base text-text-primary">
                                    {padTime(timeStr12(f.arrival))}
                                    {getTimezone(f.arrAirportCode || toCode) && <span className="text-[10px] text-text-secondary font-normal ml-1">{getTimezone(f.arrAirportCode || toCode)}</span>}
                                    {isOvernight && <span className="text-accent-cyan text-[10px] ml-1">+1</span>}
                                  </p>
                                  <p className="text-[10px] text-text-secondary font-mono">{f.arrAirportCode || toCode} &middot; {arrDateStr}</p>
                                </div>
                              </div>
                                );
                              })()}
                              {/* Row 3: Duration + stops */}
                              <p className="text-xs text-text-primary font-body text-center">
                                {f.duration} &bull; {f.stops === 'Nonstop' ? 'Direct' : f.stops}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── TRAINS ── */}
              {tab === 'train' && (
                <div className="p-4">
                  {(trains.length > 0) && (
                  <div className="flex rounded-xl overflow-hidden border border-border-subtle mb-3">
                    <button onClick={() => setTrainSort('shortest')} className={`flex-1 py-2 text-xs font-display font-bold transition-all ${trainSort === 'shortest' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Fastest</button>
                    <button onClick={() => setTrainSort('price')} className={`flex-1 py-2 text-xs font-display font-bold transition-all ${trainSort === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Cheapest</button>
                  </div>
                  )}
                  {loadingTrains ? (
                    <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" /><span className="text-text-muted text-sm ml-3">Searching trains...</span></div>
                  ) : trains.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-3">🚆</p>
                      <p className="text-text-primary text-sm font-display font-bold">No train routes found</p>
                      <p className="text-text-muted text-xs font-body mt-1">Train data for this route is not available yet</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-text-muted text-[10px] font-body mb-2">Showing {sortedTrains.length} routes</p>
                      <div className="space-y-2">
                        {sortedTrains.map((t: any, idx: number) => (
                          <button key={t.id} onClick={() => handleSelectTrain(t)}
                            className={`w-full text-left p-4 rounded-xl border transition-all relative ${
                              selectedTrain?.id === t.id ? 'bg-accent-cyan/10 border-accent-cyan' : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'
                            }`}>
                            {idx === 0 && (
                              <span className="absolute -top-2 left-3 px-2 py-0.5 bg-accent-gold text-white text-[9px] font-display font-bold rounded-full">{trainSort === 'shortest' ? 'Fastest' : 'Cheapest'}</span>
                            )}
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-display font-bold text-text-primary">{t.operator}</p>
                              <div className="text-right">
                                <span className="font-mono font-bold text-accent-cyan text-base">&#8377; {t.price.toLocaleString()}</span>
                                <span className="text-[9px] text-text-muted ml-1">est.</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-sm text-text-primary">{padTime(t.departureText || timeStr12(t.departure))}</span>
                              <div className="flex-1 relative h-[2px] bg-border-subtle mx-1">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-gold" />
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-gold" />
                              </div>
                              <span className="font-mono font-bold text-sm text-text-primary">{padTime(t.arrivalText || timeStr12(t.arrival))}</span>
                            </div>
                            <p className="text-[11px] text-text-secondary font-body text-center mb-1.5">{t.duration} &bull; {t.stops}</p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {(t.transitSteps || []).map((s: any, si: number) => (
                                <span key={si} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-white" style={{ backgroundColor: s.color || '#6b7280' }}>{s.line || s.vehicle}</span>
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-text-muted font-body mt-3">Train prices estimated based on distance. Actual fares may vary.</p>
                    </>
                  )}
                </div>
              )}

              {/* ── SIMPLE TRANSPORT TABS (bus, drive, walk, cycle, boat, tram) ── */}
              {['bus', 'drive', 'walk', 'cycle', 'boat', 'tram'].includes(tab) && (
                <div className="p-4">
                  {(() => {
                    const dist = driveDistKm;
                    // Bus tab with multiple routes
                    if (tab === 'bus' && busRoutes.length > 0) {
                      return (
                        <>
                          <p className="text-text-muted text-[10px] font-body mb-2">{busRoutes.length} bus routes found</p>
                          <div className="space-y-2">
                            {busRoutes.map((t: any, idx: number) => (
                              <button key={t.id || idx} onClick={onSelectBus}
                                className="w-full text-left p-4 rounded-xl border transition-all bg-bg-card border-border-subtle hover:border-accent-cyan/30">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-display font-bold text-text-primary">{t.operator}</p>
                                  <span className="font-mono font-bold text-accent-cyan text-base">&#8377; {t.price?.toLocaleString()}<span className="text-[9px] text-text-muted ml-0.5">est.</span></span>
                                </div>
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="font-mono font-bold text-sm text-text-primary">{padTime(timeStr12(t.departure))}</span>
                                  <div className="flex-1 h-[2px] bg-border-subtle relative">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                                  </div>
                                  <span className="font-mono font-bold text-sm text-text-primary">{padTime(timeStr12(t.arrival))}</span>
                                </div>
                                <p className="text-[11px] text-text-secondary font-body text-center mb-1">{t.duration} &bull; {t.stops}</p>
                                <div className="flex flex-wrap gap-1">
                                  {(t.transitSteps || []).map((s: any, si: number) => (
                                    <span key={si} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-white" style={{ backgroundColor: s.color || '#6b7280' }}>{s.line || s.operator?.split(' ')[0] || 'Bus'}</span>
                                  ))}
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    }

                    const configs: Record<string, { emoji: string; label: string; info: { duration: string; distance: string } | null; free: boolean; action: () => void; loading: boolean; notFound: boolean; tooFar: boolean }> = {
                      bus: { emoji: '🚌', label: 'Bus / Transit', info: null, free: false, action: onSelectBus, loading: busLoading, notFound: busNotFound, tooFar: false },
                      drive: { emoji: '🚗', label: 'Self Drive', info: driveInfo, free: true, action: onSelectDrive, loading: false, notFound: false, tooFar: false },
                      walk: { emoji: '🚶', label: 'Walking', info: walkInfo, free: true, action: onSelectDrive, loading: false, notFound: false, tooFar: false },
                      cycle: { emoji: '🚲', label: 'Cycling', info: cycleInfo, free: true, action: onSelectDrive, loading: false, notFound: false, tooFar: false },
                      boat: { emoji: '⛵', label: 'Boat / Ferry', info: null, free: false, action: () => {}, loading: false, notFound: true, tooFar: false },
                      tram: { emoji: '🚊', label: 'Tram', info: null, free: false, action: () => {}, loading: false, notFound: true, tooFar: false },
                    };
                    const cfg = configs[tab];
                    if (!cfg) return null;

                    if (cfg.loading) {
                      return (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                          <span className="text-text-muted text-sm ml-3">Searching {cfg.label.toLowerCase()} routes...</span>
                        </div>
                      );
                    }

                    if (cfg.notFound) {
                      return (
                        <div className="text-center py-12">
                          <p className="text-3xl mb-3">{cfg.emoji}</p>
                          <p className="text-text-primary text-sm font-display font-bold">No {cfg.label.toLowerCase()} routes found</p>
                          <p className="text-text-muted text-xs font-body mt-1">Not available for this route</p>
                        </div>
                      );
                    }

                    if (cfg.tooFar) {
                      return (
                        <div className="text-center py-12">
                          <p className="text-3xl mb-3">{cfg.emoji}</p>
                          <p className="text-text-primary text-sm font-display font-bold">{cfg.label} not practical</p>
                          <p className="text-text-muted text-xs font-body mt-1">Distance is too far ({dist ? `${Math.round(dist)} km` : 'unknown'})</p>
                        </div>
                      );
                    }

                    return (
                      <button onClick={cfg.action}
                        className={`w-full text-left p-5 rounded-xl border transition-all ${currentType === tab ? 'bg-accent-cyan/10 border-accent-cyan' : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'}`}>
                        <div className="flex items-center gap-4">
                          <span className="text-3xl">{cfg.emoji}</span>
                          <div className="flex-1">
                            <p className="font-display font-bold text-base text-text-primary">{cfg.label}</p>
                            {cfg.info ? (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-text-secondary text-sm font-mono">{cfg.info.duration}</span>
                                <span className="text-text-muted">&bull;</span>
                                <span className="text-text-secondary text-sm font-mono">{cfg.info.distance}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                                <span className="text-text-muted text-xs">Calculating...</span>
                              </div>
                            )}
                          </div>
                          {cfg.free && <span className="text-accent-gold text-sm font-display font-bold">Free</span>}
                        </div>
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
