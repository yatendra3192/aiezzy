'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flight, TrainOption } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';
import { getFlightBookingUrl, getTrainBookingUrl } from '@/lib/affiliateLinks';

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
  onSelectFlight: (flight: Flight, airportInfo?: { fromCode: string; fromCity: string; fromDistance: number }) => void;
  onSelectTrain: (train: TrainOption) => void;
  onSelectDrive: (info?: { duration: string; distance: string; mode: string }) => void;
  onSelectBus: (bus: TrainOption) => void;
  children?: number;
  infants?: number;
  onBookingDocUploaded?: (file: File, matchCities: string[], docType: 'hotel' | 'transport' | 'general') => void;
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

function parseDurationMin(d: string): number {
  const h = d.match(/(\d+)h/);
  const m = d.match(/(\d+)m/);
  return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}

function padTime(t: string): string {
  // "5:31 AM" → "05:31 AM"
  const parts = t.match(/^(\d{1,2})(:\d{2}.*)$/);
  if (parts && parts[1].length === 1) return `0${parts[1]}${parts[2]}`;
  return t;
}

export default function TransportCompareModal({
  isOpen, onClose, fromCity, toCity, fromCode, toCode, fromAirport, toAirport,
  date, adults, currentType, selectedFlight, selectedTrain,
  onSelectFlight, onSelectTrain, onSelectDrive, onSelectBus, children: tripChildren = 0, infants: tripInfants = 0, onBookingDocUploaded, cachedFlights,
}: Props) {
  const { currency } = useCurrency();
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
  const sameAirport = !!(fromCode && toCode && fromCode === toCode);
  const [loadingTrains, setLoadingTrains] = useState(false);
  const [nearbyAirportPrompt, setNearbyAirportPrompt] = useState<{ fromNearby: string; toNearby: string; fromCity: string; toCity: string } | null>(null);
  const [userAcceptedNearby, setUserAcceptedNearby] = useState(false);
  const [flightSort, setFlightSort] = useState<'price' | 'shortest'>('price');
  const [trainSort, setTrainSort] = useState<'price' | 'shortest'>('shortest');
  // Flight filters
  const [filterStops, setFilterStops] = useState<Set<number>>(new Set()); // empty = all stops
  const [filterAirlines, setFilterAirlines] = useState<Set<string>>(new Set()); // empty = all airlines
  const [filterDepTime, setFilterDepTime] = useState<Set<string>>(new Set()); // 'morning'|'afternoon'|'evening'|'night'
  const [showFilters, setShowFilters] = useState(false); // mobile filter toggle
  // Nearby airports dropdowns (departure + arrival)
  const [nearbyAirports, setNearbyAirports] = useState<Array<{ code: string; city: string; distance: number }>>([]);
  const [nearbyArrAirports, setNearbyArrAirports] = useState<Array<{ code: string; city: string; distance: number }>>([]);
  const [selectedAirportFilter, setSelectedAirportFilter] = useState<string>('');
  const [selectedArrAirportFilter, setSelectedArrAirportFilter] = useState<string>('');
  const [connectingTrainPrompt, setConnectingTrainPrompt] = useState(false);
  const [userAcceptedConnecting, setUserAcceptedConnecting] = useState(false);
  // Custom transport entry
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customCarrier, setCustomCarrier] = useState('');
  const [customNumber, setCustomNumber] = useState('');
  const [customDep, setCustomDep] = useState('');
  const [customArr, setCustomArr] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customFromHub, setCustomFromHub] = useState('');  // airport/station name
  const [customToHub, setCustomToHub] = useState('');
  const [customFromCode, setCustomFromCode] = useState(''); // IATA code
  const [customToCode, setCustomToCode] = useState('');
  const [customStops, setCustomStops] = useState('Nonstop');
  // Passenger breakdown from uploaded ticket (for accurate per-adult price)
  const [ticketAdults, setTicketAdults] = useState(0);
  const [ticketChildren, setTicketChildren] = useState(0);
  const [ticketInfants, setTicketInfants] = useState(0);
  // Upload booking
  const [uploadExtracting, setUploadExtracting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const transportFileRef = useRef<HTMLInputElement>(null);

  const resetCustomForm = () => {
    setShowCustomForm(false);
    setCustomCarrier(''); setCustomNumber(''); setCustomDep(''); setCustomArr('');
    setCustomPrice(''); setCustomDuration(''); setUploadError('');
    setCustomFromHub(''); setCustomToHub(''); setCustomFromCode(''); setCustomToCode('');
    setCustomStops('Nonstop');
    setTicketAdults(0); setTicketChildren(0); setTicketInfants(0);
  };

  const handleCustomFlight = () => {
    if (!customCarrier.trim() || !customDep || !customArr) return;
    const totalPrice = parseInt(customPrice.replace(/[^\d]/g, '')) || 0;
    // Use TRIP's passenger counts (what route page uses to multiply back)
    // Route page formula: pricePerAdult × (adults + children + infants × 0.15)
    const divisor = adults + tripChildren + (tripInfants * 0.15);
    const price = divisor > 0 ? Math.round(totalPrice / divisor) : totalPrice;
    const depCode = customFromCode.trim().toUpperCase() || fromCode || '?';
    const arrCode = customToCode.trim().toUpperCase() || toCode || '?';
    const flight: Flight = {
      id: `custom-flight-${Date.now()}`,
      airline: customCarrier.trim(),
      airlineCode: customCarrier.trim().substring(0, 2).toUpperCase(),
      flightNumber: customNumber.trim(),
      departure: customDep,
      arrival: customArr,
      duration: customDuration.trim() || '~',
      stops: customStops || 'Nonstop',
      route: `${depCode}-${arrCode}`,
      pricePerAdult: price,
      color: AIRLINE_COLORS[customCarrier.trim().substring(0, 2).toUpperCase()] || '#6b7280',
    };
    // Pass airport info so resolvedAirports gets updated
    onSelectFlight(flight, {
      fromCode: depCode,
      fromCity: customFromHub.trim() || fromCity,
      fromDistance: 0,
    });
  };

  const handleCustomTrain = () => {
    if (!customCarrier.trim() || !customDep || !customArr) return;
    const totalPrice = parseInt(customPrice.replace(/[^\d]/g, '')) || 0;
    // Train pricing: route page uses price × adults only (no infant/children surcharge)
    const price = adults > 0 ? Math.round(totalPrice / adults) : totalPrice;
    const train: TrainOption = {
      id: `custom-train-${Date.now()}`,
      operator: customCarrier.trim(),
      trainName: customCarrier.trim(),
      trainNumber: customNumber.trim(),
      departure: customDep,
      arrival: customArr,
      duration: customDuration.trim() || '~',
      stops: customStops === 'Nonstop' ? 'Direct' : customStops || 'Direct',
      fromStation: customFromHub.trim() || fromCity,
      toStation: customToHub.trim() || toCity,
      price,
      color: '#6b7280',
    };
    onSelectTrain(train);
  };

  const handleTransportUpload = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setUploadError('File too large (max 10MB)'); return; }
    setUploadExtracting(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/extract-transport', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to read ticket');
      const data = await res.json();
      if (data.carrier) setCustomCarrier(data.carrier);
      if (data.number) setCustomNumber(data.number);
      if (data.departure) setCustomDep(data.departure);
      if (data.arrival) setCustomArr(data.arrival);
      if (data.duration) setCustomDuration(data.duration);
      if (data.fromHub) setCustomFromHub(data.fromHub);
      if (data.toHub) setCustomToHub(data.toHub);
      if (data.fromCode) setCustomFromCode(data.fromCode);
      if (data.toCode) setCustomToCode(data.toCode);
      if (data.stops) setCustomStops(data.stops);
      // Store passenger breakdown from ticket for accurate per-adult calculation
      if (data.adults) setTicketAdults(data.adults);
      if (data.children) setTicketChildren(data.children);
      if (data.infants) setTicketInfants(data.infants);
      // Always show total price in the field — handlers will calculate per-adult
      if (data.priceTotal) {
        setCustomPrice(String(Math.round(data.priceTotal)));
      }
      setShowCustomForm(true);
      // Store file as a booking doc for viewing later
      const cities = [data.from, data.to, fromCity, toCity].filter(Boolean).map((c: string) => c.toLowerCase());
      if (onBookingDocUploaded) onBookingDocUploaded(file, cities, 'transport');
    } catch (err: any) {
      setUploadError(err.message || 'Failed to read ticket');
    } finally {
      setUploadExtracting(false);
    }
  }, [adults]);

  // Reset state on open — MUST be before fetch effects so fetches see clean state
  useEffect(() => {
    if (isOpen) {
      setTab(currentType as TabType || 'flight');
      setTrains([]); setDriveInfo(null); setWalkInfo(null); setCycleInfo(null); setBusRoutes([]); setBusNotFound(false);
      setNearbyAirportPrompt(null); setUserAcceptedNearby(false);
      setConnectingTrainPrompt(false); setUserAcceptedConnecting(false);
      setFilterStops(new Set()); setFilterAirlines(new Set()); setFilterDepTime(new Set()); setShowFilters(false); setSelectedAirportFilter(''); setSelectedArrAirportFilter(''); setNearbyAirports([]); setNearbyArrAirports([]);
      resetCustomForm();
      // Pre-populate flights from cache if available (avoids re-fetching)
      if (cachedFlights && cachedFlights.length > 0) {
        setFlights(cachedFlights.map((f: any, i: number) => ({
          id: `f-${i}-${f.flightNumber}`, airline: f.airline, airlineCode: f.airlineCode, flightNumber: f.flightNumber,
          departure: f.departure, arrival: f.arrival, duration: f.duration, stops: f.stops,
          route: `${f.depAirportCode || fromCode}-${f.arrAirportCode || toCode}`, pricePerAdult: f.price, color: AIRLINE_COLORS[f.airlineCode] || '#6b7280',
          depAirportCode: f.depAirportCode, arrAirportCode: f.arrAirportCode,
          layovers: f.layovers, isNextDay: f.isNextDay,
          co2Kg: f.co2Kg, co2Diff: f.co2Diff, travelClass: f.travelClass, durationMin: f.durationMin,
          cabinClass: f.cabinClass, checkedBaggage: f.checkedBaggage, cabinBaggage: f.cabinBaggage,
          aircraft: f.aircraft, operatingAirline: f.operatingAirline,
          depTerminal: f.depTerminal, arrTerminal: f.arrTerminal,
          basePrice: f.basePrice, stopsCount: f.stopsCount,
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
    // Skip if both cities resolve to the same airport (e.g., North Goa ↔ Old Goa both = GOI)
    if (sameAirport) { setFlights([]); setLoadingFlights(false); return; }
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
            cabinClass: f.cabinClass, checkedBaggage: f.checkedBaggage, cabinBaggage: f.cabinBaggage,
            aircraft: f.aircraft, operatingAirline: f.operatingAirline,
            depTerminal: f.depTerminal, arrTerminal: f.arrTerminal,
            basePrice: f.basePrice, stopsCount: f.stopsCount,
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
        } else {
          // No flights found — clear any seeded flight
          setFlights([]);
        }
        setLoadingFlights(false);
      }).catch(() => { setFlights([]); setLoadingFlights(false); });
  };

  useEffect(() => {
    if (!isOpen || tab !== 'flight') return;
    // Fetch if no flights, or only the seeded selected flight (no cache)
    if (flights.length > 0 && !(!cachedFlights && flights.length === 1 && flights[0]?.id?.startsWith('selected-'))) return;
    fetchFlights();
  }, [isOpen, tab]);

  // Fetch nearby airports list for the departure city (within 1000km)
  // Use city name (not code) so it geocodes and finds ALL nearby airports
  useEffect(() => {
    if (!isOpen || tab !== 'flight' || nearbyAirports.length > 0) return;
    const searchFrom = fromCity || fromCode;
    if (!searchFrom) return;
    fetch(`/api/flights?from=${encodeURIComponent(searchFrom)}&to=${encodeURIComponent(toCode || toCity)}&date=${date}&adults=${adults}&nearbyOnly=true`)
      .then(r => r.json())
      .then(data => {
        if (data.nearbyAirports?.length > 0) {
          setNearbyAirports(data.nearbyAirports);
        }
      }).catch(() => {});
  }, [isOpen, tab]);

  // Fetch nearby airports for arrival city
  useEffect(() => {
    if (!isOpen || tab !== 'flight' || nearbyArrAirports.length > 0) return;
    const searchTo = toCity || toCode;
    if (!searchTo) return;
    // Reuse the same endpoint but swap from/to to get arrival-side airports
    fetch(`/api/flights?from=${encodeURIComponent(searchTo)}&to=${encodeURIComponent(fromCode || fromCity)}&date=${date}&adults=${adults}&nearbyOnly=true`)
      .then(r => r.json())
      .then(data => {
        if (data.nearbyAirports?.length > 0) {
          setNearbyArrAirports(data.nearbyAirports);
        }
      }).catch(() => {});
  }, [isOpen, tab]);

  // Fetch flights with specific departure and/or arrival airport
  const fetchWithAirports = (depCode: string, arrCode: string) => {
    const fromQ = depCode || fromCode || fromCity;
    const toQ = arrCode || toCode || toCity;
    if (!fromQ || !toQ) return;
    setLoadingFlights(true);
    setFlights([]);
    const exactParam = (depCode || arrCode) ? '&exact=true' : '';
    fetch(`/api/flights?from=${encodeURIComponent(fromQ)}&to=${encodeURIComponent(toQ)}&date=${date}&adults=${adults}${exactParam}`)
      .then(r => r.json())
      .then(data => {
        if (data.flights?.length > 0) {
          const resolvedRoute = `${data.fromResolved || depCode || fromCode}-${data.toResolved || arrCode || toCode}`;
          const mapped = data.flights.map((f: any, idx: number) => ({
            id: `f-${idx}-${f.flightNumber}`, airline: f.airline, airlineCode: f.airlineCode, flightNumber: f.flightNumber,
            departure: f.departure, arrival: f.arrival, duration: f.duration, stops: f.stops,
            route: resolvedRoute, pricePerAdult: f.price, color: AIRLINE_COLORS[f.airlineCode] || '#6b7280',
            depAirportCode: f.depAirportCode, arrAirportCode: f.arrAirportCode,
            layovers: f.layovers, isNextDay: f.isNextDay,
            co2Kg: f.co2Kg, co2Diff: f.co2Diff, travelClass: f.travelClass, durationMin: f.durationMin,
            cabinClass: f.cabinClass, checkedBaggage: f.checkedBaggage, cabinBaggage: f.cabinBaggage,
            aircraft: f.aircraft, operatingAirline: f.operatingAirline,
            depTerminal: f.depTerminal, arrTerminal: f.arrTerminal,
            basePrice: f.basePrice, stopsCount: f.stopsCount,
          }));
          setFlights(mapped);
        } else {
          setFlights([]);
        }
        setLoadingFlights(false);
      }).catch(() => setLoadingFlights(false));
  };

  const fetchFromAirport = (airportCode: string) => {
    setSelectedAirportFilter(airportCode);
    if (!airportCode && !selectedArrAirportFilter) { fetchFlights(); return; }
    fetchWithAirports(airportCode, selectedArrAirportFilter);
  };

  const fetchToAirport = (airportCode: string) => {
    setSelectedArrAirportFilter(airportCode);
    if (!airportCode && !selectedAirportFilter) { fetchFlights(); return; }
    fetchWithAirports(selectedAirportFilter, airportCode);
  };

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


  const filterMeta = useMemo(() => {
    if (flights.length === 0) return null;
    const prices = flights.map(f => f.pricePerAdult);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    // Stops: count flights per stop level + cheapest per stop
    const stopsMap = new Map<number, { count: number; cheapest: number }>();
    flights.forEach(f => {
      const sc = f.stopsCount ?? (f.stops === 'Nonstop' ? 0 : parseInt(String(f.stops)) || 0);
      const existing = stopsMap.get(sc);
      if (!existing) stopsMap.set(sc, { count: 1, cheapest: f.pricePerAdult });
      else { existing.count++; if (f.pricePerAdult < existing.cheapest) existing.cheapest = f.pricePerAdult; }
    });
    // Airlines: cheapest per airline
    const airlinesMap = new Map<string, { code: string; name: string; cheapest: number; count: number }>();
    flights.forEach(f => {
      const existing = airlinesMap.get(f.airlineCode);
      if (!existing) airlinesMap.set(f.airlineCode, { code: f.airlineCode, name: f.airline, cheapest: f.pricePerAdult, count: 1 });
      else { existing.count++; if (f.pricePerAdult < existing.cheapest) existing.cheapest = f.pricePerAdult; }
    });
    return { minPrice, maxPrice, stopsMap, airlinesMap };
  }, [flights]);

  const sortedFlights = useMemo(() => {
    let filtered = [...flights];
    if (filterStops.size > 0) {
      filtered = filtered.filter(f => {
        const sc = f.stopsCount ?? (f.stops === 'Nonstop' ? 0 : parseInt(String(f.stops)) || 0);
        return filterStops.has(sc) || (filterStops.has(2) && sc >= 2);
      });
    }
    if (filterAirlines.size > 0) {
      filtered = filtered.filter(f => filterAirlines.has(f.airlineCode));
    }
    if (filterDepTime.size > 0) {
      filtered = filtered.filter(f => {
        const h = parseInt(f.departure?.split(':')[0] || '0');
        if (h >= 6 && h < 12) return filterDepTime.has('morning');
        if (h >= 12 && h < 18) return filterDepTime.has('afternoon');
        if (h >= 18 && h < 22) return filterDepTime.has('evening');
        return filterDepTime.has('night');
      });
    }
    return filtered.sort((a, b) =>
      flightSort === 'price' ? a.pricePerAdult - b.pricePerAdult : (a.durationMin || parseDurationMin(a.duration)) - (b.durationMin || parseDurationMin(b.duration))
    );
  }, [flights, flightSort, filterStops, filterAirlines, filterDepTime]);

  const flightBadges = useMemo(() => {
    const badges = new Map<string, string>();
    if (sortedFlights.length === 0) return badges;
    const byPrice = [...sortedFlights].sort((a, b) => a.pricePerAdult - b.pricePerAdult);
    const bySpeed = [...sortedFlights].sort((a, b) => (a.durationMin || 9999) - (b.durationMin || 9999));
    if (byPrice[0]) badges.set(byPrice[0].id, 'Cheapest');
    if (bySpeed[0] && !badges.has(bySpeed[0].id)) badges.set(bySpeed[0].id, 'Fastest');
    const bestNonstop = sortedFlights.filter(f => f.stopsCount === 0 || f.stops === 'Nonstop').sort((a, b) => a.pricePerAdult - b.pricePerAdult)[0];
    if (bestNonstop && !badges.has(bestNonstop.id)) badges.set(bestNonstop.id, 'Best Direct');
    return badges;
  }, [sortedFlights]);

  const sortedTrains = useMemo(() => [...trains].sort((a, b) =>
    trainSort === 'price' ? a.price - b.price : (a.durationSeconds || 0) - (b.durationSeconds || 0)
  ), [trains, trainSort]);

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
          className="fixed inset-0 z-50 bg-bg-surface/95 backdrop-blur-sm flex flex-col">
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Compare transport options"
            className="flex-1 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-4 md:px-8 pt-4 pb-3 border-b border-border-subtle flex-shrink-0">
              <div className="flex items-center gap-4 mb-3">
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-accent-cyan transition-colors flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="flex-1">
                  <h2 className="font-display font-bold text-base text-text-primary">{fromCity} &rarr; {toCity}</h2>
                  <p className="text-[10px] text-text-muted font-body">{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} &middot; {adults} pax</p>
                </div>
              </div>

              {/* Transport tabs — single scrollable row */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1" role="tablist" aria-label="Transport type">
                {[...PRIMARY_TABS, ...SECONDARY_TABS].map(t => {
                  const avail = availability[t.id];
                  const isActive = tab === t.id;
                  const isPrimary = PRIMARY_TABS.some(p => p.id === t.id);
                  return (
                    <button key={t.id} onClick={() => avail && setTab(t.id)}
                      role="tab" aria-selected={isActive}
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
            <div className="flex-1 overflow-y-auto">

              {/* ── CUSTOM TRANSPORT (shared across flight/train tabs) ── */}
              {(tab === 'flight' || tab === 'train') && (
                <div className="p-4 md:px-8 max-w-4xl mx-auto w-full pb-0">
                  <input ref={transportFileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleTransportUpload(f); e.target.value = ''; }} />
                  {!showCustomForm ? (
                    <div className="flex gap-2 mb-3">
                      <button onClick={() => setShowCustomForm(true)}
                        className="flex-1 text-left p-2.5 rounded-xl border border-dashed border-accent-cyan/40 hover:border-accent-cyan hover:bg-accent-cyan/5 transition-all flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs font-display font-bold text-text-primary">Add your own {tab === 'flight' ? 'flight' : 'train'}</p>
                          <p className="text-[9px] text-text-muted font-body">Already booked? Enter details manually</p>
                        </div>
                      </button>
                      <button onClick={() => { setShowCustomForm(true); setTimeout(() => transportFileRef.current?.click(), 100); }}
                        className="w-32 p-2.5 rounded-xl border border-dashed border-accent-gold/40 hover:border-accent-gold hover:bg-accent-gold/5 transition-all flex flex-col items-center justify-center gap-1 text-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p className="text-[9px] font-display font-bold text-text-primary">Upload booking</p>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 space-y-2.5 mb-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-display font-bold text-text-primary">Add your own {tab === 'flight' ? 'flight' : 'train'}</p>
                        <button onClick={resetCustomForm} className="text-text-muted hover:text-text-primary text-sm">&times;</button>
                      </div>
                      {/* Upload button inside form */}
                      {uploadExtracting ? (
                        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-accent-gold/5 border border-accent-gold/20">
                          <div className="w-4 h-4 border-2 border-accent-gold/30 border-t-accent-gold rounded-full animate-spin flex-shrink-0" />
                          <p className="text-[10px] font-display font-semibold text-text-primary">Reading booking...</p>
                        </div>
                      ) : (
                        <button onClick={() => transportFileRef.current?.click()}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-accent-gold/40 hover:border-accent-gold hover:bg-accent-gold/5 transition-all text-left">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold flex-shrink-0">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          <p className="text-[10px] font-body text-text-secondary">Upload ticket screenshot or PDF to auto-fill</p>
                        </button>
                      )}
                      {uploadError && <p className="text-[10px] text-red-500 font-body">{uploadError}</p>}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border-subtle" />
                        <span className="text-[8px] text-text-muted font-body">or enter manually</span>
                        <div className="flex-1 h-px bg-border-subtle" />
                      </div>
                      {/* Departure + arrival hubs */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">From {tab === 'flight' ? 'airport' : 'station'}</label>
                          <input type="text" placeholder={tab === 'flight' ? 'e.g., Mumbai Airport (BOM)' : 'e.g., Amsterdam Centraal'}
                            value={customFromHub} onChange={e => setCustomFromHub(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-body outline-none focus:border-accent-cyan" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">To {tab === 'flight' ? 'airport' : 'station'}</label>
                          <input type="text" placeholder={tab === 'flight' ? 'e.g., Schiphol Airport (AMS)' : 'e.g., Brugge Station'}
                            value={customToHub} onChange={e => setCustomToHub(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-body outline-none focus:border-accent-cyan" />
                        </div>
                      </div>
                      {/* Carrier + number + codes */}
                      <div className="flex gap-2">
                        <input type="text" placeholder={tab === 'flight' ? 'Airline (e.g., IndiGo)' : 'Operator (e.g., SNCF)'}
                          value={customCarrier} onChange={e => setCustomCarrier(e.target.value)}
                          className="flex-1 bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-body outline-none focus:border-accent-cyan" />
                        <input type="text" placeholder={tab === 'flight' ? 'Flight # (e.g., 6E-21)' : 'Train # (e.g., TGV 123)'}
                          value={customNumber} onChange={e => setCustomNumber(e.target.value)}
                          className="w-28 bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan" />
                        {tab === 'flight' && (
                          <>
                            <input type="text" placeholder="From code" maxLength={3}
                              value={customFromCode} onChange={e => setCustomFromCode(e.target.value.toUpperCase())}
                              className="w-16 bg-bg-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan text-center uppercase" />
                            <input type="text" placeholder="To code" maxLength={3}
                              value={customToCode} onChange={e => setCustomToCode(e.target.value.toUpperCase())}
                              className="w-16 bg-bg-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan text-center uppercase" />
                          </>
                        )}
                      </div>
                      {/* Times + duration + stops */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">Departure</label>
                          <input type="time" value={customDep} onChange={e => setCustomDep(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-cyan" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">Arrival</label>
                          <input type="time" value={customArr} onChange={e => setCustomArr(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-cyan" />
                        </div>
                        <div className="w-24">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">Duration</label>
                          <input type="text" placeholder="e.g., 9h 5m" value={customDuration} onChange={e => setCustomDuration(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan" />
                        </div>
                        <div className="w-24">
                          <label className="text-[8px] text-text-muted font-body block mb-0.5">Stops</label>
                          <select value={customStops} onChange={e => setCustomStops(e.target.value)}
                            className="w-full bg-bg-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary font-body outline-none focus:border-accent-cyan">
                            <option value="Nonstop">Direct</option>
                            <option value="1 stop">1 stop</option>
                            <option value="2 stops">2 stops</option>
                          </select>
                        </div>
                      </div>
                      {/* Price + submit */}
                      <div className="flex gap-2">
                        <input type="number" placeholder="Total price (e.g., 25000)" min="0"
                          value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                          className="flex-1 bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan" />
                        <button onClick={tab === 'flight' ? handleCustomFlight : handleCustomTrain}
                          disabled={!customCarrier.trim() || !customDep || !customArr}
                          className="px-4 py-1.5 bg-accent-cyan text-white font-display font-bold text-xs rounded-lg hover:bg-accent-cyan/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                          Add {tab === 'flight' ? 'Flight' : 'Train'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[8px] text-text-muted font-body">Enter total price for all passengers. Enter 0 for pre-booked.</p>
                        {(ticketAdults > 0 || ticketChildren > 0 || ticketInfants > 0) && (
                          <p className="text-[8px] text-accent-cyan font-body font-semibold">
                            Detected: {ticketAdults} adult{ticketAdults !== 1 ? 's' : ''}
                            {ticketChildren > 0 && `, ${ticketChildren} child${ticketChildren !== 1 ? 'ren' : ''}`}
                            {ticketInfants > 0 && `, ${ticketInfants} infant${ticketInfants !== 1 ? 's' : ''}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FLIGHTS ── */}
              {tab === 'flight' && (
                <div className="p-4 md:px-8 max-w-4xl mx-auto w-full pt-0">
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

                  {sameAirport ? (
                    <div className="text-center py-12">
                      <p className="text-2xl mb-2">🚗</p>
                      <p className="text-text-primary text-sm font-display font-bold">Same airport region ({fromCode})</p>
                      <p className="text-text-muted text-xs font-body mt-1">{fromCity} and {toCity} share the same airport — use Drive, Bus, or Train instead</p>
                    </div>
                  ) : nearbyAirportPrompt && !userAcceptedNearby && !selectedFlight ? null : loadingFlights ? (
                    <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" /><span className="text-text-muted text-sm ml-3">Searching flights{selectedAirportFilter ? ` from ${selectedAirportFilter}` : ''}{selectedArrAirportFilter ? ` to ${selectedArrAirportFilter}` : ''}...</span></div>
                  ) : flights.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-text-muted text-sm">{(selectedAirportFilter || selectedArrAirportFilter) ? `No flights found${selectedAirportFilter ? ` from ${selectedAirportFilter}` : ''}${selectedArrAirportFilter ? ` to ${selectedArrAirportFilter}` : ''}` : 'No flights found for this route'}</p>
                      {(() => {
                        const tripDate = new Date(date);
                        const now = new Date();
                        const monthsAhead = (tripDate.getFullYear() - now.getFullYear()) * 12 + (tripDate.getMonth() - now.getMonth());
                        if (monthsAhead > 10) {
                          return <p className="text-text-muted text-[10px] mt-2 max-w-xs mx-auto">Airlines typically publish schedules only 10-11 months in advance. Your travel date is {monthsAhead} months away — try a closer date to see available flights.</p>;
                        }
                        if (selectedAirportFilter || selectedArrAirportFilter) {
                          return <p className="text-text-muted text-[10px] mt-1">Try selecting a different airport above</p>;
                        }
                        return <p className="text-text-muted text-[10px] mt-1">Try a different date or check nearby airports</p>;
                      })()}
                    </div>
                  ) : null}

                  {/* Filter sidebar + flight list */}
                  {(flights.length > 0 || nearbyAirports.length > 0) && (userAcceptedNearby || !nearbyAirportPrompt) && (
                    <div className="flex gap-0">
                      {/* Desktop filter sidebar */}
                      {flights.length >= 3 && filterMeta && (
                        <div className="hidden md:block w-[190px] flex-shrink-0 border-r border-border-subtle pr-3 pl-1 py-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-display font-bold text-text-primary">Filters</h3>
                            {(filterStops.size > 0 || filterAirlines.size > 0 || filterDepTime.size > 0) && (
                              <button onClick={() => { setFilterStops(new Set()); setFilterAirlines(new Set()); setFilterDepTime(new Set()); }}
                                className="text-[9px] text-accent-gold font-body hover:underline">Clear all</button>
                            )}
                          </div>

                          {/* Stops */}
                          <div className="mb-3">
                            <p className="text-[10px] font-display font-bold text-text-secondary mb-1">Stops</p>
                            <div className="space-y-1">
                              {Array.from(filterMeta.stopsMap.entries()).sort((a, b) => a[0] - b[0]).map(([stops, info]) => (
                                <label key={stops} className="flex items-center justify-between cursor-pointer group">
                                  <span className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={filterStops.has(stops)}
                                      onChange={() => { const ns = new Set(filterStops); ns.has(stops) ? ns.delete(stops) : ns.add(stops); setFilterStops(ns); }}
                                      className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-cyan" />
                                    <span className="text-[10px] font-body text-text-primary group-hover:text-accent-cyan">{stops === 0 ? 'Direct' : stops === 1 ? '1 stop' : `${stops}+ stops`}</span>
                                  </span>
                                  <span className="text-[9px] font-mono text-text-muted">{formatPrice(info.cheapest, currency)}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Airlines */}
                          <div className="mb-3">
                            <p className="text-[10px] font-display font-bold text-text-secondary mb-1">Airlines</p>
                            <div className="space-y-1 max-h-[120px] overflow-y-auto">
                              {Array.from(filterMeta.airlinesMap.values()).sort((a, b) => a.cheapest - b.cheapest).map(al => (
                                <label key={al.code} className="flex items-center justify-between cursor-pointer group">
                                  <span className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={filterAirlines.size === 0 || filterAirlines.has(al.code)}
                                      onChange={() => {
                                        const ns = new Set(filterAirlines);
                                        if (ns.size === 0) { Array.from(filterMeta.airlinesMap.keys()).forEach(k => { if (k !== al.code) ns.add(k); }); }
                                        else if (ns.has(al.code)) { ns.delete(al.code); if (ns.size === 0) { /* all unchecked = show all */ } }
                                        else ns.add(al.code);
                                        setFilterAirlines(ns);
                                      }}
                                      className="w-3.5 h-3.5 rounded border-border-subtle accent-accent-cyan" />
                                    <span className="text-[10px] font-body text-text-primary group-hover:text-accent-cyan truncate max-w-[90px]">{al.name}</span>
                                  </span>
                                  <span className="text-[9px] font-mono text-text-muted">{formatPrice(al.cheapest, currency)}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Departure time */}
                          <div className="mb-3">
                            <p className="text-[10px] font-display font-bold text-text-secondary mb-1">Departure time</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { key: 'morning', label: 'Morning', sub: '6am-12pm' },
                                { key: 'afternoon', label: 'Afternoon', sub: '12-6pm' },
                                { key: 'evening', label: 'Evening', sub: '6-10pm' },
                                { key: 'night', label: 'Night', sub: '10pm-6am' },
                              ].map(t => (
                                <button key={t.key}
                                  onClick={() => { const ns = new Set(filterDepTime); ns.has(t.key) ? ns.delete(t.key) : ns.add(t.key); setFilterDepTime(ns); }}
                                  className={`px-2 py-1.5 rounded-lg border text-center transition-all ${filterDepTime.has(t.key) ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-border-subtle bg-bg-card text-text-secondary hover:border-accent-cyan/30'}`}>
                                  <p className="text-[9px] font-display font-bold">{t.label}</p>
                                  <p className="text-[8px] font-mono text-text-muted">{t.sub}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Airport dropdowns in sidebar */}
                          {nearbyAirports.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[10px] font-display font-bold text-text-secondary mb-1.5">From airport</p>
                              <select value={selectedAirportFilter} onChange={e => fetchFromAirport(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary outline-none focus:border-accent-cyan">
                                <option value="">All nearby</option>
                                {nearbyAirports.filter(ap => ap.code.toUpperCase() !== (selectedArrAirportFilter || toCode || '').toUpperCase()).map(ap => (
                                  <option key={ap.code} value={ap.code}>{ap.city} ({ap.code}) {Math.round(ap.distance)}km</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {nearbyArrAirports.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[10px] font-display font-bold text-text-secondary mb-1.5">To airport</p>
                              <select value={selectedArrAirportFilter} onChange={e => fetchToAirport(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary outline-none focus:border-accent-cyan">
                                <option value="">All nearby</option>
                                {nearbyArrAirports.filter(ap => ap.code.toUpperCase() !== (selectedAirportFilter || fromCode || '').toUpperCase()).map(ap => (
                                  <option key={ap.code} value={ap.code}>{ap.city} ({ap.code}) {Math.round(ap.distance)}km</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Flight list */}
                      <div className="flex-1 min-w-0 pl-3 md:pl-4">
                        {/* Sort row + mobile filter toggle */}
                        <div className="mb-3 flex items-center gap-2 flex-wrap">
                          <div className="flex rounded-lg overflow-hidden border border-border-subtle flex-shrink-0">
                            <button onClick={() => setFlightSort('price')} className={`px-3 py-1.5 text-[10px] font-display font-bold transition-all ${flightSort === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Cheapest</button>
                            <button onClick={() => setFlightSort('shortest')} className={`px-3 py-1.5 text-[10px] font-display font-bold transition-all ${flightSort === 'shortest' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>Fastest</button>
                          </div>
                          {flights.length >= 3 && (
                            <button onClick={() => setShowFilters(!showFilters)}
                              className="md:hidden px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-display font-bold text-text-secondary">
                              Filters{(filterStops.size + filterAirlines.size + filterDepTime.size) > 0 ? ` (${filterStops.size + filterAirlines.size + filterDepTime.size})` : ''}
                            </button>
                          )}
                          {/* Mobile airport dropdowns */}
                          <div className="flex gap-2 md:hidden flex-wrap">
                            {nearbyAirports.length > 0 && (
                              <select value={selectedAirportFilter} onChange={e => fetchFromAirport(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary outline-none focus:border-accent-cyan">
                                <option value="">From: Nearby</option>
                                {nearbyAirports.filter(ap => ap.code.toUpperCase() !== (selectedArrAirportFilter || toCode || '').toUpperCase()).map(ap => (
                                  <option key={ap.code} value={ap.code}>{ap.city} ({ap.code})</option>
                                ))}
                              </select>
                            )}
                            {nearbyArrAirports.length > 0 && (
                              <select value={selectedArrAirportFilter} onChange={e => fetchToAirport(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary outline-none focus:border-accent-cyan">
                                <option value="">To: Nearby</option>
                                {nearbyArrAirports.filter(ap => ap.code.toUpperCase() !== (selectedAirportFilter || fromCode || '').toUpperCase()).map(ap => (
                                  <option key={ap.code} value={ap.code}>{ap.city} ({ap.code})</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        {/* Mobile collapsible filters */}
                        {showFilters && flights.length >= 3 && filterMeta && (
                          <div className="md:hidden mb-4 p-3 bg-bg-card rounded-xl border border-border-subtle space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-display font-bold text-text-secondary">Stops</span>
                              <div className="flex gap-1">
                                {Array.from(filterMeta.stopsMap.entries()).sort((a, b) => a[0] - b[0]).map(([stops]) => (
                                  <button key={stops} onClick={() => { const ns = new Set(filterStops); ns.has(stops) ? ns.delete(stops) : ns.add(stops); setFilterStops(ns); }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-display font-bold transition-all ${filterStops.has(stops) ? 'bg-accent-cyan text-white' : 'bg-primary border border-border-subtle text-text-secondary'}`}>
                                    {stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-display font-bold text-text-secondary">Departure</span>
                              <div className="flex gap-1 mt-1">
                                {[{ key: 'morning', label: '6am-12pm' }, { key: 'afternoon', label: '12-6pm' }, { key: 'evening', label: '6-10pm' }, { key: 'night', label: '10pm-6am' }].map(t => (
                                  <button key={t.key} onClick={() => { const ns = new Set(filterDepTime); ns.has(t.key) ? ns.delete(t.key) : ns.add(t.key); setFilterDepTime(ns); }}
                                    className={`px-2 py-1 rounded-md text-[8px] font-mono transition-all ${filterDepTime.has(t.key) ? 'bg-accent-cyan text-white' : 'bg-primary border border-border-subtle text-text-secondary'}`}>
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-display font-bold text-text-secondary">Airlines</span>
                              <div className="flex gap-1 flex-wrap mt-1">
                                {Array.from(filterMeta.airlinesMap.values()).sort((a, b) => a.cheapest - b.cheapest).map(al => (
                                  <button key={al.code} onClick={() => {
                                    const ns = new Set(filterAirlines);
                                    if (ns.size === 0) { Array.from(filterMeta.airlinesMap.keys()).forEach(k => { if (k !== al.code) ns.add(k); }); }
                                    else if (ns.has(al.code)) { ns.delete(al.code); if (ns.size === 0) { /* all unchecked = show all */ } }
                                    else ns.add(al.code);
                                    setFilterAirlines(ns);
                                  }}
                                    className={`px-2 py-1 rounded-md text-[8px] font-display font-bold transition-all ${filterAirlines.size === 0 || filterAirlines.has(al.code) ? 'bg-accent-cyan text-white' : 'bg-primary border border-border-subtle text-text-secondary'}`}>
                                    {al.code}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {(filterStops.size > 0 || filterAirlines.size > 0 || filterDepTime.size > 0) && (
                              <button onClick={() => { setFilterStops(new Set()); setFilterAirlines(new Set()); setFilterDepTime(new Set()); }}
                                className="text-[9px] text-accent-gold font-body hover:underline">Clear all filters</button>
                            )}
                          </div>
                        )}

                        {/* Flight count */}
                        <p className="text-text-muted text-[10px] font-body mb-2">{sortedFlights.length} of {flights.length} flights</p>

                        {/* Flight cards */}
                        {sortedFlights.length === 0 ? (
                          <p className="text-text-muted text-sm text-center py-8 font-body">No flights match your filters. Try adjusting above.</p>
                        ) : (
                          <div className="space-y-2">
                            {sortedFlights.map(f => {
                              const badge = flightBadges.get(f.id);
                              const isSelected = selectedFlight?.id === f.id;
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
                                <button key={f.id} onClick={() => {
                                  const airportInfo = selectedAirportFilter ? nearbyAirports.find(a => a.code === selectedAirportFilter) : undefined;
                                  onSelectFlight(f, airportInfo ? { fromCode: airportInfo.code, fromCity: airportInfo.city, fromDistance: airportInfo.distance } : undefined);
                                }}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all relative ${isSelected ? 'bg-accent-cyan/10 border-accent-cyan' : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'}`}>
                                  {/* Badge */}
                                  {badge && !isSelected && (
                                    <span className={`absolute -top-2 left-3 px-2 py-0.5 text-white text-[9px] font-display font-bold rounded-full ${badge === 'Cheapest' ? 'bg-accent-gold' : badge === 'Fastest' ? 'bg-blue-500' : 'bg-accent-cyan'}`}>{badge}</span>
                                  )}
                                  {/* Row 1: Airline + price */}
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-mono font-bold" style={{ backgroundColor: f.color }}>{f.airlineCode}</div>
                                      <div>
                                        <p className="text-sm font-display font-bold text-text-primary">{f.airline} {f.flightNumber}</p>
                                        <p className="text-[10px] text-text-muted">
                                          {f.cabinClass ? f.cabinClass.charAt(0) + f.cabinClass.slice(1).toLowerCase().replace('_', ' ') : 'Economy'}
                                          {f.aircraft && <span className="ml-1 text-text-secondary">&middot; {f.aircraft}</span>}
                                        </p>
                                        {f.operatingAirline && <p className="text-[9px] text-amber-600 font-body">Operated by {f.operatingAirline}</p>}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-mono font-bold text-accent-cyan text-base">{formatPrice(f.pricePerAdult, currency)}</span>
                                      <p className="text-[9px] text-text-muted font-mono">/person</p>
                                    </div>
                                  </div>
                                  {/* Row 2: Time + timeline */}
                                  <div className="flex items-center gap-1 mb-2">
                                    <div className="text-left min-w-[85px]">
                                      <p className="font-mono font-bold text-base text-text-primary">
                                        {padTime(timeStr12(f.departure))}
                                        {getTimezone(f.depAirportCode || fromCode) && <span className="text-[10px] text-text-secondary font-normal ml-1">{getTimezone(f.depAirportCode || fromCode)}</span>}
                                      </p>
                                      <p className="text-[10px] text-text-secondary font-mono">{f.depAirportCode || fromCode}{f.depTerminal ? ` T${f.depTerminal}` : ''} &middot; {depDateStr}</p>
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
                                      <p className="text-[10px] text-text-secondary font-mono">{f.arrAirportCode || toCode}{f.arrTerminal ? ` T${f.arrTerminal}` : ''} &middot; {arrDateStr}</p>
                                    </div>
                                  </div>
                                  {/* Row 3: Duration + stops */}
                                  <p className="text-xs text-text-primary font-body text-center">
                                    {f.duration} &bull; {f.stops === 'Nonstop' ? 'Direct' : f.stops}
                                  </p>
                                  {/* Row 4: Baggage + booking */}
                                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border-subtle">
                                    <div className="flex items-center gap-3">
                                      {f.checkedBaggage && (
                                        <span className="flex items-center gap-1 text-[9px] text-text-secondary font-body">
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 10h12"/><path d="M10 2v8"/><path d="M14 2v8"/></svg>
                                          {f.checkedBaggage}
                                        </span>
                                      )}
                                      {f.cabinBaggage && (
                                        <span className="flex items-center gap-1 text-[9px] text-text-secondary font-body">
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
                                          {f.cabinBaggage} cabin
                                        </span>
                                      )}
                                      {!f.checkedBaggage && !f.cabinBaggage && (
                                        <span className="text-[9px] text-text-muted font-body">Baggage info N/A</span>
                                      )}
                                    </div>
                                    <a href={getFlightBookingUrl(f.depAirportCode || fromCode, f.arrAirportCode || toCode, date, adults)}
                                      target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                      className="text-accent-gold text-[9px] font-body hover:underline flex items-center gap-0.5">
                                      Book on Skyscanner
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TRAINS ── */}
              {tab === 'train' && (
                <div className="p-4 md:px-8 max-w-4xl mx-auto w-full">
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
                                {t.price > 0 ? (
                                  <>
                                    <span className="font-mono font-bold text-accent-cyan text-base">{formatPrice(t.price, currency)}</span>
                                    <span className="text-[9px] text-text-muted ml-1">est.</span>
                                  </>
                                ) : (
                                  <span className="font-mono text-text-muted text-sm">Price N/A</span>
                                )}
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
                            {/* Booking link */}
                            <a
                              href={getTrainBookingUrl(fromCity, toCity, date, fromCode, toCode)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-accent-gold text-[9px] font-body hover:underline flex items-center justify-center gap-0.5 mt-1.5 pt-1.5 border-t border-border-subtle"
                            >
                              {(() => {
                                const isIndia = ['BOM', 'DEL', 'BLR', 'MAA', 'CCU', 'HYD', 'AMD', 'PNQ', 'GOI', 'JAI', 'IDR'].some(
                                  code => fromCode.includes(code) || toCode.includes(code)
                                );
                                return isIndia ? 'Book on IRCTC' : 'Book on Trainline';
                              })()}
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
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
                <div className="p-4 md:px-8 max-w-4xl mx-auto w-full">
                  {(() => {
                    const dist = driveDistKm;
                    // Bus tab with multiple routes
                    if (tab === 'bus' && busRoutes.length > 0) {
                      return (
                        <>
                          <p className="text-text-muted text-[10px] font-body mb-2">{busRoutes.length} bus routes found</p>
                          <div className="space-y-2">
                            {busRoutes.map((t: any, idx: number) => (
                              <button key={t.id || idx} onClick={() => {
                                const asBus: TrainOption = {
                                  id: t.id || `bus-${idx}`,
                                  operator: t.operator || 'Bus',
                                  trainName: t.trainName || t.operator || 'Bus',
                                  trainNumber: t.trainNumber || '',
                                  departure: t.departure,
                                  arrival: t.arrival,
                                  duration: t.duration,
                                  stops: t.stops || 'Direct',
                                  fromStation: t.fromStation || fromCity,
                                  toStation: t.toStation || toCity,
                                  price: t.price || 0,
                                  color: t.transitSteps?.[0]?.color || '#6b7280',
                                };
                                onSelectBus(asBus);
                              }}
                                className="w-full text-left p-4 rounded-xl border transition-all bg-bg-card border-border-subtle hover:border-accent-cyan/30">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-display font-bold text-text-primary">{t.operator}</p>
                                  {t.price > 0 ? (
                                    <span className="font-mono font-bold text-accent-cyan text-base">{formatPrice(t.price, currency)}<span className="text-[9px] text-text-muted ml-0.5">est.</span></span>
                                  ) : (
                                    <span className="font-mono text-text-muted text-sm">Price N/A</span>
                                  )}
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
                      bus: { emoji: '🚌', label: 'Bus / Transit', info: null, free: false, action: () => {}, loading: busLoading, notFound: busNotFound, tooFar: false },
                      drive: { emoji: '🚗', label: 'Self Drive', info: driveInfo, free: true, action: () => onSelectDrive(driveInfo ? { ...driveInfo, mode: 'drive' } : undefined), loading: false, notFound: false, tooFar: false },
                      walk: { emoji: '🚶', label: 'Walking', info: walkInfo, free: true, action: () => onSelectDrive(walkInfo ? { ...walkInfo, mode: 'walk' } : undefined), loading: false, notFound: false, tooFar: false },
                      cycle: { emoji: '🚲', label: 'Cycling', info: cycleInfo, free: true, action: () => onSelectDrive(cycleInfo ? { ...cycleInfo, mode: 'cycle' } : undefined), loading: false, notFound: false, tooFar: false },
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

                    // Drive tab: show two options (Self Drive + Hire Cab)
                    if (tab === 'drive') {
                      const distKm = driveInfo ? parseFloat(driveInfo.distance.replace(/[^\d.]/g, '')) || 0 : 0;
                      const fuelEst = Math.round(distKm * 8);  // ~₹8/km avg fuel cost
                      const cabEst = Math.round(distKm * 18);  // ~₹18/km avg cab/Uber rate
                      return (
                        <div className="space-y-3">
                          {driveInfo ? (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-text-secondary text-sm font-mono">{driveInfo.duration}</span>
                              <span className="text-text-muted">&bull;</span>
                              <span className="text-text-secondary text-sm font-mono">{driveInfo.distance}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                              <span className="text-text-muted text-xs">Calculating route...</span>
                            </div>
                          )}
                          {/* Self Drive */}
                          <button onClick={() => onSelectDrive(driveInfo ? { ...driveInfo, mode: 'self-drive' } : undefined)}
                            className="w-full text-left p-4 rounded-xl border transition-all bg-bg-card border-border-subtle hover:border-accent-cyan/30">
                            <div className="flex items-center gap-4">
                              <span className="text-2xl">🚗</span>
                              <div className="flex-1">
                                <p className="font-display font-bold text-sm text-text-primary">Self Drive</p>
                                <p className="text-[10px] text-text-muted font-body mt-0.5">Rent a car or use your own vehicle</p>
                              </div>
                              {fuelEst > 0 && (
                                <div className="text-right">
                                  <span className="text-accent-cyan text-sm font-mono font-bold">{formatPrice(fuelEst, currency)}</span>
                                  <p className="text-[9px] text-text-muted">est. fuel</p>
                                </div>
                              )}
                            </div>
                          </button>
                          {/* Hire Cab */}
                          <button onClick={() => onSelectDrive(driveInfo ? { ...driveInfo, mode: 'cab' } : undefined)}
                            className="w-full text-left p-4 rounded-xl border transition-all bg-bg-card border-border-subtle hover:border-accent-cyan/30">
                            <div className="flex items-center gap-4">
                              <span className="text-2xl">🚕</span>
                              <div className="flex-1">
                                <p className="font-display font-bold text-sm text-text-primary">Hire Cab / Uber</p>
                                <p className="text-[10px] text-text-muted font-body mt-0.5">Book a taxi or ride-hailing service</p>
                              </div>
                              {cabEst > 0 && (
                                <div className="text-right">
                                  <span className="text-accent-cyan text-sm font-mono font-bold">{formatPrice(cabEst, currency)}</span>
                                  <p className="text-[9px] text-text-muted">est. cab</p>
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    }

                    // Walk/Cycle/Boat/Tram: single card
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
                          {(tab === 'walk' || tab === 'cycle') && <span className="text-accent-gold text-sm font-display font-bold">Free</span>}
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
