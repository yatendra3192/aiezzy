import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Cache to avoid repeated API calls for same city
const cache = new Map<string, { code: string; airport: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/resolve-airport?city=California
 * Returns the nearest airport IATA code for any city/place in the world.
 */
export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city') || '';

  if (!city || !API_KEY) {
    return NextResponse.json({ code: '', airport: '' });
  }

  // Check cache
  const cached = cache.get(city.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ code: cached.code, airport: cached.airport, cached: true });
  }

  try {
    // Use Google Places Text Search to find "international airport near [city]"
    const searchRes = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.shortFormattedAddress,places.id',
        },
        body: JSON.stringify({
          textQuery: `international airport near ${city}`,
          maxResultCount: 3,
          languageCode: 'en',
        }),
      }
    );

    const searchData = await searchRes.json();
    const airports = searchData.places || [];

    if (airports.length === 0) {
      // Try without "international"
      const fallbackRes = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.shortFormattedAddress,places.id',
          },
          body: JSON.stringify({
            textQuery: `airport near ${city}`,
            maxResultCount: 3,
            languageCode: 'en',
          }),
        }
      );
      const fallbackData = await fallbackRes.json();
      airports.push(...(fallbackData.places || []));
    }

    if (airports.length === 0) {
      cache.set(city.toLowerCase(), { code: '', airport: '', timestamp: Date.now() });
      return NextResponse.json({ code: '', airport: '', error: 'No airports found' });
    }

    const airportName = airports[0].displayName?.text || '';

    // Extract IATA code from airport name — look for (XXX) pattern
    let iataCode = '';
    const iataMatch = airportName.match(/\(([A-Z]{3})\)/);
    if (iataMatch) {
      iataCode = iataMatch[1];
    }

    // If no IATA in name, try autocomplete which often includes IATA codes
    if (!iataCode) {
      const autoRes = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            input: airportName,
            includedPrimaryTypes: ['airport'],
            languageCode: 'en',
          }),
        }
      );
      const autoData = await autoRes.json();
      for (const s of (autoData.suggestions || [])) {
        const text = s.placePrediction?.text?.text || '';
        const match = text.match(/\(([A-Z]{3})\)/);
        if (match) { iataCode = match[1]; break; }
      }
    }

    // If still no code, try getting place details which might have it
    if (!iataCode && airports[0].id) {
      const detailRes = await fetch(
        `https://places.googleapis.com/v1/${airports[0].id}`,
        {
          headers: {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'displayName,shortFormattedAddress,websiteUri',
          },
        }
      );
      const detailData = await detailRes.json();
      const detailName = detailData.displayName?.text || '';
      const detailMatch = detailName.match(/\(([A-Z]{3})\)/);
      if (detailMatch) iataCode = detailMatch[1];

      // Check website URL for IATA code patterns
      const website = detailData.websiteUri || '';
      const urlMatch = website.match(/\/([A-Z]{3})\b/);
      if (!iataCode && urlMatch) iataCode = urlMatch[1];
    }

    // Cache the result
    cache.set(city.toLowerCase(), { code: iataCode, airport: airportName, timestamp: Date.now() });

    return NextResponse.json({
      code: iataCode,
      airport: airportName,
      allAirports: airports.map((a: any) => a.displayName?.text || ''),
    });
  } catch (e: any) {
    return NextResponse.json({ code: '', airport: '', error: e.message });
  }
}
