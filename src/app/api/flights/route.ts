import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_CITY_AIRPORTS } from '@/data/airports';

const FLIGHTS_API_URL = process.env.FLIGHTS_API_URL || '';
const FLIGHTS_API_KEY = process.env.FLIGHTS_API_KEY || '';
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';
// Production Amadeus API — test sandbox has very limited routes (no long-haul international)
const AMADEUS_BASE_URL = process.env.AMADEUS_BASE_URL || 'https://api.amadeus.com';

const flightCache = new Map<string, { data: any; ts: number }>();
const FLIGHT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/flights - Search flights using Amadeus API
 *
 * Query params:
 *   from    - departure airport IATA code (e.g., "BOM")
 *   to      - arrival airport IATA code (e.g., "AMS")
 *   date    - departure date YYYY-MM-DD
 *   adults  - number of adults (default 1)
 */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || '';
  const date = req.nextUrl.searchParams.get('date') || '';
  const adults = req.nextUrl.searchParams.get('adults') || '1';

  const nearbyOnly = req.nextUrl.searchParams.get('nearbyOnly') === 'true';
  const exactAirport = req.nextUrl.searchParams.get('exact') === 'true';

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing params: from, to, date required' }, { status: 400 });
  }

  // Check flight cache
  const flightCacheKey = `${from}-${to}-${date}-${adults}`;
  const cachedFlight = flightCache.get(flightCacheKey);
  if (cachedFlight && Date.now() - cachedFlight.ts < FLIGHT_CACHE_TTL) {
    return NextResponse.json(cachedFlight.data, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    });
  }

  try {
    // Step 1: Resolve both cities to lists of nearby airports
    const baseUrl = req.nextUrl.origin;
    const [fromAirports, toAirports] = await Promise.all([
      resolveToAirports(from, baseUrl),
      resolveToAirports(to, baseUrl),
    ]);

    if (fromAirports.length === 0 || toAirports.length === 0) {
      return NextResponse.json({
        status: 'OK', from, to, date, adults: parseInt(adults),
        flights: [], source: 'none',
        nearbyAirports: [],
        error: `Could not resolve airports for ${fromAirports.length === 0 ? from : to}`,
      });
    }

    // If nearbyOnly, just return the list of nearby departure airports (within 1000km)
    if (nearbyOnly) {
      const nearby = fromAirports
        .filter(ap => ap.distance <= 1000)
        .map(ap => ({ code: ap.code, city: ap.city || ap.name, distance: ap.distance }));
      return NextResponse.json({ nearbyAirports: nearby });
    }

    // Step 2: Try departure airports × first arrival airport in PARALLEL
    // If exact=true, only search the specified airport code (user explicitly selected it)
    let fromCandidates = exactAirport
      ? fromAirports.filter(ap => ap.code.toUpperCase() === from.toUpperCase())
      : fromAirports;

    if (fromCandidates.length === 0 && exactAirport) {
      fromCandidates = [{ code: from.toUpperCase(), city: from, name: from, distance: 0 } as any];
    }

    // Sequential retry: try nearest airport first, fallback to next if no results
    // For exact=true, only search the specified airport
    const toCandidates = exactAirport
      ? [toAirports.find(ap => ap.code.toUpperCase() === to.toUpperCase()) || toAirports[0]]
      : toAirports.slice(0, 5);
    const fromAp = exactAirport
      ? (fromCandidates.find(ap => ap.code.toUpperCase() === from.toUpperCase()) || fromCandidates[0])
      : fromCandidates[0];
    const nearest = fromAirports[0];

    // Fallback: if input was an IATA code with only 1 result, also resolve nearby airports
    if (/^[A-Z]{3}$/.test(to) && toAirports.length === 1 && toAirports[0].city && !exactAirport) {
      const nearbyTo = await resolveToAirports(toAirports[0].city, baseUrl);
      const existingCodes = new Set(toCandidates.map(c => c.code));
      for (const a of nearbyTo) {
        if (!existingCodes.has(a.code)) { toCandidates.push(a); existingCodes.add(a.code); }
        if (toCandidates.length >= 5) break;
      }
    }

    // Try departure × arrival airport combinations
    // For small airports with no flights, try larger nearby airports
    const fromTrials = exactAirport ? [fromAp] : fromCandidates.slice(0, 3);
    let allFlights: any[] = [];
    let resolvedFromAp = fromAp;
    let resolvedToAp = toCandidates[0];
    let foundFlights = false;

    console.log(`[flights] Searching ${from}→${to} (${date}): ${fromTrials.length} from × ${toCandidates.length} to airports`);
    for (const tryFromAp of fromTrials) {
      if (foundFlights) break;
    for (const toAp of toCandidates) {
      if (foundFlights) break;
      // Run Amadeus + scraper in parallel for this airport pair
      // Scraper: try IATA code first, then city name as fallback (works better for international)
      const [amadeusResult, scraperResult] = await Promise.all([
        (AMADEUS_API_KEY && AMADEUS_API_SECRET)
          ? fetchAmadeusFlights(tryFromAp.code, toAp.code, date, parseInt(adults)).catch(() => null)
          : Promise.resolve(null),
        (FLIGHTS_API_URL && FLIGHTS_API_KEY)
          ? fetchScraperFlights(tryFromAp.code, toAp.code, date, adults).catch(() => null)
            .then(async r => {
              if (r && r.length > 0) return r;
              // Retry with city names — use trial airport's city when it differs from original query
              // e.g., if trying AKL for "Bay of Islands", search "Auckland" not "Bay of Islands"
              const fromCity = tryFromAp.city && tryFromAp.code !== from.toUpperCase()
                ? tryFromAp.city : (from.length > 3 ? from : (tryFromAp.city || from));
              const toCity = to.length > 3 ? to : (toAp.city || to);
              const r2 = await fetchScraperFlights(fromCity, toCity, date, adults).catch(() => null);
              if (r2 && r2.length > 0) return r2;
              // Also try with airport's city name if different
              if (toAp.city && toAp.city !== toCity) {
                return fetchScraperFlights(fromCity, toAp.city, date, adults).catch(() => null);
              }
              return null;
            })
          : Promise.resolve(null),
      ]);

      // Filter scraper results — keep flights to target airport OR any airport for this city
      // (allows BNK for Byron Bay even if resolved as different code)
      const validToCodes = new Set(toCandidates.map(c => c.code));
      const filteredScraper = scraperResult?.filter((f: any) =>
        !f.arrAirportCode || validToCodes.has(f.arrAirportCode) || f.arrAirportCode === toAp.code
      ) || [];

      // Merge and dedup
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const flights of [amadeusResult, filteredScraper.length > 0 ? filteredScraper : null]) {
        if (flights && flights.length > 0) {
          for (const f of flights) {
            const key = `${f.flightNumber}-${f.departure}`;
            if (!seen.has(key)) { seen.add(key); merged.push(f); }
          }
        }
      }

      if (merged.length > 0) {
        allFlights = merged;
        resolvedFromAp = tryFromAp;
        resolvedToAp = toAp;
        foundFlights = true;

        // Also search other airports within 50km (same metro area, e.g., CDG+ORY for Paris)
        // but skip airports in different cities (e.g., BHO for Indore)
        const SAME_METRO_KM = 50;
        const sameMetroAirports = toCandidates.filter(ap =>
          ap.code !== toAp.code && ap.distance <= SAME_METRO_KM
        );
        if (sameMetroAirports.length > 0) {
          const metroResults = await Promise.allSettled(
            sameMetroAirports.map(metroAp => Promise.all([
              (AMADEUS_API_KEY && AMADEUS_API_SECRET)
                ? fetchAmadeusFlights(tryFromAp.code, metroAp.code, date, parseInt(adults)).catch(() => null)
                : Promise.resolve(null),
              (FLIGHTS_API_URL && FLIGHTS_API_KEY)
                ? fetchScraperFlights(fromAp.code, metroAp.code, date, adults).then(r =>
                    r?.filter((f: any) => f.arrAirportCode === metroAp.code || !f.arrAirportCode) || null
                  ).catch(() => null)
                : Promise.resolve(null),
            ]))
          );
          const existingSeen = new Set(allFlights.map(f => `${f.flightNumber}-${f.departure}`));
          for (const r of metroResults) {
            if (r.status === 'fulfilled') {
              const [amadeus, scraper] = r.value;
              for (const flights of [amadeus, scraper]) {
                if (flights && flights.length > 0) {
                  for (const f of flights) {
                    const key = `${f.flightNumber}-${f.departure}`;
                    if (!existingSeen.has(key)) { existingSeen.add(key); allFlights.push(f); }
                  }
                }
              }
            }
          }
        }

        break; // Found flights — stop trying other arrival airports
      }
    } // end toCandidates loop
    } // end fromTrials loop

    // Sort by price (cheapest first)
    allFlights.sort((a, b) => a.price - b.price);

    if (allFlights.length > 0) {
      const responseData = {
        status: 'OK',
        from, to, date, adults: parseInt(adults),
        fromResolved: resolvedFromAp.code,
        toResolved: resolvedToAp.code,
        fromAirport: resolvedFromAp.name,
        fromCity: resolvedFromAp.city,
        fromDistance: resolvedFromAp.distance,
        toCity: resolvedToAp.city || resolvedToAp.name || '',
        toDistance: resolvedToAp.distance || 0,
        toAirport: resolvedToAp.name || '',
        nearestFrom: nearest.code !== resolvedFromAp.code ? { code: nearest.code, city: nearest.city, distance: nearest.distance } : undefined,
        flights: allFlights,
        source: allFlights.some(f => f.source === 'scraper') ? 'amadeus+scraper' : 'amadeus',
      };

      // Store in cache
      flightCache.set(flightCacheKey, { data: responseData, ts: Date.now() });
      if (flightCache.size > 500) {
        const oldest = Array.from(flightCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) flightCache.delete(oldest[0]);
      }

      return NextResponse.json(responseData, {
        headers: { 'Cache-Control': 'private, max-age=1800' },
      });
    }

    // No flights found from any source
    return NextResponse.json({
      status: 'OK', from, to, date, adults: parseInt(adults),
      flights: [], source: 'none',
    });
  } catch (e: any) {
    return NextResponse.json({
      status: 'ERROR', from, to, date, adults: parseInt(adults),
      flights: [], source: 'error', error: e.message || 'Unknown error',
    });
  }
}

// ─── Resolve city to list of nearby airports ──────────────────────────────────

interface AirportCandidate {
  code: string;
  name: string;
  city: string; // municipality/city name (e.g., "Ahmedabad")
  distance: number; // km
  countryCode?: string; // "IN", "FR", etc.
}

async function resolveToAirports(input: string, _baseUrl?: string): Promise<AirportCandidate[]> {
  // Fast path: already an IATA code — look up name/city from catalog
  if (/^[A-Z]{3}$/.test(input)) {
    try {
      const catalogUrl = process.env.CATALOG_SUPABASE_URL;
      const catalogKey = process.env.CATALOG_SUPABASE_ANON_KEY;
      if (catalogUrl && catalogKey) {
        const r = await fetch(
          `${catalogUrl}/rest/v1/airports?iata_code=eq.${input}&select=iata_code,name,municipality,country_code&limit=1`,
          { headers: { 'apikey': catalogKey, 'Authorization': `Bearer ${catalogKey}` } }
        );
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          return [{ code: input, name: data[0].name || '', city: data[0].municipality || '', distance: 0, countryCode: data[0].country_code || '' }];
        }
      }
    } catch {}
    return [{ code: input, name: '', city: '', distance: 0 }];
  }

  // For city names: resolve via Supabase PostGIS to get multiple nearby airports
  try {
    const catalogUrl = process.env.CATALOG_SUPABASE_URL;
    const catalogKey = process.env.CATALOG_SUPABASE_ANON_KEY;
    const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (catalogUrl && catalogKey && googleKey) {
      // Geocode city name
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input + ' city')}&key=${googleKey}`, { signal: AbortSignal.timeout(10000) });
      const geoData = await geoRes.json();
      if (geoData.status === 'OK' && geoData.results?.[0]) {
        const lat = geoData.results[0].geometry.location.lat;
        const lng = geoData.results[0].geometry.location.lng;
        // Query PostGIS for nearby airports
        const rpcRes = await fetch(`${catalogUrl}/rest/v1/rpc/nearby_airports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': catalogKey, 'Authorization': `Bearer ${catalogKey}` },
          body: JSON.stringify({ lat, lng, radius_km: 1000 }),
          signal: AbortSignal.timeout(10000),
        });
        const allAirports = await rpcRes.json();
        if (Array.isArray(allAirports) && allAirports.length > 0) {
          const MILITARY_KEYWORDS = ['air force', 'air base', 'afb', 'military', 'naval air', 'army airfield', 'joint base'];
          const commercial = allAirports
            .filter((a: any) => a.iata_code && a.iata_code.length === 3 && (a.type === 'large_airport' || a.type === 'medium_airport') && !MILITARY_KEYWORDS.some(kw => (a.name || '').toLowerCase().includes(kw)))
            .slice(0, 10);
          // Ensure nearest large airport is included
          const closest = commercial.slice(0, 1);
          const nearestLarge = commercial.find((a: any) => a.type === 'large_airport' && a.iata_code !== closest[0]?.iata_code);
          const seen = new Set(closest.map((a: any) => a.iata_code));
          if (nearestLarge && !seen.has(nearestLarge.iata_code)) { closest.push(nearestLarge); seen.add(nearestLarge.iata_code); }
          const rest = commercial.filter((a: any) => !seen.has(a.iata_code)).slice(0, 5);
          const result = [...closest, ...rest];
          if (result.length > 0) {
            // Get municipality data
            const codes = result.map((a: any) => `"${a.iata_code}"`).join(',');
            try {
              const muniRes = await fetch(`${catalogUrl}/rest/v1/airports?iata_code=in.(${codes})&select=iata_code,municipality,country_code`, { headers: { 'apikey': catalogKey, 'Authorization': `Bearer ${catalogKey}` } });
              const muniData = await muniRes.json();
              const muniMap = new Map((Array.isArray(muniData) ? muniData : []).map((m: any) => [m.iata_code, { muni: m.municipality || '', cc: m.country_code || '' }]));
              return result.map((a: any) => ({ code: a.iata_code, name: a.name || '', city: muniMap.get(a.iata_code)?.muni || '', distance: Math.round(a.distance_km || 0), countryCode: muniMap.get(a.iata_code)?.cc || '' }));
            } catch { return result.map((a: any) => ({ code: a.iata_code, name: a.name || '', city: '', distance: Math.round(a.distance_km || 0) })); }
          }
        }
      }
    }
  } catch (e) { console.error('[flights] Airport resolve error:', e); }

  // Fallback: static resolution (curated map + OpenFlights DB)
  const staticCode = resolveAirportCode(input);
  if (staticCode) {
    return [{ code: staticCode, name: '', city: '', distance: 0 }];
  }

  return [];
}


// ─── Resolve city names to IATA airport codes ───────────────────────────────

const CITY_TO_AIRPORT: Record<string, string> = {
  'mumbai': 'BOM', 'delhi': 'DEL', 'new delhi': 'DEL', 'bangalore': 'BLR', 'bengaluru': 'BLR',
  'chennai': 'MAA', 'kolkata': 'CCU', 'hyderabad': 'HYD', 'goa': 'GOI', 'pune': 'PNQ',
  'ahmedabad': 'AMD', 'jaipur': 'JAI', 'kochi': 'COK', 'lucknow': 'LKO',
  'indore': 'IDR', 'bhopal': 'BHO', 'nagpur': 'NAG', 'patna': 'PAT', 'ranchi': 'IXR',
  'varanasi': 'VNS', 'chandigarh': 'IXC', 'srinagar': 'SXR', 'udaipur': 'UDR',
  'amritsar': 'ATQ', 'coimbatore': 'CJB', 'trivandrum': 'TRV', 'vizag': 'VTZ', 'visakhapatnam': 'VTZ',
  'mangalore': 'IXE', 'madurai': 'IXM', 'raipur': 'RPR', 'bhubaneswar': 'BBI',
  'amsterdam': 'AMS', 'london': 'LHR', 'paris': 'CDG', 'barcelona': 'BCN',
  'rome': 'FCO', 'berlin': 'BER', 'madrid': 'MAD', 'lisbon': 'LIS', 'vienna': 'VIE',
  'prague': 'PRG', 'brussels': 'BRU', 'bruges': 'BRU', 'ghent': 'BRU',  // Bruges/Ghent → Brussels Airport
  'antwerp': 'BRU', 'zurich': 'ZRH', 'geneva': 'GVA', 'milan': 'MXP',
  'venice': 'VCE', 'florence': 'FLR', 'munich': 'MUC', 'frankfurt': 'FRA',
  'hamburg': 'HAM', 'copenhagen': 'CPH', 'stockholm': 'ARN', 'oslo': 'OSL',
  'helsinki': 'HEL', 'athens': 'ATH', 'istanbul': 'IST', 'dubai': 'DXB',
  'abu dhabi': 'AUH', 'doha': 'DOH', 'singapore': 'SIN', 'bangkok': 'BKK',
  'kuala lumpur': 'KUL', 'tokyo': 'NRT', 'hong kong': 'HKG', 'seoul': 'ICN',
  'new york': 'JFK', 'los angeles': 'LAX', 'san francisco': 'SFO', 'chicago': 'ORD',
  'toronto': 'YYZ', 'sydney': 'SYD', 'melbourne': 'MEL',
  'bali': 'DPS', 'phuket': 'HKT', 'maldives': 'MLE',
  'thane': 'BOM', 'navi mumbai': 'BOM', // Mumbai suburbs → BOM
  'reykjavik': 'KEF', // Keflavik is the international airport, not RKV
  // US cities & states
  'california': 'LAX', 'malibu': 'LAX', 'santa monica': 'LAX', 'hollywood': 'LAX', 'beverly hills': 'LAX',
  'hawthorne': 'LAX', 'inglewood': 'LAX', 'torrance': 'LAX', 'long beach': 'LAX', 'pasadena': 'LAX',
  'glendale': 'LAX', 'burbank': 'LAX', 'anaheim': 'LAX', 'irvine': 'LAX', 'compton': 'LAX',
  'san diego': 'SAN', 'san jose': 'SJC', 'sacramento': 'SMF', 'oakland': 'OAK',
  'seattle': 'SEA', 'portland': 'PDX', 'denver': 'DEN', 'phoenix': 'PHX',
  'las vegas': 'LAS', 'miami': 'MIA', 'orlando': 'MCO', 'tampa': 'TPA',
  'atlanta': 'ATL', 'dallas': 'DFW', 'houston': 'IAH', 'austin': 'AUS',
  'boston': 'BOS', 'washington': 'IAD', 'philadelphia': 'PHL', 'detroit': 'DTW',
  'minneapolis': 'MSP', 'hawaii': 'HNL', 'honolulu': 'HNL',
  // Other popular
  'cairo': 'CAI', 'johannesburg': 'JNB', 'cape town': 'CPT', 'nairobi': 'NBO',
  'moscow': 'SVO', 'beijing': 'PEK', 'shanghai': 'PVG', 'taipei': 'TPE',
  'hanoi': 'HAN', 'ho chi minh': 'SGN', 'manila': 'MNL', 'jakarta': 'CGK',
  'colombo': 'CMB', 'kathmandu': 'KTM', 'dhaka': 'DAC',
  // Madhya Pradesh / Central India cities → Indore (IDR)
  'ratlam': 'IDR', 'ujjain': 'IDR', 'dewas': 'IDR', 'mhow': 'IDR',
  // Popular tourist destinations → nearest major hub
  'cappadocia': 'IST', 'goreme': 'IST', 'nevsehir': 'IST',
  'siem reap': 'BKK', 'angkor wat': 'BKK',
  'cusco': 'BOG', 'machu picchu': 'BOG',
  'fiji': 'AKL', 'nadi': 'AKL', 'suva': 'AKL',
  'zanzibar': 'DAR',
  'queenstown': 'AKL',
  'santorini': 'ATH', 'mykonos': 'ATH', 'crete': 'ATH',
  'dubrovnik': 'FCO', 'split': 'FCO',
  'positano': 'FCO', 'amalfi': 'FCO', 'naples': 'FCO', 'sorrento': 'FCO',
  'interlaken': 'ZRH', 'lucerne': 'ZRH', 'zermatt': 'ZRH',
  'hallstatt': 'MUC', 'salzburg': 'MUC', 'innsbruck': 'MUC',
  'petra': 'AMM',
  'marrakech': 'RAK',
  'addis ababa': 'ADD', 'dar es salaam': 'DAR',
};

// Cities that use another city's airport (truly "nearby" airports)
const NEARBY_AIRPORT_CITIES = new Set([
  'bruges', 'ghent', 'antwerp',  // → Brussels BRU
  'thane', 'navi mumbai',         // → Mumbai BOM (same metro area, not really "nearby")
]);

/** Check if a city uses a DIFFERENT city's airport (not its own) */
function isNearbyAirport(input: string, resolved: string): boolean {
  if (/^[A-Z]{3}$/.test(input)) return false; // Already an IATA code
  const lower = input.toLowerCase().trim();
  // If the city has its own airport in the mapping, it's NOT nearby
  if (CITY_TO_AIRPORT[lower] && !NEARBY_AIRPORT_CITIES.has(lower)) return false;
  // If not in mapping at all but resolved, it's nearby
  if (!CITY_TO_AIRPORT[lower] && resolved) return true;
  // If in the nearby set, it's nearby
  return NEARBY_AIRPORT_CITIES.has(lower);
}

function resolveAirportCode(input: string): string {
  // Already an IATA code (3 uppercase letters)
  if (/^[A-Z]{3}$/.test(input)) return input;

  const lower = input.toLowerCase().trim();

  // 1. Check curated mapping (has special cases like Bruges→BRU, Thane→BOM)
  if (CITY_TO_AIRPORT[lower]) return CITY_TO_AIRPORT[lower];

  // 2. Check global OpenFlights database (5,599 cities worldwide)
  if (GLOBAL_CITY_AIRPORTS[lower]) return GLOBAL_CITY_AIRPORTS[lower];

  // 3. Try partial match on curated mapping
  for (const [city, code] of Object.entries(CITY_TO_AIRPORT)) {
    if (lower.includes(city)) return code;
  }

  // 4. Try partial match on global database
  for (const [city, code] of Object.entries(GLOBAL_CITY_AIRPORTS)) {
    if (lower === city) return code;
  }

  return ''; // Return empty - will trigger dynamic Google resolver
}

// ─── Amadeus API ─────────────────────────────────────────────────────────────

let amadeusToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string | null> {
  if (amadeusToken && Date.now() < amadeusToken.expiresAt) return amadeusToken.token;
  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) return null;

  try {
    const res = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${AMADEUS_API_KEY}&client_secret=${AMADEUS_API_SECRET}`,
    });
    const data = await res.json();
    if (data.access_token) {
      amadeusToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
      return data.access_token;
    }
    console.error('[flights] Amadeus token error:', data.error_description || data.error);
  } catch (e) {
    console.error('[flights] Amadeus token fetch failed:', e);
  }
  return null;
}

async function fetchAmadeusFlights(from: string, to: string, date: string, adults: number): Promise<any[] | null> {
  const token = await getAmadeusToken();
  if (!token) return null;

  try {
    const params = new URLSearchParams({
      originLocationCode: from,
      destinationLocationCode: to,
      departureDate: date,
      adults: String(adults),
      currencyCode: 'INR',
      max: '20',
    });

    const res = await fetch(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      console.error(`[flights] Amadeus ${from}→${to}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const offers = data.data || [];
    if (offers.length === 0) return null;

    // Map carrier codes to names from dictionaries
    const carriers: Record<string, string> = data.dictionaries?.carriers || {};
    const aircraftDict: Record<string, string> = data.dictionaries?.aircraft || {};

    return offers.map((offer: any, i: number) => {
      const itin = offer.itineraries?.[0];
      const segments = itin?.segments || [];
      const first = segments[0] || {};
      const last = segments[segments.length - 1] || {};

      const airline = carriers[first.carrierCode] || first.carrierCode || 'Unknown';
      const airlineCode = first.carrierCode || '';

      // Cabin class & baggage from fare details
      const fareDetails = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0];
      const cabinClass = fareDetails?.cabin || 'ECONOMY';
      const checkedBags = fareDetails?.includedCheckedBags;
      const checkedBaggage = checkedBags?.weight
        ? `${checkedBags.weight}${(checkedBags.weightUnit || 'KG').toLowerCase()}`
        : checkedBags?.quantity != null
          ? `${checkedBags.quantity} piece${checkedBags.quantity !== 1 ? 's' : ''}`
          : undefined;
      const cabinBags = fareDetails?.includedCabinBags;
      const cabinBaggage = cabinBags?.weight
        ? `${cabinBags.weight}${(cabinBags.weightUnit || 'KG').toLowerCase()}`
        : cabinBags?.quantity != null
          ? `${cabinBags.quantity} piece${cabinBags.quantity !== 1 ? 's' : ''}`
          : undefined;

      // Aircraft type
      const aircraftCode = first.aircraft?.code || '';
      const aircraft = aircraftDict[aircraftCode] || (aircraftCode ? aircraftCode : undefined);

      // Operating airline (codeshare detection)
      const operatingCode = first.operating?.carrierCode;
      const operatingAirline = operatingCode && operatingCode !== first.carrierCode
        ? (carriers[operatingCode] || operatingCode) : undefined;
      const operatingAirlineCode = operatingCode && operatingCode !== first.carrierCode
        ? operatingCode : undefined;

      // Terminals
      const depTerminal = first.departure?.terminal || undefined;
      const arrTerminal = last.arrival?.terminal || undefined;

      // Price breakdown
      const baseTotal = parseFloat(offer.price?.base || '0');
      const numAdultsForBase = typeof adults === 'string' ? parseInt(adults) || 1 : (adults || 1);
      const basePrice = baseTotal > 0 ? Math.round(baseTotal / numAdultsForBase) : undefined;

      // Parse departure/arrival times from ISO format "2026-08-11T06:30:00"
      const depTime = first.departure?.at?.split('T')[1]?.substring(0, 5) || '00:00';
      const arrTime = last.arrival?.at?.split('T')[1]?.substring(0, 5) || '00:00';
      const depDate = first.departure?.at?.split('T')[0] || date;
      const arrDate = last.arrival?.at?.split('T')[0] || date;
      const isNextDay = depDate !== arrDate;

      // Parse duration "PT11H20M" → "11h 20m"
      const durMatch = (itin?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      const durHrs = durMatch?.[1] || '0';
      const durMins = durMatch?.[2] || '0';
      const duration = `${durHrs}h ${durMins}m`;
      const durationMin = parseInt(durHrs) * 60 + parseInt(durMins);

      const stops = segments.length - 1;

      // Build layover details from segment connections
      const layovers: Array<{ airport: string; airportCode: string; duration: number; overnight: boolean }> = [];
      for (let si = 0; si < segments.length - 1; si++) {
        const arrSeg = segments[si];
        const depSeg = segments[si + 1];
        const arrAt = new Date(arrSeg.arrival?.at || '');
        const depAt = new Date(depSeg.departure?.at || '');
        const layoverMin = Math.round((depAt.getTime() - arrAt.getTime()) / 60000);
        const arrCode = arrSeg.arrival?.iataCode || '';
        layovers.push({
          airport: arrCode, // Amadeus only gives IATA code, not full name
          airportCode: arrCode,
          duration: layoverMin,
          overnight: layoverMin > 480, // >8 hours
        });
      }

      let stopsText = 'Nonstop';
      if (layovers.length > 0) {
        const layoverInfo = layovers.map(l => {
          const hrs = Math.floor(l.duration / 60);
          const mins = l.duration % 60;
          return `${hrs}h ${mins}m in ${l.airportCode}`;
        }).join(', ');
        stopsText = `${stops} stop${stops > 1 ? 's' : ''} \u00b7 ${layoverInfo}`;
      }

      const grandTotal = parseFloat(offer.price?.grandTotal || '0');
      const numAdults = typeof adults === 'string' ? parseInt(adults) || 1 : (adults || 1);
      const perPerson = Math.round(grandTotal / numAdults);

      return {
        airline,
        airlineCode,
        flightNumber: `${first.carrierCode || ''}${first.number || ''}`,
        departure: depTime,
        arrival: arrTime,
        depAirportCode: first.departure?.iataCode || from,
        arrAirportCode: last.arrival?.iataCode || to,
        duration,
        durationMin,
        stops: stopsText,
        stopsCount: stops,
        layovers,
        isNextDay,
        price: perPerson,
        basePrice,
        currency: 'INR',
        source: 'amadeus' as const,
        cabinClass,
        checkedBaggage,
        cabinBaggage,
        aircraft,
        aircraftCode,
        operatingAirline,
        operatingAirlineCode,
        depTerminal,
        arrTerminal,
      };
    });
  } catch {
    return null;
  }
}

// ─── Google Flights Scraper (for domestic Indian routes — LCCs like IndiGo/SpiceJet not on Amadeus GDS) ──

async function fetchScraperFlights(from: string, to: string, date: string, adults: string): Promise<any[] | null> {
  if (!FLIGHTS_API_URL || !FLIGHTS_API_KEY) return null;
  try {
    const params = new URLSearchParams({
      departure_id: from, arrival_id: to, outbound_date: date,
      type: '2', adults, currency: 'INR', gl: 'in', hl: 'en',
    });
    const res = await fetch(`${FLIGHTS_API_URL}/search?${params}`, {
      headers: { 'X-API-Key': FLIGHTS_API_KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = [...(data.best_flights || []), ...(data.other_flights || [])];
    if (raw.length === 0) return null;

    return raw.map((f: any) => {
      const segments = f.flights || [];
      const first = segments[0] || {};
      const last = segments[segments.length - 1] || {};
      const dep = first.departure_airport || {};
      const arr = last.arrival_airport || {};
      const airline = first.airline || 'Unknown';
      const layovers = f.layovers || [];

      // Parse "2026-05-22 4:40 AM" → "04:40"
      const parseTime = (t: string) => {
        const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return '00:00';
        let h = parseInt(m[1]); const mi = m[2]; const ap = m[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${mi}`;
      };

      const depTime = parseTime(dep.time || '');
      const arrTime = parseTime(arr.time || '');
      const totalMin = f.total_duration || 0;
      const durHrs = Math.floor(totalMin / 60);
      const durMins = totalMin % 60;
      const stops = layovers.length;

      let stopsText = 'Nonstop';
      if (stops > 0) {
        const info = layovers.map((l: any) => {
          const lh = Math.floor((l.duration || 0) / 60);
          const lm = (l.duration || 0) % 60;
          return `${lh}h ${lm}m in ${l.name || l.id || ''}`.trim();
        }).join(', ');
        stopsText = `${stops} stop${stops > 1 ? 's' : ''} \u00b7 ${info}`;
      }

      // Guess airline code from logo URL or name
      const logoMatch = (first.airline_logo || '').match(/\/(\w{2})\.png/);
      const codeMap: Record<string, string> = {
        'indigo': '6E', 'air india': 'AI', 'air india express': 'IX',
        'vistara': 'UK', 'spicejet': 'SG', 'akasa air': 'QP',
        'alliance air': '9I', 'star air': 'OG',
      };
      const airlineCode = logoMatch?.[1] || codeMap[airline.toLowerCase()] || airline.substring(0, 2).toUpperCase();

      const depDate = dep.time?.split(' ')[0] || '';
      const arrDate = arr.time?.split(' ')[0] || '';

      // Determine isNextDay: scraper dates can be unreliable for cross-timezone flights
      // (e.g., BOM 4:25 AM → AMS 1:15 PM, 12h 20m — same day but scraper may show +1 from HTML)
      // Use hour-based check as primary: if arrival hour < departure hour and duration > 2h, it's overnight
      // Only trust date comparison if hours also confirm it, or duration >= 24h
      const depHr = parseInt(depTime.split(':')[0] || '0');
      const arrHr = parseInt(arrTime.split(':')[0] || '0');
      const crossesMidnight = arrHr < depHr && durHrs > 2;
      const isNextDay = durHrs >= 24 || crossesMidnight;

      return {
        airline,
        airlineCode,
        flightNumber: first.flight_number || airlineCode || '',
        departure: depTime,
        arrival: arrTime,
        depAirportCode: dep.id || from,
        arrAirportCode: arr.id || to,
        duration: `${durHrs}h ${durMins}m`,
        durationMin: totalMin,
        stops: stopsText,
        stopsCount: stops,
        layovers: layovers.map((l: any) => ({
          airport: l.name || '', airportCode: l.id || '',
          duration: l.duration || 0, overnight: l.overnight || false,
        })),
        isNextDay,
        price: f.price || 0,
        currency: 'INR',
        source: 'scraper' as const,
        cabinClass: first.travel_class || 'ECONOMY',
        aircraft: undefined,
        checkedBaggage: undefined,
        cabinBaggage: undefined,
        operatingAirline: undefined,
        depTerminal: undefined,
        arrTerminal: undefined,
        basePrice: undefined,
      };
    });
  } catch {
    return null;
  }
}

