// Persistent API usage tracker — in-memory buffer + Supabase persistence
// trackApiCall() is synchronous and fast (in-memory only)
// Flushes to Supabase every 60s and loads from DB on first read

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
  amadeus_flights: 0,
  amadeus_auth: 0,
  scraper_flights: 0,
  scraper_hotels: 0,
  openai_chat: 0.03,
  openai_responses: 0.03,
  gemini: 0.005,
  anthropic: 0.01,
  open_meteo: 0,
  catalog_supabase: 0,
};

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

// --- In-memory buffer (fast, no DB on every call) ---
// Stores UNFLUSHED increments since last flush
const buffer = new Map<string, number>();
// Stores TOTAL counts (DB + buffer combined)
const totals = new Map<string, { count: number; lastCalledAt: number }>();

let dbLoaded = false;
let loadingPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let trackingSince: string | null = null; // ISO date of earliest record

/** Track an external API call. Synchronous, never throws. */
export function trackApiCall(provider: ApiProvider, count: number = 1): void {
  try {
    // Add to buffer (unflushed)
    buffer.set(provider, (buffer.get(provider) || 0) + count);
    // Update totals
    const existing = totals.get(provider);
    if (existing) {
      existing.count += count;
      existing.lastCalledAt = Date.now();
    } else {
      totals.set(provider, { count, lastCalledAt: Date.now() });
    }
    // Start flush timer if not running
    if (!flushTimer) {
      flushTimer = setInterval(() => { flushToDb(); }, 60_000);
    }
  } catch {
    // Never crash
  }
}

/** Load totals from Supabase (called once on first getApiUsage) */
async function loadFromDb(): Promise<void> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();

    // Create table if not exists
    await supabase.rpc('exec_sql', {
      sql: `CREATE TABLE IF NOT EXISTS public.api_usage (
        provider TEXT PRIMARY KEY,
        call_count BIGINT NOT NULL DEFAULT 0,
        last_called_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    }).maybeSingle();

    const { data } = await supabase
      .from('api_usage')
      .select('provider, call_count, last_called_at, updated_at');

    if (data) {
      let earliest: string | null = null;
      for (const row of data) {
        const bufferCount = buffer.get(row.provider) || 0;
        totals.set(row.provider, {
          count: (row.call_count || 0) + bufferCount,
          lastCalledAt: row.last_called_at ? new Date(row.last_called_at).getTime() : 0,
        });
        if (row.updated_at && (!earliest || row.updated_at < earliest)) {
          earliest = row.updated_at;
        }
      }
      trackingSince = earliest;
    }
    dbLoaded = true;
  } catch (e) {
    // If DB load fails, just use in-memory
    console.error('[apiTracker] DB load failed:', (e as Error).message);
    dbLoaded = true;
  }
}

/** Flush buffered increments to Supabase */
async function flushToDb(): Promise<void> {
  if (buffer.size === 0) return;
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();

    // Snapshot and clear buffer
    const toFlush = new Map(buffer);
    buffer.clear();

    for (const [provider, increment] of Array.from(toFlush.entries())) {
      // Upsert: increment existing count or insert new
      await supabase.rpc('exec_sql', {
        sql: `INSERT INTO public.api_usage (provider, call_count, last_called_at, updated_at)
              VALUES ('${provider}', ${increment}, NOW(), NOW())
              ON CONFLICT (provider)
              DO UPDATE SET
                call_count = api_usage.call_count + ${increment},
                last_called_at = NOW(),
                updated_at = NOW();`,
      }).maybeSingle();
    }
  } catch (e) {
    console.error('[apiTracker] Flush failed:', (e as Error).message);
    // Don't lose data — buffer stays, will retry next flush
  }
}

/** Get all usage data for admin dashboard */
export async function getApiUsage() {
  // Load from DB on first call
  if (!dbLoaded) {
    if (!loadingPromise) loadingPromise = loadFromDb();
    await loadingPromise;
  }

  // Flush any pending buffer before reading
  await flushToDb();

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
    const entry = totals.get(key);
    const count = entry?.count || 0;
    const cost = count * COST_PER_CALL[key];
    totalCostUSD += cost;

    providers[key] = {
      count,
      costPerCall: COST_PER_CALL[key],
      estimatedCostUSD: Math.round(cost * 1000) / 1000,
      lastCalledAt: entry?.lastCalledAt ? new Date(entry.lastCalledAt).toISOString() : null,
      label: PROVIDER_LABELS[key],
      category: PROVIDER_CATEGORY[key],
    };
  }

  // Calculate uptime from earliest record
  const since = trackingSince ? new Date(trackingSince) : new Date();
  const uptimeMs = Date.now() - since.getTime();
  const uptimeHours = Math.round(uptimeMs / (1000 * 60 * 60) * 10) / 10;

  const projectedMonthlyCostUSD = uptimeHours > 1
    ? Math.round((totalCostUSD / uptimeHours) * 720 * 100) / 100
    : 0;

  return {
    providers,
    totalCostUSD: Math.round(totalCostUSD * 1000) / 1000,
    projectedMonthlyCostUSD,
    resetAt: trackingSince || new Date().toISOString(),
    uptimeHours,
  };
}

/** Reset all counters (DB + memory) */
export async function resetApiUsage(): Promise<void> {
  buffer.clear();
  totals.clear();
  trackingSince = new Date().toISOString();
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    await supabase.rpc('exec_sql', {
      sql: `DELETE FROM public.api_usage;`,
    }).maybeSingle();
  } catch (e) {
    console.error('[apiTracker] Reset failed:', (e as Error).message);
  }
}
