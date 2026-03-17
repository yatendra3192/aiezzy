'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { motion, Reorder } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import { CITIES, City } from '@/data/mockData';
import { searchPlaces, getPlaceDetails, PlacePrediction } from '@/lib/googleApi';

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
        onSelect({
          name: pred.mainText,
          country: details?.country || '',
          fullName: pred.description,
          parentCity: realCity || pred.mainText,
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

export default function PlanPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const trip = useTrip();
  const [isRestoring, setIsRestoring] = useState(false);
  const [editingFrom, setEditingFrom] = useState(!trip.fromAddress);

  // Restore trip from sessionStorage on page reload
  useEffect(() => {
    if (trip.tripId || trip.destinations.length > 0) return;
    try {
      const savedId = sessionStorage.getItem('currentTripId');
      if (savedId) {
        setIsRestoring(true);
        trip.loadTrip(savedId).catch(() => {}).finally(() => setIsRestoring(false));
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<typeof trip.destinations | null>(null);
  const [optimizeSavings, setOptimizeSavings] = useState('');

  // Route optimization: find the shortest path using nearest neighbor algorithm
  const optimizeRoute = async () => {
    if (trip.destinations.length < 3) {
      // 2 or fewer destinations - no optimization needed
      router.push('/route');
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
        router.push('/route');
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
      router.push('/route');
    }
  };

  const applyOptimization = () => {
    if (optimizedOrder) {
      trip.reorderDestinations(optimizedOrder);
    }
    setShowOptimizeModal(false);
    setOptimizedOrder(null);
    router.push('/route');
  };

  const skipOptimization = () => {
    setShowOptimizeModal(false);
    setOptimizedOrder(null);
    router.push('/route');
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

            {/* DESTINATIONS */}
            <div>
              <label className="text-accent-gold text-xs font-display font-bold tracking-widest uppercase mb-3 block">Destinations</label>
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
                    {/* Drag handle */}
                    <div className="flex flex-col gap-0.5 opacity-30 flex-shrink-0 mr-1">
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-text-muted"></div><div className="w-1 h-1 rounded-full bg-text-muted"></div></div>
                    </div>
                    {/* Number */}
                    <span className="w-6 h-6 rounded-full bg-accent-cyan text-white text-xs font-mono font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                    {/* City name + full address */}
                    <div className="flex-1 min-w-0">
                      {(() => {
                        // parentCity comes from Google Place Details API (locality type) — most reliable
                        const displayCity = dest.city.parentCity || dest.city.name;
                        return (
                          <>
                            <p className="text-sm font-display font-bold text-text-primary truncate">{displayCity}</p>
                            {dest.city.fullName && <p className="text-[10px] text-text-muted font-body truncate">{dest.city.fullName}</p>}
                          </>
                        );
                      })()}
                    </div>
                    {/* Nights */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => trip.updateNights(dest.id, dest.nights - 1)} className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">-</button>
                      <span className="font-mono text-sm font-bold text-text-primary w-4 text-center">{dest.nights}</span>
                      <button onClick={() => trip.updateNights(dest.id, dest.nights + 1)} className="w-6 h-6 rounded-md bg-bg-surface border border-border-subtle text-text-muted hover:text-accent-cyan hover:border-accent-cyan text-xs flex items-center justify-center transition-colors">+</button>
                      <span className="text-text-muted text-[10px] font-body w-6">nights</span>
                    </div>
                    {/* Remove */}
                    <button onClick={() => trip.removeDestination(dest.id)} className="w-5 h-5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs flex items-center justify-center hover:bg-accent-cyan/30 transition-colors flex-shrink-0">&times;</button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              <PlacesAutocomplete
                placeholder="Add a destination city or place..."
                scope="all"
                onSelect={city => trip.addDestination(city)}
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
              whileHover={trip.destinations.length > 0 ? { scale: 1.02 } : {}}
              whileTap={trip.destinations.length > 0 ? { scale: 0.98 } : {}}
              onClick={() => { if (trip.destinations.length > 0) optimizeRoute(); }}
              className={`w-full font-display font-bold py-4 rounded-xl text-sm transition-all ${
                trip.destinations.length > 0
                  ? 'bg-accent-cyan text-white hover:shadow-[0_0_30px_rgba(232,101,74,0.3)] cursor-pointer'
                  : 'bg-bg-card text-text-muted cursor-not-allowed'
              }`}
            >
              {trip.destinations.length > 0 ? 'Plan My Route' : 'Add a destination to continue'}
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
                        const parts = (d.city.fullName || '').split(',').map(s => s.trim());
                        const city = parts.length >= 3 ? parts[parts.length - 2] : d.city.name;
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
                        const parts = (d.city.fullName || '').split(',').map(s => s.trim());
                        const city = parts.length >= 3 ? parts[parts.length - 2] : d.city.name;
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
    </div>
  );
}
