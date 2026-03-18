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

// Approximate rates vs INR (updated periodically)
const RATES_VS_INR: Record<CurrencyCode, number> = {
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

export function convertFromINR(amountINR: number, toCurrency: CurrencyCode): number {
  const converted = amountINR * RATES_VS_INR[toCurrency];
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

export { CURRENCIES, type CurrencyCode };
