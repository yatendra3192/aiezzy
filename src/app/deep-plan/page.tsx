'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import { getDepartureHub, getArrivalHub, CITY_ATTRACTIONS } from '@/data/mockData';
import { addDaysToDate, subtractMinutes, addMinutes, getBufferMinutes, parseDurationMinutes, formatTime12, formatTime24, parseTime } from '@/lib/timeUtils';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice, getForeignToINR } from '@/lib/currency';
import { getDirections } from '@/lib/googleApi';
import dynamic from 'next/dynamic';
const ShareTripModal = dynamic(() => import('@/components/ShareTripModal'), { ssr: false });
import HotelModal from '@/components/HotelModal';
import WeatherBadge from '@/components/WeatherBadge';
import PlacePhoto from '@/components/PlacePhoto';
import DeepPlanSidebar from '@/components/deep-plan/DeepPlanSidebar';
const TransportCompareModal = dynamic(() => import('@/components/TransportCompareModal'), { ssr: false });

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
  type: 'travel' | 'explore' | 'departure' | 'arrival';
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
  arrival: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', line: 'border-violet-300', label: 'Arrival & Explore' },
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

/** Get timezone abbreviation for a city based on its country */
function getCityTimezone(country?: string): string {
  if (!country) return '';
  const info = LOCAL_INFO[country];
  if (info) {
    // Extract abbreviation (e.g., "CET +1" → "CET", "IST +5:30" → "IST")
    return info.timezone.split(' ')[0] || '';
  }
  return '';
}

/** Local info for destination countries */
const LOCAL_INFO: Record<string, { currency: string; timezone: string; emergency: string; language: string }> = {
  'Netherlands': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'Dutch' },
  'Belgium': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'FR/NL' },
  'France': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'French' },
  'Spain': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'Spanish' },
  'Italy': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'Italian' },
  'Germany': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'German' },
  'United Kingdom': { currency: 'GBP (\u00A3)', timezone: 'GMT +0', emergency: '999', language: 'English' },
  'India': { currency: 'INR (\u20B9)', timezone: 'IST +5:30', emergency: '112', language: 'Hindi/English' },
  'United States': { currency: 'USD ($)', timezone: 'EST -5', emergency: '911', language: 'English' },
  'Japan': { currency: 'JPY (\u00A5)', timezone: 'JST +9', emergency: '110', language: 'Japanese' },
  'Thailand': { currency: 'THB (\u0E3F)', timezone: 'ICT +7', emergency: '191', language: 'Thai' },
  'Australia': { currency: 'AUD ($)', timezone: 'AEST +10', emergency: '000', language: 'English' },
  'Portugal': { currency: 'EUR (\u20AC)', timezone: 'WET +0', emergency: '112', language: 'Portuguese' },
  'Greece': { currency: 'EUR (\u20AC)', timezone: 'EET +2', emergency: '112', language: 'Greek' },
  'Turkey': { currency: 'TRY (\u20BA)', timezone: 'TRT +3', emergency: '112', language: 'Turkish' },
  'UAE': { currency: 'AED', timezone: 'GST +4', emergency: '999', language: 'Arabic/English' },
  'Singapore': { currency: 'SGD ($)', timezone: 'SGT +8', emergency: '999', language: 'English' },
  'Malaysia': { currency: 'MYR (RM)', timezone: 'MYT +8', emergency: '999', language: 'Malay/English' },
  'Indonesia': { currency: 'IDR (Rp)', timezone: 'WIB +7', emergency: '112', language: 'Indonesian' },
  'Vietnam': { currency: 'VND (\u20AB)', timezone: 'ICT +7', emergency: '113', language: 'Vietnamese' },
  'South Korea': { currency: 'KRW (\u20A9)', timezone: 'KST +9', emergency: '112', language: 'Korean' },
  'China': { currency: 'CNY (\u00A5)', timezone: 'CST +8', emergency: '110', language: 'Mandarin' },
  'Mexico': { currency: 'MXN ($)', timezone: 'CST -6', emergency: '911', language: 'Spanish' },
  'Brazil': { currency: 'BRL (R$)', timezone: 'BRT -3', emergency: '190', language: 'Portuguese' },
  'Canada': { currency: 'CAD ($)', timezone: 'EST -5', emergency: '911', language: 'English/French' },
  'New Zealand': { currency: 'NZD ($)', timezone: 'NZST +12', emergency: '111', language: 'English' },
  'Switzerland': { currency: 'CHF (Fr)', timezone: 'CET +1', emergency: '112', language: 'DE/FR/IT' },
  'Austria': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'German' },
  'Czech Republic': { currency: 'CZK (K\u010D)', timezone: 'CET +1', emergency: '112', language: 'Czech' },
  'Poland': { currency: 'PLN (z\u0142)', timezone: 'CET +1', emergency: '112', language: 'Polish' },
  'Hungary': { currency: 'HUF (Ft)', timezone: 'CET +1', emergency: '112', language: 'Hungarian' },
  'Croatia': { currency: 'EUR (\u20AC)', timezone: 'CET +1', emergency: '112', language: 'Croatian' },
  'Egypt': { currency: 'EGP (\u00A3)', timezone: 'EET +2', emergency: '122', language: 'Arabic' },
  'Morocco': { currency: 'MAD', timezone: 'WET +1', emergency: '15', language: 'Arabic/French' },
  'South Africa': { currency: 'ZAR (R)', timezone: 'SAST +2', emergency: '10111', language: 'English' },
  'Sri Lanka': { currency: 'LKR (Rs)', timezone: 'IST +5:30', emergency: '119', language: 'Sinhala/Tamil' },
  'Nepal': { currency: 'NPR (Rs)', timezone: 'NPT +5:45', emergency: '100', language: 'Nepali' },
  'Maldives': { currency: 'MVR (Rf)', timezone: 'MVT +5', emergency: '119', language: 'Dhivehi' },
  'Philippines': { currency: 'PHP (\u20B1)', timezone: 'PHT +8', emergency: '911', language: 'Filipino/English' },
  'Cambodia': { currency: 'KHR/USD', timezone: 'ICT +7', emergency: '117', language: 'Khmer' },
  'Ireland': { currency: 'EUR (\u20AC)', timezone: 'GMT +0', emergency: '112', language: 'English/Irish' },
  'Scotland': { currency: 'GBP (\u00A3)', timezone: 'GMT +0', emergency: '999', language: 'English' },
  'Sweden': { currency: 'SEK (kr)', timezone: 'CET +1', emergency: '112', language: 'Swedish' },
  'Norway': { currency: 'NOK (kr)', timezone: 'CET +1', emergency: '112', language: 'Norwegian' },
  'Denmark': { currency: 'DKK (kr)', timezone: 'CET +1', emergency: '112', language: 'Danish' },
  'Finland': { currency: 'EUR (\u20AC)', timezone: 'EET +2', emergency: '112', language: 'Finnish' },
  'Russia': { currency: 'RUB (\u20BD)', timezone: 'MSK +3', emergency: '112', language: 'Russian' },
  'Argentina': { currency: 'ARS ($)', timezone: 'ART -3', emergency: '911', language: 'Spanish' },
  'Colombia': { currency: 'COP ($)', timezone: 'COT -5', emergency: '123', language: 'Spanish' },
  'Peru': { currency: 'PEN (S/)', timezone: 'PET -5', emergency: '105', language: 'Spanish' },
  'Chile': { currency: 'CLP ($)', timezone: 'CLT -4', emergency: '131', language: 'Spanish' },
};

/** Category-based card styles for activity cards */
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
  const shareToken = searchParams.get('shareToken');
  const isReadOnly = !!shareToken;
  const trip = useTrip();
  const { currency, setCurrency } = useCurrency();
  const [isRestoring, setIsRestoring] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [viewingBooking, setViewingBooking] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadContextRef = useRef<{ cities: string[]; docType: 'hotel' | 'transport' }>({ cities: [], docType: 'transport' });
  const handleUploadBooking = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !trip.tripId) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tripId', trip.tripId);
      fd.append('matchCities', uploadContextRef.current.cities.join(','));
      const res = await fetch('/api/booking-docs', { method: 'POST', body: fd });
      if (res.ok) {
        const doc = await res.json();
        doc.docType = uploadContextRef.current.docType;
        doc.matchCities = uploadContextRef.current.cities;
        trip.addBookingDoc(doc);
      }
    } catch { /* continue */ }
    if (uploadRef.current) uploadRef.current.value = '';
  };
  const triggerUpload = (cities: string[], docType: 'hotel' | 'transport') => {
    uploadContextRef.current = { cities, docType };
    uploadRef.current?.click();
  };

  // Deep plan data from context (persisted to DB)
  const deepPlan = trip.deepPlanData || { customActivities: {}, dayNotes: {}, dayStartTimes: {} };
  const [dayStartTimes, setDayStartTimesLocal] = useState<Record<number, string>>(deepPlan.dayStartTimes || {});
  const [customActivities, setCustomActivitiesLocal] = useState<Record<number, Array<{name: string; time: string}>>>(deepPlan.customActivities || {});
  const [dayNotes, setDayNotesLocal] = useState<Record<number, string>>(deepPlan.dayNotes || {});
  // UI-only state (not persisted)
  const [showActivityInput, setShowActivityInput] = useState<Record<number, boolean>>({});
  const [activityInputText, setActivityInputText] = useState<Record<number, string>>({});
  const [activityInputTime, setActivityInputTime] = useState<Record<number, string>>({});
  const [placeSuggestions, setPlaceSuggestions] = useState<Record<number, Array<{ name: string; description: string }>>>({});
  const [editingTimeKey, setEditingTimeKey] = useState<string | null>(null);
  const [showDayNotes, setShowDayNotes] = useState<Record<number, boolean>>({});
  // Collapsible days: Record<dayNumber, boolean> — multiple can be open
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 1: true });
  const [allExpanded, setAllExpanded] = useState(false);
  const isDayExpanded = (dayNum: number) => allExpanded || !!expandedDays[dayNum];
  const toggleDay = (dayNum: number) => {
    setExpandedDays(prev => ({ ...prev, [dayNum]: !prev[dayNum] }));
  };
  // For nav chip clicks: expand that day (don't collapse others)
  const expandAndScrollTo = (dayNum: number) => {
    setExpandedDays(prev => ({ ...prev, [dayNum]: true }));
    setTimeout(() => { document.getElementById(`day-${dayNum}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };
  // Expand all days before printing, restore after
  useEffect(() => {
    const handleBeforePrint = () => setAllExpanded(true);
    const handleAfterPrint = () => setAllExpanded(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => { window.removeEventListener('beforeprint', handleBeforePrint); window.removeEventListener('afterprint', handleAfterPrint); };
  }, []);
  // AI activity loading state (Record<string, boolean> — not Set, avoids downlevelIteration)
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const aiFetchedRef = useRef<Record<string, boolean>>({});
  // Inter-activity travel times: key = "from→to@city"
  const [travelBetween, setTravelBetween] = useState<Record<string, {
    selected: string;
    walk?: { duration: string; distance: string };
    transit?: { duration: string; distance: string };
    drive?: { duration: string; distance: string };
    _fetched?: boolean;
  }>>({});
  const travelFetchedRef = useRef<Record<string, boolean>>({});
  const [openTravelDropdown, setOpenTravelDropdown] = useState<string | null>(null);
  // Activity action menu (three-dot)
  const [openActivityMenu, setOpenActivityMenu] = useState<string | null>(null);
  // Close activity menu on click outside
  useEffect(() => {
    if (!openActivityMenu) return;
    const handleClick = () => setOpenActivityMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openActivityMenu]);
  // Drag-reorder: overridden activity order per day (day number → ordered stop IDs)
  const [activityOrder, setActivityOrderLocal] = useState<Record<number, string[]>>(deepPlan.activityOrder || {});
  const setActivityOrder = (updater: Record<number, string[]> | ((prev: Record<number, string[]>) => Record<number, string[]>)) => {
    setActivityOrderLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ activityOrder: next });
      return next;
    });
  };
  // Persisted: removed activities + edited times for meals/hotel/overnight
  const [removedActivities, setRemovedActivitiesLocal] = useState<Record<string, string[]>>(deepPlan.removedActivities || {});
  const [editedTimes, setEditedTimesLocal] = useState<Record<string, string>>(deepPlan.editedTimes || {});
  const setRemovedActivities = (updater: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) => {
    setRemovedActivitiesLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ removedActivities: next });
      return next;
    });
  };
  const setEditedTimes = (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setEditedTimesLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      trip.updateDeepPlanData({ editedTimes: next });
      return next;
    });
  };

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

  // Restore trip from URL param, share token, context, or sessionStorage on page reload
  useEffect(() => {
    if (trip.destinations.length > 0 && !shareToken) return;
    if (shareToken) {
      // Load trip via public shared API (no auth needed)
      setIsRestoring(true);
      fetch(`/api/trips/shared/${shareToken}`)
        .then(res => { if (!res.ok) throw new Error('Shared trip not found'); return res.json(); })
        .then(data => { trip.loadTripFromData(data); })
        .catch(() => {})
        .finally(() => setIsRestoring(false));
      return;
    }
    const idToLoad = urlTripId || trip.tripId || (() => { try { return sessionStorage.getItem('currentTripId'); } catch { return null; } })();
    if (idToLoad) {
      setIsRestoring(true);
      trip.loadTrip(idToLoad).catch(() => {}).finally(() => setIsRestoring(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local state when trip context loads deep plan data (always sync, even empty)
  useEffect(() => {
    setCustomActivitiesLocal(deepPlan.customActivities || {});
    setDayNotesLocal(deepPlan.dayNotes || {});
    setDayStartTimesLocal(deepPlan.dayStartTimes || {});
    setActivityOrderLocal((deepPlan as any).activityOrder || {});
    setRemovedActivitiesLocal(deepPlan.removedActivities || {});
    setEditedTimesLocal(deepPlan.editedTimes || {});
  }, [trip.tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: persist ALL changes to DB (5s debounce)
  const deepPlanSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepPlanStableRef = useRef(false);
  // Mark stable after 2s (skip initial load changes)
  useEffect(() => {
    const t = setTimeout(() => { deepPlanStableRef.current = true; }, 2000);
    return () => clearTimeout(t);
  }, []);
  // Watch for deepPlanData changes and auto-save
  const deepPlanJSON = JSON.stringify(trip.deepPlanData || {});
  useEffect(() => {
    if (isReadOnly || !deepPlanStableRef.current || !trip.tripId) return;
    if (deepPlanSaveTimerRef.current) clearTimeout(deepPlanSaveTimerRef.current);
    deepPlanSaveTimerRef.current = setTimeout(() => {
      trip.saveTrip().catch(() => {});
    }, 3000);
    return () => { if (deepPlanSaveTimerRef.current) clearTimeout(deepPlanSaveTimerRef.current); };
  }, [deepPlanJSON]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset autoFillRanRef when tripId changes so AI activities are fetched for the new trip
  useEffect(() => {
    autoFillRanRef.current = false;
  }, [trip.tripId]);

  // Fetch AI activities for cities not in static CITY_ATTRACTIONS and not already cached
  const fetchAiActivities = useCallback(async (cityName: string, country: string, days: number, userPlaces: string[], hotel?: string, timeWindows?: Array<{ dayIndex: number; date: string; slots: Array<{ from: string; to: string; label: string }> }>, cancelledRef?: { current: boolean }) => {
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
        body: JSON.stringify({ city: cityName, country, days, userPlaces, month: monthName, hotel, timeWindows }),
      });
      // Check cancellation before applying state — prevents stale data from merging into a different trip
      if (cancelledRef?.current) return;
      if (res.ok) {
        const data = await res.json();
        if (cancelledRef?.current) return;
        if (data.activities?.length > 0) {
          // updateDeepPlanData deep-merges nested Records, safe for parallel calls
          const updates: Record<string, any> = { cityActivities: { [cityName]: data.activities }, cacheGeneratedAt: new Date().toISOString().split('T')[0] };
          if (data.dayThemes?.length > 0) updates.dayThemes = { [cityName]: data.dayThemes };
          if (data.mealCosts) updates.mealCosts = { [cityName]: data.mealCosts };
          if (data.localTransport) updates.localTransport = { [cityName]: data.localTransport };
          trip.updateDeepPlanData(updates);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch AI activities for ${cityName}:`, err);
    } finally {
      setAiLoading(prev => ({ ...prev, [cityName]: false }));
    }
  }, [trip.departureDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill progress state
  const [autoFillProgress, setAutoFillProgress] = useState<{ total: number; done: number; current: string; cities: Array<{ name: string; done: boolean }> } | null>(null);
  const autoFillRanRef = useRef(false);

  // On mount / trip load: auto-fetch AI activities ONLY for cities with NO cached data
  useEffect(() => {
    if (isReadOnly || trip.destinations.length === 0 || autoFillRanRef.current) return;
    // Collect cities that need AI activities — only cities with ZERO cached activities
    const citiesNeeded: Array<{ cityName: string; country: string; days: number; userPlaces: string[]; hotel?: string; timeWindows?: Array<{ dayIndex: number; date: string; slots: Array<{ from: string; to: string; label: string }> }> }> = [];
    for (const dest of trip.destinations) {
      const cityName = dest.city.parentCity || dest.city.name;
      if (!cityName) continue;
      const cached = trip.deepPlanData?.cityActivities?.[cityName] || [];
      // Skip if cached AND generated after the last fix date (per-trip, not global)
      // Only regenerate trips cached before fix date (scheduling + cost display + real place names)
      const FIX_DATE = '2026-04-08';
      const cachedAt = trip.deepPlanData?.cacheGeneratedAt;
      if (cached.length > 0 && cachedAt && cachedAt >= FIX_DATE) continue;
      if (dest.nights < 1) continue;
      const exploreDays = Math.max(1, dest.nights);
      const userPlaces = dest.places?.map(p => p.name) || [];
      const hotelName = dest.selectedHotel?.name;
      // Build time windows from trip dates
      const destIdx = trip.destinations.indexOf(dest);
      const timeWindows: Array<{ dayIndex: number; date: string; slots: Array<{ from: string; to: string; label: string }> }> = [];
      for (let d = 0; d < exploreDays; d++) {
        const slots: Array<{ from: string; to: string; label: string }> = [];
        if (d === 0) {
          // Arrival day might have limited time
          slots.push({ from: '9:00 AM', to: '12:30 PM', label: 'Morning activities' });
          slots.push({ from: '1:15 PM', to: '6:30 PM', label: 'Afternoon activities' });
        } else {
          slots.push({ from: '9:00 AM', to: '12:30 PM', label: 'Morning activities' });
          slots.push({ from: '1:15 PM', to: '6:30 PM', label: 'Afternoon activities' });
        }
        timeWindows.push({ dayIndex: d, date: `Day ${d + 1}`, slots });
      }
      if (!citiesNeeded.some(c => c.cityName === cityName)) {
        citiesNeeded.push({ cityName, country: dest.city.country || '', days: exploreDays, userPlaces, hotel: hotelName, timeWindows });
        aiFetchedRef.current[cityName] = false;
      }
    }
    if (citiesNeeded.length === 0) return;
    autoFillRanRef.current = true;

    // Clear old cached data for cities that need refresh
    const existingActivities = { ...(trip.deepPlanData?.cityActivities || {}) };
    const existingMeals = { ...(trip.deepPlanData?.mealCosts || {}) };
    const existingTransport = { ...(trip.deepPlanData?.localTransport || {}) };
    for (const c of citiesNeeded) {
      delete existingActivities[c.cityName];
      delete existingMeals[c.cityName];
      delete existingTransport[c.cityName];
    }
    trip.updateDeepPlanData({ cityActivities: existingActivities, mealCosts: existingMeals, localTransport: existingTransport });

    // Show progress overlay and fetch ALL cities in parallel for speed
    const cities = citiesNeeded.map(c => ({ name: c.cityName, done: false }));
    setAutoFillProgress({ total: citiesNeeded.length, done: 0, current: 'All cities', cities });

    // Track the tripId at effect start to detect staleness
    const effectTripId = trip.tripId;
    const cancelledRef = { current: false };

    // Fire all requests in parallel — save progressively after each city completes (don't wait for all)
    const promises = citiesNeeded.map((c, i) =>
      fetchAiActivities(c.cityName, c.country, c.days, c.userPlaces, c.hotel, c.timeWindows, cancelledRef).then(() => {
        if (cancelledRef.current) return;
        setAutoFillProgress(prev => {
          if (!prev) return null;
          const updated = prev.cities.map((city, idx) => idx === i ? { ...city, done: true } : city);
          const doneCount = updated.filter(city => city.done).length;
          const nextPending = updated.find(city => !city.done);
          return { ...prev, done: doneCount, current: nextPending?.name || 'Done', cities: updated };
        });
        // Progressive save: persist each city's activities as soon as they arrive
        if (trip.tripId && trip.tripId === effectTripId) trip.saveTrip().catch(() => {});
      }).catch(() => {
        // Update progress even on failure so the overlay doesn't hang
        if (cancelledRef.current) return;
        setAutoFillProgress(prev => {
          if (!prev) return null;
          const updated = prev.cities.map((city, idx) => idx === i ? { ...city, done: true } : city);
          const doneCount = updated.filter(city => city.done).length;
          const nextPending = updated.find(city => !city.done);
          return { ...prev, done: doneCount, current: nextPending?.name || 'Done', cities: updated };
        });
      })
    );
    Promise.allSettled(promises).then(() => {
      if (cancelledRef.current) return;
      setTimeout(() => setAutoFillProgress(null), 800);
    });

    return () => { cancelledRef.current = true; };
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
    let usedArrivalActivities = new Set<string>(); // track activities used on arrival day — reset per destination

    for (let destIdx = 0; destIdx < trip.destinations.length; destIdx++) {
      usedArrivalActivities = new Set<string>(); // reset for each city — only exclude THIS city's arrival activities
      let transitDays = 0;
      const dest = trip.destinations[destIdx];
      const leg = trip.transportLegs[destIdx];
      const prevDest = destIdx > 0 ? trip.destinations[destIdx - 1] : null;
      const fromCity = destIdx === 0 ? trip.from : prevDest!.city;
      const toCity = dest.city;

      // Calculate travel day cost
      // Flights: adults + children (full fare) + infants (15% of adult fare)
      // Trains/Bus: adults + children (full fare), no infant surcharge
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

      // ── TRAVEL DAY to this destination ──
      const departureCityName = destIdx === 0 ? (trip.from.parentCity || trip.from.name) : (prevDest!.city.parentCity || prevDest!.city.name);
      const travelDay: DayPlan = {
        day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
        type: 'travel', city: toCity.parentCity || toCity.name, departureCity: departureCityName, dayCost: travelDayCost, costLabel: travelCostLabel,
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
        const startName = isFirstLeg ? (trip.fromAddress || fromCityName) : (prevDest?.selectedHotel?.name || `Stay in ${fromCityName}`);
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
        let leaveIsPrevDay = false;
        if (depTime) {
          arriveAtTerminalTime = subtractMinutes(depTime, bufferMin);
          leaveTime = subtractMinutes(arriveAtTerminalTime, toTerminalMin);
          // Detect if leave time wrapped into previous day (e.g., 06:00 - 5h = 01:00 prev day)
          const depMin = parseTime(depTime);
          const leaveMin = parseTime(leaveTime);
          if (leaveMin > depMin) leaveIsPrevDay = true; // wrapped past midnight
        }

        if (leg.type === 'flight' || leg.type === 'train' || leg.type === 'bus') {
          // Step 1: Leave starting point
          const leaveNote = leaveTime && depTime
            ? `Leave by ${formatTime12(parseTime(leaveTime))}${leaveIsPrevDay ? ' (night before)' : ''} to reach on time`
            : undefined;
          travelDay.stops.push({
            id: `dp${sc++}`, name: startName, type: startType, time: leaveTime,
            transport: { icon: 'drive', duration: realHomeToHub?.duration || `${toTerminalMin} min`, distance: toTerminalDist },
            destIndex: !isFirstLeg ? destIdx - 1 : undefined,
            note: leaveNote,
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

          // Detect overnight/multi-day arrival
          // Use arrDate vs depDate from flight data (most reliable), then fall back to hour-based check
          const sel = leg.selectedFlight || leg.selectedTrain;
          transitDays = 0;
          if (sel && depTime && arrTime) {
            const depH = parseInt(depTime.split(':')[0] || '0');
            const arrH = parseInt(arrTime.split(':')[0] || '0');
            const durMatch = (sel as any).duration?.match(/(\d+)h/);
            const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
            // Only trust isNextDay if arrDate/depDate are available and different (ignore timezone-confused flags)
            const hasReliableDateInfo = (sel as any).arrDate && (sel as any).depDate && (sel as any).arrDate !== (sel as any).depDate;
            const arrivesNextDay = hasReliableDateInfo || (arrH < depH && durHrs > 2) || (durHrs >= 24);
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
              type: 'arrival' as any, city: toCity.parentCity || toCity.name, dayCost: 0, costLabel: 'Arrival',
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
              const lateCheckIn2 = 21 * 60;
              const checkInNote2 = hotelArriveMin2 !== null
                ? (hotelArriveMin2 < stdCheckIn2 ? 'Arriving before standard check-in (3 PM) — request early check-in or leave luggage'
                  : hotelArriveMin2 >= lateCheckIn2 ? 'Late arrival — confirm late check-in with hotel and save their contact number'
                  : null)
                : null;
              arrivalDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArriveTime2, transport: null, destIndex: destIdx,
                note: checkInNote2 || undefined,
              });

              // Add activities if arriving during daytime (7 AM–6 PM) — pack the day!
              const dinnerTime2 = 19 * 60;
              const sleepTime2 = 22 * 60;
              const earliestActivity2 = 7 * 60; // Don't schedule activities before 7 AM
              if (hotelArriveMin2 !== null && hotelArriveMin2 >= earliestActivity2 && hotelArriveMin2 < dinnerTime2 - 60) {
                arrivalDay.type = 'arrival' as any;
                const freeStart2 = hotelArriveMin2 + 30;
                const freeHrs2 = (sleepTime2 - freeStart2) / 60;
                const evCityKey2 = toCity.parentCity || toCity.name;
                let cityAttr2: string[] = [];
                if (dest.places?.length) {
                  cityAttr2 = dest.places.map(p => p.name);
                } else if (trip.deepPlanData?.cityActivities?.[evCityKey2]?.length) {
                  cityAttr2 = trip.deepPlanData.cityActivities[evCityKey2].map(a => a.name);
                } else if (CITY_ATTRACTIONS[evCityKey2] || CITY_ATTRACTIONS[toCity.name]) {
                  cityAttr2 = (CITY_ATTRACTIONS[evCityKey2] || CITY_ATTRACTIONS[toCity.name])?.map(a => a.name) || [];
                }
                // Filter out user-removed activities
                const removed2 = new Set((removedActivities[evCityKey2] || []).map(n => n.toLowerCase()));
                cityAttr2 = cityAttr2.filter(n => !removed2.has(n.toLowerCase()));
                if (cityAttr2.length > 0 && freeHrs2 >= 1.5 && freeStart2 < dinnerTime2 - 60) {
                  const aiActs2 = trip.deepPlanData?.cityActivities?.[evCityKey2] || [];
                  arrivalDay.stops.push({
                    id: `dp${sc++}`, name: `Free time — ${Math.round(freeHrs2)} hours to explore ${toCity.name}`,
                    type: 'attraction', time: formatTime24(freeStart2),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    note: 'Evening exploration (optional)',
                  });
                  // Fill as many activities as fit in the free time (no cap)
                  let evCursor2 = freeStart2 + 30;
                  let addedCount2 = 0;
                  for (let ei = 0; ei < cityAttr2.length; ei++) {
                    if (evCursor2 + 30 > dinnerTime2) break; // no room for even a short activity
                    const attrName2 = cityAttr2[ei];
                    const aiD2 = aiActs2.find(a => a.name === attrName2);
                    const dur2 = aiD2?.durationMin || 60;
                    if (evCursor2 + dur2 > dinnerTime2) continue; // this one doesn't fit, try next
                    arrivalDay.stops.push({
                      id: `dp${sc++}`, name: attrName2, type: 'attraction',
                      time: formatTime24(evCursor2),
                      transport: { icon: 'walk', duration: '', distance: '' },
                      category: aiD2?.category || 'landmark', durationMin: dur2,
                      note: aiD2?.note, openingHours: aiD2?.openingHours, ticketPrice: aiD2?.ticketPrice,
                    });
                    usedArrivalActivities.add(attrName2.toLowerCase());
                    evCursor2 += dur2 + 30;
                    addedCount2++;
                  }
                  // Remove transport from last activity (before dinner)
                  if (addedCount2 > 0) {
                    const lastAct = arrivalDay.stops[arrivalDay.stops.length - 1];
                    if (lastAct.type === 'attraction') lastAct.transport = null;
                  }
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
            // Always add dinner + sleep to arrival day and keep it separate from explore days
            // Merging arrival + explore into one card created confusing 24h+ timelines
            if (!arrivalDay.stops.some(s => s.mealType === 'dinner')) {
              const arrMinCheck = arrTime ? parseTime(arrTime) : 15 * 60;
              const dinnerTimeStr = arrMinCheck >= 20 * 60 ? '21:00' : '19:00';
              arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: dinnerTimeStr, transport: null, mealType: 'dinner' });
            }
            if (!arrivalDay.stops.some(s => s.name === 'Rest / Sleep')) {
              arrivalDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
            }
            result.push(arrivalDay);
            dayNum++; // explore days always start the next calendar day
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
              // Check-in note: early (<3PM), late (>9PM), or normal
              const stdCheckIn = 15 * 60; // 3:00 PM standard
              const lateCheckIn = 21 * 60; // 9:00 PM
              const checkInNote = hotelArriveMin !== null
                ? (hotelArriveMin < stdCheckIn ? 'Arriving before standard check-in (3 PM) — request early check-in or leave luggage'
                  : hotelArriveMin >= lateCheckIn ? 'Late arrival — confirm late check-in with hotel and save their contact number'
                  : null)
                : null;
              travelDay.stops.push({
                id: `dp${sc++}`, name: dest.selectedHotel?.name || `Stay in ${toCity.name}`, type: 'hotel',
                time: hotelArriveTime, transport: null, destIndex: destIdx,
                note: checkInNote || undefined,
              });

              // Add evening activities if arriving during daytime (7 AM–6 PM) — pack the day!
              const dinnerTime = 19 * 60; // 7 PM
              const sleepTime = 22 * 60; // 10 PM
              const earliestActivity = 7 * 60; // Don't schedule activities before 7 AM
              if (hotelArriveMin !== null && hotelArriveMin >= earliestActivity && hotelArriveMin < dinnerTime - 60) {
                // Retype as "arrival" to show it's not a wasted day
                travelDay.type = 'arrival' as any;
                const freeStartMin = hotelArriveMin + 30; // 30 min to settle in
                const totalFreeHours = (sleepTime - freeStartMin) / 60; // Total evening free time until sleep

                // Get attractions for this city (AI cache > static > generic fallback)
                const evCityKey = toCity.parentCity || toCity.name;
                let cityAttractions: string[] = [];
                if (dest.places && dest.places.length > 0) {
                  cityAttractions = dest.places.map(p => p.name);
                } else if (trip.deepPlanData?.cityActivities?.[evCityKey]?.length) {
                  cityAttractions = trip.deepPlanData.cityActivities[evCityKey].map(a => a.name);
                } else if (CITY_ATTRACTIONS[evCityKey] || CITY_ATTRACTIONS[toCity.name]) {
                  cityAttractions = (CITY_ATTRACTIONS[evCityKey] || CITY_ATTRACTIONS[toCity.name])?.map(a => a.name) || [];
                }
                // Filter out user-removed activities
                const removedSame = new Set((removedActivities[evCityKey] || []).map(n => n.toLowerCase()));
                cityAttractions = cityAttractions.filter(n => !removedSame.has(n.toLowerCase()));

                if (cityAttractions.length > 0 && totalFreeHours >= 1.5 && freeStartMin < dinnerTime - 60) {
                  const aiActs = trip.deepPlanData?.cityActivities?.[evCityKey] || [];

                  travelDay.stops.push({
                    id: `dp${sc++}`, name: `Free time — ${Math.round(totalFreeHours)} hours to explore ${toCity.name}`,
                    type: 'attraction', time: formatTime24(freeStartMin),
                    transport: { icon: 'walk', duration: '', distance: '' },
                    note: 'Evening exploration (optional)',
                  });

                  // Fill as many activities as fit (no cap for arrival day free time)
                  let evCursor = freeStartMin + 30;
                  let addedCount = 0;
                  for (let ei = 0; ei < cityAttractions.length; ei++) {
                    if (evCursor + 30 > dinnerTime) break;
                    const attrName = cityAttractions[ei];
                    const aiDetail = aiActs.find(a => a.name === attrName);
                    const dur = aiDetail?.durationMin || 60;
                    if (evCursor + dur > dinnerTime) continue;
                    travelDay.stops.push({
                      id: `dp${sc++}`, name: attrName, type: 'attraction',
                      time: formatTime24(evCursor),
                      transport: { icon: 'walk', duration: '', distance: '' },
                      category: aiDetail?.category || 'landmark',
                      durationMin: dur,
                      note: aiDetail?.note, openingHours: aiDetail?.openingHours, ticketPrice: aiDetail?.ticketPrice,
                    });
                    usedArrivalActivities.add(attrName.toLowerCase());
                    addedCount++;
                    evCursor += dur + 30; // activity + travel gap
                  }
                  // Remove transport from last activity (before dinner)
                  if (addedCount > 0) {
                    const lastAct = travelDay.stops[travelDay.stops.length - 1];
                    if (lastAct.type === 'attraction') lastAct.transport = null;
                  }
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
      // Skip activities already used on the arrival day to avoid repeats
      type TypedActivity = { name: string; category: string; durationMin: number; bestTime: string; note?: string; openingHours?: string; ticketPrice?: string; dayIndex?: number };
      const typedActivities: TypedActivity[] = [];
      const cityKey = toCity.parentCity || toCity.name;
      // Exclude arrival activities but NOT removed ones yet — we filter removed AFTER slicing per day
      // so that removing an activity doesn't cause extras to backfill the slot
      const cityRemoved = new Set((removedActivities[cityKey] || []).map(n => n.toLowerCase()));
      const usedNames = new Set<string>([...Array.from(usedArrivalActivities)]);

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

      // No generic fallback — wait for AI data. Empty days show "Auto-plan" prompt.

      for (let n = 0; n < exploreDays; n++) {
        const roomsNeeded = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
        const hotelCostForNight = dest.selectedHotel ? dest.selectedHotel.pricePerNight * roomsNeeded : 0;
        const expDay: DayPlan = {
          day: dayNum + 1, date: addDaysToDate(trip.departureDate, dayNum), stops: [],
          type: 'explore', city: cityKey, dayCost: hotelCostForNight, costLabel: 'Hotel',
          exploreDayIndex: n,
        };
        const hotelName = dest.selectedHotel?.name || `Stay in ${toCity.name}`;

        // Distribute activities evenly across explore days
        // Include removed activities in scheduling so the layout stays stable
        // They get filtered from rendered stops AFTER scheduling (below)
        const perDay = Math.max(1, Math.ceil(typedActivities.length / exploreDays));
        const startIdx = n * perDay;
        let dayActivities: TypedActivity[] = typedActivities.slice(startIdx, startIdx + perDay);

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
          if (cursor + act.durationMin > morningEnd) continue; // try shorter activities
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

        // Remove user-deleted activities from scheduled stops (keeps schedule stable — no backfill)
        if (cityRemoved.size > 0) {
          expDay.stops = expDay.stops.filter(s => s.type !== 'attraction' || s.mealType || !cityRemoved.has(s.name.toLowerCase()));
        }

        // Dinner meal slot
        expDay.stops.push({
          id: `dp${sc++}`, name: 'Dinner', type: 'hotel', time: '19:00',
          transport: null, mealType: 'dinner',
        });

        expDay.stops.push({ id: `dp${sc++}`, name: 'Return to hotel', type: 'hotel', time: '20:00', transport: null, destIndex: destIdx });
        expDay.stops.push({ id: `dp${sc++}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null });
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
                    transport: mi < morningCount - 1 ? { icon: 'walk', duration: '', distance: '' } : null,
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
            const retHasReliableDate = (retSel as any).arrDate && (retSel as any).depDate && (retSel as any).arrDate !== (retSel as any).depDate;
            const retArrivesNextDay = retHasReliableDate || (retArrH < retDepH && retDurHrs > 2) || retDurHrs >= 20;
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

    // Merge consecutive days with same day number and date
    // A day is a day — 24 hours. Arrival + explore on same date = one card.
    const merged: DayPlan[] = [];
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (prev && prev.day === cur.day && prev.date === cur.date) {
        // Merge: remove sleep/overnight from prev (the day continues), then append cur's stops
        prev.stops = prev.stops.filter(s => s.name !== 'Rest / Sleep');
        const prevStopNames = prev.stops.map(s => s.name);
        for (const stop of cur.stops) {
          // Skip duplicates: same meal type, same hotel name already present
          if (stop.mealType && prev.stops.some(s => s.mealType === stop.mealType)) continue;
          if (stop.type === 'hotel' && !stop.mealType && prevStopNames.includes(stop.name)) continue;
          prev.stops.push(stop);
        }
        // Add sleep back at the end
        prev.stops.push({ id: `merge-sleep-${prev.day}`, name: 'Rest / Sleep', type: 'hotel', time: '22:00', transport: null, note: 'Default sleep time — adjust as needed' });
        // Type: arrival + explore = 'arrival' (shows "Arrival & Explore" badge). Sum costs.
        if (cur.type === 'explore' && (prev.type === 'travel' || (prev.type as string) === 'arrival')) prev.type = 'arrival' as any;
        else if (cur.type === 'explore') prev.type = 'explore';
        else if ((cur.type as string) === 'arrival' && prev.type === 'travel') prev.type = 'arrival' as any;
        prev.dayCost += cur.dayCost;
        if (cur.costLabel && cur.costLabel !== 'Arrival') {
          prev.costLabel = cur.costLabel; // Use the more meaningful label
        }
        if (cur.exploreDayIndex !== undefined) prev.exploreDayIndex = cur.exploreDayIndex;
      } else {
        merged.push({ ...cur, stops: [...cur.stops] });
      }
    }
    return merged;
  }, [trip, realTimes, isLocalStay, removedActivities]);

  // Recalculate explore day times: re-run scheduling algorithm with new start time
  const adjustedDays: DayPlan[] = useMemo(() => {
    return days.map(day => {
      // Recalculate leave times on travel/departure days when user changes travel mode
      if (day.type === 'travel' || day.type === 'departure' || day.type === 'arrival') {
        let changed = false;
        // Build map of updated durations for each stop→next pair
        const updatedTransport: Record<number, { dur: string; dist: string; travelMin: number }> = {};
        day.stops.forEach((stop, si) => {
          if (!stop.transport || stop.mealType) return;
          if (stop.legIndex !== undefined) return; // skip flight/train legs
          const nextStop = day.stops.slice(si + 1).find(s => !s.mealType);
          if (!nextStop) return;
          const key = `${stop.name}→${nextStop.name}`;
          const td = travelBetween[key];
          if (!td) return;
          const sel = td[td.selected as 'walk' | 'transit' | 'drive'];
          if (!sel) return;
          if (stop.transport.duration !== sel.duration || stop.transport.distance !== sel.distance) {
            changed = true;
            updatedTransport[si] = { dur: sel.duration, dist: sel.distance, travelMin: parseDurationMinutes(sel.duration) || 20 };
          }
        });

        if (changed) {
          let newStops = [...day.stops];
          // Apply updates in reverse order so index shifts don't matter
          for (const siStr of Object.keys(updatedTransport).sort((a, b) => Number(b) - Number(a))) {
            const si = Number(siStr);
            const { dur, dist, travelMin } = updatedTransport[si];
            const stop = newStops[si];
            const nextIdx = newStops.findIndex((s, idx) => idx > si && !s.mealType);

            // Update transport on this stop
            let newTime = stop.time;
            if (stop.note?.includes('Leave by') && nextIdx >= 0 && newStops[nextIdx].time) {
              // Recalculate leave time from next stop's fixed time
              newTime = formatTime24(parseTime(newStops[nextIdx].time!) - travelMin);
            }
            newStops[si] = {
              ...stop,
              time: newTime,
              transport: { ...stop.transport!, duration: dur, distance: dist },
              note: stop.note?.includes('Leave by') && newTime
                ? `Leave by ${formatTime12(parseTime(newTime))} to reach on time`
                : stop.note,
            };

            // Update next stop's arrival time AND cascade to all subsequent stops
            // Skip cascade for "Leave by" stops — their time was recalculated backwards
            // from the next stop's fixed time, so the next stop is already correct
            if (!stop.note?.includes('Leave by') && nextIdx >= 0 && !newStops[nextIdx].note?.includes('Leave by') && newTime) {
              // Departure from this stop = arrival time + activity duration (if it's an activity)
              const stopDuration = stop.type === 'attraction' && stop.durationMin ? stop.durationMin : 0;
              const departMin = parseTime(newTime) + stopDuration;
              const arrivalMin = departMin + travelMin;
              const oldNextMin = newStops[nextIdx].time ? parseTime(newStops[nextIdx].time!) : arrivalMin;
              const delta = arrivalMin - oldNextMin; // how much time shifted
              // Recalculate check-in note based on new arrival time
              const stdCheckInMin = 15 * 60; // 3 PM
              const lateCheckInMin = 21 * 60; // 9 PM
              let updatedNote = newStops[nextIdx].note;
              if (newStops[nextIdx].type === 'hotel' && (newStops[nextIdx].note?.includes('check-in') || newStops[nextIdx].note === undefined)) {
                updatedNote = arrivalMin < stdCheckInMin
                  ? 'Arriving before standard check-in (3 PM) — request early check-in or leave luggage'
                  : arrivalMin >= lateCheckInMin
                    ? 'Late arrival — confirm late check-in with hotel and save their contact number'
                    : undefined;
              }
              newStops[nextIdx] = { ...newStops[nextIdx], time: formatTime24(arrivalMin), note: updatedNote };
              // Cascade: shift all subsequent non-fixed stops by the same delta
              if (delta !== 0) {
                for (let k = nextIdx + 1; k < newStops.length; k++) {
                  if (!newStops[k].time) continue;
                  // Don't shift dinner (7 PM) or sleep (10 PM) — they're fixed
                  if (newStops[k].mealType === 'dinner' || newStops[k].name === 'Rest / Sleep') continue;
                  const oldMin = parseTime(newStops[k].time!);
                  newStops[k] = { ...newStops[k], time: formatTime24(oldMin + delta) };
                }
              }
            }
          }
          // For arrival days: also inject custom activities and apply reorder
          if (day.type === 'arrival') {
            const customs = customActivities[day.day] || [];
            if (customs.length > 0) {
              const dinnerIdx = newStops.findIndex(s => s.mealType === 'dinner');
              const insertIdx = dinnerIdx >= 0 ? dinnerIdx : newStops.length - 1;
              const baseAiNames = new Set(newStops.filter(s => s.type === 'attraction' && !s.mealType).map(s => s.name.trim().toLowerCase()));
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
            // Apply drag-reorder for arrival days
            const userOrder = activityOrder[day.day];
            if (userOrder && userOrder.length > 0) {
              const actStops = newStops.filter(s => s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time'));
              const nonActStops = newStops.filter(s => !(s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time')));
              const ordered: DeepStop[] = [];
              for (const id of userOrder) {
                const found = actStops.find(s => s.id === id);
                if (found) ordered.push(found);
              }
              for (const s of actStops) {
                if (!userOrder.includes(s.id)) ordered.push(s);
              }
              // Recalculate times: use original times in new order
              if (actStops.length > 0 && ordered.length > 0) {
                const origTimes = actStops.map(s => s.time).filter(Boolean);
                ordered.forEach((s, i) => { if (i < origTimes.length) s.time = origTimes[i]; });
              }
              // Re-insert activities before dinner
              const dinnerIdx2 = nonActStops.findIndex(s => s.mealType === 'dinner');
              const insertIdx2 = dinnerIdx2 >= 0 ? dinnerIdx2 : nonActStops.length - 1;
              nonActStops.splice(insertIdx2, 0, ...ordered);
              newStops = nonActStops;
            }
          }
          return { ...day, stops: newStops };
        }

        // For arrival days without transport changes, still inject custom activities and apply reorder
        if (day.type === 'arrival') {
          let newStops = [...day.stops];
          const customs = customActivities[day.day] || [];
          if (customs.length > 0) {
            const dinnerIdx = newStops.findIndex(s => s.mealType === 'dinner');
            const insertIdx = dinnerIdx >= 0 ? dinnerIdx : newStops.length - 1;
            const baseAiNames = new Set(newStops.filter(s => s.type === 'attraction' && !s.mealType).map(s => s.name.trim().toLowerCase()));
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
          // Apply drag-reorder for arrival days
          const userOrder = activityOrder[day.day];
          if (userOrder && userOrder.length > 0) {
            const actStops = newStops.filter(s => s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time'));
            const nonActStops = newStops.filter(s => !(s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time')));
            const ordered: DeepStop[] = [];
            for (const id of userOrder) {
              const found = actStops.find(s => s.id === id);
              if (found) ordered.push(found);
            }
            for (const s of actStops) {
              if (!userOrder.includes(s.id)) ordered.push(s);
            }
            // Recalculate times: use original times in new order
            if (actStops.length > 0 && ordered.length > 0) {
              const origTimes = actStops.map(s => s.time).filter(Boolean);
              ordered.forEach((s, i) => { if (i < origTimes.length) s.time = origTimes[i]; });
            }
            const dinnerIdx2 = nonActStops.findIndex(s => s.mealType === 'dinner');
            const insertIdx2 = dinnerIdx2 >= 0 ? dinnerIdx2 : nonActStops.length - 1;
            nonActStops.splice(insertIdx2, 0, ...ordered);
            newStops = nonActStops;
          }
          if (customs.length > 0 || (userOrder && userOrder.length > 0)) return { ...day, stops: newStops };
          return day;
        }

        return day;
      }

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
      const defaultTravelGap = 30;
      // Get real travel time between two stops (from travelBetween), fallback to 30min
      const getTravelGap = (fromName: string, toName: string): number => {
        const key = `${fromName}→${toName}`;
        const td = travelBetween[key];
        if (!td) return defaultTravelGap;
        const sel = td[td.selected as 'walk' | 'transit' | 'drive'];
        return sel ? (parseDurationMinutes(sel.duration) || defaultTravelGap) : defaultTravelGap;
      };

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

      const hotelName = hotelLeave?.name || '';
      let prevName = hotelName;
      if (startMin < lunchTime) {
        for (const s of orderedForScheduling) {
          const dur = s.durationMin || 60;
          const gap = getTravelGap(prevName, s.name);
          // Add travel gap from previous stop (including hotel → first activity)
          const actStart = cursor + gap;
          if (actStart + dur > lunchTime) break;
          morningScheduled.push({ stop: s, time: actStart });
          scheduledIds.add(s.id);
          prevName = s.name;
          cursor = actStart + dur;
        }
      }

      // Fill afternoon block: afterLunch → dinnerTime - 30 (or startMin if starting after lunch)
      const remainingForAfternoon = orderedForScheduling.filter(s => !scheduledIds.has(s.id));
      const afternoonScheduled: Array<{ stop: DeepStop; time: number }> = [];
      cursor = startMin >= lunchTime ? startMin : afterLunch;
      const afternoonEnd = dinnerTime - 30;
      // Reset prevName for afternoon (last morning activity or hotel if no morning)
      if (morningScheduled.length > 0) prevName = morningScheduled[morningScheduled.length - 1].stop.name;

      for (const s of remainingForAfternoon) {
        const dur = s.durationMin || 60;
        const gap = getTravelGap(prevName, s.name);
        const actStart = cursor + gap;
        if (actStart + dur > afternoonEnd) continue;
        afternoonScheduled.push({ stop: s, time: actStart });
        scheduledIds.add(s.id);
        prevName = s.name;
        cursor = actStart + dur;
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

      // Smart lunch time: after last morning activity ends + 15 min, clamped to 12:00-14:00
      const lastMorningEnd = morningScheduled.length > 0
        ? morningScheduled[morningScheduled.length - 1].time + (morningScheduled[morningScheduled.length - 1].stop.durationMin || 60) + 15
        : lunchTime;
      const smartLunchTime = Math.max(12 * 60, Math.min(14 * 60, lastMorningEnd));
      if (lunchStop && startMin < smartLunchTime) newStops.push({ ...lunchStop, time: formatTime24(smartLunchTime) });

      // Afternoon activities — adjust start if lunch shifted
      const smartAfternoonStart = smartLunchTime + 45; // 45 min lunch
      for (let ai = 0; ai < afternoonScheduled.length; ai++) {
        const { stop, time } = afternoonScheduled[ai];
        const adjustedTime = ai === 0 ? Math.max(time, smartAfternoonStart) : time + (smartAfternoonStart - afterLunch);
        newStops.push({ ...stop, time: formatTime24(Math.min(adjustedTime, dinnerTime - 30)) });
      }

      // Smart dinner time: after last afternoon activity ends + 30 min, clamped to 18:30-20:00
      const lastAfternoonEnd = afternoonScheduled.length > 0
        ? (() => { const last = afternoonScheduled[afternoonScheduled.length - 1]; return last.time + (last.stop.durationMin || 60) + 30; })()
        : dinnerTime;
      const smartDinnerTime = Math.max(18 * 60 + 30, Math.min(20 * 60, lastAfternoonEnd));
      if (dinnerStop) newStops.push({ ...dinnerStop, time: formatTime24(smartDinnerTime) });

      // Hotel return + sleep — follow dinner time dynamically
      const hotelReturnTime = smartDinnerTime + 60; // 1 hour after dinner starts
      const sleepTime = hotelReturnTime + 120; // 2 hours after returning
      if (hotelReturn) newStops.push({ ...hotelReturn, time: formatTime24(Math.min(hotelReturnTime, 22 * 60)) });
      if (sleepStop) newStops.push({ ...sleepStop, time: formatTime24(Math.min(sleepTime, 23 * 60 + 30)) });

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
  }, [days, dayStartTimes, customActivities, activityOrder, travelBetween]);

  const totalNights = trip.destinations.reduce((s, d) => s + d.nights, 0);
  const summaryTransportPax = (trip.adults + (trip.children || 0)) + (trip.infants || 0) * 0.15;
  const summaryRooms = Math.ceil(((trip.adults || 1) + (trip.children || 0)) / 2);
  const flightCost = trip.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + l.selectedFlight!.pricePerAdult, 0) * summaryTransportPax;
  const trainCost = trip.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + l.selectedTrain!.price, 0) * (trip.adults + (trip.children || 0));
  const hotelCost = trip.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => s + d.selectedHotel!.pricePerNight * d.nights * summaryRooms, 0);

  // Calculate attraction costs from AI ticketPrice (e.g., "€26", "$15", "₹500", "Free")
  const attractionCost = useMemo(() => {
    const conversionRates: Record<string, number> = { '€': 93, '$': 85, '£': 108, '¥': 0.57, '₹': 1 };
    let total = 0;
    const seen = new Set<string>();
    for (const day of adjustedDays) {
      for (const stop of day.stops) {
        if (stop.type !== 'attraction' || !stop.ticketPrice || seen.has(stop.name)) continue;
        seen.add(stop.name);
        const priceStr = String(stop.ticketPrice);
        if (priceStr.toLowerCase().includes('free')) continue;
        const match = priceStr.match(/([€$£¥₹])\s*([\d,.]+)/);
        if (match) {
          const rate = conversionRates[match[1]] || 1;
          const amount = parseFloat(match[2].replace(',', ''));
          if (!isNaN(amount)) total += amount * rate * (trip.adults + (trip.children || 0));
        }
      }
    }
    return Math.round(total);
  }, [adjustedDays, trip.adults, trip.children]);

  // Estimate food costs from AI-generated mealCosts per city (stored in deepPlanData)
  // Live rates (foreign → INR) from open.er-api.com, falls back to static rates
  const convRates: Record<string, number> = getForeignToINR();
  const totalDays = adjustedDays.length;
  const foodCost = useMemo(() => {
    const pax = (trip.adults || 1) + (trip.children || 0);
    const cityMealCosts = trip.deepPlanData?.mealCosts || {};
    let total = 0;
    for (const day of adjustedDays) {
      const meals = day.stops.filter(s => s.mealType);
      if (meals.length === 0) continue;
      // Find meal costs — try day.city, departureCity, then match by destination parentCity
      const mc = cityMealCosts[day.city] || cityMealCosts[day.departureCity || ''] || (() => {
        const dest = trip.destinations.find(d => d.city.name === day.city || d.city.parentCity === day.city);
        return dest ? cityMealCosts[dest.city.parentCity || dest.city.name] : undefined;
      })();
      if (!mc) continue; // no AI data yet
      const rate = convRates[mc.currency?.toUpperCase()] || convRates[mc.currency] || 1;
      for (const meal of meals) {
        const cost = mc[meal.mealType as 'breakfast' | 'lunch' | 'dinner'] || 0;
        total += cost * rate * pax;
      }
    }
    return Math.round(total);
  }, [adjustedDays, trip.adults, trip.children, trip.deepPlanData?.mealCosts]);

  // Estimate local transport costs using AI-generated city rates
  const localTransportCost = useMemo(() => {
    const pax = (trip.adults || 1) + (trip.children || 0);
    const cityTransportData = trip.deepPlanData?.localTransport || {};
    let total = 0;
    for (const day of adjustedDays) {
      // Try day.city, departureCity, then match by destination parentCity
      const lt = cityTransportData[day.city] || cityTransportData[day.departureCity || ''] || (() => {
        const dest = trip.destinations.find(d => d.city.name === day.city || d.city.parentCity === day.city);
        return dest ? cityTransportData[dest.city.parentCity || dest.city.name] : undefined;
      })();
      const rate = lt ? (convRates[lt.currency?.toUpperCase()] || convRates[lt.currency] || 1) : 1;
      for (const stop of day.stops) {
        if (!stop.transport || stop.legIndex !== undefined) continue;
        const nextIdx = day.stops.findIndex((s, i) => i > day.stops.indexOf(stop) && !s.mealType);
        if (nextIdx < 0) continue;
        const key = `${stop.name}→${day.stops[nextIdx].name}`;
        const td = travelBetween[key];
        if (!td) continue;
        const mode = td.selected;
        if (mode === 'walk') continue;
        const selData = td[mode as 'transit' | 'drive'];
        if (!selData) continue;
        if (mode === 'transit' && lt) {
          const distMatch = selData.distance?.match(/([\d.]+)\s*km/);
          const distKm = distMatch ? parseFloat(distMatch[1]) : 3;
          const rides = distKm < 5 ? 1 : distKm < 15 ? 2 : 3;
          const perRide = lt.metroSingleRide || lt.busSingleRide || 2;
          const rideCost = rides * perRide;
          const cost = lt.dailyPass && lt.dailyPass < rideCost ? lt.dailyPass : rideCost;
          total += cost * rate * pax;
        } else if (mode === 'drive' && lt) {
          const distMatch = selData.distance?.match(/([\d.]+)\s*km/);
          const distKm = distMatch ? parseFloat(distMatch[1]) : 3;
          total += distKm * (lt.taxiPerKm || 2) * rate;
        } else if (mode === 'transit') {
          total += 150 * pax; // fallback if no AI data
        } else if (mode === 'drive') {
          const distMatch = selData.distance?.match(/([\d.]+)\s*km/);
          const distKm = distMatch ? parseFloat(distMatch[1]) : 3;
          total += distKm * 100; // fallback ₹100/km
        }
      }
    }
    return Math.round(total);
  }, [adjustedDays, travelBetween, trip.adults, trip.children, trip.deepPlanData?.localTransport]);

  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? trip.from : trip.destinations[Math.min(legIdx - 1, trip.destinations.length - 1)]?.city;
    const toCity = legIdx < trip.destinations.length ? trip.destinations[legIdx]?.city : trip.from;
    return { fromCity, toCity };
  };

  // Fetch real travel times (all 3 modes) between stops with walk transport on ALL day types
  useEffect(() => {
    if (adjustedDays.length === 0) return;
    for (const day of adjustedDays) {
      // For each stop with walk transport, find the next non-meal stop
      for (let j = 0; j < day.stops.length; j++) {
        const from = day.stops[j];
        if (!from.transport || from.mealType) continue;
        // Only process walk/drive segments (not flight/train/bus with legIndex)
        if (from.transport.icon !== 'walk' && from.transport.icon !== 'drive' && from.transport.icon !== 'publicTransit') continue;
        // Skip flight/train legs (they have legIndex)
        if (from.legIndex !== undefined) continue;
        // Skip Rest/Sleep
        if (from.name === 'Rest / Sleep') continue;
        // For "Free time" stops: use the previous real location as origin
        let actualFrom = from;
        if (from.name.startsWith('Free time')) {
          // Find previous real location (hotel, airport, etc.)
          const prevReal = day.stops.slice(0, j).reverse().find(s => !s.mealType && !s.name.startsWith('Free time') && s.name !== 'Rest / Sleep' && s.type !== 'attraction');
          if (prevReal) actualFrom = prevReal;
          else continue;
        }
        // Find next non-meal stop that's a real location
        const to = day.stops.slice(j + 1).find(s => !s.mealType && !s.name.startsWith('Free time') && s.name !== 'Rest / Sleep');
        if (!to) continue;
        // For travel/departure days, stops may be in different cities
        // Use departureCity for pre-flight stops, day.city for post-flight stops
        const transportLegIdx = day.stops.findIndex(s => s.legIndex !== undefined);
        const isFromAfterTransport = transportLegIdx >= 0 && j > transportLegIdx;
        const isToAfterTransport = transportLegIdx >= 0 && day.stops.indexOf(to) > transportLegIdx;
        const fromCity = isFromAfterTransport ? (day.city || day.departureCity) : (day.departureCity || day.city);
        const toCity = isToAfterTransport ? (day.city || day.departureCity) : (day.departureCity || day.city);
        // If stop is an airport/station, use its full name directly (not "Mumbai Airport, Amsterdam")
        const queryFrom = actualFrom || from; // Use actual location for directions query
        const fromIsHub = queryFrom.type === 'airport' || queryFrom.type === 'station' || queryFrom.type === 'home';
        const toIsHub = to.type === 'airport' || to.type === 'station' || to.type === 'home';
        const key = `${from.name}→${to.name}`; // Key uses original stop name for render lookup
        if (travelFetchedRef.current[key] || travelBetween[key]) continue;
        travelFetchedRef.current[key] = true;
        const fromQ = fromIsHub ? queryFrom.name : `${queryFrom.name}, ${fromCity}`;
        const toQ = toIsHub ? to.name : `${to.name}, ${toCity}`;
        // Fetch all 3 modes in parallel
        const fetchMode = (mode: 'walking' | 'transit' | 'driving', modeKey: string) =>
          getDirections(fromQ, toQ, mode).then(r => r ? { duration: r.durationText, distance: r.distanceText } : null).catch(() => null);
        Promise.all([fetchMode('walking', 'walk'), fetchMode('transit', 'transit'), fetchMode('driving', 'drive')]).then(([walk, transit, drive]) => {
          // Smart default: pick best mode based on distance/duration
          // Walk if ≤ 20 min, transit if available and ≤ 45 min, else drive
          const walkMin = walk ? parseDurationMinutes(walk.duration) : 999;
          const transitMin = transit ? parseDurationMinutes(transit.duration) : 999;
          const driveMin = drive ? parseDurationMinutes(drive.duration) : 999;
          let bestMode = 'walk';
          if (walkMin <= 20) bestMode = 'walk';
          else if (transitMin <= 45 && transit) bestMode = 'transit';
          else if (drive) bestMode = 'drive';
          else if (transit) bestMode = 'transit';

          setTravelBetween(prev => ({
            ...prev,
            [key]: {
              selected: bestMode,
              ...(walk && { walk }),
              ...(transit && { transit }),
              ...(drive && { drive }),
              _fetched: true, // marker so UI knows fetch completed (even if all modes failed)
            },
          }));
        }).catch(() => {});
      }
    }
  }, [adjustedDays.map(d => `${d.day}-${d.stops.map(s => s.name).join('|')}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let time = activityInputTime[dayNumber] || getDefaultActivityTime(dayNumber);
    // Clamp custom activity time to reasonable bounds (6 AM - 22 PM)
    const timeMin = parseTime(time);
    if (timeMin < 6 * 60) time = '06:00';
    else if (timeMin > 22 * 60) time = '22:00';
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
    // Remove from custom activities if it's a custom one
    const customs = customActivities[dayNumber] || [];
    const idx = customs.findIndex(c => c.name === stopName);
    if (idx >= 0) {
      handleDeleteActivity(dayNumber, idx);
    }

    // Always track removal so AI activities don't reappear on rebuild
    const dayData = adjustedDays.find(d => d.day === dayNumber);
    const cityKey = dayData?.city || '';
    if (cityKey) {
      setRemovedActivities(prev => ({
        ...prev,
        [cityKey]: [...(prev[cityKey] || []), stopName],
      }));
    }

    // Remove from activityOrder
    setActivityOrder(prev => {
      const dayOrder = prev[dayNumber];
      if (!dayOrder) return prev;
      const stopId = dayData?.stops.find(s => s.name === stopName)?.id;
      if (!stopId) return prev;
      return { ...prev, [dayNumber]: dayOrder.filter(id => id !== stopId) };
    });
  };

  // Move an activity up/down within a day's attraction order
  const handleMoveActivity = (dayNumber: number, stopId: string, direction: 'up' | 'down') => {
    setActivityOrder(prev => {
      const dayStops = adjustedDays.find(d => d.day === dayNumber)?.stops.filter(s => s.type === 'attraction' && !s.mealType) || [];
      const currentOrder = prev[dayNumber] || dayStops.map(s => s.id);
      const idx = currentOrder.indexOf(stopId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= currentOrder.length) return prev;
      const newOrder = [...currentOrder];
      const tmp = newOrder[idx];
      newOrder[idx] = newOrder[swapIdx];
      newOrder[swapIdx] = tmp;
      return { ...prev, [dayNumber]: newOrder };
    });
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
  // Reorder callback for Framer Motion Reorder.Group
  const handleActivityReorder = (dayNum: number, newOrder: string[]) => {
    setActivityOrder(prev => ({ ...prev, [dayNum]: newOrder }));
  };

  // Generate itinerary for a travel/departure day's free time
  const [generatingDay, setGeneratingDay] = useState<Record<number, boolean>>({});
  const handleGenerateItinerary = async (dayNum: number, city: string, freeHours: number) => {
    setGeneratingDay(prev => ({ ...prev, [dayNum]: true }));
    try {
      const dest = trip.destinations.find(d => (d.city.parentCity || d.city.name) === city || d.city.name === city);
      const country = dest?.city.country || '';
      const monthName = trip.departureDate ? new Date(trip.departureDate).toLocaleString('en', { month: 'long' }) : undefined;
      const res = await fetch('/api/ai/itinerary-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, country, days: 1, userPlaces: [], month: monthName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.activities?.length > 0) {
          // Cache AI activities in deepPlanData so arrival/travel days pick them up
          const cityKey = city;
          trip.updateDeepPlanData({
            cityActivities: {
              ...trip.deepPlanData?.cityActivities,
              [cityKey]: data.activities,
            },
            ...(data.dayThemes ? { dayThemes: { ...trip.deepPlanData?.dayThemes, [cityKey]: data.dayThemes } } : {}),
          });

          // Also add as custom activities for this specific day
          const maxMin = freeHours * 60;
          let totalMin = 0;
          const dayData = adjustedDays.find(d => d.day === dayNum);
          const freeStop = dayData?.stops.find(s => s.name.startsWith('Free time'));
          let cursor = freeStop?.time ? parseTime(freeStop.time) + 30 : 13 * 60;
          const newActivities: Array<{ name: string; time: string }> = [];
          for (const act of data.activities) {
            const dur = act.durationMin || 60;
            if (totalMin + dur + 30 > maxMin) break;
            newActivities.push({ name: act.name, time: formatTime24(cursor) });
            cursor += dur + 30;
            totalMin += dur + 30;
          }
          if (newActivities.length > 0) {
            setCustomActivities(prev => ({
              ...prev,
              [dayNum]: [...(prev[dayNum] || []), ...newActivities],
            }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate itinerary:', err);
    } finally {
      setGeneratingDay(prev => ({ ...prev, [dayNum]: false }));
    }
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
    <div className="min-h-screen flex justify-center p-4 py-6 deep-plan-page">
      {/* Auto-fill progress overlay */}
      {autoFillProgress && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-[360px]"
          >
            <div className="text-center mb-4">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-accent-cyan/10 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8654A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <h3 className="font-display text-lg font-bold text-text-primary">Filling Your Itinerary</h3>
              <p className="text-text-muted text-xs font-body mt-1">Generating activities for each city...</p>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-accent-cyan rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.round((autoFillProgress.done / autoFillProgress.total) * 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {/* City list */}
            <div className="space-y-2">
              {autoFillProgress.cities.map((city, i) => (
                <div key={city.name} className="flex items-center gap-2.5 text-[13px] font-body">
                  {city.done ? (
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  ) : autoFillProgress.current === city.name ? (
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <div className="w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex-shrink-0" />
                  )}
                  <span className={city.done ? 'text-text-muted' : autoFillProgress.current === city.name ? 'text-accent-cyan font-semibold' : 'text-text-secondary'}>{city.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-text-muted font-body text-center mt-4">
              {autoFillProgress.done}/{autoFillProgress.total} cities completed
            </p>
          </motion.div>
        </motion.div>
      )}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[960px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-5 md:p-8 relative">
          {/* ====== [A] TRIP HEADER ====== */}
          <div className="mb-5">
            {!isReadOnly && (
            <nav className="print-hide flex items-center gap-1.5 mb-3 text-[11px] font-body">
              <button onClick={() => router.push('/my-trips')} className="text-text-muted hover:text-accent-cyan transition-colors">My Trips</button>
              <span className="text-text-muted/50">/</span>
              <button onClick={() => router.push(trip.tripId ? `/route?id=${trip.tripId}` : '/route')} className="text-text-muted hover:text-accent-cyan transition-colors">Route</button>
              <span className="text-text-muted/50">/</span>
              <span className="text-text-primary font-semibold">Itinerary</span>
            </nav>
            )}
            {isReadOnly && (
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-[11px] font-body font-semibold text-teal-700">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Shared Itinerary (Read-Only)
                </span>
              </div>
            )}
            <h1 className="font-display text-[22px] md:text-[26px] font-bold text-text-primary leading-tight tracking-tight">
              {trip.destinations.length > 0
                ? trip.destinations.map(d => d.city.parentCity || d.city.name).filter((v, i, a) => a.indexOf(v) === i).join(' & ')
                : 'Your Itinerary'}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap text-[13px] text-text-secondary font-body">
              {adjustedDays.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {formatDateNice(adjustedDays[0].date)} &mdash; {formatDateNice(adjustedDays[adjustedDays.length - 1].date)}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-text-muted/30" />
                </>
              )}
              <span>{trip.adults + (trip.children || 0) + (trip.infants || 0)} traveler{(trip.adults + (trip.children || 0) + (trip.infants || 0)) !== 1 ? 's' : ''}</span>
              <span className="w-1 h-1 rounded-full bg-text-muted/30" />
              <span>{trip.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}</span>
            </div>
          </div>

          {/* ====== [B] ACTION ROW ====== */}
          <div className="print-hide flex items-center gap-2 mb-5 flex-wrap">
            {!isReadOnly && (
            <button onClick={() => router.push(trip.tripId ? `/route?id=${trip.tripId}` : '/route')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-bg-surface border border-border-subtle rounded-lg text-[13px] font-body font-medium text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Edit Route
            </button>
            )}
            <button
              onClick={async () => {
                setPdfLoading(true);
                try {
                  const { exportTripPDFFromData } = await import('@/lib/pdfExport');
                  const cityNames = trip.destinations.map(d => d.city.name).join('-');
                  await exportTripPDFFromData({
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
                  }, `AIEzzy-DeepPlan${cityNames ? '-' + cityNames : ''}.pdf`);
                } catch (e) {
                  console.error('PDF export failed:', e);
                } finally {
                  setPdfLoading(false);
                }
              }}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-bg-surface border border-border-subtle rounded-lg text-[13px] font-body font-medium text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {pdfLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-secondary rounded-full animate-spin" />
                  PDF...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  PDF
                </>
              )}
            </button>
            {!isReadOnly && (
            <button onClick={() => setShowShareModal(true)}
              disabled={!trip.tripId}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-bg-surface border border-border-subtle rounded-lg text-[13px] font-body font-medium text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors shadow-sm disabled:opacity-50">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>
            )}
          </div>

          {/* ====== [C] TRIP OVERVIEW CARD ====== */}
          {adjustedDays.length > 0 && (
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 mb-5 shadow-sm print-hide">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{adjustedDays.length}</p>
                    <p className="text-[11px] text-text-muted font-body mt-0.5">Days</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div>
                    <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{trip.destinations.length}</p>
                    <p className="text-[11px] text-text-muted font-body mt-0.5">{trip.destinations.length === 1 ? 'City' : 'Cities'}</p>
                  </div>
                </div>
                {(flightCost + trainCost + hotelCost + attractionCost + foodCost + localTransportCost) > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8654A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    </div>
                    <div>
                      <p className="text-[16px] font-mono font-bold text-accent-cyan leading-none">{formatPrice(flightCost + trainCost + hotelCost + attractionCost + foodCost + localTransportCost, currency)}</p>
                      <p className="text-[11px] text-text-muted font-body mt-0.5">Est. Budget</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{trip.adults + (trip.children || 0) + (trip.infants || 0)}</p>
                    <p className="text-[11px] text-text-muted font-body mt-0.5">Travelers</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====== [D] STICKY DAY NAVIGATION ====== */}
          {adjustedDays.length > 1 && (
            <div className="sticky top-0 z-30 bg-[#FAF7F2]/95 backdrop-blur-sm py-2.5 mb-5 border-b border-border-subtle/50 print-hide">
              <div className="relative">
                <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
                  {adjustedDays.map(d => {
                    const s = DAY_TYPE_STYLES[d.type];
                    const cityLabel = d.city ? (trip.destinations.find(dest => dest.city.name === d.city || (dest.city.parentCity || dest.city.name) === d.city)?.city.parentCity || d.city) : '';
                    return (
                      <button key={d.day}
                        onClick={() => expandAndScrollTo(d.day)}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-body font-semibold border transition-all whitespace-nowrap ${
                          isDayExpanded(d.day)
                            ? 'bg-accent-cyan text-white border-accent-cyan shadow-sm'
                            : `${s.bg} ${s.text} ${s.border} hover:opacity-80`
                        }`}
                      >
                        {d.day}{cityLabel ? ` \u00B7 ${cityLabel.length > 9 ? cityLabel.slice(0, 7) + '\u2026' : cityLabel}` : ''}
                      </button>
                    );
                  })}
                </div>
                {/* Fade hint — only show when many days */}
                {adjustedDays.length > 7 && (
                  <div className="absolute right-0 top-0 bottom-1.5 w-8 bg-gradient-to-l from-[#FAF7F2] to-transparent pointer-events-none" />
                )}
              </div>
            </div>
          )}

          {/* ====== 2-COLUMN LAYOUT ====== */}
          <div className="md:flex md:gap-6 md:items-start">
          {/* Main itinerary column */}
          <div className="flex-1 min-w-0">

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

            // City chapter header: show when entering a new city
            const isNewCity = !!(day.city && day.city !== '' && day.city !== prevDay?.city && day.type !== 'departure');
            const cityDest = isNewCity ? trip.destinations.find(d => d.city.name === day.city || (d.city.parentCity || d.city.name) === day.city) : null;
            const cityDisplayName = cityDest ? (cityDest.city.parentCity || cityDest.city.name) : day.city;
            const cityCountry = cityDest?.city.country;
            const cityNights = cityDest?.nights || 0;
            const cityHotel = cityDest?.selectedHotel?.name;
            let lastCityDayIdx = dayIdx;
            if (isNewCity) {
              for (let k = dayIdx + 1; k < adjustedDays.length; k++) {
                if (adjustedDays[k].city === day.city || adjustedDays[k].city === cityDisplayName) lastCityDayIdx = k;
                else break;
              }
            }

            return (
              <div key={day.day} id={`day-${day.day}`} className="mb-6 last:mb-0 scroll-mt-[60px]">
                {/* Overnight connector between days */}
                {overnightHotelName && (
                  <div className="flex items-center gap-2 py-1.5 px-4 -mt-4 mb-1">
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
                {isNewCity && (() => {
                  const cityActivityCount = adjustedDays.filter(d => d.city === day.city || d.city === cityDisplayName).reduce((n, d) => n + d.stops.filter(s => s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time') && !s.name.startsWith('Morning in')).length, 0);
                  const cityDayCount = adjustedDays.filter(d => d.city === day.city || d.city === cityDisplayName).length;
                  return (
                  <div className="mb-3">
                    <div className="bg-bg-surface border border-border-subtle rounded-xl shadow-sm overflow-hidden flex">
                      <div className="flex-1 px-4 py-3 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {cityCountry && <p className="text-[10px] text-accent-gold font-body font-bold uppercase tracking-widest mb-0.5">{cityCountry}</p>}
                            <h2 className="font-display text-[20px] font-bold text-text-primary tracking-tight leading-tight">{cityDisplayName}</h2>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-text-secondary font-body">
                              <span className="flex items-center gap-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                {formatDateNice(day.date)}{lastCityDayIdx > dayIdx ? ` \u2014 ${formatDateNice(adjustedDays[lastCityDayIdx].date)}` : ''}
                              </span>
                              {cityNights > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100/70 text-teal-700 font-body">{cityNights}N</span>
                              )}
                            </div>
                            {cityHotel && (
                              <div className="mt-1">
                                <p className="flex items-center gap-1 text-[11px] text-text-muted font-body truncate">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 flex-shrink-0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                  {cityHotel}
                                </p>
                                {/* Hotel rating + price */}
                                {cityDest?.selectedHotel && (
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted font-body">
                                    {(cityDest.selectedHotel.rating || 0) > 0 && (
                                      <span className="flex items-center gap-0.5">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                        <span className="font-mono font-medium">{cityDest.selectedHotel.rating}</span>
                                      </span>
                                    )}
                                    {(cityDest.selectedHotel.pricePerNight || 0) > 0 && (
                                      <span className="font-mono">{formatPrice(cityDest.selectedHotel.pricePerNight, currency)}/night</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* City action buttons */}
                            <div className="flex items-center gap-2 mt-2 print-hide">
                              <a href={`https://www.google.com/maps/search/${encodeURIComponent(cityDisplayName + (cityCountry ? ', ' + cityCountry : ''))}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card border border-border-subtle rounded-lg text-[10px] font-body text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                View on map
                              </a>
                              <a href={`https://www.google.com/search?q=things+to+do+in+${encodeURIComponent(cityDisplayName)}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card border border-border-subtle rounded-lg text-[10px] font-body text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                Explore suggestions
                              </a>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-[11px] font-body">
                            <span className="text-accent-gold font-semibold">{cityActivityCount} {cityActivityCount === 1 ? 'place' : 'places'}</span>
                            <span className="text-text-muted">{cityDayCount} {cityDayCount === 1 ? 'day' : 'days'}</span>
                          </div>
                        </div>
                      </div>
                      {/* Gradient visual panel (desktop only) */}
                      <div className="hidden md:flex items-center justify-center w-[120px] bg-gradient-to-br from-teal-100 via-cyan-100 to-blue-100 flex-shrink-0 overflow-hidden">
                        <span className="text-[48px] font-display font-black text-white/30 tracking-tighter select-none">{cityDisplayName.slice(0, 3).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  );
                })()}
                {/* Day header — click to expand/collapse */}
                <div
                  className={`bg-bg-surface border rounded-xl shadow-sm transition-colors overflow-visible ${isDayExpanded(day.day) ? 'border-accent-cyan/30' : 'border-border-subtle hover:border-accent-cyan/20'}`}
                >
                  <div className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleDay(day.day)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-text-muted transition-transform flex-shrink-0 ${isDayExpanded(day.day) ? 'rotate-90' : ''}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <h2 className="font-display font-bold text-[16px] text-text-primary whitespace-nowrap">Day {day.day} &mdash; {formatDateNice(day.date)}</h2>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-body ${dayStyle.bg} ${dayStyle.text} ${dayStyle.border} border`}>
                        {dayStyle.label}
                      </span>
                      {/* Weather inline with day title */}
                      {day.city && (
                        <div className="hidden md:flex items-center gap-1.5">
                          {day.departureCity && day.departureCity !== day.city ? (
                            <>
                              <WeatherBadge city={day.departureCity} date={isoDate} shareToken={shareToken || undefined} />
                              <span className="text-text-muted text-[10px]">&rarr;</span>
                              <WeatherBadge city={day.city} date={isoDate} shareToken={shareToken || undefined} />
                            </>
                          ) : (
                            <WeatherBadge city={day.city} date={isoDate} shareToken={shareToken || undefined} />
                          )}
                        </div>
                      )}
                      {day.type === 'explore' && (() => {
                        const themes = trip.deepPlanData?.dayThemes?.[day.city]
                          || trip.deepPlanData?.dayThemes?.[trip.destinations.find(d => d.city.name === day.city)?.city.parentCity || ''];
                        const theme = themes && typeof day.exploreDayIndex === 'number' ? themes[day.exploreDayIndex] : null;
                        return theme ? (
                          <span className="hidden md:inline text-[10px] text-text-muted font-body italic">{theme}</span>
                        ) : null;
                      })()}
                    </div>
                    {/* Right side: budget + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {day.dayCost > 0 && (
                        <span className="text-[13px] font-mono font-bold text-accent-cyan whitespace-nowrap">{formatPrice(day.dayCost, currency)}</span>
                      )}
                      {/* Add Activity + Refresh — explore days only, visible when expanded */}
                      {!isReadOnly && isDayExpanded(day.day) && (day.type === 'explore' || day.type === 'arrival') && (
                        <div className="print-hide flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowActivityInput(prev => ({ ...prev, [day.day]: true })); }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/5 transition-colors"
                            aria-label="Add activity"
                            title="Add activity"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          {!aiLoading[day.city] && (() => {
                            const cityKey = day.city;
                            const dest = trip.destinations.find(d => (d.city.parentCity || d.city.name) === cityKey || d.city.name === cityKey);
                            if (!dest) return null;
                            const exploreDaysCount = Math.max(0, dest.nights - 1);
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); refreshAiActivities(cityKey, dest.city.country || '', exploreDaysCount, dest.places?.map(p => p.name) || []); }}
                                className="p-1.5 rounded-lg text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/5 transition-colors"
                                aria-label="Get new ideas"
                                title="Get new ideas"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                              </button>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collapsed preview: stats + activity names */}
                  {!isDayExpanded(day.day) && (() => {
                    const attractions = day.stops.filter(s => s.type === 'attraction' && !s.mealType);
                    const transportStops = day.stops.filter(s => s.transport);
                    const totalTravelMin = transportStops.reduce((sum, s) => {
                      if (!s.transport?.duration) return sum;
                      const dur = s.transport.duration;
                      const hLong = dur.match(/(\d+)\s*hour/);
                      const hShort = dur.match(/(\d+)\s*h(?:\s|$|[^o])/);
                      const mLong = dur.match(/(\d+)\s*min/);
                      const mShort = dur.match(/(\d+)\s*m(?:\s|$|[^i])/);
                      const hours = hLong ? parseInt(hLong[1]) : hShort ? parseInt(hShort[1]) : 0;
                      const mins = mLong ? parseInt(mLong[1]) : mShort ? parseInt(mShort[1]) : 0;
                      return sum + hours * 60 + mins;
                    }, 0);
                    const previewNames = attractions.slice(0, 3).map(s => s.name === 'Rest / Sleep' ? 'Overnight' : s.name);
                    const more = attractions.length > 3 ? ` +${attractions.length - 3} more` : '';
                    return (
                      <div className="mt-1.5 pl-7 flex items-center gap-2 flex-wrap">
                        {attractions.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-card rounded-full text-[10px] font-body text-text-muted">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            {attractions.length} {attractions.length === 1 ? 'stop' : 'stops'}
                          </span>
                        )}
                        {totalTravelMin > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-card rounded-full text-[10px] font-mono text-text-muted">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {totalTravelMin >= 60 ? `${Math.floor(totalTravelMin / 60)}h ${totalTravelMin % 60}m` : `${totalTravelMin}m`} travel
                          </span>
                        )}
                        {previewNames.length > 0 && (
                          <p className="text-[10px] text-text-muted font-body truncate flex-1 min-w-0">
                            {previewNames.join(' \u2022 ')}{more}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  </div>{/* end clickable header area */}

                {/* Collapsible day content — inside the same card */}
                {isDayExpanded(day.day) && (
                  <div className="border-t border-border-subtle/50 px-4 pb-4 mt-1">

                {/* Start time selector + AI loading for explore days */}
                {!isReadOnly && day.type === 'explore' && (
                  <div className="print-hide flex items-center gap-3 py-3 flex-wrap">
                    <label className="text-[11px] text-text-muted font-body font-medium">Start time</label>
                    <input
                      type="time"
                      value={dayStartTimes[day.day] || '09:00'}
                      onChange={e => {
                        let v = e.target.value;
                        if (v < '06:00') v = '06:00';
                        else if (v > '22:00') v = '22:00';
                        setDayStartTimes(prev => ({ ...prev, [day.day]: v }));
                      }}
                      min="06:00" max="22:00"
                      className="text-xs font-mono bg-bg-card border border-border-subtle rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-cyan"
                    />
                    {aiLoading[day.city] && (
                      <span className="flex items-center gap-1 text-[10px] text-accent-cyan font-body ml-2">
                        <span className="w-3 h-3 border border-accent-cyan border-t-transparent rounded-full animate-spin" />
                        Generating itinerary...
                      </span>
                    )}
                  </div>
                )}

                {/* Timeline — solid line = confirmed plan */}
                {(() => {
                  const isDraggableDay = day.type === 'explore' || String(day.type) === 'arrival' || day.costLabel === 'Arrival' || (DAY_TYPE_STYLES as any)[day.type]?.label === 'Arrival & Explore';
                  const activityIds = isDraggableDay ? day.stops.filter(s => s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time') && !s.name.startsWith('Morning in')).map(s => s.id) : [];
                  // All stop IDs for Reorder.Group values (includes non-draggable items with dragListener=false)
                  const allStopIds = isDraggableDay ? day.stops.map(s => s.id) : [];
                  const useReorder = isDraggableDay && activityIds.length >= 1;

                  // Apply edited times and cascade: if user edited a time, recalculate subsequent stops
                  {
                    let timeShift = 0; // accumulated shift in minutes from edits
                    for (let si2 = 0; si2 < day.stops.length; si2++) {
                      const s = day.stops[si2];
                      if (!s.time) continue;
                      const timeKey = s.mealType
                        ? `day_${day.day}_${s.mealType}`
                        : `day_${day.day}_${s.name.replace(/\s+/g, '_')}`;
                      const edited = editedTimes[timeKey];
                      if (edited) {
                        // User edited this stop's time — compute shift from original
                        const origMin = parseTime(s.time);
                        const editMin = parseTime(edited);
                        timeShift = editMin - origMin;
                        s.time = edited; // apply the edit
                      } else if (timeShift !== 0) {
                        // Downstream stop — shift by accumulated offset
                        const origMin = parseTime(s.time);
                        const shifted = origMin + timeShift;
                        if (shifted >= 0 && shifted < 24 * 60) {
                          s.time = formatTime24(shifted);
                        }
                      }
                    }
                  }

                  const stopsContent = day.stops.map((stop, si) => {
                    const hasTransport = stop.transport !== null;
                    const isMeal = !!stop.mealType;
                    const isCustom = isCustomDeletable(stop.name);
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
                                {stop.time && (() => {
                                  const timeKey = `day_${day.day}_${stop.mealType}`;
                                  const displayTime = editedTimes[timeKey] || stop.time;
                                  const isEditing = editingTimeKey === timeKey;
                                  return isEditing ? (
                                    <input type="time" autoFocus value={displayTime}
                                      onChange={e => { if (e.target.value) setEditedTimes(prev => ({ ...prev, [timeKey]: e.target.value })); }}
                                      onBlur={() => setEditingTimeKey(null)}
                                      className="text-orange-400 text-[10px] font-mono bg-transparent border-none outline-none w-[60px] p-0"
                                    />
                                  ) : (
                                    <button onClick={() => !isReadOnly && setEditingTimeKey(timeKey)} className={`text-orange-400 text-[10px] font-mono ${isReadOnly ? '' : 'hover:text-orange-600 cursor-pointer'}`} title={isReadOnly ? '' : 'Click to change time'}>
                                      {formatTime12(parseTime(displayTime))}
                                    </button>
                                  );
                                })()}
                                <span className="text-orange-600 text-[11px] font-body font-medium flex items-center gap-1">
                                  <span className="text-xs">{stop.mealType === 'breakfast' ? '\u2615' : stop.mealType === 'dinner' ? '\uD83C\uDF19' : '\uD83C\uDF7D\uFE0F'}</span> {stop.name}
                                </span>
                                {(() => {
                                  const mealCosts = trip.deepPlanData?.mealCosts || {};
                                  // day.city uses parentCity||name, same key as mealCosts storage
                                  const mc = mealCosts[day.city] || mealCosts[day.departureCity || ''];
                                  if (!mc || !stop.mealType) return null;
                                  const cost = mc[stop.mealType as 'breakfast' | 'lunch' | 'dinner'];
                                  if (!cost) return null;
                                  const rate = convRates[mc.currency?.toUpperCase()] || convRates[mc.currency] || 1;
                                  return <span className="text-orange-400 text-[10px] font-mono ml-1">~{formatPrice(Math.round(cost * rate), currency)}/person</span>;
                                })()}
                              </div>
                              {mealHint && <span className="text-[9px] text-orange-400/70 font-body ml-3 mt-0.5">{mealHint}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Is this an attraction on an explore/arrival day that can be dragged?
                    const isDraggableActivity = isDraggableDay && stop.type === 'attraction' && !isMeal && !stop.name.startsWith('Free time') && !stop.name.startsWith('Morning in');

                    // Render stop content — wrapped in Reorder.Item if draggable
                    const stopContent = (
                      <>
                        {/* Stop */}
                        <div className="flex items-start gap-3 pl-4 py-1.5">
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
                            <div className="print-hide flex flex-col gap-[2px] opacity-30 hover:opacity-70 flex-shrink-0 cursor-grab active:cursor-grabbing mt-1.5 -mr-1 select-none" aria-label="Drag to reorder">
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                              <div className="flex gap-[2px]"><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /><div className="w-[3px] h-[3px] rounded-full bg-text-muted" /></div>
                            </div>
                          )}
                          <div className={`flex-1${cardStyle ? ` ${cardStyle.bg} ${cardStyle.border} border rounded-xl p-2.5` : ''}`}>
                            <div className={isAttractionCard ? 'flex gap-3 items-start' : ''}>
                            {isAttractionCard && (
                              <PlacePhoto name={stop.name} city={day.city} className="w-14 h-14" fallbackIcon={CATEGORY_ICONS[stop.category || 'landmark']} />
                            )}
                            <div className={isAttractionCard ? 'flex-1 min-w-0' : ''}>
                            <div className="flex items-start gap-1.5">
                              {/* Time + Name */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {stop.time && (() => {
                                    const timeKey = `day_${day.day}_${stop.name.replace(/\s+/g, '_')}`;
                                    const displayTime = editedTimes[timeKey] || stop.time;
                                    const isEditing = editingTimeKey === timeKey;
                                    return isEditing ? (
                                      <input type="time" autoFocus value={displayTime}
                                        onChange={e => { if (e.target.value) setEditedTimes(prev => ({ ...prev, [timeKey]: e.target.value })); }}
                                        onBlur={() => setEditingTimeKey(null)}
                                        className="text-accent-cyan text-[13px] font-mono font-bold bg-transparent border-none outline-none w-[70px] p-0 flex-shrink-0"
                                      />
                                    ) : (
                                      <button onClick={() => !isReadOnly && setEditingTimeKey(timeKey)} className={`text-accent-cyan text-[13px] font-mono font-bold flex-shrink-0 ${isReadOnly ? '' : 'hover:text-accent-cyan/70 cursor-pointer'}`} title={isReadOnly ? '' : 'Click to change time'}>
                                        {formatTime12(parseTime(displayTime))}
                                        {stop.isNextDay && <span className="text-accent-cyan/60 text-[9px] ml-0.5">+1</span>}
                                      </button>
                                    );
                                  })()}
                                  <h3 className="font-display font-bold text-[15px] text-text-primary leading-tight line-clamp-2 min-w-0" title={stop.name}>{stop.name === 'Rest / Sleep' ? (<span className="flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400 flex-shrink-0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Overnight</span>) : stop.name}</h3>
                                </div>
                              </div>
                              {/* Action menu — three-dot with dropdown */}
                              {!isReadOnly && <div className="print-hide relative flex-shrink-0 mt-0.5">
                                {stop.isPinned && (
                                  <span className="text-accent-cyan p-0.5 mr-0.5" title="Saved activity">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                  </span>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenActivityMenu(openActivityMenu === stop.id ? null : stop.id); }}
                                  className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
                                  aria-label="Activity actions"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                </button>
                                {openActivityMenu === stop.id && (
                                  <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-50 bg-bg-surface border border-border-subtle rounded-xl shadow-xl py-1.5 min-w-[160px]">
                                    {/* View on map */}
                                    {(stop.type === 'attraction' || stop.type === 'hotel') && !isMeal && (
                                      <a href={mapsUrl(stop.name, day.city)} target="_blank" rel="noopener noreferrer"
                                        onClick={() => setOpenActivityMenu(null)}
                                        className="flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-text-secondary hover:bg-bg-card transition-colors">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                        View on map
                                      </a>
                                    )}
                                    {/* Directions */}
                                    {(stop.type === 'attraction' || stop.type === 'hotel') && !isMeal && (
                                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.name + ', ' + day.city)}`} target="_blank" rel="noopener noreferrer"
                                        onClick={() => setOpenActivityMenu(null)}
                                        className="flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-text-secondary hover:bg-bg-card transition-colors">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                        Directions
                                      </a>
                                    )}
                                    {/* Save/Pin (AI activities only) */}
                                    {day.type === 'explore' && stop.type === 'attraction' && !isMeal && !isCustom && !stop.isPinned && (
                                      <button onClick={() => { handlePinActivity(day.day, stop); setOpenActivityMenu(null); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-text-secondary hover:bg-bg-card transition-colors text-left">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                        Save activity
                                      </button>
                                    )}
                                    {/* Book — hide for free activities */}
                                    {isAttractionCard && !(stop.ticketPrice && stop.ticketPrice.toLowerCase().includes('free')) && (
                                      <a href={`https://www.getyourguide.com/s/?q=${encodeURIComponent(stop.name + ' ' + day.city)}`} target="_blank" rel="noopener noreferrer"
                                        onClick={() => setOpenActivityMenu(null)}
                                        className="flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-accent-cyan hover:bg-bg-card transition-colors">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                        Book tickets
                                      </a>
                                    )}
                                    {/* Divider + reorder/remove actions */}
                                    {(isCustom || isDraggableActivity || isAttractionCard) && <div className="my-1 border-t border-border-subtle" />}
                                    {/* Move up */}
                                    {isAttractionCard && (
                                      <button onClick={() => { handleMoveActivity(day.day, stop.id, 'up'); setOpenActivityMenu(null); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-text-secondary hover:bg-bg-card transition-colors text-left">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                                        Move up
                                      </button>
                                    )}
                                    {/* Move down */}
                                    {isAttractionCard && (
                                      <button onClick={() => { handleMoveActivity(day.day, stop.id, 'down'); setOpenActivityMenu(null); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-text-secondary hover:bg-bg-card transition-colors text-left">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                        Move down
                                      </button>
                                    )}
                                    {/* Remove activity */}
                                    <button onClick={() => { handleDeleteStop(day.day, stop.name); setOpenActivityMenu(null); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-body text-red-500 hover:bg-red-50 transition-colors text-left">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>}
                            </div>
                            {stop.note && (() => {
                              const isUrgent = /Leave by|Board |Check-in /i.test(stop.note);
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
                            {/* Opening hours + ticket price + booking links */}
                            {(stop.openingHours || stop.ticketPrice || isAttractionCard) && (
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {stop.openingHours && (
                                  <span className="text-[10px] text-text-muted font-body flex items-center gap-1">
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {stop.openingHours}
                                  </span>
                                )}
                                {stop.ticketPrice ? (
                                  <span className={`text-[10px] font-body font-semibold flex items-center gap-1 ${stop.ticketPrice.toLowerCase().includes('free') ? 'text-emerald-600' : 'text-violet-600'}`}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                    {stop.ticketPrice}
                                  </span>
                                ) : null}
                                {isAttractionCard && !(stop.ticketPrice && stop.ticketPrice.toLowerCase().includes('free')) && (
                                  <a
                                    href={`https://www.getyourguide.com/s/?q=${encodeURIComponent(stop.name + ' ' + day.city)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="print-hide text-[10px] text-accent-cyan hover:text-accent-cyan/80 font-body font-semibold flex items-center gap-1 transition-colors"
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                    Book
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Hotel card with rating, price, booking status */}
                            {stop.type === 'hotel' && !hasTransport && stop.destIndex !== undefined && stop.destIndex < trip.destinations.length && (() => {
                              const dest = trip.destinations[stop.destIndex!];
                              const hotel = dest?.selectedHotel;
                              const hotelDoc = day.city ? (trip.bookingDocs || []).find((d: any) => (!d.docType || d.docType === 'hotel' || d.docType === 'general') && (d.matchCities || []).some((c: string) => c.toLowerCase().includes(day.city.toLowerCase()) || day.city.toLowerCase().includes(c.toLowerCase()))) : null;
                              if (!hotel) return (
                                <div className="mt-2 bg-amber-50/60 border border-amber-200/50 border-l-[3px] border-l-amber-400 rounded-xl p-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-amber-700 font-body flex items-center gap-1.5">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                      No hotel selected
                                    </span>
                                    {!isReadOnly && <button onClick={() => setHotelModal({ destIndex: stop.destIndex! })} className="print-hide text-accent-cyan text-[11px] font-body font-semibold hover:underline">Select hotel</button>}
                                  </div>
                                </div>
                              );
                              return (
                                <div className="mt-2 bg-rose-50/40 border border-rose-200/50 border-l-[3px] border-l-rose-400 rounded-xl p-3 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                      {hotel.rating > 0 && <span className="px-1 py-0.5 rounded text-white font-mono font-bold text-[8px]" style={{ backgroundColor: hotel.ratingColor || '#9ca3af' }}>{hotel.rating}</span>}
                                      <span className="text-[11px] font-body text-text-secondary">{formatPrice(hotel.pricePerNight, currency)}/night &times; {dest.nights}N</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {hotelDoc ? (
                                        <button onClick={() => setViewingBooking(hotelDoc)} className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer">Booked</button>
                                      ) : (
                                        <>
                                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-amber-100 text-amber-700">Pending</span>
                                          {!isReadOnly && <button onClick={() => triggerUpload([day.city], 'hotel')} className="print-hide text-purple-600 text-[11px] font-body font-semibold hover:underline flex items-center gap-0.5">
                                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            Upload
                                          </button>}
                                        </>
                                      )}
                                      {!isReadOnly && <button onClick={() => setHotelModal({ destIndex: stop.destIndex! })} className="print-hide text-accent-cyan text-[11px] font-body font-semibold hover:underline">Replace</button>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {stop.type === 'attraction' && !isMeal && !isCustom && (stop.category || stop.durationMin) && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {stop.category && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-body ${cardStyle?.pill || 'bg-slate-100 text-slate-600'}`}>
                                    {CATEGORY_LABELS[stop.category] || 'Sightseeing'}
                                  </span>
                                )}
                                {stop.durationMin ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-gray-100 text-gray-500">
                                    {formatDuration(stop.durationMin)}
                                  </span>
                                ) : null}
                              </div>
                            )}
                            </div>{/* close inner content wrapper */}
                            </div>{/* close photo flex row */}
                          </div>
                        </div>

                        {/* Bug fix #5: Rich transport card (flight/train details) */}
                        {hasTransport && stop.transport && (() => {
                          const legIdx = stop.legIndex;
                          const leg = legIdx !== undefined ? trip.transportLegs[legIdx] : null;
                          const flight = leg?.selectedFlight;
                          const train = leg?.selectedTrain;

                          // Rich flight card (blue themed) — vertical route stepper
                          if (flight && legIdx !== undefined) {
                            const { fromCity: legFromCity, toCity: legToCity } = getLegCities(legIdx);
                            const flightToName = legToCity?.parentCity || legToCity?.name || '';
                            const depTz = getCityTimezone((legFromCity as any)?.country || trip.from?.country || '');
                            const arrTz = getCityTimezone((legToCity as any)?.country || '');
                            // Calculate arrival date using reliable date info from API
                            const depHour = parseInt((flight.departure || '').split(':')[0] || '0');
                            const arrHour = parseInt((flight.arrival || '').split(':')[0] || '0');
                            const durH = parseInt(((flight.duration || '').match(/(\d+)h/) || ['', '0'])[1]);
                            const hasReliableDates = (flight as any).arrDate && (flight as any).depDate && (flight as any).arrDate !== (flight as any).depDate;
                            const isNextDayArr = hasReliableDates || (arrHour < depHour && durH > 2) || durH >= 24;
                            return (
                              <div className="pl-4 py-1">
                                <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                  <div className="bg-blue-50/50 border border-blue-200/60 border-l-[3px] border-l-blue-500 rounded-xl p-3">
                                    {/* Header: icon + title + badges */}
                                    <div className="flex items-center justify-between mb-2.5">
                                      <span className="text-[13px] font-display font-bold text-text-primary flex items-center gap-1.5">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
                                        Flight to {flightToName}
                                      </span>
                                      <div className="flex items-center gap-2 print-hide">
                                        {(() => {
                                          const { fromCity: fc, toCity: tc } = getLegCities(legIdx);
                                          const fcName = (fc?.parentCity || fc?.name || '').toLowerCase();
                                          const tcName = (tc?.parentCity || tc?.name || '').toLowerCase();
                                          const transportDoc = fcName && tcName ? (trip.bookingDocs || []).find((d: any) => {
                                            if (d.docType && d.docType !== 'transport' && d.docType !== 'general') return false;
                                            const cities = (d.matchCities || []).map((c: string) => c.toLowerCase());
                                            return cities.some((c: string) => c.includes(fcName) || fcName.includes(c)) && cities.some((c: string) => c.includes(tcName) || tcName.includes(c));
                                          }) : null;
                                          return transportDoc ? (
                                            <button onClick={() => setViewingBooking(transportDoc)} className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer">Booked</button>
                                          ) : (
                                            <>
                                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-blue-100 text-blue-700">Pending</span>
                                              {!isReadOnly && <button onClick={() => triggerUpload([fc?.parentCity || fc?.name || '', tc?.parentCity || tc?.name || ''].filter(Boolean), 'transport')} className="print-hide text-purple-600 text-[11px] font-body font-semibold hover:underline flex items-center gap-0.5">
                                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                                Upload
                                              </button>}
                                            </>
                                          );
                                        })()}
                                        {!isReadOnly && <button onClick={() => setTransportModal({ legIndex: legIdx })} className="text-accent-cyan text-[11px] font-body font-semibold hover:underline">Replace</button>}
                                      </div>
                                    </div>
                                    {/* Vertical route stepper */}
                                    <div className="relative ml-1 mb-2.5">
                                      {/* Vertical connecting line */}
                                      <div className="absolute left-[5px] top-[10px] bottom-[10px] w-[2px] bg-blue-300" />
                                      {/* Departure */}
                                      <div className="flex items-start gap-3 relative pb-3">
                                        <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white flex-shrink-0 mt-0.5 relative z-10" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-baseline gap-1.5 flex-wrap">
                                            <span className="text-[10px] text-blue-500 font-body font-bold uppercase tracking-wider">DEP</span>
                                            <span className="text-[13px] font-mono font-bold text-text-primary">{flight.departure || '--:--'}</span>
                                            {depTz && <span className="text-[9px] text-text-muted font-body uppercase">{depTz}</span>}
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
                                        {flight.stops && flight.stops !== 'Direct' && flight.stops !== '0 stops' && (
                                          <>
                                            <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                            <span className="text-[10px] text-amber-600 font-body font-medium">{flight.stops}</span>
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
                                            {arrTz && <span className="text-[9px] text-text-muted font-body uppercase">{arrTz}</span>}
                                            {isNextDayArr && <span className="text-[9px] text-accent-cyan font-mono font-bold">+1</span>}
                                            <span className="text-[9px] text-text-muted font-body">{isNextDayArr ? formatDateNice(addDaysToDate(toIsoDate(day.date), 1)).split(',').slice(1).join(',').trim() : formatDateNice(day.date).split(',').slice(1).join(',').trim()}</span>
                                          </div>
                                          <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{day.stops[si + 1]?.name || flightToName + ' Airport'}</p>
                                        </div>
                                      </div>
                                    </div>
                                    {/* Price footer */}
                                    <div className="flex items-center justify-between text-[10px] pt-2 border-t border-blue-200/60">
                                      <span className="text-text-secondary font-body">{formatPrice(flight.pricePerAdult, currency)}/pax &times; {trip.adults}</span>
                                      <span className="text-accent-cyan font-mono font-bold text-[12px]">Total: {formatPrice(flight.pricePerAdult * trip.adults, currency)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Rich train/bus/drive card (amber/orange/slate themed) — vertical route stepper
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
                            const iconPath = isBus ? 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01'
                              : isDrive ? 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2'
                              : 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0h16M8 22h8';
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
                                      <div className="flex items-center gap-2 print-hide">
                                        {(() => {
                                          const { fromCity: fc, toCity: tc } = getLegCities(legIdx);
                                          const fcName = (fc?.parentCity || fc?.name || '').toLowerCase();
                                          const tcName = (tc?.parentCity || tc?.name || '').toLowerCase();
                                          const transportDoc2 = fcName && tcName ? (trip.bookingDocs || []).find((d: any) => {
                                            if (d.docType && d.docType !== 'transport' && d.docType !== 'general') return false;
                                            const cities = (d.matchCities || []).map((c: string) => c.toLowerCase());
                                            return cities.some((c: string) => c.includes(fcName) || fcName.includes(c)) && cities.some((c: string) => c.includes(tcName) || tcName.includes(c));
                                          }) : null;
                                          return transportDoc2 ? (
                                            <button onClick={() => setViewingBooking(transportDoc2)} className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer">Booked</button>
                                          ) : (
                                            <>
                                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-body bg-amber-100 text-amber-700">Pending</span>
                                              {!isReadOnly && <button onClick={() => triggerUpload([fc?.parentCity || fc?.name || '', tc?.parentCity || tc?.name || ''].filter(Boolean), 'transport')} className="print-hide text-purple-600 text-[11px] font-body font-semibold hover:underline flex items-center gap-0.5">
                                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                                Upload
                                              </button>}
                                            </>
                                          );
                                        })()}
                                        {!isReadOnly && <button onClick={() => setTransportModal({ legIndex: legIdx })} className="text-accent-cyan text-[11px] font-body font-semibold hover:underline">Replace</button>}
                                      </div>
                                    </div>
                                    {/* Vertical route stepper */}
                                    {hasTimes ? (
                                      <div className="relative ml-1 mb-2.5">
                                        <div className={`absolute left-[5px] top-[10px] bottom-[10px] w-[2px] ${lineColor}`} />
                                        {/* Departure */}
                                        <div className="flex items-start gap-3 relative pb-3">
                                          <div className={`w-3 h-3 rounded-full ${dotColor} border-2 border-white flex-shrink-0 mt-0.5 relative z-10`} />
                                          <div className="flex-1 min-w-0">
                                            <span className={`text-[10px] ${labelColor} font-body font-bold uppercase tracking-wider`}>DEP</span>
                                            <span className="text-[13px] font-mono font-bold text-text-primary ml-2">{train.departure}</span>
                                            <p className="text-[11px] text-text-muted font-body truncate mt-0.5">{train.fromStation || stop.name || 'Departure Station'}</p>
                                          </div>
                                        </div>
                                        {/* Journey info */}
                                        <div className="flex items-center gap-2 pl-6 pb-3">
                                          <span className="text-[10px] text-text-muted font-mono">{train.duration || ''}</span>
                                          <span className="text-[10px] text-text-muted font-body">&middot;</span>
                                          <span className="text-[10px] text-text-secondary font-body">{train.operator || train.trainName} {train.trainNumber}</span>
                                        </div>
                                        {/* Arrival */}
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
                                          <span className="text-text-secondary font-body">{formatPrice(train.price, currency)}/pax &times; {trip.adults + (trip.children || 0)}</span>
                                          <span className="text-accent-cyan font-mono font-bold text-[12px]">Total: {formatPrice(train.price * (trip.adults + (trip.children || 0)), currency)}</span>
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
                          // Look up real travel times between this stop and next non-meal stop
                          const nextStopIdx = day.stops.findIndex((s, idx) => idx > si && !s.mealType);
                          const nextStop = nextStopIdx >= 0 ? day.stops[nextStopIdx] : null;
                          const travelKey = nextStop ? `${stop.name}→${nextStop.name}` : '';
                          const travelData = travelKey ? travelBetween[travelKey] : null;
                          const selMode = travelData?.selected || 'walk';
                          const selData = travelData?.[selMode as 'walk' | 'transit' | 'drive'];
                          const selIcon = selMode === 'transit' ? 'publicTransit' : selMode === 'drive' ? 'drive' : 'walk';
                          const isDropdownOpen = openTravelDropdown === travelKey;
                          const gmapsTravelMode = selMode === 'drive' ? 'driving' : selMode === 'transit' ? 'transit' : 'walking';
                          // Use a real place name for directions origin — skip "Free time", "Morning in", meal names
                          const originName = (stop.name.startsWith('Free time') || stop.name.startsWith('Morning in') || stop.mealType)
                            ? (day.stops.slice(0, si).reverse().find(s => s.type === 'hotel' || (s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time')))?.name || day.city)
                            : stop.name;
                          const gmapsUrl = nextStop ? `https://www.google.com/maps/dir/${encodeURIComponent(originName + ', ' + day.city)}/${encodeURIComponent(nextStop.name + ', ' + day.city)}/@0,0,14z/data=!3m1!4b1!4m2!4m1!3e${gmapsTravelMode === 'driving' ? '0' : gmapsTravelMode === 'transit' ? '3' : '2'}` : '';

                          return (
                            <div className="pl-4 py-1">
                              <div className="ml-2 border-l-2 border-dashed border-border-subtle pl-4 py-1">
                                {legIdx !== undefined ? (
                                  isReadOnly ? (
                                  <div className="flex items-center gap-2 text-text-secondary">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d={TRANSPORT_ICONS[stop.transport.icon] || TRANSPORT_ICONS.drive} />
                                    </svg>
                                    {hasDurationInfo ? (
                                      <span className="text-xs font-mono">{stop.transport.duration} &middot; {stop.transport.distance}</span>
                                    ) : (
                                      <span className="text-xs font-body text-text-muted capitalize">{stop.transport.icon === 'walk' ? 'Walk' : stop.transport.icon}</span>
                                    )}
                                  </div>
                                  ) : (
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
                                  )
                                ) : (
                                  <div className="relative">
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-2 bg-gray-50/80 rounded-lg px-2.5 py-1.5 border border-gray-100/60">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 flex-shrink-0"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
                                        <button
                                          onClick={() => setOpenTravelDropdown(isDropdownOpen ? null : travelKey)}
                                          className="print-hide flex items-center gap-2 hover:text-accent-cyan transition-colors group text-text-secondary"
                                        >
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-accent-cyan flex-shrink-0">
                                            <path d={TRANSPORT_ICONS[selIcon] || TRANSPORT_ICONS.walk} />
                                          </svg>
                                          {selData ? (
                                            <span className="text-[11px] font-mono">{selData.duration} &middot; {selData.distance}
                                              {(() => {
                                                // Use correct city: pre-transport stops use departureCity, post-transport use day.city
                                                const transportIdx = day.stops.findIndex(s => s.legIndex !== undefined);
                                                const isBeforeTransport = transportIdx >= 0 && si < transportIdx;
                                                const cityKey = isBeforeTransport ? (day.departureCity || day.city) : day.city;
                                                const ltAll = trip.deepPlanData?.localTransport || {};
                                                const lt = ltAll[cityKey] || ltAll[day.city] || ltAll[day.departureCity || ''];
                                                if (selMode === 'walk') return <span className="text-emerald-500 ml-1">Free</span>;
                                                if (!lt) {
                                                  // No AI transport data — estimate from distance
                                                  const distMatch2 = selData.distance?.match(/([\d.]+)\s*km/);
                                                  const distKm2 = distMatch2 ? parseFloat(distMatch2[1]) : 0;
                                                  if (distKm2 > 0 && selMode !== 'walk') {
                                                    const estCost = selMode === 'transit' ? Math.round(distKm2 * 5) : Math.round(distKm2 * 15);
                                                    return <span className="text-violet-500 ml-1">~{formatPrice(estCost, currency)}</span>;
                                                  }
                                                  return null;
                                                }
                                                const rate = convRates[lt.currency?.toUpperCase()] || 1;
                                                const distMatch = selData.distance?.match(/([\d.]+)\s*km/);
                                                const distKm = distMatch ? parseFloat(distMatch[1]) : 3;
                                                if (selMode === 'transit') {
                                                  // Scale transit: 1 ride for <5km, 2 for 5-15km, 3 for 15km+
                                                  const rides = distKm < 5 ? 1 : distKm < 15 ? 2 : 3;
                                                  const perRide = lt.metroSingleRide || lt.busSingleRide || 2;
                                                  // If daily pass is cheaper than rides, suggest it
                                                  const rideCost = rides * perRide;
                                                  const cost = lt.dailyPass && lt.dailyPass < rideCost ? lt.dailyPass : rideCost;
                                                  return <span className="text-violet-500 ml-1">~{formatPrice(Math.round(cost * rate), currency)}</span>;
                                                }
                                                return <span className="text-violet-500 ml-1">~{formatPrice(Math.round(distKm * (lt.taxiPerKm || 2) * rate), currency)}</span>;
                                              })()}
                                            </span>
                                          ) : travelData?._fetched ? (
                                            <span className="text-[11px] font-body text-text-muted">Walk <span className="text-emerald-500">Free</span></span>
                                          ) : (
                                            <span className="text-[11px] font-body text-text-muted/50">
                                              <span className="inline-block w-2.5 h-2.5 border border-text-muted/30 border-t-text-muted/60 rounded-full animate-spin mr-1 align-middle" />
                                              Loading...
                                            </span>
                                          )}
                                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-muted"><path d="M6 9l6 6 6-6"/></svg>
                                        </button>
                                        {gmapsUrl && (
                                          <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                                            className="print-hide text-[11px] text-accent-cyan hover:underline font-body font-semibold transition-colors ml-auto">
                                            Directions &rarr;
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    {/* Directions dropdown */}
                                    {isDropdownOpen && travelData && (
                                      <div className="absolute left-0 top-full mt-1 z-50 bg-bg-surface border border-border-subtle rounded-lg shadow-xl p-2 min-w-[200px] space-y-1">
                                        {([['walk', '🚶', 'Walk'], ['transit', '🚌', 'Transit'], ['drive', '🚗', 'Drive']] as const).map(([mode, emoji, label]) => {
                                          const d = travelData[mode];
                                          return (
                                            <button key={mode} onClick={() => { setTravelBetween(prev => ({ ...prev, [travelKey]: { ...prev[travelKey], selected: mode } })); setOpenTravelDropdown(null); }}
                                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[12px] transition-colors ${selMode === mode ? 'bg-accent-cyan/10 text-accent-cyan font-bold' : 'hover:bg-bg-card text-text-secondary'}`}>
                                              <span className="text-base">{emoji}</span>
                                              <span className="flex-1 font-body">{label}</span>
                                              {d ? (
                                                <span className="font-mono text-[11px] text-text-muted">{d.duration} &middot; {d.distance}</span>
                                              ) : (travelData as any)?._fetched ? (
                                                <span className="text-[11px] text-text-muted/40 italic font-body">N/A</span>
                                              ) : (
                                                <span className="text-[11px] text-text-muted/50 italic font-body">Loading...</span>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );

                    if (useReorder && isDraggableActivity) {
                      return (
                        <Reorder.Item
                          key={stop.id}
                          value={stop.id}
                          as="div"
                          className={`relative ${isReadOnly ? '' : 'cursor-grab active:cursor-grabbing active:z-10'} select-none`}
                          dragListener={!isReadOnly}
                          whileDrag={isReadOnly ? undefined : { scale: 1.02, boxShadow: '0 8px 25px rgba(232,101,74,0.15)', background: '#FFFFFF', borderRadius: '12px', zIndex: 50 }}
                        >
                          {stopContent}
                        </Reorder.Item>
                      );
                    }

                    // Non-draggable stops inside Reorder.Group: wrap as static Reorder.Item so layout tracking works
                    if (useReorder && !isDraggableActivity) {
                      return (
                        <Reorder.Item
                          key={stop.id}
                          value={stop.id}
                          as="div"
                          className="relative"
                          dragListener={false}
                          style={{ cursor: 'default' }}
                        >
                          {stopContent}
                        </Reorder.Item>
                      );
                    }

                    return <div key={stop.id} className="relative">{stopContent}</div>;
                  });

                  return useReorder ? (
                    <Reorder.Group
                      axis="y"
                      values={allStopIds}
                      onReorder={(newOrder: string[]) => {
                        // Filter to only activity IDs for persistence (non-draggable items stay in place)
                        const reorderedActivities = newOrder.filter(id => activityIds.includes(id));
                        handleActivityReorder(day.day, reorderedActivities);
                      }}
                      as="div"
                      className={`ml-4 border-l-2 ${dayStyle.line} pl-0 mt-2`}
                    >
                      {stopsContent}
                    </Reorder.Group>
                  ) : (
                    <div className={`ml-4 border-l-2 ${dayStyle.line} pl-0 mt-2`}>
                      {stopsContent}
                    </div>
                  );
                })()}

                {/* Smart empty state / Generate Itinerary for days with free time */}
                {!isReadOnly && (day.type === 'travel' || day.type === 'departure' || day.type === 'arrival') && day.stops.some(s => s.name.startsWith('Free time')) && (() => {
                  const freeStop = day.stops.find(s => s.name.startsWith('Free time'));
                  const hoursMatch = freeStop?.name.match(/(\d+)\s*hours?/);
                  const freeHours = hoursMatch ? parseInt(hoursMatch[1]) : 4;
                  if (freeHours < 1) return null;
                  return (
                  <div className="print-hide ml-4 pl-4 mt-3">
                    <div className="bg-gradient-to-r from-accent-cyan/5 to-transparent border border-accent-cyan/15 rounded-xl p-3">
                      <p className="text-[12px] text-text-secondary font-body mb-2">
                        You have <span className="font-semibold text-text-primary">{freeHours} hours free</span> in {day.city}. Fill them with activities?
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {generatingDay[day.day] ? (
                          <span className="flex items-center gap-2 text-[12px] text-accent-cyan font-body">
                            <span className="w-3 h-3 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </span>
                        ) : (
                          <button
                            onClick={() => handleGenerateItinerary(day.day, day.city, freeHours)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan text-white text-[12px] font-body font-semibold rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            Auto-plan this day
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {/* Empty state for explore days with no attractions */}
                {!isReadOnly && day.type === 'explore' && day.stops.filter(s => s.type === 'attraction' && !s.mealType).length === 0 && !showActivityInput[day.day] && (
                  <div className="print-hide ml-4 pl-4 mt-3">
                    <div className="bg-gradient-to-r from-emerald-50/50 to-transparent border border-emerald-200/30 rounded-xl p-3 text-center">
                      <p className="text-[12px] text-text-secondary font-body mb-2">This day is still open. Add some activities?</p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={() => setShowActivityInput(prev => ({ ...prev, [day.day]: true }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan text-white text-[12px] font-body font-semibold rounded-lg hover:opacity-90 transition-opacity"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Add places
                        </button>
                        {!aiLoading[day.city] && (() => {
                          const cityKey = day.city;
                          const dest = trip.destinations.find(d => (d.city.parentCity || d.city.name) === cityKey || d.city.name === cityKey);
                          if (!dest) return null;
                          const exploreDaysCount = Math.max(0, dest.nights - 1);
                          return (
                            <button
                              onClick={() => refreshAiActivities(cityKey, dest.city.country || '', exploreDaysCount, dest.places?.map(p => p.name) || [])}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-accent-cyan/30 text-accent-cyan text-[12px] font-body font-semibold rounded-lg hover:bg-accent-cyan/5 transition-colors"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                              Auto-plan
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Add Activity input form (explore days, shown via header button) */}
                {!isReadOnly && (day.type === 'explore' || day.type === 'arrival') && showActivityInput[day.day] && (() => {
                  const suggestions = placeSuggestions[day.day] || [];
                  return (
                  <div className="print-hide ml-4 pl-4 mt-2 overflow-visible">
                    <div className="flex items-center gap-2 flex-wrap bg-bg-card border border-accent-cyan/30 rounded-xl p-2.5 relative overflow-visible">
                      <div className="flex-1 min-w-[120px] relative overflow-visible">
                        <input
                          type="text"
                          placeholder="Search places..."
                          value={activityInputText[day.day] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setActivityInputText(prev => ({ ...prev, [day.day]: val }));
                            // Fetch suggestions from Google Places
                            if (val.length >= 2) {
                              fetch(`/api/places?input=${encodeURIComponent(val + ' ' + day.city)}&scope=all`)
                                .then(r => r.json())
                                .then(data => {
                                  const items = (data.suggestions || []).slice(0, 5).map((s: any) => ({
                                    name: s.placePrediction?.structuredFormat?.mainText?.text || s.placePrediction?.text?.text || '',
                                    description: s.placePrediction?.structuredFormat?.secondaryText?.text || '',
                                  })).filter((s: any) => s.name);
                                  setPlaceSuggestions(prev => ({ ...prev, [day.day]: items }));
                                })
                                .catch(() => {});
                            } else {
                              setPlaceSuggestions(prev => ({ ...prev, [day.day]: [] }));
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') { handleAddActivity(day.day); setPlaceSuggestions(prev => ({ ...prev, [day.day]: [] })); } if (e.key === 'Escape') setShowActivityInput(prev => ({ ...prev, [day.day]: false })); }}
                          className="w-full text-xs font-body bg-transparent border border-border-subtle rounded-lg px-3 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan"
                          autoFocus
                        />
                        {suggestions.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 w-full bg-white border border-border-subtle rounded-lg shadow-2xl z-[100] overflow-hidden">
                            {suggestions.map((s: any, i: number) => (
                              <button key={i} onClick={() => {
                                setActivityInputText(prev => ({ ...prev, [day.day]: s.name }));
                                setPlaceSuggestions(prev => ({ ...prev, [day.day]: [] }));
                              }}
                                className="w-full text-left px-3 py-2 hover:bg-accent-cyan/5 transition-colors border-b border-border-subtle/50 last:border-0"
                              >
                                <p className="text-[12px] font-body font-medium text-text-primary">{s.name}</p>
                                {s.description && <p className="text-[10px] font-body text-text-muted truncate">{s.description}</p>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="time"
                        value={activityInputTime[day.day] || getDefaultActivityTime(day.day)}
                        onChange={e => {
                          let v = e.target.value;
                          if (v < '06:00') v = '06:00';
                          else if (v > '22:00') v = '22:00';
                          setActivityInputTime(prev => ({ ...prev, [day.day]: v }));
                        }}
                        min="06:00" max="22:00"
                        className="text-xs font-mono bg-transparent border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent-cyan w-[90px]"
                      />
                      <button
                        onClick={() => { handleAddActivity(day.day); setPlaceSuggestions(prev => ({ ...prev, [day.day]: [] })); }}
                        className="px-3 py-1.5 bg-accent-cyan text-white text-xs font-body font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowActivityInput(prev => ({ ...prev, [day.day]: false }))}
                        className="text-text-muted hover:text-text-primary text-sm px-1"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {/* Day Notes */}
                {isReadOnly ? (
                  dayNotes[day.day] ? (
                    <div className="ml-4 pl-4 mt-2">
                      <p className="text-[11px] text-text-muted font-body italic flex items-start gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        {dayNotes[day.day]}
                      </p>
                    </div>
                  ) : null
                ) : (
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
                        maxLength={1000}
                        className="w-full text-xs font-body bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan resize-none"
                      />
                      <span className="text-[9px] text-text-muted font-mono">{(dayNotes[day.day] || '').length}/1000</span>
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
                )}

                  </div>
                )}{/* end collapsible day content */}
                </div>{/* end day card */}
              </div>
            );
          })}

          {/* Trip Summary — mobile only (sidebar handles desktop) */}
          <div className="md:hidden mt-6 bg-bg-surface border border-border-subtle rounded-xl p-4 shadow-sm">
            <h3 className="font-display font-bold text-[14px] text-text-primary mb-3">Trip Summary</h3>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div><p className="text-accent-cyan font-mono font-bold text-[18px]">{adjustedDays.length}</p><p className="text-text-muted text-[11px] font-body">Days</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-[18px]">{trip.destinations.length}</p><p className="text-text-muted text-[11px] font-body">Cities</p></div>
              <div><p className="text-accent-cyan font-mono font-bold text-[18px]">{totalNights}</p><p className="text-text-muted text-[11px] font-body">Nights</p></div>
            </div>
            {(flightCost + trainCost + hotelCost + attractionCost + foodCost + localTransportCost) > 0 && (
              <div className="pt-3 border-t border-border-subtle space-y-2">
                {flightCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Flights</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(flightCost, currency)}</span>
                  </div>
                )}
                {trainCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Trains</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(trainCost, currency)}</span>
                  </div>
                )}
                {hotelCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Hotels ({totalNights}N)</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(hotelCost, currency)}</span>
                  </div>
                )}
                {attractionCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Attractions</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(attractionCost, currency)}</span>
                  </div>
                )}
                {foodCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Food ({totalDays}D)</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(foodCost, currency)}</span>
                  </div>
                )}
                {localTransportCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-text-muted font-body">Local Transport</span>
                    <span className="text-[13px] font-mono text-text-secondary">{formatPrice(localTransportCost, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border-subtle">
                  <span className="text-[13px] text-text-primary font-body font-semibold">Estimated Total</span>
                  <span className="text-accent-cyan font-mono font-bold text-[15px]">{formatPrice(flightCost + trainCost + hotelCost + attractionCost + foodCost + localTransportCost, currency)}</span>
                </div>
              </div>
            )}
            {trip.destinations.some(d => d.nights > 0 && !d.selectedHotel) && (
              <p className="mt-2 text-[11px] text-amber-600 font-body flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Some destinations have no hotel selected.
              </p>
            )}
            {trip.transportLegs.some(l => !l.selectedFlight && !l.selectedTrain) && !isLocalStay && (
              <p className="mt-1 text-[11px] text-amber-600 font-body flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Some transport legs have no selection.
              </p>
            )}
          </div>

          </div>{/* end main itinerary column */}

          {/* ====== [F] SIDEBAR — Desktop Only ====== */}
          <DeepPlanSidebar
            adjustedDays={adjustedDays}
            tripId={trip.tripId}
            destinations={trip.destinations}
            transportLegs={trip.transportLegs}
            from={trip.from}
            bookingDocs={trip.bookingDocs}
            totalNights={totalNights}
            isLocalStay={isLocalStay}
            flightCost={flightCost}
            trainCost={trainCost}
            hotelCost={hotelCost}
            attractionCost={attractionCost}
            foodCost={foodCost}
            localTransportCost={localTransportCost}
            totalDays={totalDays}
            currency={currency}
            setCurrency={setCurrency}
            isReadOnly={isReadOnly}
            shareToken={shareToken || undefined}
          />

          </div>{/* end 2-column layout */}
        </div>
      </motion.div>

      {/* Hotel Modal */}
      {!isReadOnly && hotelModal !== null && (() => {
        const dest = trip.destinations[hotelModal.destIndex];
        if (!dest) return null;
        return <HotelModal isOpen onClose={() => setHotelModal(null)}
          cityName={dest.city.name} locationQuery={dest.city.fullName} nights={dest.nights} selectedHotel={dest.selectedHotel}
          onSelectHotel={h => { trip.updateDestinationHotel(dest.id, h); setHotelModal(null); }} />;
      })()}

      {/* Transport Compare Modal (full-screen, same as route page) */}
      {!isReadOnly && transportModal !== null && (() => {
        const { fromCity, toCity } = getLegCities(transportModal.legIndex);
        const leg = trip.transportLegs[transportModal.legIndex];
        if (!fromCity || !toCity) return null;
        return (
          <TransportCompareModal
            isOpen
            onClose={() => setTransportModal(null)}
            fromCity={fromCity?.name || ''}
            toCity={toCity?.name || ''}
            fromCode={leg?.resolvedAirports?.fromCode || (fromCity as any)?.airportCode || ''}
            toCode={leg?.resolvedAirports?.toCode || (toCity as any)?.airportCode || ''}
            fromAirport={(fromCity as any)?.airport?.name || fromCity?.name || ''}
            toAirport={(toCity as any)?.airport?.name || toCity?.name || ''}
            date={trip.departureDate}
            adults={trip.adults}
            children={trip.children}
            infants={trip.infants}
            currentType={leg?.type || 'drive'}
            selectedFlight={leg?.selectedFlight || null}
            selectedTrain={leg?.selectedTrain || null}
            cachedFlights={null}
            onSelectFlight={(flight, airportInfo) => {
              if (leg) {
                trip.selectFlight(leg.id, flight);
                if (airportInfo) {
                  const routeParts = flight.route?.split('-') || [];
                  const updated = {
                    fromCode: airportInfo.fromCode,
                    fromCity: airportInfo.fromCity,
                    fromDistance: airportInfo.fromDistance,
                    fromAirport: airportInfo.fromCity,
                    toCode: routeParts[1]?.trim() || leg.resolvedAirports?.toCode || '',
                    toCity: leg.resolvedAirports?.toCity || toCity?.name || '',
                    toAirport: leg.resolvedAirports?.toAirport || '',
                    toDistance: leg.resolvedAirports?.toDistance || 0,
                  };
                  trip.updateTransportLeg(leg.id, { resolvedAirports: updated });
                }
              }
              setTransportModal(null);
            }}
            onSelectTrain={train => {
              if (leg) trip.selectTrain(leg.id, train);
              setTransportModal(null);
            }}
            onSelectBus={bus => {
              if (leg) trip.updateTransportLeg(leg.id, { type: 'bus', selectedFlight: null, selectedTrain: bus });
              setTransportModal(null);
            }}
            onSelectDrive={(info) => {
              if (!leg) { setTransportModal(null); return; }
              const distKm = parseFloat((info?.distance || '0').replace(/[^\d.]/g, '')) || 0;
              const fuelCostINR = Math.round(distKm * 8);
              const cabCostINR = Math.round(distKm * 18);
              const isCab = info?.mode === 'cab';
              const isWalk = info?.mode === 'walk';
              const isCycle = info?.mode === 'cycle';
              const price = isWalk || isCycle ? 0 : isCab ? cabCostINR : fuelCostINR;
              trip.updateTransportLeg(leg.id, {
                type: 'drive',
                selectedFlight: null,
                selectedTrain: {
                  id: `drive-${leg.id}`,
                  operator: isCab ? 'Hire Cab' : isWalk ? 'Walking' : isCycle ? 'Cycling' : 'Self Drive',
                  trainName: '', trainNumber: '', departure: '', arrival: '',
                  duration: info?.duration || '', price,
                  stops: 'Direct', fromStation: '', toStation: '', color: '#64748b',
                },
                distance: info?.distance || '',
              });
              setTransportModal(null);
            }}
          />
        );
      })()}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 90% !important;
          }
          .print-hide { display: none !important; }
          .deep-plan-page {
            padding: 0 !important;
            max-width: 100% !important;
          }
          .deep-plan-page > div {
            max-width: 100% !important;
          }
          /* Force single column in print — hide sidebar */
          .deep-plan-page aside { display: none !important; }
          .deep-plan-page .md\\:flex { display: block !important; }
          .deep-plan-page .md\\:hidden { display: block !important; }
          /* Remove card shadows */
          .deep-plan-page .rounded-xl { border-radius: 4px !important; box-shadow: none !important; }
          .deep-plan-page .rounded-lg { border-radius: 2px !important; box-shadow: none !important; }
          .deep-plan-page .shadow-sm { box-shadow: none !important; }
          /* Day type badges: keep readable */
          .deep-plan-page .bg-blue-50,
          .deep-plan-page .bg-emerald-50,
          .deep-plan-page .bg-orange-50 {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Show all days expanded */
          .deep-plan-page [id^="day-"] > div > div:not(:first-child) { display: block !important; }
          /* Hide photos in print */
          .deep-plan-page img[loading="lazy"] { display: none !important; }
          /* Compact font sizes */
          .deep-plan-page h1 { font-size: 16px !important; }
          .deep-plan-page h2 { font-size: 12px !important; }
          .deep-plan-page h3 { font-size: 11px !important; }
          /* Avoid page breaks */
          .deep-plan-page [id^="day-"] { page-break-inside: avoid; break-inside: avoid; }
          /* Force backgrounds */
          .deep-plan-page [style*="backgroundColor"] {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Share Trip Modal */}
      {!isReadOnly && trip.tripId && (
        <ShareTripModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          tripId={trip.tripId}
          view="deepplan"
        />
      )}

      {/* Hidden file input for booking doc uploads */}
      {!isReadOnly && <input ref={uploadRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUploadBooking} />}

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

export default function DeepPlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" /></div>}>
      <DeepPlanPageContent />
    </Suspense>
  );
}
