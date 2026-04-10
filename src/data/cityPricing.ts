/**
 * Curated city-level pricing guide for local transport and meals.
 * Prices are in LOCAL CURRENCY (see `currency` field).
 * Sources: official transit authority sites, Numbeo, local taxi apps, 2024-2026 data.
 */

export interface CityPricing {
  currency: string; // local currency code (EUR, USD, THB, etc.)
  transport: {
    taxiPerKm: number;    // local currency per km
    taxiBase: number;     // base fare / flag-down in local currency
    metroSingle: number;  // single metro/subway ride (0 if none)
    busSingle: number;    // single bus ride
    dailyPass: number;    // day pass for public transport (0 if not available)
  };
  meals: {
    breakfast: number;    // average per person, local currency
    lunch: number;        // casual restaurant
    dinner: number;       // mid-range restaurant
  };
}

// Keys are lowercase city names for fuzzy matching
const CITY_PRICING: Record<string, CityPricing> = {
  // ======================== EUROPE ========================

  amsterdam: {
    currency: 'EUR',
    transport: { taxiPerKm: 2.35, taxiBase: 2.95, metroSingle: 3.40, busSingle: 3.40, dailyPass: 9.00 },
    meals: { breakfast: 8, lunch: 15, dinner: 25 },
  },
  paris: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.10, taxiBase: 4.00, metroSingle: 2.15, busSingle: 2.15, dailyPass: 16.60 },
    meals: { breakfast: 8, lunch: 15, dinner: 30 },
  },
  london: {
    currency: 'GBP',
    transport: { taxiPerKm: 2.00, taxiBase: 3.80, metroSingle: 2.80, busSingle: 1.75, dailyPass: 8.10 },
    meals: { breakfast: 8, lunch: 14, dinner: 28 },
  },
  rome: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.10, taxiBase: 3.50, metroSingle: 1.50, busSingle: 1.50, dailyPass: 7.00 },
    meals: { breakfast: 5, lunch: 12, dinner: 22 },
  },
  barcelona: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.13, taxiBase: 2.50, metroSingle: 2.55, busSingle: 2.55, dailyPass: 11.20 },
    meals: { breakfast: 6, lunch: 13, dinner: 22 },
  },
  prague: {
    currency: 'CZK',
    transport: { taxiPerKm: 36, taxiBase: 60, metroSingle: 30, busSingle: 30, dailyPass: 120 },
    meals: { breakfast: 120, lunch: 200, dinner: 400 },
  },
  berlin: {
    currency: 'EUR',
    transport: { taxiPerKm: 2.00, taxiBase: 3.90, metroSingle: 2.80, busSingle: 2.80, dailyPass: 8.80 },
    meals: { breakfast: 7, lunch: 12, dinner: 22 },
  },
  vienna: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.42, taxiBase: 3.80, metroSingle: 2.40, busSingle: 2.40, dailyPass: 8.00 },
    meals: { breakfast: 7, lunch: 13, dinner: 25 },
  },
  lisbon: {
    currency: 'EUR',
    transport: { taxiPerKm: 0.47, taxiBase: 3.25, metroSingle: 1.70, busSingle: 2.10, dailyPass: 6.80 },
    meals: { breakfast: 5, lunch: 10, dinner: 20 },
  },
  athens: {
    currency: 'EUR',
    transport: { taxiPerKm: 0.74, taxiBase: 3.50, metroSingle: 1.20, busSingle: 1.20, dailyPass: 4.10 },
    meals: { breakfast: 5, lunch: 10, dinner: 18 },
  },
  budapest: {
    currency: 'HUF',
    transport: { taxiPerKm: 400, taxiBase: 1100, metroSingle: 450, busSingle: 450, dailyPass: 2500 },
    meals: { breakfast: 2000, lunch: 3500, dinner: 6000 },
  },
  krakow: {
    currency: 'PLN',
    transport: { taxiPerKm: 3.00, taxiBase: 8.00, metroSingle: 0, busSingle: 5.00, dailyPass: 17.00 },
    meals: { breakfast: 20, lunch: 35, dinner: 60 },
  },
  dublin: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.14, taxiBase: 3.80, metroSingle: 0, busSingle: 2.40, dailyPass: 8.00 },
    meals: { breakfast: 10, lunch: 15, dinner: 28 },
  },
  edinburgh: {
    currency: 'GBP',
    transport: { taxiPerKm: 1.60, taxiBase: 3.00, metroSingle: 0, busSingle: 1.80, dailyPass: 4.80 },
    meals: { breakfast: 8, lunch: 12, dinner: 25 },
  },
  zurich: {
    currency: 'CHF',
    transport: { taxiPerKm: 3.80, taxiBase: 6.00, metroSingle: 0, busSingle: 4.40, dailyPass: 13.60 },
    meals: { breakfast: 15, lunch: 25, dinner: 50 },
  },
  stockholm: {
    currency: 'SEK',
    transport: { taxiPerKm: 12.00, taxiBase: 45.00, metroSingle: 42.00, busSingle: 42.00, dailyPass: 175.00 },
    meals: { breakfast: 80, lunch: 140, dinner: 280 },
  },
  copenhagen: {
    currency: 'DKK',
    transport: { taxiPerKm: 8.50, taxiBase: 39.00, metroSingle: 24.00, busSingle: 24.00, dailyPass: 80.00 },
    meals: { breakfast: 70, lunch: 130, dinner: 250 },
  },
  brussels: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.80, taxiBase: 2.40, metroSingle: 2.10, busSingle: 2.10, dailyPass: 8.00 },
    meals: { breakfast: 7, lunch: 14, dinner: 25 },
  },
  munich: {
    currency: 'EUR',
    transport: { taxiPerKm: 2.00, taxiBase: 4.10, metroSingle: 3.70, busSingle: 3.70, dailyPass: 8.80 },
    meals: { breakfast: 8, lunch: 14, dinner: 26 },
  },
  florence: {
    currency: 'EUR',
    transport: { taxiPerKm: 0.90, taxiBase: 3.30, metroSingle: 0, busSingle: 1.50, dailyPass: 5.00 },
    meals: { breakfast: 5, lunch: 12, dinner: 22 },
  },
  venice: {
    currency: 'EUR',
    transport: { taxiPerKm: 0, taxiBase: 0, metroSingle: 0, busSingle: 1.50, dailyPass: 25.00 }, // water bus (vaporetto)
    meals: { breakfast: 6, lunch: 14, dinner: 28 },
  },
  milan: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.09, taxiBase: 3.30, metroSingle: 2.20, busSingle: 2.20, dailyPass: 7.60 },
    meals: { breakfast: 5, lunch: 13, dinner: 25 },
  },
  nice: {
    currency: 'EUR',
    transport: { taxiPerKm: 1.05, taxiBase: 3.00, metroSingle: 0, busSingle: 1.50, dailyPass: 5.00 },
    meals: { breakfast: 7, lunch: 14, dinner: 28 },
  },
  santorini: {
    currency: 'EUR',
    transport: { taxiPerKm: 0.74, taxiBase: 3.50, metroSingle: 0, busSingle: 1.80, dailyPass: 0 },
    meals: { breakfast: 8, lunch: 14, dinner: 30 },
  },

  // ======================== ASIA ========================

  bangkok: {
    currency: 'THB',
    transport: { taxiPerKm: 6.00, taxiBase: 35.00, metroSingle: 30.00, busSingle: 15.00, dailyPass: 140.00 },
    meals: { breakfast: 80, lunch: 120, dinner: 300 },
  },
  tokyo: {
    currency: 'JPY',
    transport: { taxiPerKm: 320, taxiBase: 500, metroSingle: 210, busSingle: 210, dailyPass: 1600 },
    meals: { breakfast: 600, lunch: 1000, dinner: 2000 },
  },
  singapore: {
    currency: 'SGD',
    transport: { taxiPerKm: 0.74, taxiBase: 4.10, metroSingle: 2.10, busSingle: 1.80, dailyPass: 0 },
    meals: { breakfast: 5, lunch: 8, dinner: 20 },
  },
  bali: {
    currency: 'IDR',
    transport: { taxiPerKm: 7000, taxiBase: 7000, metroSingle: 0, busSingle: 3500, dailyPass: 0 },
    meals: { breakfast: 40000, lunch: 60000, dinner: 120000 },
  },
  denpasar: {
    currency: 'IDR',
    transport: { taxiPerKm: 7000, taxiBase: 7000, metroSingle: 0, busSingle: 3500, dailyPass: 0 },
    meals: { breakfast: 40000, lunch: 60000, dinner: 120000 },
  },
  'kuala lumpur': {
    currency: 'MYR',
    transport: { taxiPerKm: 1.50, taxiBase: 3.00, metroSingle: 2.60, busSingle: 1.50, dailyPass: 0 },
    meals: { breakfast: 8, lunch: 12, dinner: 30 },
  },
  'ho chi minh city': {
    currency: 'VND',
    transport: { taxiPerKm: 15000, taxiBase: 12000, metroSingle: 8000, busSingle: 7000, dailyPass: 0 },
    meals: { breakfast: 40000, lunch: 60000, dinner: 150000 },
  },
  hanoi: {
    currency: 'VND',
    transport: { taxiPerKm: 14000, taxiBase: 10000, metroSingle: 8000, busSingle: 7000, dailyPass: 0 },
    meals: { breakfast: 35000, lunch: 55000, dinner: 130000 },
  },
  seoul: {
    currency: 'KRW',
    transport: { taxiPerKm: 1000, taxiBase: 4800, metroSingle: 1400, busSingle: 1400, dailyPass: 0 },
    meals: { breakfast: 7000, lunch: 10000, dinner: 18000 },
  },
  taipei: {
    currency: 'TWD',
    transport: { taxiPerKm: 25, taxiBase: 85, metroSingle: 25, busSingle: 15, dailyPass: 180 },
    meals: { breakfast: 60, lunch: 120, dinner: 300 },
  },
  'hong kong': {
    currency: 'HKD',
    transport: { taxiPerKm: 1.90, taxiBase: 27.00, metroSingle: 10.50, busSingle: 5.80, dailyPass: 65.00 },
    meals: { breakfast: 35, lunch: 60, dinner: 150 },
  },
  'siem reap': {
    currency: 'USD',
    transport: { taxiPerKm: 0.80, taxiBase: 2.00, metroSingle: 0, busSingle: 0, dailyPass: 0 },
    meals: { breakfast: 3, lunch: 5, dinner: 10 },
  },
  'luang prabang': {
    currency: 'LAK',
    transport: { taxiPerKm: 3000, taxiBase: 20000, metroSingle: 0, busSingle: 5000, dailyPass: 0 },
    meals: { breakfast: 30000, lunch: 50000, dinner: 100000 },
  },
  kathmandu: {
    currency: 'NPR',
    transport: { taxiPerKm: 30, taxiBase: 100, metroSingle: 0, busSingle: 20, dailyPass: 0 },
    meals: { breakfast: 250, lunch: 400, dinner: 800 },
  },
  colombo: {
    currency: 'LKR',
    transport: { taxiPerKm: 90, taxiBase: 100, metroSingle: 0, busSingle: 40, dailyPass: 0 },
    meals: { breakfast: 500, lunch: 800, dinner: 2000 },
  },
  maldives: {
    currency: 'USD',
    transport: { taxiPerKm: 0, taxiBase: 2.00, metroSingle: 0, busSingle: 0, dailyPass: 0 },
    meals: { breakfast: 12, lunch: 18, dinner: 35 },
  },
  male: {
    currency: 'USD',
    transport: { taxiPerKm: 0, taxiBase: 2.00, metroSingle: 0, busSingle: 0, dailyPass: 0 },
    meals: { breakfast: 12, lunch: 18, dinner: 35 },
  },
  dubai: {
    currency: 'AED',
    transport: { taxiPerKm: 1.96, taxiBase: 12.00, metroSingle: 6.00, busSingle: 4.00, dailyPass: 22.00 },
    meals: { breakfast: 30, lunch: 50, dinner: 100 },
  },
  istanbul: {
    currency: 'TRY',
    transport: { taxiPerKm: 20.00, taxiBase: 50.00, metroSingle: 20.00, busSingle: 20.00, dailyPass: 0 },
    meals: { breakfast: 100, lunch: 200, dinner: 400 },
  },
  goa: {
    currency: 'INR',
    transport: { taxiPerKm: 18, taxiBase: 50, metroSingle: 0, busSingle: 15, dailyPass: 0 },
    meals: { breakfast: 150, lunch: 250, dinner: 500 },
  },
  mumbai: {
    currency: 'INR',
    transport: { taxiPerKm: 14, taxiBase: 28, metroSingle: 20, busSingle: 10, dailyPass: 0 },
    meals: { breakfast: 100, lunch: 200, dinner: 400 },
  },
  delhi: {
    currency: 'INR',
    transport: { taxiPerKm: 13, taxiBase: 25, metroSingle: 30, busSingle: 10, dailyPass: 0 },
    meals: { breakfast: 100, lunch: 180, dinner: 350 },
  },
  'new delhi': {
    currency: 'INR',
    transport: { taxiPerKm: 13, taxiBase: 25, metroSingle: 30, busSingle: 10, dailyPass: 0 },
    meals: { breakfast: 100, lunch: 180, dinner: 350 },
  },
  jaipur: {
    currency: 'INR',
    transport: { taxiPerKm: 12, taxiBase: 30, metroSingle: 15, busSingle: 10, dailyPass: 0 },
    meals: { breakfast: 80, lunch: 150, dinner: 300 },
  },
  agra: {
    currency: 'INR',
    transport: { taxiPerKm: 12, taxiBase: 30, metroSingle: 0, busSingle: 10, dailyPass: 0 },
    meals: { breakfast: 80, lunch: 150, dinner: 300 },
  },

  // ======================== AMERICAS ========================

  'new york': {
    currency: 'USD',
    transport: { taxiPerKm: 1.56, taxiBase: 3.00, metroSingle: 2.90, busSingle: 2.90, dailyPass: 0 },
    meals: { breakfast: 10, lunch: 18, dinner: 35 },
  },
  'los angeles': {
    currency: 'USD',
    transport: { taxiPerKm: 1.70, taxiBase: 2.85, metroSingle: 1.75, busSingle: 1.75, dailyPass: 7.00 },
    meals: { breakfast: 12, lunch: 18, dinner: 35 },
  },
  'san francisco': {
    currency: 'USD',
    transport: { taxiPerKm: 1.72, taxiBase: 3.50, metroSingle: 2.50, busSingle: 2.50, dailyPass: 5.00 },
    meals: { breakfast: 12, lunch: 18, dinner: 38 },
  },
  miami: {
    currency: 'USD',
    transport: { taxiPerKm: 1.65, taxiBase: 2.50, metroSingle: 2.25, busSingle: 2.25, dailyPass: 5.65 },
    meals: { breakfast: 10, lunch: 16, dinner: 32 },
  },
  cancun: {
    currency: 'MXN',
    transport: { taxiPerKm: 20, taxiBase: 40, metroSingle: 0, busSingle: 12, dailyPass: 0 },
    meals: { breakfast: 80, lunch: 150, dinner: 300 },
  },
  'mexico city': {
    currency: 'MXN',
    transport: { taxiPerKm: 8.50, taxiBase: 13.10, metroSingle: 5.00, busSingle: 7.50, dailyPass: 0 },
    meals: { breakfast: 60, lunch: 120, dinner: 250 },
  },
  lima: {
    currency: 'PEN',
    transport: { taxiPerKm: 2.00, taxiBase: 5.00, metroSingle: 1.50, busSingle: 1.50, dailyPass: 0 },
    meals: { breakfast: 10, lunch: 18, dinner: 40 },
  },
  'buenos aires': {
    currency: 'ARS',
    transport: { taxiPerKm: 460, taxiBase: 1200, metroSingle: 650, busSingle: 650, dailyPass: 0 },
    meals: { breakfast: 3000, lunch: 6000, dinner: 12000 },
  },
  'rio de janeiro': {
    currency: 'BRL',
    transport: { taxiPerKm: 3.10, taxiBase: 7.10, metroSingle: 6.90, busSingle: 4.30, dailyPass: 0 },
    meals: { breakfast: 18, lunch: 35, dinner: 70 },
  },
  bogota: {
    currency: 'COP',
    transport: { taxiPerKm: 1350, taxiBase: 5000, metroSingle: 0, busSingle: 2950, dailyPass: 0 },
    meals: { breakfast: 8000, lunch: 15000, dinner: 35000 },
  },

  // ======================== OCEANIA & AFRICA & MIDDLE EAST ========================

  sydney: {
    currency: 'AUD',
    transport: { taxiPerKm: 2.19, taxiBase: 3.60, metroSingle: 3.80, busSingle: 3.20, dailyPass: 8.90 },
    meals: { breakfast: 15, lunch: 22, dinner: 40 },
  },
  melbourne: {
    currency: 'AUD',
    transport: { taxiPerKm: 1.86, taxiBase: 4.20, metroSingle: 0, busSingle: 3.20, dailyPass: 10.60 },
    meals: { breakfast: 14, lunch: 20, dinner: 38 },
  },
  auckland: {
    currency: 'NZD',
    transport: { taxiPerKm: 3.10, taxiBase: 3.50, metroSingle: 0, busSingle: 3.50, dailyPass: 20.00 },
    meals: { breakfast: 15, lunch: 20, dinner: 40 },
  },
  'cape town': {
    currency: 'ZAR',
    transport: { taxiPerKm: 14, taxiBase: 20, metroSingle: 0, busSingle: 12, dailyPass: 0 },
    meals: { breakfast: 80, lunch: 150, dinner: 300 },
  },
  marrakech: {
    currency: 'MAD',
    transport: { taxiPerKm: 7.00, taxiBase: 10.00, metroSingle: 0, busSingle: 4.00, dailyPass: 0 },
    meals: { breakfast: 30, lunch: 50, dinner: 120 },
  },
  cairo: {
    currency: 'EGP',
    transport: { taxiPerKm: 5.50, taxiBase: 10.00, metroSingle: 8.00, busSingle: 5.00, dailyPass: 0 },
    meals: { breakfast: 60, lunch: 120, dinner: 250 },
  },
};

// Aliases: common alternate names → canonical key
const ALIASES: Record<string, string> = {
  'new york city': 'new york',
  'nyc': 'new york',
  'manhattan': 'new york',
  'la': 'los angeles',
  'sf': 'san francisco',
  'hcmc': 'ho chi minh city',
  'saigon': 'ho chi minh city',
  'ho chi minh': 'ho chi minh city',
  'kl': 'kuala lumpur',
  'cdmx': 'mexico city',
  'ba': 'buenos aires',
  'rio': 'rio de janeiro',
  'denpasar': 'bali', // Bali's main city
  'ubud': 'bali',
  'seminyak': 'bali',
  'kuta': 'bali',
  'male': 'maldives',
  'malé': 'maldives',
  'panaji': 'goa',
  'panjim': 'goa',
  'calangute': 'goa',
  'anjuna': 'goa',
  'mumbai city': 'mumbai',
  'bombay': 'mumbai',
  'new delhi': 'delhi',
  'old delhi': 'delhi',
  'kyoto': 'tokyo', // Similar pricing region
  'osaka': 'tokyo',
  'phuket': 'bangkok', // Similar pricing
  'chiang mai': 'bangkok',
  'bruges': 'brussels',
  'ghent': 'brussels',
  'fira': 'santorini',
  'oia': 'santorini',
  'thira': 'santorini',
};

/**
 * Fuzzy-match a city name to our pricing database.
 * Tries: exact lowercase → alias → prefix match → partial match.
 */
export function getCityPricing(cityName: string | undefined | null): CityPricing | null {
  if (!cityName) return null;

  const key = cityName.toLowerCase().trim();

  // 1. Direct match
  if (CITY_PRICING[key]) return CITY_PRICING[key];

  // 2. Alias match
  if (ALIASES[key] && CITY_PRICING[ALIASES[key]]) return CITY_PRICING[ALIASES[key]];

  // 3. Try without common suffixes like "City", "Province", etc.
  const cleaned = key
    .replace(/\s*city$/i, '')
    .replace(/\s*province$/i, '')
    .replace(/\s*metropolitan area$/i, '')
    .trim();
  if (cleaned !== key && CITY_PRICING[cleaned]) return CITY_PRICING[cleaned];
  if (cleaned !== key && ALIASES[cleaned] && CITY_PRICING[ALIASES[cleaned]]) return CITY_PRICING[ALIASES[cleaned]];

  // 4. Check if any pricing key starts with or is contained in the input
  for (const pKey of Object.keys(CITY_PRICING)) {
    if (key.startsWith(pKey) || pKey.startsWith(key)) return CITY_PRICING[pKey];
  }

  // 5. Check if any alias matches
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (key.startsWith(alias) || alias.startsWith(key)) return CITY_PRICING[canonical];
  }

  return null;
}

/**
 * Calculate taxi cost using base fare + per-km rate.
 * Returns cost in LOCAL currency.
 */
export function calcTaxiCost(pricing: CityPricing, distKm: number): number {
  return pricing.transport.taxiBase + pricing.transport.taxiPerKm * distKm;
}
