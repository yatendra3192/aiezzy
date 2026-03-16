import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_CITY_AIRPORTS } from '@/data/airports';

const FLIGHTS_API_URL = process.env.FLIGHTS_API_URL || '';
const FLIGHTS_API_KEY = process.env.FLIGHTS_API_KEY || '';

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
        error: `Could not resolve airports for ${fromAirports.length === 0 ? from : to}`,
      });
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
          return NextResponse.json({
            status: 'OK',
            from, to, date, adults: parseInt(adults),
            fromResolved: ap.code,
            toResolved: toCode,
            fromAirport: ap.name,
            fromDistance: ap.distance,
            fromIsNearby: ap.code !== resolveAirportCode(from),
            toIsNearby: toCode !== resolveAirportCode(to),
            flights: r.value.flights,
            source: 'live',
          });
        }
      }

      // If departure side all failed, try parallelizing the arrival side too
      if (toAirports.length > 1) {
        const toCandidates = toAirports.slice(0, 3);
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
              toAirport: ap.name,
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

    // No flights found from any nearby airport
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

/**
 * Pick a spread of airports: closest + spaced out to cover major hubs.
 * E.g., from [IDR(103), UDR(184), BDQ(216), BHO(235), AMD(247), STV(341), BOM(521)]
 * picks: IDR(103), BDQ(216), STV(341), BOM(521) — covering 100-500km range
 */
function pickSpreadCandidates(airports: AirportCandidate[], maxCount: number): AirportCandidate[] {
  if (airports.length <= maxCount) return airports;

  const picked: AirportCandidate[] = [airports[0]]; // always include closest
  let lastDist = airports[0].distance;

  for (const ap of airports.slice(1)) {
    if (picked.length >= maxCount) break;
    // Include if it's 100+km farther than last picked, OR if it's one of the first 2
    if (picked.length < 2 || ap.distance > lastDist + 75) {
      picked.push(ap);
      lastDist = ap.distance;
    }
  }

  return picked;
}

// ─── Resolve city to list of nearby airports ──────────────────────────────────

interface AirportCandidate {
  code: string;
  name: string;
  distance: number; // km
}

async function resolveToAirports(input: string, baseUrl: string): Promise<AirportCandidate[]> {
  // Fast path: already an IATA code — no alternatives needed
  if (/^[A-Z]{2,3}$/.test(input)) {
    return [{ code: input, name: '', distance: 0 }];
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
        distance: a.distance_km,
      }));
    }
  } catch {}

  // Fallback: static resolution (curated map + OpenFlights DB)
  const staticCode = resolveAirportCode(input);
  if (staticCode) {
    return [{ code: staticCode, name: '', distance: 0 }];
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
      flightNumber: first.flight_number || `${airlineCode}${Math.floor(Math.random() * 900 + 100)}`,
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
  if (/^[A-Z]{2,3}$/.test(input)) return false; // Already an IATA code
  const lower = input.toLowerCase().trim();
  // If the city has its own airport in the mapping, it's NOT nearby
  if (CITY_TO_AIRPORT[lower] && !NEARBY_AIRPORT_CITIES.has(lower)) return false;
  // If not in mapping at all but resolved, it's nearby
  if (!CITY_TO_AIRPORT[lower] && resolved) return true;
  // If in the nearby set, it's nearby
  return NEARBY_AIRPORT_CITIES.has(lower);
}

function resolveAirportCode(input: string): string {
  // Already an IATA code (2-3 uppercase letters)
  if (/^[A-Z]{2,3}$/.test(input)) return input;

  const lower = input.toLowerCase().trim();

  // 1. Check curated mapping (has special cases like Bruges→BRU, Thane→BOM)
  if (CITY_TO_AIRPORT[lower]) return CITY_TO_AIRPORT[lower];

  // 2. Check global OpenFlights database (5,599 cities worldwide)
  if (GLOBAL_CITY_AIRPORTS[lower]) return GLOBAL_CITY_AIRPORTS[lower];

  // 3. Try partial match on curated mapping
  for (const [city, code] of Object.entries(CITY_TO_AIRPORT)) {
    if (lower.includes(city) || city.includes(lower)) return code;
  }

  // 4. Try partial match on global database
  for (const [city, code] of Object.entries(GLOBAL_CITY_AIRPORTS)) {
    if (lower === city) return code;
  }

  return ''; // Return empty - will trigger dynamic Google resolver
}

