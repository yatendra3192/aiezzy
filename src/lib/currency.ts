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
let liveRatesFetchedAt = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function setLiveRates(rates: Record<string, number>) {
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
    const res = await fetch('https://open.er-api.com/v6/latest/INR');
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
