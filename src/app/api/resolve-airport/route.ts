import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const CATALOG_URL = process.env.CATALOG_SUPABASE_URL || '';
const CATALOG_KEY = process.env.CATALOG_SUPABASE_ANON_KEY || '';

// Cache to avoid repeated API calls
const cache = new Map<string, { airports: NearbyAirport[]; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface NearbyAirport {
  iata_code: string;
  name: string;
  distance_km: number;
  type: string;
  municipality: string;
  country_code: string;
}

/**
 * GET /api/resolve-airport?city=Ratlam
 *
 * Clean approach — no hardcoded mappings:
 * 1. Geocode city → lat/lng (Google Places)
 * 2. Query Supabase airports table → nearest airports with IATA codes
 * 3. Return sorted by distance
 *
 * The flights route then tries the top 3 in parallel.
 */
export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city') || '';

  if (!city || !GOOGLE_API_KEY || !CATALOG_URL) {
    return NextResponse.json({ airports: [], error: 'Missing config' });
  }

  // Check cache
  const cached = cache.get(city.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ airports: cached.airports, cached: true });
  }

  try {
    // Step 1: Geocode city to lat/lng
    const geocodeRes = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.location,places.displayName',
        },
        body: JSON.stringify({ textQuery: city, maxResultCount: 1, languageCode: 'en' }),
      }
    );
    const geocodeData = await geocodeRes.json();
    const place = geocodeData.places?.[0];

    if (!place?.location) {
      return NextResponse.json({ airports: [], error: 'Could not geocode city' });
    }

    const lat = place.location.latitude;
    const lng = place.location.longitude;

    // Step 2: Query Supabase nearby_airports() — PostGIS-powered, fast
    const rpcRes = await fetch(`${CATALOG_URL}/rest/v1/rpc/nearby_airports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CATALOG_KEY,
        'Authorization': `Bearer ${CATALOG_KEY}`,
      },
      body: JSON.stringify({ lat, lng, radius_km: 1000 }),
    });
    const allAirports = await rpcRes.json();

    if (!Array.isArray(allAirports) || allAirports.length === 0) {
      return NextResponse.json({ airports: [], error: 'No airports found nearby' });
    }

    // Step 3: Filter to commercial airports with IATA codes
    // Return a smart mix: closest airports + spread to cover major hubs
    const allCommercial = allAirports
      .filter((a: any) =>
        a.iata_code &&
        a.iata_code.length === 3 &&
        (a.type === 'large_airport' || a.type === 'medium_airport')
      )
      .map((a: any) => ({
        iata_code: a.iata_code,
        name: a.name || '',
        distance_km: Math.round(a.distance_km || 0),
        type: a.type || '',
        municipality: '', // Will be filled from direct query below
        country_code: '',
      }));

    // Get municipality + country_code from airports table directly
    if (allCommercial.length > 0) {
      try {
        const codes = allCommercial.map(a => `"${a.iata_code}"`).join(',');
        const muniRes = await fetch(
          `${CATALOG_URL}/rest/v1/airports?iata_code=in.(${codes})&select=iata_code,municipality,country_code`,
          { headers: { 'apikey': CATALOG_KEY, 'Authorization': `Bearer ${CATALOG_KEY}` } }
        );
        const muniData = await muniRes.json();
        if (Array.isArray(muniData)) {
          const muniMap = new Map(muniData.map((m: any) => [m.iata_code, { muni: m.municipality || '', cc: m.country_code || '' }]));
          allCommercial.forEach(a => {
            const info = muniMap.get(a.iata_code);
            a.municipality = info?.muni || '';
            a.country_code = info?.cc || '';
          });
        }
      } catch {}
    }

    // Detect the origin country from the closest airport
    const originCountry = allCommercial[0]?.country_code || '';

    // Filter out airports from different countries for domestic-like searches
    // (prevents Leh→Skardu(Pakistan), etc.) but keep all for international destinations
    const sameCountry = originCountry
      ? allCommercial.filter(a => a.country_code === originCountry || !a.country_code)
      : allCommercial;
    const pool = sameCountry.length >= 3 ? sameCountry : allCommercial;

    // Smart selection: always include closest 2 airports (any type — catches JMK for Mykonos)
    // then fill with large airports for scraper compatibility
    const closest = pool.slice(0, 2);
    const largeAfter = pool.slice(2).filter(a => a.type === 'large_airport');
    const seen = new Set(closest.map(a => a.iata_code));
    const remaining = largeAfter.filter(a => !seen.has(a.iata_code));
    const commercial = [...closest, ...remaining];

    // Cache the result
    cache.set(city.toLowerCase(), { airports: commercial, timestamp: Date.now() });

    return NextResponse.json({
      airports: commercial,
      geocoded: { lat, lng, name: place.displayName?.text || city },
    });
  } catch (e: any) {
    return NextResponse.json({ airports: [], error: e.message });
  }
}
