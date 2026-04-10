// In-memory API usage tracker (resets on deploy)
// Tracks external API calls with cost estimates for admin dashboard

export type ApiProvider =
  | 'google_places_autocomplete'
  | 'google_places_details'
  | 'google_places_photos'
  | 'google_places_text_search'
  | 'google_nearby_search'
  | 'google_directions'
  | 'google_geocoding'
  | 'amadeus_flights'
  | 'amadeus_auth'
  | 'scraper_flights'
  | 'scraper_hotels'
  | 'openai_chat'
  | 'openai_responses'
  | 'gemini'
  | 'anthropic'
  | 'open_meteo'
  | 'catalog_supabase';

// Cost per call in USD (approximate averages)
const COST_PER_CALL: Record<ApiProvider, number> = {
  google_places_autocomplete: 0.00283,
  google_places_details: 0.017,
  google_places_photos: 0.007,
  google_places_text_search: 0.005,
  google_nearby_search: 0.032,
  google_directions: 0.005,
  google_geocoding: 0.005,
  amadeus_flights: 0,        // free tier
  amadeus_auth: 0,
  scraper_flights: 0,        // self-hosted
  scraper_hotels: 0,         // self-hosted
  openai_chat: 0.03,
  openai_responses: 0.03,
  gemini: 0.005,
  anthropic: 0.01,
  open_meteo: 0,             // free
  catalog_supabase: 0,       // own DB
};

// Display names for admin UI
export const PROVIDER_LABELS: Record<ApiProvider, string> = {
  google_places_autocomplete: 'Places Autocomplete',
  google_places_details: 'Places Details',
  google_places_photos: 'Places Photos',
  google_places_text_search: 'Places Text Search',
  google_nearby_search: 'Nearby Search',
  google_directions: 'Directions',
  google_geocoding: 'Geocoding',
  amadeus_flights: 'Amadeus Flights',
  amadeus_auth: 'Amadeus Auth',
  scraper_flights: 'Flights Scraper',
  scraper_hotels: 'Hotels Scraper',
  openai_chat: 'OpenAI Chat',
  openai_responses: 'OpenAI Responses',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  open_meteo: 'Open-Meteo',
  catalog_supabase: 'Airport DB',
};

// Provider categories for grouping
export const PROVIDER_CATEGORY: Record<ApiProvider, string> = {
  google_places_autocomplete: 'Google Maps',
  google_places_details: 'Google Maps',
  google_places_photos: 'Google Maps',
  google_places_text_search: 'Google Maps',
  google_nearby_search: 'Google Maps',
  google_directions: 'Google Maps',
  google_geocoding: 'Google Maps',
  amadeus_flights: 'Transport',
  amadeus_auth: 'Transport',
  scraper_flights: 'Transport',
  scraper_hotels: 'Transport',
  openai_chat: 'AI',
  openai_responses: 'AI',
  gemini: 'AI',
  anthropic: 'AI',
  open_meteo: 'Free',
  catalog_supabase: 'Free',
};

interface UsageEntry {
  count: number;
  lastCalledAt: number;
}

const usage = new Map<string, UsageEntry>();
let resetAt = Date.now();

/** Track an external API call. Safe to call anywhere — never throws. */
export function trackApiCall(provider: ApiProvider, count: number = 1): void {
  try {
    const entry = usage.get(provider);
    if (entry) {
      entry.count += count;
      entry.lastCalledAt = Date.now();
    } else {
      usage.set(provider, { count, lastCalledAt: Date.now() });
    }
  } catch {
    // Never crash the request for tracking
  }
}

/** Get all usage data for admin dashboard */
export function getApiUsage() {
  const uptimeMs = Date.now() - resetAt;
  const uptimeHours = Math.round(uptimeMs / (1000 * 60 * 60) * 10) / 10;

  const providers: Record<string, {
    count: number;
    costPerCall: number;
    estimatedCostUSD: number;
    lastCalledAt: string | null;
    label: string;
    category: string;
  }> = {};

  let totalCostUSD = 0;

  const allProviders = Object.keys(COST_PER_CALL) as ApiProvider[];
  for (const key of allProviders) {
    const entry = usage.get(key);
    const count = entry?.count || 0;
    const cost = count * COST_PER_CALL[key];
    totalCostUSD += cost;

    providers[key] = {
      count,
      costPerCall: COST_PER_CALL[key],
      estimatedCostUSD: Math.round(cost * 1000) / 1000,
      lastCalledAt: entry ? new Date(entry.lastCalledAt).toISOString() : null,
      label: PROVIDER_LABELS[key],
      category: PROVIDER_CATEGORY[key],
    };
  }

  // Projected monthly cost
  const projectedMonthlyCostUSD = uptimeHours > 0
    ? Math.round((totalCostUSD / uptimeHours) * 720 * 100) / 100
    : 0;

  return {
    providers,
    totalCostUSD: Math.round(totalCostUSD * 1000) / 1000,
    projectedMonthlyCostUSD,
    resetAt: new Date(resetAt).toISOString(),
    uptimeHours,
  };
}

/** Reset all counters */
export function resetApiUsage(): void {
  usage.clear();
  resetAt = Date.now();
}
