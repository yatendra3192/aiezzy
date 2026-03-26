'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { motion, Reorder } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import { CITIES, City, Place } from '@/data/mockData';
import { searchPlaces, getPlaceDetails, PlacePrediction } from '@/lib/googleApi';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';
import AISuggestModal from '@/components/AISuggestModal';
import { setBookingFiles, setBookingCityMap, clearBookingStore } from '@/lib/bookingStore';

// ─── Google Places Autocomplete ──────────────────────────────────────────────

function PlacesAutocomplete({
  placeholder,
  onSelect,
  initialValue,
  onSelectRaw,
  scope = 'cities',
}: {
  placeholder: string;
  onSelect?: (city: City) => void;
  initialValue?: string;
  onSelectRaw?: (prediction: PlacePrediction) => void;
  scope?: 'cities' | 'all';
}) {
  const [query, setQuery] = useState(initialValue || '');
  const [open, setOpen] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [localResults, setLocalResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const blurRef = useRef<ReturnType<typeof setTimeout>>();
  const userInteractedRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  // Reposition dropdown on scroll
  useEffect(() => {
    if (!open) return;
    const handleScroll = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [open]);

  const updateRect = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  };

  const doSearch = useCallback(async (text: string) => {
    if (text.length < 2) { setPredictions([]); setLocalResults([]); setLoading(false); return; }
    setLoading(true);
    const local = CITIES.filter(c => c.fullName.toLowerCase().includes(text.toLowerCase()));
    setLocalResults(local.slice(0, 3));
    try {
      const results = await searchPlaces(text, scope);
      setPredictions(results.slice(0, 6));
    } catch { /* ignore */ }
    setLoading(false);
    updateRect();
  }, [scope]);

  const handleChange = (value: string) => {
    setQuery(value);
    userInteractedRef.current = true;
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = async (pred: PlacePrediction) => {
    setQuery(initialValue !== undefined ? pred.description : '');
    setOpen(false);
    setPredictions([]);
    setLocalResults([]);
    if (onSelectRaw) onSelectRaw(pred);
    if (onSelect) {
      // Check if the main text exactly matches a known city (not partial match)
      const exactMatch = CITIES.find(c =>
        c.name.toLowerCase() === pred.mainText.toLowerCase()
      );
      if (exactMatch) {
        onSelect(exactMatch);
      } else {
        // Get real city/country from Google Place Details API
        const details = await getPlaceDetails(pred.placeId);
        // Use Google's locality (city) from address components — most reliable
        const realCity = details?.city || '';
        // Try to inherit transport hubs from a known city
        const cityInName = CITIES.find(c =>
          (realCity && c.name.toLowerCase() === realCity.toLowerCase()) ||
          pred.description.toLowerCase().includes(c.name.toLowerCase())
        );
        // Resolve parentCity with multiple fallbacks:
        // 1. Google locality (realCity) — most reliable when present
        // 2. Known city match from description (cityInName)
        // 3. Parse from secondaryText (e.g., "Paris, France" → "Paris")
        // 4. Parse from formattedAddress (second-to-last comma segment before country)
        // 5. Last resort: use the place name itself
        let resolvedParentCity = realCity;
        if (!resolvedParentCity && cityInName) {
          resolvedParentCity = cityInName.name;
        }
        if (!resolvedParentCity && pred.secondaryText) {
          // secondaryText is typically "City, Country" or "Street, City, Country"
          const parts = pred.secondaryText.split(',').map(s => s.trim());
          // Try to find a known city in the parts
          const knownPart = parts.find(p => CITIES.some(c => c.name.toLowerCase() === p.toLowerCase()));
          resolvedParentCity = knownPart || parts[0] || '';
        }
        if (!resolvedParentCity && details?.formattedAddress) {
          // formattedAddress: "Musée du Louvre, Rue de Rivoli, 75001 Paris, France"
          const addrParts = details.formattedAddress.split(',').map(s => s.trim());
          if (addrParts.length >= 3) {
            // Second-to-last part often contains "75001 Paris" — strip postal code
            const cityPart = addrParts[addrParts.length - 2].replace(/^\d{3,6}\s*/, '');
            resolvedParentCity = cityPart;
          }
        }
        if (!resolvedParentCity) resolvedParentCity = pred.mainText;

        // Resolve country with fallback
        const resolvedCountry = details?.country || cityInName?.country
          || (pred.secondaryText ? pred.secondaryText.split(',').map(s => s.trim()).pop() : '')
          || '';

        onSelect({
          name: pred.mainText,
          country: resolvedCountry,
          fullName: pred.description,
          parentCity: resolvedParentCity,
          // Inherit airport/train station from the known city
          ...(cityInName?.airport ? { airport: cityInName.airport, airportCode: cityInName.airportCode } : {}),
          ...(cityInName?.trainStation ? { trainStation: cityInName.trainStation } : {}),
        });
      }
    }
  };

  const handleSelectLocal = (city: City) => {
    setQuery(initialValue !== undefined ? city.fullName : '');
    setOpen(false);
    setPredictions([]);
    setLocalResults([]);
    if (onSelect) onSelect(city);
  };

  const hasResults = predictions.length > 0 || localResults.length > 0;
  const showDropdown = open && query.length >= 2 && (hasResults || loading);

  // Render dropdown via portal with fixed positioning
  const dropdownPortal = showDropdown && mounted && rect ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 99999,
      }}
      className="bg-bg-elevated border border-border-subtle rounded-xl overflow-hidden shadow-2xl shadow-black/50 max-h-[280px] overflow-y-auto"
      onMouseDown={e => { e.preventDefault(); if (blurRef.current) clearTimeout(blurRef.current); }}
    >
      {loading && !hasResults && (
        <div className="flex items-center justify-center py-4">
          <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
          <span className="text-text-muted text-xs ml-2">Searching...</span>
        </div>
      )}
      {predictions.map(pred => (
        <button
          key={pred.placeId}
          onClick={() => handleSelect(pred)}
          className="w-full text-left px-4 py-3 text-sm font-body text-text-primary hover:bg-accent-cyan/10 transition-colors border-b border-border-subtle last:border-0"
        >
          <span className="text-accent-cyan mr-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </span>
          <span className="font-semibold">{pred.mainText}</span>
          {pred.secondaryText && <span className="text-text-muted ml-1">{pred.secondaryText}</span>}
        </button>
      ))}
      {predictions.length === 0 && localResults.map(city => (
        <button
          key={city.name}
          onClick={() => handleSelectLocal(city)}
          className="w-full text-left px-4 py-3 text-sm font-body text-text-primary hover:bg-accent-cyan/10 transition-colors border-b border-border-subtle last:border-0"
        >
          <span className="text-accent-cyan mr-2">&#9679;</span>
          {city.fullName}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onMouseDown={() => { userInteractedRef.current = true; }}
          onClick={() => {
            if (!userInteractedRef.current) return;
            setOpen(true); updateRect();
            if (query.length >= 2) doSearch(query);
          }}
          onBlur={() => {
            if (blurRef.current) clearTimeout(blurRef.current);
            blurRef.current = setTimeout(() => { setOpen(false); }, 200);
          }}
          className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all input-glow focus:border-accent-cyan pr-8"
        />
        {loading && !showDropdown && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
          </div>
        )}
      </div>
      {dropdownPortal}
    </div>
  );
}

// ─── Counter ─────────────────────────────────────────────────────────────────

function Counter({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-8 h-8 rounded-lg bg-bg-card border border-border-subtle text-text-secondary hover:border-accent-cyan hover:text-accent-cyan transition-all flex items-center justify-center text-lg font-mono">-</button>
      <span className="font-mono text-lg text-text-primary w-6 text-center">{value}</span>
      <button onClick={() => onChange(value + 1)} className="w-8 h-8 rounded-lg bg-bg-card border border-border-subtle text-text-secondary hover:border-accent-cyan hover:text-accent-cyan transition-all flex items-center justify-center text-lg font-mono">+</button>
    </div>
  );
}

// ─── Plan Page ───────────────────────────────────────────────────────────────

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTripId = searchParams.get('id');
  const { data: session } = useSession();
  const trip = useTrip();
  const { currency } = useCurrency();
  const [isRestoring, setIsRestoring] = useState(false);
  const [editingFrom, setEditingFrom] = useState(!trip.fromAddress);

  // Sync editingFrom when fromAddress is set externally (e.g., AI suggest, trip load)
  useEffect(() => {
    if (trip.fromAddress) setEditingFrom(false);
  }, [trip.fromAddress]);

  // Restore trip from URL param, context, or sessionStorage on page reload
  useEffect(() => {
    if (trip.destinations.length > 0 || trip.userPlaces.length > 0) return; // Already have data in context

    const idToLoad = urlTripId || trip.tripId || (() => { try { return sessionStorage.getItem('currentTripId'); } catch { return null; } })();
    if (idToLoad) {
      setIsRestoring(true);
      trip.loadTrip(idToLoad).catch(() => {}).finally(() => setIsRestoring(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAISuggest, setShowAISuggest] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<typeof trip.destinations | null>(null);
  const [optimizeSavings, setOptimizeSavings] = useState('');
  const [pendingOptimize, setPendingOptimize] = useState(false);
  // Booking upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadExtracting, setUploadExtracting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const tripFileInputRef = useRef<HTMLInputElement>(null);

  // After groupPlacesIntoCities populates destinations, trigger route optimization
  useEffect(() => {
    if (pendingOptimize && trip.destinations.length > 0) {
      setPendingOptimize(false);
      optimizeRoute();
    }
  }, [pendingOptimize, trip.destinations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save trip to DB before navigating to /route (prevents data loss on page refresh)
  // Returns the tripId so callers can include it in the URL
  const saveTripBeforeNavigate = async (): Promise<string | null> => {
    try {
      const tripId = await trip.saveTrip();
      if (tripId) {
        try { sessionStorage.setItem('currentTripId', tripId); } catch {}
      }
      return tripId || null;
    } catch (e) {
      console.error('Pre-navigation save failed:', e);
      // Continue navigation even if save fails — data is still in context
      return trip.tripId || null;
    }
  };

  // Route optimization: find the shortest path using nearest neighbor algorithm
  const optimizeRoute = async () => {
    if (trip.destinations.length < 3) {
      // 2 or fewer destinations - no optimization needed
      const tripId = await saveTripBeforeNavigate();
      router.push(tripId ? `/route?id=${tripId}` : '/route');
      return;
    }

    setOptimizing(true);
    setShowOptimizeModal(true);

    try {
      // Only optimize among destinations (exclude origin - it's always the start)
      const destNames = trip.destinations.map(d => d.city.fullName || d.city.name);
      const n = destNames.length;
      const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

      // Fetch pairwise distances between destinations only
      const promises: Promise<void>[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          promises.push(
            fetch(`/api/directions?origin=${encodeURIComponent(destNames[i])}&destination=${encodeURIComponent(destNames[j])}&mode=driving`)
              .then(r => r.json())
              .then(data => {
                if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
                  const d = data.routes[0].legs[0].distance.value; // meters
                  dist[i][j] = d;
                  dist[j][i] = d;
                } else {
                  // Fallback: estimate from city names using rough coords
                  dist[i][j] = 500000; // 500km default for unknown
                  dist[j][i] = 500000;
                }
              })
              .catch(() => { dist[i][j] = 500000; dist[j][i] = 500000; })
          );
        }
      }
      await Promise.all(promises);

      // Try all permutations for small N, nearest neighbor for larger
      let bestOrder: number[];

      if (n <= 6) {
        // Brute force all permutations (max 720 for 6 cities)
        const permute = (arr: number[]): number[][] => {
          if (arr.length <= 1) return [arr];
          const result: number[][] = [];
          for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const p of permute(rest)) result.push([arr[i], ...p]);
          }
          return result;
        };

        const indices = Array.from({ length: n }, (_, i) => i);
        const perms = permute(indices);
        let bestDist = Infinity;
        bestOrder = indices;

        for (const perm of perms) {
          let total = 0;
          for (let k = 0; k < perm.length - 1; k++) {
            total += dist[perm[k]][perm[k + 1]];
          }
          if (total < bestDist) {
            bestDist = total;
            bestOrder = perm;
          }
        }
      } else {
        // Nearest neighbor for 7+ destinations
        const visited = new Set<number>();
        bestOrder = [];
        let current = 0; // start from first destination
        visited.add(0);
        bestOrder.push(0);

        while (bestOrder.length < n) {
          let nearest = -1;
          let nearestD = Infinity;
          for (let j = 0; j < n; j++) {
            if (!visited.has(j) && dist[current][j] < nearestD) {
              nearest = j;
              nearestD = dist[current][j];
            }
          }
          if (nearest === -1) break;
          visited.add(nearest);
          bestOrder.push(nearest);
          current = nearest;
        }
      }

      // Check if order differs from current
      const currentOrder = Array.from({ length: n }, (_, i) => i);
      const isAlreadyOptimal = bestOrder.every((v, i) => v === currentOrder[i]);

      if (isAlreadyOptimal) {
        setShowOptimizeModal(false);
        setOptimizing(false);
        const tripId = await saveTripBeforeNavigate();
        router.push(tripId ? `/route?id=${tripId}` : '/route');
        return;
      }

      // Calculate total inter-destination distance for current vs optimized
      let currentTotal = 0;
      for (let k = 0; k < n - 1; k++) currentTotal += dist[k][k + 1];

      let optimizedTotal = 0;
      for (let k = 0; k < bestOrder.length - 1; k++) optimizedTotal += dist[bestOrder[k]][bestOrder[k + 1]];

      const savedKm = Math.round((currentTotal - optimizedTotal) / 1000);
      setOptimizeSavings(savedKm > 0 ? `Save ~${savedKm} km of travel` : 'More efficient route');

      const newDests = bestOrder.map(i => trip.destinations[i]);
      setOptimizedOrder(newDests);
      setOptimizing(false);
    } catch {
      setOptimizing(false);
      setShowOptimizeModal(false);
      const tripId = await saveTripBeforeNavigate();
      router.push(tripId ? `/route?id=${tripId}` : '/route');
    }
  };

  const applyOptimization = async () => {
    if (optimizedOrder) {
      trip.reorderDestinations(optimizedOrder);
    }
    setShowOptimizeModal(false);
    setOptimizedOrder(null);
    const tripId = await saveTripBeforeNavigate();
    router.push(tripId ? `/route?id=${tripId}` : '/route');
  };

  const skipOptimization = async () => {
    setShowOptimizeModal(false);
    setOptimizedOrder(null);
    const tripId = await saveTripBeforeNavigate();
    router.push(tripId ? `/route?id=${tripId}` : '/route');
  };

  // Handle booking files upload and extraction
  const handleTripUpload = async () => {
    if (!uploadFiles.length) return;
    setUploadExtracting(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));

      const res = await fetch('/api/ai/extract-trip', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to process bookings');
      const data = await res.json();
      setUploadResult(data);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to extract trip details');
    } finally {
      setUploadExtracting(false);
    }
  };

  // Apply extracted trip data to context
  const applyUploadResult = async () => {
    if (!uploadResult) return;
    const data = uploadResult;

    // Resolve origin
    const originCity = (() => {
      if (!data.origin?.city) return CITIES[0];
      return CITIES.find(c => c.name.toLowerCase() === data.origin.city.toLowerCase()) || {
        name: data.origin.city, country: data.origin.country || '',
        fullName: `${data.origin.city}, ${data.origin.country || ''}`, parentCity: data.origin.city,
      };
    })();
    const originAddress = originCity.fullName || `${originCity.name}, ${originCity.country}`;

    // Resolve hotels in parallel
    const resolvedHotels = await Promise.all((data.destinations || []).map(async (dest: any, i: number) => {
      if (!dest.hotel?.name) return undefined;
      let addr = dest.hotel.address || '';
      let lat: number | undefined, lng: number | undefined;
      if (addr) {
        try {
          const results = await searchPlaces(addr, 'all');
          if (results.length > 0) {
            const details = await getPlaceDetails(results[0].placeId);
            if (details) { addr = details.formattedAddress; lat = details.lat; lng = details.lng; }
          }
        } catch {}
      }
      return { id: `custom-${Date.now()}-${i}`, name: dest.hotel.name, rating: 0, pricePerNight: dest.hotel.pricePerNight || 0, ratingColor: '#9ca3af', ...(addr && { address: addr }), ...(lat && { lat }), ...(lng && { lng }) } as import('@/data/mockData').Hotel;
    }));

    // Build transport from segments (chronological)
    const transportSegs = (data.segments || [])
      .filter((s: any) => s.type === 'flight' || s.type === 'train')
      .sort((a: any, b: any) => (a.departureDate || '').localeCompare(b.departureDate || ''));

    const tAdults = data.travelers?.adults || 1;
    const tChildren = data.travelers?.children || 0;
    const tInfants = data.travelers?.infants || 0;

    const buildTransport = (seg: any): { flight?: import('@/data/mockData').Flight; train?: import('@/data/mockData').TrainOption; resolvedAirports?: any } | null => {
      if (!seg) return null;
      if (seg.type === 'flight') {
        const totalPrice = seg.priceTotal || 0;
        const divisor = tAdults + tChildren + (tInfants * 0.15);
        const depCode = seg.fromCode || '';
        const arrCode = seg.toCode || '';
        return {
          flight: {
            id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            airline: seg.carrier || 'Unknown', airlineCode: (seg.carrier || '??').substring(0, 2).toUpperCase(),
            flightNumber: seg.flightNumber || '', departure: seg.departureTime || '', arrival: seg.arrivalTime || '',
            duration: seg.duration || '~', stops: seg.stops || 'Nonstop',
            route: depCode && arrCode ? `${depCode}-${arrCode}` : '?-?',
            pricePerAdult: divisor > 0 ? Math.round(totalPrice / divisor) : totalPrice, color: '#6b7280',
          },
          resolvedAirports: {
            fromCode: depCode, toCode: arrCode, fromCity: seg.from || '', toCity: seg.to || '',
            fromAirport: seg.fromHub || seg.from || '', toAirport: seg.toHub || seg.to || '',
            fromDistance: 0, toDistance: 0,
          },
        };
      } else {
        const totalPrice = seg.priceTotal || 0;
        return {
          train: {
            id: `ct-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            operator: seg.carrier || 'Unknown', trainName: seg.carrier || 'Unknown',
            trainNumber: seg.flightNumber || '', departure: seg.departureTime || '', arrival: seg.arrivalTime || '',
            duration: seg.duration || '~', stops: seg.stops || 'Direct',
            fromStation: seg.fromHub || seg.from || '', toStation: seg.toHub || seg.to || '',
            price: tAdults > 0 ? Math.round(totalPrice / tAdults) : totalPrice, color: '#6b7280',
          },
        };
      }
    };

    // Build destinations array
    const destConfigs = (data.destinations || []).map((dest: any, i: number) => {
      const knownCity = CITIES.find(c => c.name.toLowerCase() === dest.city.toLowerCase());
      return {
        city: knownCity || { name: dest.city, country: dest.country || '', fullName: `${dest.city}, ${dest.country || ''}`, parentCity: dest.city } as City,
        nights: dest.nights || 2,
        hotel: resolvedHotels[i] || undefined,
      };
    });

    // Match transport segments to legs by city names (more reliable than index)
    // Leg structure: leg[0] = origin→dest[0], leg[1] = dest[0]→dest[1], ..., leg[n] = dest[n-1]→origin (return)
    const originName = (data.origin?.city || '').toLowerCase();
    const destNames = destConfigs.map((d: any) => d.city.name.toLowerCase());
    const legCities: Array<[string, string]> = [];
    for (let i = 0; i < destConfigs.length; i++) {
      const from = i === 0 ? originName : destNames[i - 1];
      legCities.push([from, destNames[i]]);
    }
    if (data.tripType === 'roundTrip') {
      legCities.push([destNames[destNames.length - 1] || '', originName]);
    }

    const usedSegIndices = new Set<number>();
    const transports: Array<{ flight?: import('@/data/mockData').Flight; train?: import('@/data/mockData').TrainOption; resolvedAirports?: any } | null> = [];

    for (const [fromC, toC] of legCities) {
      // Try to find matching segment by city names (fuzzy: from includes legFrom AND to includes legTo)
      let bestIdx = -1;
      for (let si = 0; si < transportSegs.length; si++) {
        if (usedSegIndices.has(si)) continue;
        const seg = transportSegs[si];
        const segFrom = (seg.from || '').toLowerCase();
        const segTo = (seg.to || '').toLowerCase();
        if ((segFrom.includes(fromC) || fromC.includes(segFrom)) &&
            (segTo.includes(toC) || toC.includes(segTo))) {
          bestIdx = si;
          break;
        }
      }
      // Fallback: find first unused segment in chronological order
      if (bestIdx === -1) {
        for (let si = 0; si < transportSegs.length; si++) {
          if (!usedSegIndices.has(si)) { bestIdx = si; break; }
        }
      }
      if (bestIdx >= 0) {
        usedSegIndices.add(bestIdx);
        transports.push(buildTransport(transportSegs[bestIdx]));
      } else {
        transports.push(null);
      }
    }

    // Build entire trip in ONE atomic setState — no stale state issues
    trip.buildFullTrip({
      from: originCity, fromAddress: originAddress,
      departureDate: data.departureDate || new Date().toISOString().split('T')[0],
      adults: tAdults, children: tChildren, infants: tInfants,
      tripType: data.tripType === 'roundTrip' ? 'roundTrip' : 'oneWay',
      destinations: destConfigs, transports,
    });

    // Close modal immediately — don't wait for file uploads
    setShowUploadModal(false);
    setUploadResult(null);
    setEditingFrom(false);

    // Upload files in background: classify each file individually via AI, then upload to Supabase
    const filesToUpload = [...uploadFiles];
    setUploadFiles([]);
    if (filesToUpload.length > 0) {
      // Step 1: Classify each file in parallel (each gets its own AI call)
      const classifyPromises = filesToUpload.map(async (file) => {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/ai/classify-doc', { method: 'POST', body: fd });
          if (res.ok) return await res.json();
        } catch {}
        return { type: 'general', from: null, to: null, city: null };
      });
      const classifications = await Promise.all(classifyPromises);

      // Step 2: Upload each file to Supabase with correct tags
      const uploadedDocs: import('@/context/TripContext').BookingDoc[] = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const cls = classifications[i];
        const matchCities: string[] = [];
        let docType: 'hotel' | 'transport' | 'general' = 'general';

        if (cls.type === 'flight' || cls.type === 'train') {
          docType = 'transport';
          if (cls.from) matchCities.push(cls.from.toLowerCase());
          if (cls.to) matchCities.push(cls.to.toLowerCase());
        } else if (cls.type === 'hotel') {
          docType = 'hotel';
          if (cls.city) matchCities.push(cls.city.toLowerCase());
        }

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('tripId', trip.tripId || 'pending');
          formData.append('matchCities', matchCities.join(','));
          const res = await fetch('/api/booking-docs', { method: 'POST', body: formData });
          if (res.ok) {
            const doc = await res.json();
            doc.docType = docType;
            uploadedDocs.push(doc);
          }
        } catch { /* continue */ }
      }

      if (uploadedDocs.length > 0) {
        trip.setBookingDocs(uploadedDocs);
      }
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
    <div className="min-h-screen flex justify-center p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-[430px] md:max-w-[680px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 relative">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => router.push('/my-trips')} className="font-display text-xl font-bold hover:opacity-80 transition-opacity"><span className="text-accent-cyan">AI</span>Ezzy</button>
            <div className="flex items-center gap-3">
              {session?.user?.name && <span className="text-text-muted text-xs font-body">{session.user.name}</span>}
              <button onClick={() => signOut({ callbackUrl: '/' })} className="text-text-muted text-xs hover:text-accent-cyan transition-colors font-body">Sign Out</button>
            </div>
          </div>

          <div className="space-y-6">
            {/* FROM */}
            <div>
              <label className="text-accent-gold text-xs font-display font-bold tracking-widest uppercase mb-2 block">From</label>
              {trip.fromAddress && !editingFrom ? (
                <div className="bg-bg-card border border-border-subtle rounded-xl p-3 flex items-center gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-cyan">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    {(() => {
                      // Use parentCity from Google Places, fall back to parsing
                      const cityPart = trip.from.parentCity || (() => {
                        const parts = trip.fromAddress.split(',').map(s => s.trim());
                        const known = parts.find(p => CITIES.some(c => c.name.toLowerCase() === p.toLowerCase()));
                        if (known) return known;
                        if (parts.length >= 4) return parts[parts.length - 3];
                        if (parts.length >= 3) return parts[parts.length - 2];
                        return parts[0] || trip.from.name;
                      })();
                      return (
                        <>
                          <p className="text-sm font-display font-bold text-text-primary truncate">{cityPart || trip.from.name}</p>
                          <p className="text-[10px] text-text-muted font-body truncate">{trip.fromAddress}</p>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => setEditingFrom(true)}
                    className="text-text-muted hover:text-accent-cyan transition-colors text-xs font-body flex-shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <PlacesAutocomplete
                  placeholder="Search your address or city..."
                  initialValue={trip.fromAddress}
                  scope="all"
                  onSelect={city => { trip.setFrom(city); setEditingFrom(false); }}
                  onSelectRaw={pred => { trip.setFromAddress(pred.description); setEditingFrom(false); }}
                />
              )}
            </div>

            {/* PLACES TO VISIT / DESTINATIONS */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-accent-gold text-xs font-display font-bold tracking-widest uppercase">
                  {trip.userPlaces.length > 0 ? 'Places to Visit' : 'Destinations'}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-1 text-[10px] font-display font-bold text-accent-gold hover:text-accent-gold/80 transition-colors bg-accent-gold/10 px-2.5 py-1 rounded-lg"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload Bookings
                  </button>
                  <button
                    onClick={() => setShowAISuggest(true)}
                    className="flex items-center gap-1 text-[10px] font-display font-bold text-accent-cyan hover:text-accent-cyan/80 transition-colors bg-accent-cyan/10 px-2.5 py-1 rounded-lg"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                    </svg>
                    AI Suggest
                  </button>
                </div>
              </div>

              {/* User Places list (places-first flow) */}
              {trip.userPlaces.length > 0 && (
                <Reorder.Group
                  axis="y"
                  values={trip.userPlaces}
                  onReorder={trip.reorderPlaces}
                  className="flex flex-col gap-2 mb-3"
                  as="div"
                >
                  {trip.userPlaces.map((place, idx) => (
                    <Reorder.Item
                      key={place.id}
                      value={place}
                      className="bg-bg-card border border-accent-cyan/30 rounded-xl px-4 py-3 flex items-center gap-3 cursor-grab active:cursor-grabbing active:z-10 transition-shadow select-none"
                      whileDrag={{ scale: 1.02, boxShadow: '0 8px 25px rgba(232,101,74,0.15)', background: '#FFFFFF' }}
                      as="div"
                    >
                      {/* Drag handle */}
                      <div className="flex flex-col gap-0.5 opacity-30 flex-shrink-0 mr-1" aria-label="Drag to reorder" role="img">
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                      </div>
                      {/* Number */}
                      <span className="w-6 h-6 rounded-full bg-accent-cyan text-white text-xs font-mono font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                      {/* Place name + city/country */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold text-text-primary truncate">{place.name}</p>
                        <p className="text-[10px] text-text-muted font-body truncate">{place.parentCity}, {place.country}</p>
                      </div>
                      {/* Nights */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => trip.updatePlaceNights(place.id, place.nights - 1)} aria-label="Decrease nights" className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">-</button>
                        <span className="font-mono text-sm font-bold text-text-primary w-4 text-center">{place.nights}</span>
                        <button onClick={() => trip.updatePlaceNights(place.id, place.nights + 1)} aria-label="Increase nights" className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">+</button>
                        <span className="text-text-muted text-[10px] font-body w-6">nights</span>
                      </div>
                      {/* Remove */}
                      <button onClick={() => trip.removePlace(place.id)} aria-label="Remove place" className="w-5 h-5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs flex items-center justify-center hover:bg-accent-cyan/30 transition-colors flex-shrink-0">&times;</button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}

              {/* Destinations list (backward compat: templates, AI, loaded trips without places) */}
              {trip.userPlaces.length === 0 && trip.destinations.length > 0 && (
                <Reorder.Group
                  axis="y"
                  values={trip.destinations}
                  onReorder={trip.reorderDestinations}
                  className="flex flex-col gap-2 mb-3"
                  as="div"
                >
                  {trip.destinations.map((dest, idx) => (
                    <Reorder.Item
                      key={dest.id}
                      value={dest}
                      className="bg-bg-card border border-accent-cyan/30 rounded-xl px-4 py-3 flex items-center gap-3 cursor-grab active:cursor-grabbing active:z-10 transition-shadow select-none"
                      whileDrag={{ scale: 1.02, boxShadow: '0 8px 25px rgba(232,101,74,0.15)', background: '#FFFFFF' }}
                      as="div"
                    >
                      <div className="flex flex-col gap-0.5 opacity-30 flex-shrink-0 mr-1" aria-label="Drag to reorder" role="img">
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                        <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                      </div>
                      <span className="w-6 h-6 rounded-full bg-accent-cyan text-white text-xs font-mono font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold text-text-primary truncate">{dest.city.parentCity || dest.city.name}</p>
                        {dest.city.fullName && <p className="text-[10px] text-text-muted font-body truncate">{dest.city.fullName}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => trip.updateNights(dest.id, dest.nights - 1)} aria-label="Decrease nights" className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">-</button>
                        <span className="font-mono text-sm font-bold text-text-primary w-4 text-center">{dest.nights}</span>
                        <button onClick={() => trip.updateNights(dest.id, dest.nights + 1)} aria-label="Increase nights" className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">+</button>
                        <span className="text-text-muted text-[10px] font-body w-6">nights</span>
                      </div>
                      <button onClick={() => trip.removeDestination(dest.id)} aria-label="Remove destination" className="w-5 h-5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs flex items-center justify-center hover:bg-accent-cyan/30 transition-colors flex-shrink-0">&times;</button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}

              <PlacesAutocomplete
                placeholder="Add a place, attraction, or city..."
                scope="all"
                onSelect={city => {
                  // Build a Place from the resolved city data
                  const place: Place = {
                    id: `p${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    name: city.name,
                    fullName: city.fullName,
                    parentCity: city.parentCity || city.name,
                    country: city.country,
                    nights: 2,
                  };
                  trip.addPlace(place);
                }}
              />
            </div>

            {/* DEPARTURE DATE */}
            <div>
              <label className="text-accent-gold text-xs font-display font-bold tracking-widest uppercase mb-2 block">Departure Date</label>
              <input type="date" value={trip.departureDate} onChange={e => trip.setDepartureDate(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary font-mono outline-none transition-all input-glow focus:border-accent-cyan [color-scheme:light]" />
            </div>

            {/* TRAVELERS */}
            <div>
              <label className="text-accent-gold text-xs font-display font-bold tracking-widest uppercase mb-3 block">Travelers</label>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary text-xs font-body w-12">Adults</span>
                  <Counter value={trip.adults} onChange={trip.setAdults} min={1} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary text-xs font-body w-16">Children <span className="text-text-muted text-[10px]">(2-11)</span></span>
                  <Counter value={trip.children} onChange={trip.setChildren} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary text-xs font-body w-14">Infants <span className="text-text-muted text-[10px]">(0-2)</span></span>
                  <Counter value={trip.infants} onChange={trip.setInfants} />
                </div>
              </div>
            </div>

            {/* TRIP TYPE */}
            <div className="flex rounded-xl overflow-hidden border border-border-subtle">
              <button onClick={() => trip.setTripType('roundTrip')}
                className={`flex-1 py-3 text-sm font-display font-bold transition-all flex items-center justify-center gap-2 ${trip.tripType === 'roundTrip' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary hover:text-text-primary'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                Round Trip
              </button>
              <button onClick={() => trip.setTripType('oneWay')}
                className={`flex-1 py-3 text-sm font-display font-bold transition-all flex items-center justify-center gap-2 ${trip.tripType === 'oneWay' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary hover:text-text-primary'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                One Way
              </button>
            </div>

            {/* CONTINUE */}
            <motion.button
              whileHover={(trip.userPlaces.length > 0 || trip.destinations.length > 0) ? { scale: 1.02 } : {}}
              whileTap={(trip.userPlaces.length > 0 || trip.destinations.length > 0) ? { scale: 0.98 } : {}}
              onClick={() => {
                if (trip.userPlaces.length > 0) {
                  // Places flow: group into cities first, then optimize
                  trip.groupPlacesIntoCities();
                  setPendingOptimize(true);
                } else if (trip.destinations.length > 0) {
                  // Backward compat: templates/AI/loaded trips already have destinations
                  optimizeRoute();
                }
              }}
              className={`w-full font-display font-bold py-4 rounded-xl text-sm transition-all ${
                (trip.userPlaces.length > 0 || trip.destinations.length > 0)
                  ? 'bg-accent-cyan text-white hover:shadow-[0_0_30px_rgba(232,101,74,0.3)] cursor-pointer'
                  : 'bg-bg-card text-text-muted cursor-not-allowed'
              }`}
            >
              {(trip.userPlaces.length > 0 || trip.destinations.length > 0) ? 'Plan My Route' : 'Add a place to continue'}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Route Optimization Modal */}
      {showOptimizeModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 w-full max-w-[420px]">

            {optimizing ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-3 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin mx-auto mb-4" />
                <p className="font-display font-bold text-text-primary">Optimizing your route...</p>
                <p className="text-text-muted text-xs font-body mt-1">Calculating shortest travel distances</p>
              </div>
            ) : optimizedOrder ? (
              <>
                <h3 className="font-display font-bold text-lg text-text-primary mb-1">Optimize Route?</h3>
                <p className="text-text-secondary text-xs font-body mb-4">
                  We found a shorter route order. {optimizeSavings && <span className="text-accent-cyan font-bold">{optimizeSavings}!</span>}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Current order */}
                  <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
                    <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">Current</p>
                    <div className="space-y-1.5">
                      {trip.destinations.map((d, i) => {
                        const city = d.city.parentCity || d.city.name;
                        return (
                          <div key={d.id} className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-text-muted/20 text-text-muted text-[9px] font-mono flex items-center justify-center">{i + 1}</span>
                            <span className="text-xs text-text-secondary font-body truncate">{city}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optimized order */}
                  <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-3">
                    <p className="text-[10px] font-display font-bold text-accent-cyan uppercase tracking-wider mb-2">Optimized</p>
                    <div className="space-y-1.5">
                      {optimizedOrder.map((d, i) => {
                        const city = d.city.parentCity || d.city.name;
                        return (
                          <div key={d.id} className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-accent-cyan text-white text-[9px] font-mono flex items-center justify-center">{i + 1}</span>
                            <span className="text-xs text-text-primary font-body font-semibold truncate">{city}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={skipOptimization}
                    className="flex-1 bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-sm py-3 rounded-xl hover:border-accent-cyan/30 transition-all">
                    Keep current
                  </button>
                  <button onClick={applyOptimization}
                    className="flex-1 bg-accent-cyan text-white font-display font-bold text-sm py-3 rounded-xl hover:bg-accent-cyan/90 transition-all">
                    Yes, optimize
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      )}

      {/* AI Suggest Modal */}
      <AISuggestModal
        isOpen={showAISuggest}
        onClose={() => setShowAISuggest(false)}
      />

      {/* Upload Bookings Modal */}
      {showUploadModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !uploadExtracting) { setShowUploadModal(false); setUploadFiles([]); setUploadResult(null); setUploadError(''); } }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 w-full max-w-[480px] max-h-[85vh] overflow-y-auto">

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-text-primary">Upload Bookings</h3>
              {!uploadExtracting && (
                <button onClick={() => { setShowUploadModal(false); setUploadFiles([]); setUploadResult(null); setUploadError(''); }}
                  className="text-text-muted hover:text-text-primary text-lg">&times;</button>
              )}
            </div>

            {!uploadResult ? (
              <>
                <p className="text-text-secondary text-xs font-body mb-4">
                  Upload your flight tickets, hotel confirmations, Airbnb bookings — we&apos;ll extract everything and build your trip automatically.
                </p>

                {/* File drop zone */}
                <input ref={tripFileInputRef} type="file" accept="image/*,.pdf" multiple className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setUploadFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                  }} />

                <button onClick={() => tripFileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-accent-gold/30 hover:border-accent-gold rounded-xl p-6 transition-all hover:bg-accent-gold/5 flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-accent-gold/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="text-sm font-display font-bold text-text-primary">Click to upload files</p>
                  <p className="text-[10px] text-text-muted font-body">PDFs, screenshots, images — up to 10MB each</p>
                </button>

                {/* Selected files list */}
                {uploadFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {uploadFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold flex-shrink-0">
                          {file.type === 'application/pdf' || file.name.endsWith('.pdf')
                            ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                            : <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>
                          }
                        </svg>
                        <span className="text-xs font-body text-text-primary truncate flex-1">{file.name}</span>
                        <span className="text-[9px] text-text-muted font-mono flex-shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                        <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-text-muted hover:text-red-500 text-sm flex-shrink-0">&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadError && (
                  <p className="text-red-500 text-xs font-body mt-2">{uploadError}</p>
                )}

                {/* Extract button */}
                <button onClick={handleTripUpload}
                  disabled={uploadFiles.length === 0 || uploadExtracting}
                  className={`w-full mt-4 py-3 rounded-xl font-display font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    uploadFiles.length > 0 && !uploadExtracting
                      ? 'bg-accent-gold text-white hover:bg-accent-gold/90'
                      : 'bg-bg-card text-text-muted cursor-not-allowed'
                  }`}>
                  {uploadExtracting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reading your bookings...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                      </svg>
                      Extract Trip Details ({uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''})
                    </>
                  )}
                </button>
              </>
            ) : (
              /* Show extracted results for confirmation */
              <>
                <div className="space-y-3">
                  {/* Origin */}
                  {uploadResult.origin && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-cyan flex-shrink-0">
                        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                      <div>
                        <p className="text-[9px] text-text-muted font-body uppercase">From</p>
                        <p className="text-sm font-display font-bold text-text-primary">{uploadResult.origin.city}, {uploadResult.origin.country}</p>
                      </div>
                    </div>
                  )}

                  {/* Trip info row */}
                  <div className="flex gap-2">
                    {uploadResult.departureDate && (
                      <div className="flex-1 px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
                        <p className="text-[9px] text-text-muted font-body uppercase">Departure</p>
                        <p className="text-xs font-mono font-bold text-text-primary">{new Date(uploadResult.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    )}
                    {uploadResult.travelers && (
                      <div className="flex-1 px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
                        <p className="text-[9px] text-text-muted font-body uppercase">Travelers</p>
                        <p className="text-xs font-mono font-bold text-text-primary">
                          {uploadResult.travelers.adults} adult{uploadResult.travelers.adults !== 1 ? 's' : ''}
                          {uploadResult.travelers.children > 0 && `, ${uploadResult.travelers.children} child`}
                          {uploadResult.travelers.infants > 0 && `, ${uploadResult.travelers.infants} infant`}
                        </p>
                      </div>
                    )}
                    <div className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
                      <p className="text-[9px] text-text-muted font-body uppercase">Type</p>
                      <p className="text-xs font-mono font-bold text-text-primary">{uploadResult.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}</p>
                    </div>
                  </div>

                  {/* Destinations */}
                  {uploadResult.destinations?.length > 0 && (
                    <div>
                      <p className="text-[9px] text-text-muted font-body uppercase mb-1.5">Destinations</p>
                      <div className="space-y-1.5">
                        {uploadResult.destinations.map((dest: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-cyan/5 border border-accent-cyan/20">
                            <span className="w-5 h-5 rounded-full bg-accent-cyan text-white text-[9px] font-mono font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-display font-bold text-text-primary">{dest.city}, {dest.country}</p>
                              <p className="text-[10px] text-text-muted font-body">
                                {dest.nights} night{dest.nights !== 1 ? 's' : ''}
                                {dest.hotel?.name && ` · ${dest.hotel.name}`}
                              </p>
                            </div>
                            {dest.hotel?.pricePerNight > 0 && (
                              <span className="text-[10px] font-mono text-accent-gold flex-shrink-0">{formatPrice(dest.hotel.pricePerNight, currency)}/n</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Flight/transport segments */}
                  {uploadResult.segments?.filter((s: any) => s.type === 'flight' || s.type === 'train').length > 0 && (
                    <div>
                      <p className="text-[9px] text-text-muted font-body uppercase mb-1.5">Transport</p>
                      <div className="space-y-1">
                        {uploadResult.segments.filter((s: any) => s.type === 'flight' || s.type === 'train').map((seg: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle text-[10px]">
                            <span className="text-text-muted font-body">{seg.type === 'flight' ? '✈' : '🚆'}</span>
                            <span className="font-display font-semibold text-text-primary">{seg.from} → {seg.to}</span>
                            {seg.carrier && <span className="text-text-muted font-body">· {seg.carrier} {seg.flightNumber || ''}</span>}
                            {seg.departureDate && <span className="text-text-muted font-mono ml-auto">{new Date(seg.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setUploadResult(null); setUploadFiles([]); }}
                    className="flex-1 bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-sm py-3 rounded-xl hover:border-accent-cyan/30 transition-all">
                    Re-upload
                  </button>
                  <button onClick={applyUploadResult}
                    className="flex-1 bg-accent-gold text-white font-display font-bold text-sm py-3 rounded-xl hover:bg-accent-gold/90 transition-all">
                    Build My Trip
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" /></div>}>
      <PlanPageContent />
    </Suspense>
  );
}
