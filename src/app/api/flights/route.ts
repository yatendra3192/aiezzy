import { NextRequest, NextResponse } from 'next/server';

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
  const type = req.nextUrl.searchParams.get('type') || '2'; // default one-way
  const returnDate = req.nextUrl.searchParams.get('returnDate') || '';

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing params: from, to, date required' }, { status: 400 });
  }

  // Resolve city names to airport codes if needed
  const fromResolved = resolveAirportCode(from);
  const toResolved = resolveAirportCode(to);

  try {
    // Try live API first (use resolved airport codes)
    if (FLIGHTS_API_URL && FLIGHTS_API_KEY && fromResolved && toResolved) {
      const liveResult = await fetchLiveFlights(fromResolved, toResolved, date, adults, type, returnDate);
      if (liveResult && liveResult.length > 0) {
        return NextResponse.json({
          status: 'OK',
          from, to, date, adults: parseInt(adults),
          fromResolved, toResolved,
          fromIsNearby: isNearbyAirport(from, fromResolved),
          toIsNearby: isNearbyAirport(to, toResolved),
          flights: liveResult,
          source: 'live',
        });
      }
    }

    // Fallback to estimated pricing
    const estimated = generateEstimatedFlights(from, to, date);
    return NextResponse.json({
      status: 'OK',
      from, to, date, adults: parseInt(adults),
      flights: estimated,
      source: 'estimated',
    });
  } catch (e) {
    // Fallback on any error
    const estimated = generateEstimatedFlights(from, to, date);
    return NextResponse.json({
      status: 'OK',
      from, to, date, adults: parseInt(adults),
      flights: estimated,
      source: 'estimated',
    });
  }
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

  // Look up city name
  const lower = input.toLowerCase().trim();
  if (CITY_TO_AIRPORT[lower]) return CITY_TO_AIRPORT[lower];

  // Try partial match
  for (const [city, code] of Object.entries(CITY_TO_AIRPORT)) {
    if (lower.includes(city) || city.includes(lower)) return code;
  }

  return input; // Return as-is, let the API handle it
}

// ─── Estimated fallback (simplified) ──────────────────────────────────────────

function generateEstimatedFlights(from: string, to: string, date: string) {
  const DISTANCES: Record<string, number> = {
    'BOM-AMS': 7366, 'BOM-LHR': 7196, 'BOM-CDG': 7020, 'BOM-BCN': 6576,
    'AMS-BCN': 1240, 'AMS-CDG': 430, 'CDG-BCN': 830, 'BCN-BOM': 6576,
  };
  const dist = DISTANCES[`${from}-${to}`] || DISTANCES[`${to}-${from}`] || 3000;
  const base = dist > 5000 ? 22000 + dist * 1.2 : dist > 2000 ? 8000 + dist * 3 : 4000 + dist * 4;

  const airlines = [
    { name: 'IndiGo', code: '6E', m: 0.92 },
    { name: 'Air India', code: 'AI', m: 1.05 },
    { name: 'Etihad', code: 'EY', m: 1.12 },
    { name: 'KLM', code: 'KL', m: 1.08 },
  ];

  const seed = date.split('-').reduce((a, b) => a + parseInt(b), 0);

  return airlines.map((a, i) => ({
    airline: a.name, airlineCode: a.code,
    flightNumber: `${a.code}${100 + ((seed + i * 37) % 900)}`,
    departure: `${String(5 + i * 3).padStart(2, '0')}:${String((seed * 7 + i * 13) % 60).padStart(2, '0')}`,
    arrival: `${String((11 + i * 4) % 24).padStart(2, '0')}:${String((seed * 3 + i * 17) % 60).padStart(2, '0')}`,
    duration: `${Math.floor(dist / 800 + i)}h ${30 + i * 10}m`,
    stops: i === 0 ? 'Nonstop' : `1 stop`,
    price: Math.round(base * a.m / 100) * 100,
    currency: 'INR',
    source: 'estimated' as const,
  })).sort((a, b) => a.price - b.price);
}
