'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PackingDestination {
  city: { name: string; country: string };
  nights: number;
}

interface PackingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinations: PackingDestination[];
  totalNights: number;
  tripId: string | null;
}

interface PackingItem {
  id: string;
  name: string;
  quantity?: number;
  note?: string;
}

interface PackingCategory {
  name: string;
  icon: string;
  items: PackingItem[];
}

// Power plug types by country
const PLUG_TYPES: Record<string, string> = {
  'United States': 'Type A/B (US plug)',
  'Canada': 'Type A/B (US plug)',
  'United Kingdom': 'Type G (UK plug)',
  'France': 'Type C/E (EU plug)',
  'Germany': 'Type C/F (EU plug)',
  'Italy': 'Type C/F/L (EU plug)',
  'Spain': 'Type C/F (EU plug)',
  'Netherlands': 'Type C/F (EU plug)',
  'Belgium': 'Type C/E (EU plug)',
  'Switzerland': 'Type C/J (Swiss plug)',
  'Japan': 'Type A/B (US plug)',
  'China': 'Type A/C/I (multi-type)',
  'Australia': 'Type I (AU plug)',
  'New Zealand': 'Type I (AU plug)',
  'Thailand': 'Type A/B/C (multi-type)',
  'Singapore': 'Type G (UK plug)',
  'Malaysia': 'Type G (UK plug)',
  'UAE': 'Type G (UK plug)',
  'India': 'Type C/D/M (Indian plug)',
  'South Korea': 'Type C/F (EU plug)',
  'Turkey': 'Type C/F (EU plug)',
  'Russia': 'Type C/F (EU plug)',
  'South Africa': 'Type C/M/N (SA plug)',
  'Indonesia': 'Type C/F (EU plug)',
  'Vietnam': 'Type A/C (multi-type)',
  'Sri Lanka': 'Type D/G (UK/Indian plug)',
  'Nepal': 'Type C/D/M (Indian plug)',
  'Bhutan': 'Type D/F/G (multi-type)',
  'Maldives': 'Type G (UK plug)',
  'Kenya': 'Type G (UK plug)',
  'Cambodia': 'Type A/C (multi-type)',
};

// Tropical countries (for mosquito repellent, etc.)
const TROPICAL_COUNTRIES = new Set([
  'Thailand', 'Indonesia', 'Vietnam', 'Cambodia', 'Laos', 'Malaysia', 'Singapore',
  'Sri Lanka', 'India', 'Maldives', 'Kenya', 'Seychelles', 'Mauritius',
]);

function generatePackingList(
  destinations: PackingDestination[],
  totalNights: number,
  weatherData: Record<string, { temp_max: number; temp_min: number; precipitation: number } | null>
): PackingCategory[] {
  const countries = Array.from(new Set(destinations.map(d => d.city.country)));
  const foreignCountries = countries.filter(c => c !== 'India');

  // Determine weather conditions across all destinations
  const temps = Object.values(weatherData).filter(Boolean) as { temp_max: number; temp_min: number; precipitation: number }[];
  const minTemp = temps.length > 0 ? Math.min(...temps.map(t => t.temp_min)) : 20;
  const maxTemp = temps.length > 0 ? Math.max(...temps.map(t => t.temp_max)) : 30;
  const hasRain = temps.some(t => t.precipitation > 5);
  const isCold = minTemp < 15;
  const isHot = maxTemp > 25;
  const isTropical = destinations.some(d => TROPICAL_COUNTRIES.has(d.city.country));

  // Determine adapter needs
  const adapters = Array.from(new Set(
    foreignCountries.map(c => PLUG_TYPES[c]).filter(Boolean)
  ));

  // Visa-required countries (simplified check)
  const needsVisa = foreignCountries.length > 0;

  // --- Build categories ---
  const categories: PackingCategory[] = [];

  // Essentials
  const essentials: PackingItem[] = [
    { id: 'passport', name: 'Passport' },
    { id: 'wallet', name: 'Wallet / Cash / Cards' },
    { id: 'phone', name: 'Phone' },
    { id: 'charger', name: 'Phone charger' },
  ];
  if (adapters.length > 0) {
    essentials.push({ id: 'adapter', name: `Power adapter`, note: adapters.join(', ') });
  }
  essentials.push(
    { id: 'keys', name: 'House keys' },
    { id: 'bag', name: 'Day bag / backpack' },
  );
  categories.push({ name: 'Essentials', icon: '\uD83C\uDF92', items: essentials });

  // Clothing
  const clothing: PackingItem[] = [
    { id: 'underwear', name: 'Underwear', quantity: Math.min(totalNights + 1, 10) },
    { id: 'socks', name: 'Socks', quantity: Math.min(totalNights + 1, 8) },
    { id: 'shirts', name: isHot ? 'T-shirts / light tops' : 'Shirts / tops', quantity: Math.min(Math.ceil(totalNights / 2), 7) },
    { id: 'pants', name: isHot ? 'Shorts / light pants' : 'Pants / jeans', quantity: Math.min(Math.ceil(totalNights / 3), 4) },
    { id: 'sleepwear', name: 'Sleepwear', quantity: 2 },
    { id: 'shoes', name: 'Comfortable walking shoes', quantity: 1 },
  ];
  if (isCold) {
    clothing.push(
      { id: 'jacket', name: 'Warm jacket / coat', quantity: 1 },
      { id: 'sweater', name: 'Sweater / hoodie', quantity: 2 },
      { id: 'thermals', name: 'Thermal underwear', quantity: 2, note: `Lows of ${Math.round(minTemp)}C expected` },
      { id: 'gloves', name: 'Gloves', quantity: 1 },
      { id: 'beanie', name: 'Beanie / warm hat', quantity: 1 },
      { id: 'scarf', name: 'Scarf', quantity: 1 },
    );
  }
  if (isHot) {
    clothing.push(
      { id: 'hat', name: 'Sun hat / cap', quantity: 1 },
      { id: 'sunglasses', name: 'Sunglasses', quantity: 1 },
      { id: 'swimwear', name: 'Swimwear', quantity: 1 },
    );
  }
  if (hasRain) {
    clothing.push(
      { id: 'rainjacket', name: 'Rain jacket / umbrella', quantity: 1, note: 'Rain expected' },
    );
  }
  categories.push({ name: 'Clothing', icon: '\uD83D\uDC55', items: clothing });

  // Toiletries
  const toiletries: PackingItem[] = [
    { id: 'toothbrush', name: 'Toothbrush & toothpaste' },
    { id: 'deodorant', name: 'Deodorant' },
    { id: 'shampoo', name: 'Shampoo & body wash (travel size)' },
    { id: 'comb', name: 'Comb / brush' },
    { id: 'skincare', name: 'Moisturizer / skincare' },
    { id: 'razor', name: 'Razor / grooming kit' },
  ];
  categories.push({ name: 'Toiletries', icon: '\uD83E\uDDF4', items: toiletries });

  // Electronics
  const electronics: PackingItem[] = [
    { id: 'powerbank', name: 'Power bank' },
    { id: 'earphones', name: 'Earphones / headphones' },
    { id: 'camera', name: 'Camera (optional)' },
  ];
  if (adapters.length > 0) {
    electronics.push({ id: 'universal-adapter', name: 'Universal adapter', note: adapters.join(', ') });
  }
  categories.push({ name: 'Electronics', icon: '\uD83D\uDD0C', items: electronics });

  // Documents
  const documents: PackingItem[] = [
    { id: 'passport-copy', name: 'Passport (+ photocopy)' },
    { id: 'flight-tickets', name: 'Flight / train tickets (printed or digital)' },
    { id: 'hotel-booking', name: 'Hotel booking confirmations' },
    { id: 'insurance', name: 'Travel insurance documents' },
  ];
  if (needsVisa) {
    documents.push({ id: 'visa', name: 'Visa documents', note: foreignCountries.join(', ') });
  }
  documents.push(
    { id: 'id-card', name: 'Government ID (Aadhaar / DL)' },
    { id: 'photos', name: 'Passport-size photos (2)', quantity: 2 },
  );
  categories.push({ name: 'Documents', icon: '\uD83D\uDCC4', items: documents });

  // Health
  const health: PackingItem[] = [
    { id: 'firstaid', name: 'First aid kit (band-aids, antiseptic)' },
    { id: 'meds', name: 'Personal medications' },
    { id: 'painkiller', name: 'Paracetamol / painkillers' },
    { id: 'sanitizer', name: 'Hand sanitizer' },
    { id: 'masks', name: 'Face masks', quantity: 3 },
  ];
  if (isHot) {
    health.push({ id: 'sunscreen', name: 'Sunscreen (SPF 50+)', note: `Highs of ${Math.round(maxTemp)}C` });
  }
  if (isTropical) {
    health.push(
      { id: 'mosquito', name: 'Mosquito repellent' },
      { id: 'ors', name: 'ORS packets', quantity: 3 },
    );
  }
  categories.push({ name: 'Health', icon: '\uD83C\uDFE5', items: health });

  return categories;
}

export default function PackingListModal({ isOpen, onClose, destinations, totalNights, tripId }: PackingListModalProps) {
  const [categories, setCategories] = useState<PackingCategory[]>([]);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const storageKey = tripId ? `packing-${tripId}` : null;

  // Load checked items from localStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCheckedItems(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  // Save checked items to localStorage
  const saveChecked = useCallback((updated: Record<string, boolean>) => {
    setCheckedItems(updated);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
    }
  }, [storageKey]);

  // Generate packing list when modal opens
  useEffect(() => {
    if (!isOpen || destinations.length === 0) return;

    setLoading(true);

    // Fetch weather for each destination
    const weatherPromises = destinations.map(d =>
      fetch(`/api/weather?city=${encodeURIComponent(d.city.name)}&date=${new Date().toISOString().split('T')[0]}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );

    Promise.all(weatherPromises).then(results => {
      const weatherData: Record<string, any> = {};
      destinations.forEach((d, i) => {
        weatherData[d.city.name] = results[i];
      });

      const list = generatePackingList(destinations, totalNights, weatherData);
      setCategories(list);
      setLoading(false);
    });
  }, [isOpen, destinations, totalNights]);

  const toggleItem = (itemId: string) => {
    const updated = { ...checkedItems, [itemId]: !checkedItems[itemId] };
    saveChecked(updated);
  };

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedCount = categories.reduce((sum, cat) => sum + cat.items.filter(item => checkedItems[item.id]).length, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            className="relative bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg w-full max-w-[420px] max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-3">
              <div>
                <h3 className="font-display font-bold text-base text-text-primary">Packing List</h3>
                <p className="text-text-muted text-[10px] font-body mt-0.5">
                  {destinations.length} destination{destinations.length !== 1 ? 's' : ''} &middot; {totalNights} nights
                  {totalItems > 0 && ` \u00B7 ${checkedCount}/${totalItems} packed`}
                </p>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none">&times;</button>
            </div>

            {/* Progress bar */}
            {totalItems > 0 && (
              <div className="px-6 pb-3">
                <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(checkedCount / totalItems) * 100}%`,
                      backgroundColor: checkedCount === totalItems ? '#22c55e' : '#E8654A',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                  <span className="text-text-muted text-xs font-body ml-2">Generating your packing list...</span>
                </div>
              ) : (
                categories.map(category => {
                  const catChecked = category.items.filter(item => checkedItems[item.id]).length;
                  return (
                    <div key={category.name}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{category.icon}</span>
                        <h4 className="font-display font-bold text-xs text-text-primary uppercase tracking-wider">{category.name}</h4>
                        <span className="text-[10px] font-mono text-text-muted">{catChecked}/{category.items.length}</span>
                      </div>
                      <div className="space-y-1">
                        {category.items.map(item => (
                          <label
                            key={item.id}
                            className="flex items-start gap-2.5 py-1 px-2 rounded-lg hover:bg-bg-card transition-colors cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              checked={!!checkedItems[item.id]}
                              onChange={() => toggleItem(item.id)}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-border-subtle accent-[#E8654A] cursor-pointer flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-body ${checkedItems[item.id] ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                                {item.name}
                                {item.quantity && item.quantity > 1 && (
                                  <span className="text-text-muted font-mono ml-1">&times;{item.quantity}</span>
                                )}
                              </span>
                              {item.note && (
                                <span className="block text-[10px] text-text-muted font-body mt-0.5">{item.note}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {!loading && totalItems > 0 && (
              <div className="border-t border-border-subtle p-4 flex items-center justify-between">
                <button
                  onClick={() => {
                    const allChecked = checkedCount === totalItems;
                    const updated: Record<string, boolean> = {};
                    categories.forEach(cat => cat.items.forEach(item => { updated[item.id] = !allChecked; }));
                    saveChecked(updated);
                  }}
                  className="text-[10px] font-body text-text-muted hover:text-accent-cyan transition-colors"
                >
                  {checkedCount === totalItems ? 'Uncheck all' : 'Check all'}
                </button>
                <button
                  onClick={() => { saveChecked({}); }}
                  className="text-[10px] font-body text-text-muted hover:text-red-400 transition-colors"
                >
                  Reset
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
