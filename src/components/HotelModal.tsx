'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hotel, getHotelsForCity } from '@/data/mockData';
import { searchNearbyHotels, NearbyHotel } from '@/lib/googleApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  nights: number;
  selectedHotel: Hotel | null;
  onSelectHotel: (hotel: Hotel) => void;
  locationQuery?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

export default function HotelModal({
  isOpen, onClose, cityName, nights, selectedHotel, onSelectHotel, locationQuery, checkInDate, checkOutDate,
}: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'rating'>('price');
  const [search, setSearch] = useState('');
  const [googleHotels, setGoogleHotels] = useState<NearbyHotel[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [useGoogle, setUseGoogle] = useState(false);

  // Fetch nearby hotels from Google when modal opens
  useEffect(() => {
    if (isOpen && (locationQuery || cityName)) {
      setLoadingGoogle(true);
      const query = locationQuery || cityName;
      searchNearbyHotels(query, 5000, checkInDate, checkOutDate).then(results => {
        setGoogleHotels(results);
        setUseGoogle(results.length > 0);
        setLoadingGoogle(false);
      });
    }
  }, [isOpen, locationQuery, cityName]);

  // Mock hotels as fallback
  const mockHotels = getHotelsForCity(cityName);

  // Convert Google hotels to the Hotel interface for selection
  const googleAsHotels: Hotel[] = googleHotels.map((gh, i) => ({
    id: `google-${gh.id || i}`,
    name: gh.name,
    rating: gh.rating,
    pricePerNight: gh.livePrice || estimatePrice(gh.priceLevel, gh.name, gh.rating),
    ratingColor: gh.rating >= 4 ? '#22c55e' : gh.rating >= 3 ? '#eab308' : '#ef4444',
  }));

  const hotels = useGoogle ? googleAsHotels : mockHotels;

  const filtered = hotels.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) =>
    sortBy === 'price' ? a.pricePerNight - b.pricePerNight : b.rating - a.rating
  );

  const current = selectedHotel || sorted[0];

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
            className="w-full max-w-[430px] md:max-w-[520px] max-h-[85vh] bg-bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-border-subtle">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display font-bold text-sm text-text-primary">
                    Hotels near {cityName}
                  </h2>
                  <p className="text-[10px] text-text-muted font-body mt-0.5">
                    Within 5 km {locationQuery ? `of ${locationQuery}` : ''}
                  </p>
                  {current && (
                    <p className="text-xs text-text-secondary font-body mt-1">
                      <span className="font-semibold text-text-primary">{current.name}</span> &middot; &#8377;{current.pricePerNight.toLocaleString()}/night &middot; {nights} nights
                    </p>
                  )}
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl transition-colors ml-4">&times;</button>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search hotels..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted font-body outline-none mt-3 input-glow focus:border-accent-cyan transition-all"
              />

              {/* Sort + source tabs */}
              <div className="flex mt-3 gap-2">
                <div className="flex flex-1 rounded-xl overflow-hidden border border-border-subtle">
                  <button
                    onClick={() => setSortBy('price')}
                    className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                      sortBy === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    &#8595; Price
                  </button>
                  <button
                    onClick={() => setSortBy('rating')}
                    className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                      sortBy === 'rating' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    &#9733; Rating
                  </button>
                </div>
              </div>

              {/* Google/Mock toggle */}
              {googleHotels.length > 0 && mockHotels.length > 0 && (
                <div className="flex mt-2 gap-2">
                  <button
                    onClick={() => setUseGoogle(true)}
                    className={`flex-1 py-1.5 text-[10px] font-body rounded-lg border transition-all ${
                      useGoogle ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10' : 'border-border-subtle text-text-muted'
                    }`}
                  >
                    Nearby (Google)
                  </button>
                  <button
                    onClick={() => setUseGoogle(false)}
                    className={`flex-1 py-1.5 text-[10px] font-body rounded-lg border transition-all ${
                      !useGoogle ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10' : 'border-border-subtle text-text-muted'
                    }`}
                  >
                    Curated List
                  </button>
                </div>
              )}
            </div>

            {/* Hotel list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingGoogle ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                  <span className="text-text-muted text-sm ml-3 font-body">Finding nearby hotels...</span>
                </div>
              ) : sorted.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-8 font-body">No hotels found</p>
              ) : (
                sorted.map(hotel => {
                  const isSelected = current?.id === hotel.id;
                  const googleData = googleHotels.find(g => `google-${g.id}` === hotel.id);
                  return (
                    <motion.button
                      key={hotel.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => onSelectHotel(hotel)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${
                        isSelected
                          ? 'bg-accent-cyan/10 border-accent-cyan shadow-[0_0_15px_rgba(0,229,199,0.15)]'
                          : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'
                      }`}
                    >
                      <div className="w-14 h-14 rounded-xl bg-bg-elevated flex-shrink-0 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                          <path d="M3 21h18M3 7v14m18-14v14M6 11h.01M6 15h.01M6 19h.01M10 11h.01M10 15h.01M10 19h.01M14 11h.01M14 15h.01M14 19h.01M18 11h.01M18 15h.01M18 19h.01M3 7l9-4 9 4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold text-text-primary truncate">{hotel.name}</p>
                        {googleData?.address && (
                          <p className="text-[10px] text-text-muted font-body truncate mt-0.5">{googleData.address}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {hotel.rating > 0 && (
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold text-white"
                              style={{ backgroundColor: hotel.ratingColor }}
                            >
                              {hotel.rating}
                            </span>
                          )}
                          {googleData?.priceLevel && (
                            <span className="text-[10px] text-text-muted">{formatPriceLevel(googleData.priceLevel)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono font-bold text-accent-cyan">&#8377;{hotel.pricePerNight.toLocaleString()}</p>
                        <p className="text-[10px] text-text-muted">/night</p>
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

/** Generate a realistic-looking price from hotel name + rating + priceLevel */
function estimatePrice(priceLevel: string, name: string = '', rating: number = 0): number {
  // Use priceLevel if available
  if (priceLevel && priceLevel !== '') {
    switch (priceLevel) {
      case 'PRICE_LEVEL_FREE': return 0;
      case 'PRICE_LEVEL_INEXPENSIVE': return 1800 + nameHash(name) % 1500;
      case 'PRICE_LEVEL_MODERATE': return 4500 + nameHash(name) % 4000;
      case 'PRICE_LEVEL_EXPENSIVE': return 9000 + nameHash(name) % 8000;
      case 'PRICE_LEVEL_VERY_EXPENSIVE': return 18000 + nameHash(name) % 15000;
    }
  }
  // No priceLevel: estimate from rating and name hash
  const hash = nameHash(name);
  const basePrice = rating >= 4.5 ? 8000 : rating >= 4 ? 5500 : rating >= 3 ? 3500 : 2500;
  const variance = hash % 4000;
  return basePrice + variance;
}

/** Simple string hash to create consistent variation per hotel */
function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatPriceLevel(level: string): string {
  switch (level) {
    case 'PRICE_LEVEL_FREE': return 'Free';
    case 'PRICE_LEVEL_INEXPENSIVE': return '$';
    case 'PRICE_LEVEL_MODERATE': return '$$';
    case 'PRICE_LEVEL_EXPENSIVE': return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$';
    default: return '';
  }
}
