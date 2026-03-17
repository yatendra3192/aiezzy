// Visa requirements from Indian passport perspective (most users are Indian)
// Source: various government websites, last updated 2025

export interface VisaInfo {
  type: 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required';
  label: string;
  color: string; // hex color
  note?: string;
  duration?: string; // e.g., "30 days"
}

const VISA_FROM_INDIA: Record<string, VisaInfo> = {
  // Visa-free
  'Bhutan': { type: 'visa-free', label: 'Visa Free', color: '#22c55e', duration: '14 days' },
  'Nepal': { type: 'visa-free', label: 'Visa Free', color: '#22c55e' },
  'Maldives': { type: 'visa-free', label: 'Visa Free', color: '#22c55e', duration: '90 days' },
  'Mauritius': { type: 'visa-free', label: 'Visa Free', color: '#22c55e', duration: '90 days' },
  'Serbia': { type: 'visa-free', label: 'Visa Free', color: '#22c55e', duration: '30 days' },

  // Visa on arrival
  'Thailand': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '15 days' },
  'Indonesia': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '30 days', note: 'Free VOA at major airports' },
  'Cambodia': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '30 days' },
  'Laos': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '30 days' },
  'Jordan': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '30 days' },
  'Seychelles': { type: 'visa-on-arrival', label: 'Visa on Arrival', color: '#eab308', duration: '30 days' },

  // E-visa
  'UAE': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days', note: 'Apply online before travel' },
  'Singapore': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days' },
  'Malaysia': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days', note: 'eNTRI or eVISA' },
  'Turkey': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days' },
  'Vietnam': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days' },
  'Sri Lanka': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '30 days', note: 'ETA required' },
  'Australia': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', note: 'Subclass 601' },
  'Kenya': { type: 'e-visa', label: 'E-Visa', color: '#3b82f6', duration: '90 days' },

  // Visa required (major destinations)
  'United States': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'B1/B2 tourist visa' },
  'United Kingdom': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Standard visitor visa' },
  'Canada': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Visitor visa (TRV)' },
  'France': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Germany': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Italy': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Spain': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Netherlands': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Belgium': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Switzerland': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Schengen visa' },
  'Japan': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Tourist visa' },
  'South Korea': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Tourist visa' },
  'China': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Tourist visa (L)' },
  'Russia': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Tourist visa' },
  'New Zealand': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Visitor visa' },
  'South Africa': { type: 'visa-required', label: 'Visa Required', color: '#ef4444', note: 'Tourist visa' },
};

export function getVisaInfo(country: string): VisaInfo | null {
  // Try exact match, then partial match
  if (VISA_FROM_INDIA[country]) return VISA_FROM_INDIA[country];
  const key = Object.keys(VISA_FROM_INDIA).find(k =>
    country.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(country.toLowerCase())
  );
  return key ? VISA_FROM_INDIA[key] : null;
}
