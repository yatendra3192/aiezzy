'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hotel } from '@/data/mockData';
import { searchNearbyHotels, NearbyHotel, searchPlaces, getPlaceDetails, PlacePrediction } from '@/lib/googleApi';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  nights: number;
  selectedHotel: Hotel | null;
  onSelectHotel: (hotel: Hotel) => void;
  onUpdateNights?: (nights: number) => void;
  locationQuery?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

const AMENITY_FILTERS = [
  'Free Wi-Fi', 'Breakfast', 'Parking', 'Pool', 'Spa', 'Air conditioning',
  'Restaurant', 'Bar', 'Gym', 'Pet-friendly', 'Kid-friendly',
];

export default function HotelModal({
  isOpen, onClose, cityName, nights, selectedHotel, onSelectHotel, onUpdateNights, locationQuery, checkInDate, checkOutDate,
}: Props) {
  const { currency } = useCurrency();
  const [sortBy, setSortBy] = useState<'price' | 'rating'>('price');
  const [search, setSearch] = useState('');
  const [googleHotels, setGoogleHotels] = useState<NearbyHotel[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(0);
  const [amenityFilters, setAmenityFilters] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  // Places autocomplete for custom stay
  const [customSuggestions, setCustomSuggestions] = useState<PlacePrediction[]>([]);
  const [customSearching, setCustomSearching] = useState(false);
  const [customPlaceDetails, setCustomPlaceDetails] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [showCustomDropdown, setShowCustomDropdown] = useState(false);
  const customDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const customInputRef = useRef<HTMLInputElement>(null);
  // Booking upload
  const [uploadExtracting, setUploadExtracting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMinRatingFilter(0); setMaxPriceFilter(0); setSearch('');
      setAmenityFilters(new Set()); setGoogleHotels([]);
      setShowCustomForm(false); setCustomName(''); setCustomPrice('');
      setCustomSuggestions([]); setCustomPlaceDetails(null); setShowCustomDropdown(false);
      setUploadExtracting(false); setUploadError(''); setUploadFileName('');
    }
  }, [isOpen, cityName]);

  // Debounced places search for custom stay input
  const handleCustomNameChange = useCallback((value: string) => {
    setCustomName(value);
    setCustomPlaceDetails(null); // Reset resolved place when typing
    if (customDebounceRef.current) clearTimeout(customDebounceRef.current);
    if (value.trim().length < 3) {
      setCustomSuggestions([]);
      setShowCustomDropdown(false);
      return;
    }
    setCustomSearching(true);
    customDebounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(value, 'all');
      setCustomSuggestions(results);
      setShowCustomDropdown(results.length > 0);
      setCustomSearching(false);
    }, 300);
  }, []);

  // When user selects a place suggestion
  const handleSelectCustomPlace = useCallback(async (prediction: PlacePrediction) => {
    setCustomName(prediction.description);
    setShowCustomDropdown(false);
    setCustomSuggestions([]);
    // Fetch full details (coordinates)
    const details = await getPlaceDetails(prediction.placeId);
    if (details) {
      setCustomPlaceDetails({
        address: details.formattedAddress,
        lat: details.lat,
        lng: details.lng,
      });
    }
  }, []);

  // Handle booking file upload (PDF/image)
  const handleBookingUpload = useCallback(async (file: File) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError('File too large (max 10MB)');
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please upload an image (JPG/PNG) or PDF');
      return;
    }

    setUploadExtracting(true);
    setUploadError('');
    setUploadFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ai/extract-booking', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to extract booking details');
      const data = await res.json();

      // Fill in the form with extracted data
      if (data.name) setCustomName(data.address || data.name);
      if (data.pricePerNight) {
        setCustomPrice(String(Math.round(data.pricePerNight)));
      } else if (data.totalPrice && data.nights) {
        setCustomPrice(String(Math.round(data.totalPrice / data.nights)));
      }

      // Update nights if extracted from booking
      if (data.nights && data.nights > 0 && onUpdateNights) {
        onUpdateNights(data.nights);
      }

      // Auto-resolve address via Google Places
      const addressToSearch = data.address || data.name;
      if (addressToSearch) {
        const results = await searchPlaces(addressToSearch, 'all');
        if (results.length > 0) {
          const details = await getPlaceDetails(results[0].placeId);
          if (details) {
            setCustomName(details.formattedAddress);
            setCustomPlaceDetails({
              address: details.formattedAddress,
              lat: details.lat,
              lng: details.lng,
            });
          }
        }
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to read booking');
    } finally {
      setUploadExtracting(false);
    }
  }, []);

  const handleCustomStay = () => {
    if (!customName.trim()) return;
    const rawPrice = customPrice.replace(/[^\d]/g, '');
    const price = rawPrice ? parseInt(rawPrice) : 0;
    if (price < 0) return;
    onSelectHotel({
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      rating: 0,
      pricePerNight: price,
      ratingColor: '#9ca3af',
      ...(customPlaceDetails && {
        address: customPlaceDetails.address,
        lat: customPlaceDetails.lat,
        lng: customPlaceDetails.lng,
      }),
    });
  };

  useEffect(() => {
    if (isOpen && (locationQuery || cityName)) {
      setLoadingGoogle(true);
      searchNearbyHotels(locationQuery || cityName, 5000, checkInDate, checkOutDate).then(results => {
        setGoogleHotels(results);
        setLoadingGoogle(false);
      });
    }
  }, [isOpen, locationQuery, cityName]);

  const googleAsHotels: Hotel[] = googleHotels.map((gh, i) => ({
    id: `google-${gh.id || i}`,
    name: gh.name,
    rating: gh.rating,
    pricePerNight: gh.livePrice || estimatePrice(gh.priceLevel, gh.name, gh.rating),
    ratingColor: gh.rating >= 4.5 ? '#16a34a' : gh.rating >= 4 ? '#22c55e' : gh.rating >= 3 ? '#eab308' : '#ef4444',
    ...(gh.address && { address: gh.address }),
  }));

  const toggleAmenity = (a: string) => {
    setAmenityFilters(prev => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };

  const sorted = useMemo(() => {
    const filtered = googleAsHotels.filter(h => {
      if (search && !h.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (minRatingFilter > 0 && h.rating < minRatingFilter) return false;
      if (maxPriceFilter > 0 && h.pricePerNight >= maxPriceFilter) return false;
      if (amenityFilters.size > 0) {
        const gd = googleHotels.find(g => `google-${g.id}` === h.id);
        const hotelAmenities = (gd?.amenities || []).map(a => a.toLowerCase());
        for (let afi = 0; afi < Array.from(amenityFilters).length; afi++) { const af = Array.from(amenityFilters)[afi];
          if (!hotelAmenities.some(ha => ha.includes(af.toLowerCase()))) return false;
        }
      }
      return true;
    });
    return [...filtered].sort((a, b) =>
      sortBy === 'price' ? a.pricePerNight - b.pricePerNight : b.rating - a.rating
    );
  }, [googleAsHotels, search, minRatingFilter, maxPriceFilter, amenityFilters, sortBy]);

  const current = selectedHotel || sorted[0];
  const fmtD = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-bg-surface/95 backdrop-blur-sm flex flex-col"
        >
          {/* ═══ Top Bar ═══ */}
          <div className="border-b border-border-subtle bg-bg-surface px-4 md:px-8 py-3 flex items-center gap-4 flex-shrink-0">
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-accent-cyan transition-colors flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-base text-text-primary">Hotels in {cityName}</h1>
              <p className="text-[10px] text-text-muted font-body">
                {sorted.length} of {googleAsHotels.length} hotels
                {checkInDate && checkOutDate && ` · ${fmtD(checkInDate)} - ${fmtD(checkOutDate)}`}
                {` · ${nights} night${nights !== 1 ? 's' : ''}`}
              </p>
            </div>
            {/* Search */}
            <div className="hidden md:block w-64">
              <input type="text" placeholder="Search hotels..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted font-body outline-none focus:border-accent-cyan transition-all" />
            </div>
            {/* Sort */}
            <div className="flex rounded-lg overflow-hidden border border-border-subtle flex-shrink-0">
              <button onClick={() => setSortBy('price')}
                className={`px-3 py-1.5 text-[10px] font-display font-bold transition-all ${sortBy === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>
                Cheapest
              </button>
              <button onClick={() => setSortBy('rating')}
                className={`px-3 py-1.5 text-[10px] font-display font-bold transition-all ${sortBy === 'rating' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>
                Top Rated
              </button>
            </div>
            {/* View toggle */}
            <div className="hidden md:flex rounded-lg overflow-hidden border border-border-subtle flex-shrink-0">
              <button onClick={() => setViewMode('list')}
                className={`px-2 py-1.5 transition-all ${viewMode === 'list' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
              </button>
              <button onClick={() => setViewMode('grid')}
                className={`px-2 py-1.5 transition-all ${viewMode === 'grid' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
            </div>
          </div>

          {/* ═══ Mobile search ═══ */}
          <div className="md:hidden px-4 py-2 border-b border-border-subtle flex-shrink-0">
            <input type="text" placeholder="Search hotels..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-body outline-none focus:border-accent-cyan" />
          </div>

          {/* ═══ Content: Sidebar + Hotels ═══ */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar — filters (desktop) */}
            <div className="hidden md:flex flex-col w-56 border-r border-border-subtle p-4 overflow-y-auto flex-shrink-0 space-y-5">
              {/* Rating filter */}
              <div>
                <h3 className="text-xs font-display font-bold text-text-primary mb-2">Rating</h3>
                <div className="space-y-1">
                  {[0, 3, 3.5, 4, 4.5].map(r => (
                    <button key={r} onClick={() => setMinRatingFilter(r)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-body transition-all ${
                        minRatingFilter === r ? 'bg-accent-cyan/10 text-accent-cyan font-semibold border border-accent-cyan/30' : 'text-text-secondary hover:bg-bg-card'
                      }`}>
                      {r === 0 ? 'All Ratings' : `${r}+ Stars`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price filter */}
              <div>
                <h3 className="text-xs font-display font-bold text-text-primary mb-2">Max Price/Night</h3>
                <div className="space-y-1">
                  {[0, 3000, 5000, 10000, 15000, 25000].map(p => (
                    <button key={p} onClick={() => setMaxPriceFilter(p)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-body transition-all ${
                        maxPriceFilter === p ? 'bg-accent-cyan/10 text-accent-cyan font-semibold border border-accent-cyan/30' : 'text-text-secondary hover:bg-bg-card'
                      }`}>
                      {p === 0 ? 'Any Price' : `Under ${formatPrice(p, currency)}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amenity filters */}
              <div>
                <h3 className="text-xs font-display font-bold text-text-primary mb-2">Amenities</h3>
                <div className="space-y-1">
                  {AMENITY_FILTERS.map(a => (
                    <button key={a} onClick={() => toggleAmenity(a)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-body transition-all flex items-center gap-2 ${
                        amenityFilters.has(a) ? 'bg-accent-cyan/10 text-accent-cyan font-semibold border border-accent-cyan/30' : 'text-text-secondary hover:bg-bg-card'
                      }`}>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                        amenityFilters.has(a) ? 'bg-accent-cyan border-accent-cyan' : 'border-border-subtle'
                      }`}>
                        {amenityFilters.has(a) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear filters */}
              {(minRatingFilter > 0 || maxPriceFilter > 0 || amenityFilters.size > 0) && (
                <button onClick={() => { setMinRatingFilter(0); setMaxPriceFilter(0); setAmenityFilters(new Set()); }}
                  className="text-xs text-accent-cyan font-body hover:underline">
                  Clear all filters
                </button>
              )}
            </div>

            {/* Mobile filter bar */}
            <div className="md:hidden flex gap-2 px-4 py-2 border-b border-border-subtle overflow-x-auto scrollbar-hide flex-shrink-0">
              <select value={minRatingFilter} onChange={e => setMinRatingFilter(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary flex-shrink-0">
                <option value="0">Any Rating</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
              </select>
              <select value={maxPriceFilter} onChange={e => setMaxPriceFilter(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-border-subtle bg-bg-card text-[10px] font-body text-text-secondary flex-shrink-0">
                <option value="0">Any Price</option>
                <option value="5000">Under {formatPrice(5000, currency)}</option>
                <option value="10000">Under {formatPrice(10000, currency)}</option>
                <option value="15000">Under {formatPrice(15000, currency)}</option>
              </select>
            </div>

            {/* ═══ Hotel List/Grid ═══ */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {/* Custom Stay Form */}
              <div className="mb-4 max-w-3xl">
                {!showCustomForm ? (
                  <div className="flex gap-2">
                    <button onClick={() => setShowCustomForm(true)}
                      className="flex-1 text-left p-3 rounded-xl border border-dashed border-accent-cyan/40 hover:border-accent-cyan hover:bg-accent-cyan/5 transition-all flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-display font-bold text-text-primary">Add your own stay</p>
                        <p className="text-[10px] text-text-muted font-body">Airbnb, friend&apos;s place, or a hotel not in the list</p>
                      </div>
                    </button>
                    <button onClick={() => { setShowCustomForm(true); setTimeout(() => fileInputRef.current?.click(), 100); }}
                      className="w-36 md:w-44 p-3 rounded-xl border border-dashed border-accent-gold/40 hover:border-accent-gold hover:bg-accent-gold/5 transition-all flex flex-col items-center justify-center gap-1.5 text-center">
                      <div className="w-10 h-10 rounded-lg bg-accent-gold/10 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                      </div>
                      <p className="text-[10px] font-display font-bold text-text-primary leading-tight">Upload booking</p>
                      <p className="text-[8px] text-text-muted font-body">PDF or screenshot</p>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-display font-bold text-text-primary">Add custom stay</p>
                      <button onClick={() => setShowCustomForm(false)} className="text-text-muted hover:text-text-primary text-sm">&times;</button>
                    </div>
                    {/* Upload booking file */}
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleBookingUpload(f); e.target.value = ''; }} />
                    {uploadExtracting ? (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent-gold/5 border border-accent-gold/20">
                        <div className="w-5 h-5 border-2 border-accent-gold/30 border-t-accent-gold rounded-full animate-spin flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-display font-semibold text-text-primary">Reading booking details...</p>
                          <p className="text-[9px] text-text-muted font-body truncate">{uploadFileName}</p>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-accent-gold/40 hover:border-accent-gold hover:bg-accent-gold/5 transition-all text-left">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold flex-shrink-0">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <div className="min-w-0">
                          <p className="text-xs font-display font-semibold text-text-primary">Upload booking screenshot or PDF</p>
                          <p className="text-[9px] text-text-muted font-body">We&apos;ll extract address &amp; price automatically</p>
                        </div>
                      </button>
                    )}
                    {uploadError && (
                      <p className="text-[10px] text-red-500 font-body">{uploadError}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border-subtle" />
                      <span className="text-[9px] text-text-muted font-body">or enter manually</span>
                      <div className="flex-1 h-px bg-border-subtle" />
                    </div>
                    {/* Address input with Google Places autocomplete */}
                    <div className="relative">
                      <input
                        ref={customInputRef}
                        type="text" placeholder="Search address (e.g., 42 Rue de Rivoli, Paris)"
                        value={customName} onChange={e => handleCustomNameChange(e.target.value)}
                        onFocus={() => { if (customSuggestions.length > 0) setShowCustomDropdown(true); }}
                        onBlur={() => { setTimeout(() => setShowCustomDropdown(false), 200); }}
                        className={`w-full bg-bg-card border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-body outline-none transition-all ${
                          customPlaceDetails ? 'border-green-400 focus:border-green-500' : 'border-border-subtle focus:border-accent-cyan'
                        }`}
                      />
                      {customSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                        </div>
                      )}
                      {/* Autocomplete dropdown */}
                      {showCustomDropdown && customSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-card border border-border-subtle rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                          {customSuggestions.map((pred) => (
                            <button
                              key={pred.placeId}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => handleSelectCustomPlace(pred)}
                              className="w-full text-left px-3 py-2.5 hover:bg-accent-cyan/5 transition-colors border-b border-border-subtle/50 last:border-b-0 flex items-start gap-2.5"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan flex-shrink-0 mt-0.5">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                              </svg>
                              <div className="min-w-0">
                                <p className="text-xs font-display font-semibold text-text-primary truncate">{pred.mainText}</p>
                                <p className="text-[10px] text-text-muted font-body truncate">{pred.secondaryText}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Location confirmed badge */}
                    {customPlaceDetails && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 flex-shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        <p className="text-[10px] text-green-700 font-body truncate flex-1">{customPlaceDetails.address}</p>
                        <button onClick={() => { setCustomPlaceDetails(null); setCustomName(''); }}
                          className="text-green-500 hover:text-green-700 text-xs flex-shrink-0">&times;</button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="number" placeholder="Price per night (e.g., 3000)" min="0"
                        value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                        className="flex-1 bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-mono outline-none focus:border-accent-cyan"
                      />
                      <button onClick={handleCustomStay}
                        disabled={!customName.trim()}
                        className="px-4 py-2 bg-accent-cyan text-white font-display font-bold text-sm rounded-lg hover:bg-accent-cyan/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        Add Stay
                      </button>
                    </div>
                    <p className="text-[9px] text-text-muted font-body">Enter 0 for free stays (friend&apos;s place, etc.)</p>
                  </div>
                )}
              </div>
              {loadingGoogle ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-3 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                  <span className="text-text-muted text-sm mt-4 font-body">Finding hotels in {cityName}...</span>
                  <span className="text-text-muted text-[10px] font-body mt-1">Checking live prices and availability</span>
                </div>
              ) : sorted.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-text-muted text-sm font-body">No hotels match your filters</p>
                  <button onClick={() => { setMinRatingFilter(0); setMaxPriceFilter(0); setAmenityFilters(new Set()); setSearch(''); }}
                    className="text-accent-cyan text-xs font-body mt-2 hover:underline">Clear all filters</button>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-2 max-w-3xl'}>
                  {sorted.map(hotel => {
                    const isSelected = current?.id === hotel.id;
                    const gd = googleHotels.find(g => `google-${g.id}` === hotel.id);
                    const amenities = gd?.amenities || [];
                    const totalPrice = gd?.totalPrice || hotel.pricePerNight * nights;
                    const hasImage = gd?.images?.[0]?.thumbnail;

                    return (
                      <motion.button
                        key={hotel.id}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onSelectHotel(hotel)}
                        className={`w-full text-left rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-accent-cyan/5 border-accent-cyan ring-1 ring-accent-cyan/20'
                            : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30 hover:shadow-sm'
                        }`}
                      >
                        <div className={viewMode === 'grid' ? 'flex flex-col' : 'flex'}>
                          {/* Image */}
                          {hasImage ? (
                            <div className={viewMode === 'grid' ? 'w-full h-36 rounded-t-xl overflow-hidden' : 'w-28 md:w-36 flex-shrink-0 rounded-l-xl overflow-hidden'}>
                              <img src={gd!.images[0].thumbnail} alt="" className="w-full h-full object-cover" loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                          ) : (
                            <div className={`${viewMode === 'grid' ? 'w-full h-36 rounded-t-xl' : 'w-28 md:w-36 flex-shrink-0 rounded-l-xl'} bg-bg-elevated flex items-center justify-center`}>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-text-muted/30">
                                <path d="M3 21h18M3 7v14m18-14v14M6 11h.01M6 15h.01M6 19h.01M10 11h.01M10 15h.01M10 19h.01M14 11h.01M14 15h.01M14 19h.01M18 11h.01M18 15h.01M18 19h.01M3 7l9-4 9 4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}

                          {/* Content */}
                          <div className="flex-1 p-3 min-w-0 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-display font-bold text-text-primary leading-tight truncate">{hotel.name}</h3>
                                  {hotel.rating > 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white flex-shrink-0"
                                      style={{ backgroundColor: hotel.ratingColor }}>{hotel.rating}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {gd?.hotelClass && <span className="text-[9px] text-text-muted font-body">{gd.hotelClass}</span>}
                                  {(gd as any)?.deal && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[8px] font-body font-semibold">{(gd as any).deal}</span>
                                  )}
                                </div>
                                {gd?.address && gd.address.length > 2 && <p className="text-[10px] text-text-muted font-body truncate mt-0.5">{gd.address}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-mono font-bold text-accent-cyan text-base leading-tight">{formatPrice(hotel.pricePerNight, currency)}</p>
                                <p className="text-[9px] text-text-muted font-body">/night</p>
                              </div>
                            </div>

                            {/* Amenities */}
                            {amenities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {amenities.slice(0, viewMode === 'grid' ? 3 : 6).map((a, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded-md bg-bg-surface border border-border-subtle text-[9px] text-text-secondary font-body">{a}</span>
                                ))}
                                {amenities.length > (viewMode === 'grid' ? 3 : 6) && (
                                  <span className="text-[9px] text-text-muted font-body px-1 self-center">+{amenities.length - (viewMode === 'grid' ? 3 : 6)}</span>
                                )}
                              </div>
                            )}

                            {/* Bottom row: total + links */}
                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border-subtle/50">
                              <div className="flex items-center gap-3">
                                {gd?.mapsLink && (
                                  <a href={gd.mapsLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="text-[9px] font-body text-accent-cyan hover:underline flex items-center gap-0.5">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    Maps
                                  </a>
                                )}
                                {gd?.bookingLink && (
                                  <a href={gd.bookingLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="text-[9px] font-body text-accent-gold hover:underline flex items-center gap-0.5">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    Book
                                  </a>
                                )}
                                {isSelected && (
                                  <span className="text-[9px] font-body font-semibold text-accent-cyan flex items-center gap-0.5">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    Selected
                                  </span>
                                )}
                              </div>
                              {nights > 1 && (
                                <span className="text-[10px] text-text-secondary font-mono">
                                  {formatPrice(totalPrice, currency)} total
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function estimatePrice(priceLevel: string, name: string = '', rating: number = 0): number {
  if (priceLevel) {
    switch (priceLevel) {
      case 'PRICE_LEVEL_FREE': return 0;
      case 'PRICE_LEVEL_INEXPENSIVE': return 1800 + nameHash(name) % 1500;
      case 'PRICE_LEVEL_MODERATE': return 4500 + nameHash(name) % 4000;
      case 'PRICE_LEVEL_EXPENSIVE': return 9000 + nameHash(name) % 8000;
      case 'PRICE_LEVEL_VERY_EXPENSIVE': return 18000 + nameHash(name) % 15000;
    }
  }
  const hash = nameHash(name);
  const basePrice = rating >= 4.5 ? 8000 : rating >= 4 ? 5500 : rating >= 3 ? 3500 : 2500;
  return basePrice + (hash % 4000);
}

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
