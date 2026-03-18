import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_CITY_AIRPORTS } from '@/data/airports';

const FLIGHTS_API_URL = process.env.FLIGHTS_API_URL || '';
const FLIGHTS_API_KEY = process.env.FLIGHTS_API_KEY || '';
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';
// NOTE: Default is Amadeus test/sandbox. Set AMADEUS_BASE_URL=https://api.amadeus.com for production
const AMADEUS_BASE_URL = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

/**
 * GET /api/flights - Search flights using live Google Flights scraper
 *
 * Query params:
 *   from    - departure airport IATA code (e.g., "BOM")
 *   to      - arrival airport IATA code (e.g., "AMS")
 *   date    - departure date YYYY-MM-DD
 *   adults  - number of adults (default 1)
 *   type    - 1 = round trip, 2 = one way (default 2)
 *   returnDate - return date for round trips
 */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || '';
  const date = req.nextUrl.searchParams.get('date') || '';
  const adults = req.nextUrl.searchParams.get('adults') || '1';
  const type = req.nextUrl.searchParams.get('type') || '2';
  const returnDate = req.nextUrl.searchParams.get('returnDate') || '';

  const nearbyOnly = req.nextUrl.searchParams.get('nearbyOnly') === 'true';

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing params: from, to, date required' }, { status: 400 });
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
    // Pick closest 2 + every ~150km after that to spread coverage to major hubs
    // All run simultaneously — parallel calls take the same time as 1 call (~5-15s)
    const toCode = toAirports[0].code;
    // Try all nearby large airports in parallel (~5-10 airports)
    // All execute simultaneously — takes same time as 1 call (~5-15s)
    const fromCandidates = fromAirports;

    if (FLIGHTS_API_URL && FLIGHTS_API_KEY) {
      const results = await Promise.allSettled(
        fromCandidates.map(ap =>
          fetchLiveFlights(ap.code, toCode, date, adults, type, returnDate)
            .then(flights => ({ flights, airport: ap }))
        )
      );

      // Return the first successful result (closest airport that has flights)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.flights && r.value.flights.length > 0) {
          const ap = r.value.airport;
          const nearest = fromAirports[0]; // Closest airport (may differ from the one with flights)
          return NextResponse.json({
            status: 'OK',
            from, to, date, adults: parseInt(adults),
            fromResolved: ap.code,
            toResolved: toCode,
            fromAirport: ap.name,
            fromCity: ap.city,
            fromDistance: ap.distance,
            toCity: toAirports[0]?.city || '',
            // Include nearest airport if different from the one with flights
            nearestFrom: nearest.code !== ap.code ? { code: nearest.code, city: nearest.city, distance: nearest.distance } : undefined,
            fromIsNearby: ap.code !== resolveAirportCode(from),
            toIsNearby: toCode !== resolveAirportCode(to),
            flights: r.value.flights,
            source: 'live',
          });
        }
      }

      // If departure side all failed, try parallelizing the arrival side too
      if (toAirports.length > 1) {
        const toCandidates = toAirports; // Try all airports in parallel
        const fromCode = fromAirports[0].code;
        const toResults = await Promise.allSettled(
          toCandidates.map(ap =>
            fetchLiveFlights(fromCode, ap.code, date, adults, type, returnDate)
              .then(flights => ({ flights, airport: ap }))
          )
        );

        for (const r of toResults) {
          if (r.status === 'fulfilled' && r.value.flights && r.value.flights.length > 0) {
            const ap = r.value.airport;
            return NextResponse.json({
              status: 'OK',
              from, to, date, adults: parseInt(adults),
              fromResolved: fromCode,
              toResolved: ap.code,
              fromCity: fromAirports[0]?.city || '',
              toAirport: ap.name,
              toCity: ap.city,
              toDistance: ap.distance,
              fromIsNearby: fromCode !== resolveAirportCode(from),
              toIsNearby: true,
              flights: r.value.flights,
              source: 'live',
            });
          }
        }
      }
    }

    // Fallback: Try Amadeus API when Google scraper fails
    // Try multiple airport combinations (closest airports may not have commercial flights)
    if (AMADEUS_API_KEY && AMADEUS_API_SECRET) {
      for (const fromAp of fromAirports.slice(0, 3)) {
        for (const toAp of toAirports.slice(0, 3)) {
          const amadeusFlights = await fetchAmadeusFlights(fromAp.code, toAp.code, date, parseInt(adults));
          if (amadeusFlights && amadeusFlights.length > 0) {
            return NextResponse.json({
              status: 'OK',
              from, to, date, adults: parseInt(adults),
              fromResolved: fromAp.code,
              toResolved: toAp.code,
              fromCity: fromAp.city,
              toCity: toAp.city,
              fromAirport: fromAp.name,
              fromDistance: fromAp.distance,
              nearestFrom: fromAp.code !== fromAirports[0].code
                ? { code: fromAirports[0].code, city: fromAirports[0].city, distance: fromAirports[0].distance }
                : undefined,
              flights: amadeusFlights,
              source: 'amadeus',
            });
          }
        }
      }
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
}

async function resolveToAirports(input: string, baseUrl: string): Promise<AirportCandidate[]> {
  // Fast path: already an IATA code — no alternatives needed
  if (/^[A-Z]{3}$/.test(input)) {
    return [{ code: input, name: '', city: '', distance: 0 }];
  }

  // For city names: always try Supabase to get multiple nearby airports
  // This enables parallel search (try IDR, UDR, BDQ simultaneously)
  try {
    const res = await fetch(`${baseUrl}/api/resolve-airport?city=${encodeURIComponent(input)}`);
    const data = await res.json();
    if (data.airports && data.airports.length > 0) {
      return data.airports.map((a: any) => ({
        code: a.iata_code,
        name: a.name,
        city: a.municipality || a.name?.split(' ')[0] || '',
        distance: a.distance_km,
      }));
    }
  } catch {}

  // Fallback: static resolution (curated map + OpenFlights DB)
  const staticCode = resolveAirportCode(input);
  if (staticCode) {
    return [{ code: staticCode, name: '', city: '', distance: 0 }];
  }

  return [];
}

// ─── Live API ─────────────────────────────────────────────────────────────────

interface LiveFlight {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  price: number;
  currency: string;
  source: 'live';
  airlineLogo?: string;
  carbonEmissions?: number;
}

async function fetchLiveFlights(
  from: string, to: string, date: string, adults: string, type: string, returnDate: string
): Promise<LiveFlight[] | null> {
  const params = new URLSearchParams({
    departure_id: from,
    arrival_id: to,
    outbound_date: date,
    type,
    adults,
    currency: 'INR',
    gl: 'in',
    hl: 'en',
  });

  if (type === '1' && returnDate) {
    params.set('return_date', returnDate);
  }

  const res = await fetch(`${FLIGHTS_API_URL}/search?${params}`, {
    headers: { 'X-API-Key': FLIGHTS_API_KEY },
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!res.ok) return null;

  const data = await res.json();
  const allFlights = [
    ...(data.best_flights || []),
    ...(data.other_flights || []),
  ];

  if (allFlights.length === 0) return null;

  return allFlights.map((f: any) => {
    const segments = f.flights || [];
    const first = segments[0] || {};
    const last = segments[segments.length - 1] || {};
    const dep = first.departure_airport || {};
    const arr = last.arrival_airport || {};
    const airline = first.airline || 'Unknown';
    const layovers = f.layovers || [];

    // Extract time from "2026-05-22 4:40 AM" format
    const depTime = extractTime(dep.time || '');
    const arrTime = extractTime(arr.time || '');

    // Build stops description
    let stopsText = 'Nonstop';
    if (layovers.length > 0) {
      const layoverInfo = layovers.map((l: any) => {
        const hrs = Math.floor((l.duration || 0) / 60);
        const mins = (l.duration || 0) % 60;
        return `${hrs}h ${mins}m in ${l.name || l.id || ''}`.trim();
      }).join(', ');
      stopsText = `${layovers.length} stop${layovers.length > 1 ? 's' : ''} \u00b7 ${layoverInfo}`;
    }

    // Format duration
    const totalMin = f.total_duration || 0;
    const durHrs = Math.floor(totalMin / 60);
    const durMins = totalMin % 60;

    // Extract airline code from logo URL or guess from name
    const airlineCode = extractAirlineCode(airline, first.airline_logo || f.airline_logo || '');

    // Check if arrival is next day
    const depDate = dep.time?.split(' ')[0] || '';
    const arrDate = arr.time?.split(' ')[0] || '';
    const isNextDay = depDate && arrDate && depDate !== arrDate;

    // Layover details for display
    const layoverDetails = layovers.map((l: any) => ({
      airport: l.name || '',
      airportCode: l.id || '',
      duration: l.duration || 0,
      overnight: l.overnight || false,
    }));

    // Carbon emissions
    const carbon = f.carbon_emissions || {};
    const co2Kg = carbon.this_flight ? Math.round(carbon.this_flight / 1000) : null;
    const co2Diff = carbon.difference_percent || null;

    return {
      airline,
      airlineCode,
      flightNumber: first.flight_number || airlineCode || '',
      departure: depTime,
      arrival: arrTime,
      depAirportCode: dep.id || from,
      arrAirportCode: arr.id || to,
      depAirportName: dep.name || '',
      arrAirportName: arr.name || '',
      duration: `${durHrs}h ${durMins}m`,
      durationMin: totalMin,
      stops: stopsText,
      layovers: layoverDetails,
      isNextDay,
      price: f.price || 0,
      currency: 'INR',
      travelClass: first.travel_class || 'Economy',
      source: 'live' as const,
      airlineLogo: first.airline_logo || f.airline_logo || '',
      co2Kg,
      co2Diff,
    };
  });
}

/** Extract "HH:MM" from "2026-05-22 4:40 AM" or "2026-05-22 11:15 AM" */
function extractTime(timeStr: string): string {
  if (!timeStr) return '00:00';
  // Match time portion like "4:40 AM" or "11:15 PM"
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return '00:00';

  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Extract airline code from airline name or logo URL */
function extractAirlineCode(name: string, logoUrl: string): string {
  // Try to extract from logo URL like ".../70px/EY.png"
  const logoMatch = logoUrl.match(/\/(\w{2})\.png/);
  if (logoMatch) return logoMatch[1];

  // Map common airline names to codes
  const nameMap: Record<string, string> = {
    'indigo': '6E', 'air india': 'AI', 'air india express': 'IX',
    'vistara': 'UK', 'spicejet': 'SG', 'akasa air': 'QP',
    'etihad': 'EY', 'emirates': 'EK', 'qatar airways': 'QR',
    'turkish airlines': 'TK', 'lufthansa': 'LH', 'klm': 'KL',
    'air france': 'AF', 'british airways': 'BA', 'vueling': 'VY',
    'ryanair': 'FR', 'easyjet': 'U2', 'eurowings': 'EW',
    'singapore airlines': 'SQ', 'thai airways': 'TG',
    'swiss': 'LX', 'austrian': 'OS', 'lot': 'LO',
  };

  const lower = name.toLowerCase();
  for (const [key, code] of Object.entries(nameMap)) {
    if (lower.includes(key)) return code;
  }

  return name.substring(0, 2).toUpperCase();
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
  // Popular tourist destinations → nearest major hub the scraper can handle
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

// ─── Amadeus API (fallback when Google scraper can't render a route) ─────────

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
  } catch {}
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
      max: '10',
    });

    const res = await fetch(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const offers = data.data || [];
    if (offers.length === 0) return null;

    // Map carrier codes to names from dictionaries
    const carriers: Record<string, string> = data.dictionaries?.carriers || {};

    return offers.map((offer: any, i: number) => {
      const itin = offer.itineraries?.[0];
      const segments = itin?.segments || [];
      const first = segments[0] || {};
      const last = segments[segments.length - 1] || {};

      const airline = carriers[first.carrierCode] || first.carrierCode || 'Unknown';
      const airlineCode = first.carrierCode || '';

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
      const stopsText = stops === 0 ? 'Nonstop' : `${stops} stop${stops > 1 ? 's' : ''}`;

      const price = parseFloat(offer.price?.grandTotal || '0');

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
        isNextDay,
        price,
        currency: 'INR',
        source: 'amadeus' as const,
      };
    });
  } catch {
    return null;
  }
}

