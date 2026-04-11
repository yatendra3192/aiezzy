// Persistent API usage tracker — in-memory buffer + Supabase persistence
// trackApiCall() is synchronous (no DB latency on API routes)
// Flushes to Supabase every 60s, loads from DB on first admin read

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

// In-memory buffer (fast, no DB on every call)
const buffer = new Map<string, number>();
const totals = new Map<string, { count: number; lastCalledAt: number }>();

let dbLoaded = false;
let loadingPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let trackingSince: string | null = null;
let tableExists = false;

/** Track an external API call. Synchronous, never throws. */
export function trackApiCall(provider: ApiProvider, count: number = 1): void {
  try {
    buffer.set(provider, (buffer.get(provider) || 0) + count);
    const existing = totals.get(provider);
    if (existing) {
      existing.count += count;
      existing.lastCalledAt = Date.now();
    } else {
      totals.set(provider, { count, lastCalledAt: Date.now() });
    }
    if (!flushTimer) {
      flushTimer = setInterval(() => { flushToDb(); }, 60_000);
    }
  } catch {
    // Never crash
  }
}

/** Ensure api_usage table exists */
async function ensureTable(): Promise<boolean> {
  if (tableExists) return true;
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    // Try to select — if table exists, this succeeds
    const { error } = await supabase.from('api_usage').select('provider').limit(1);
    if (!error) {
      tableExists = true;
      return true;
    }
    // Table doesn't exist — try to create via exec_sql RPC
    const { error: rpcError } = await supabase.rpc('exec_sql', {
      sql: `CREATE TABLE IF NOT EXISTS public.api_usage (
        provider TEXT PRIMARY KEY,
        call_count BIGINT NOT NULL DEFAULT 0,
        last_called_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    }).maybeSingle();
    if (!rpcError) {
      tableExists = true;
      return true;
    }
    console.error('[apiTracker] Cannot create api_usage table. Run migration from admin.');
    return false;
  } catch {
    return false;
  }
}

/** Load totals from Supabase */
async function loadFromDb(): Promise<void> {
  try {
    if (!(await ensureTable())) { dbLoaded = true; return; }
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();

    const { data } = await supabase
      .from('api_usage')
      .select('provider, call_count, last_called_at, updated_at');

    if (data && data.length > 0) {
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
    console.error('[apiTracker] DB load failed:', (e as Error).message);
    dbLoaded = true;
  }
}

/** Flush buffered increments to Supabase using upsert (no exec_sql needed) */
async function flushToDb(): Promise<void> {
  if (buffer.size === 0) return;
  if (!tableExists && !(await ensureTable())) return;
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();

    const toFlush = new Map(buffer);
    buffer.clear();

    for (const [provider, increment] of Array.from(toFlush.entries())) {
      // Read current count, then upsert with incremented value
      const { data: existing } = await supabase
        .from('api_usage')
        .select('call_count')
        .eq('provider', provider)
        .maybeSingle();

      const newCount = (existing?.call_count || 0) + increment;
      const now = new Date().toISOString();

      await supabase
        .from('api_usage')
        .upsert({
          provider,
          call_count: newCount,
          last_called_at: now,
          updated_at: now,
        }, { onConflict: 'provider' });
    }
  } catch (e) {
    console.error('[apiTracker] Flush failed:', (e as Error).message);
  }
}

/** Get all usage data for admin dashboard */
export async function getApiUsage() {
  if (!dbLoaded) {
    if (!loadingPromise) loadingPromise = loadFromDb();
    await loadingPromise;
  }
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

/** Reset all counters */
export async function resetApiUsage(): Promise<void> {
  buffer.clear();
  totals.clear();
  trackingSince = new Date().toISOString();
  try {
    if (!tableExists) return;
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    // Delete all rows
    const allProviders = Object.keys(COST_PER_CALL) as ApiProvider[];
    await supabase.from('api_usage').delete().in('provider', allProviders);
  } catch (e) {
    console.error('[apiTracker] Reset failed:', (e as Error).message);
  }
}
