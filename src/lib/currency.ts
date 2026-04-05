const CURRENCIES = {
  INR: { symbol: '\u20B9', name: 'Indian Rupee' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '\u20AC', name: 'Euro' },
  GBP: { symbol: '\u00A3', name: 'British Pound' },
  JPY: { symbol: '\u00A5', name: 'Japanese Yen' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  AED: { symbol: '\u062F.\u0625', name: 'UAE Dirham' },
  THB: { symbol: '\u0E3F', name: 'Thai Baht' },
} as const;

type CurrencyCode = keyof typeof CURRENCIES;

// Fallback static rates vs INR (used when live API is unavailable)
const STATIC_RATES_VS_INR: Record<CurrencyCode, number> = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0094,
  JPY: 1.79,
  AUD: 0.018,
  CAD: 0.016,
  SGD: 0.016,
  AED: 0.044,
  THB: 0.41,
};

// Live rates cache (updated by CurrencyContext)
let liveRates: Record<CurrencyCode, number> | null = null;
// Full API response — ALL currency rates (1 INR = X foreign), not just display currencies
let allLiveRates: Record<string, number> | null = null;
let liveRatesFetchedAt = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function setLiveRates(rates: Record<string, number>) {
  // Store full rates for getForeignToINR()
  allLiveRates = rates;

  const mapped: Partial<Record<CurrencyCode, number>> = { INR: 1 };
  for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
    if (code === 'INR') continue;
    if (rates[code]) {
      // API returns "1 INR = X foreign", so rates[code] is already the multiplier
      mapped[code] = rates[code];
    }
  }
  liveRates = mapped as Record<CurrencyCode, number>;
  liveRatesFetchedAt = Date.now();
}

export function hasLiveRates(): boolean {
  return liveRates !== null && (Date.now() - liveRatesFetchedAt) < CACHE_DURATION_MS;
}

function getRates(): Record<CurrencyCode, number> {
  if (liveRates && (Date.now() - liveRatesFetchedAt) < CACHE_DURATION_MS) {
    return liveRates;
  }
  return STATIC_RATES_VS_INR;
}

// Static fallback: foreign currency → INR (1 foreign unit = X INR)
const STATIC_FOREIGN_TO_INR: Record<string, number> = {
  INR: 1, USD: 85, EUR: 93, GBP: 108, JPY: 0.57, THB: 2.5, CHF: 95,
  AUD: 55, NZD: 50, CAD: 63, SGD: 63, AED: 23, MYR: 18, IDR: 0.005,
  VND: 0.003, KRW: 0.06, CNY: 12, MXN: 5, BRL: 17, ARS: 0.07,
  COP: 0.02, PEN: 23, CLP: 0.09, ZAR: 4.7, EGP: 1.7, MAD: 8.5,
  TRY: 2.6, PHP: 1.5, KHR: 0.02, NPR: 0.63, LKR: 0.26, MVR: 5.5,
  CZK: 3.7, SEK: 8, NOK: 8, DKK: 12.5, PLN: 21, HUF: 0.24,
};

/**
 * Get conversion rates: foreign currency → INR (1 foreign = X INR).
 * Uses live rates when available, static fallback otherwise.
 * Covers 35+ currencies for AI-generated meal/transport costs.
 */
export function getForeignToINR(): Record<string, number> {
  if (allLiveRates && (Date.now() - liveRatesFetchedAt) < CACHE_DURATION_MS) {
    // API returns 1 INR = X foreign → invert to get 1 foreign = Y INR
    const inverted: Record<string, number> = { INR: 1 };
    for (const [code, rate] of Object.entries(allLiveRates)) {
      if (rate > 0) inverted[code] = Math.round((1 / rate) * 1000) / 1000;
    }
    return inverted;
  }
  return STATIC_FOREIGN_TO_INR;
}

export function convertFromINR(amountINR: number, toCurrency: CurrencyCode): number {
  const rates = getRates();
  const converted = amountINR * rates[toCurrency];
  // JPY doesn't use decimal places
  return toCurrency === 'JPY' ? Math.round(converted) : Math.round(converted * 100) / 100;
}

export function formatPrice(amountINR: number, currency: CurrencyCode): string {
  const converted = convertFromINR(amountINR, currency);
  if (currency === 'JPY') return `${CURRENCIES[currency].symbol}${converted.toLocaleString()}`;
  // Show decimals for non-INR currencies with small amounts
  if (currency !== 'INR' && converted < 100) {
    return `${CURRENCIES[currency].symbol}${converted.toFixed(2)}`;
  }
  return `${CURRENCIES[currency].symbol}${Math.round(converted).toLocaleString()}`;
}

/** Fetch live rates from free API. Returns rates object or null on failure. */
export async function fetchLiveRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result === 'success' && data.rates) {
      return data.rates;
    }
    return null;
  } catch {
    return null;
  }
}

export { CURRENCIES, type CurrencyCode };
