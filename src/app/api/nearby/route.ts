import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const FLIGHTS_API_URL = process.env.FLIGHTS_API_URL || '';
const FLIGHTS_API_KEY = process.env.FLIGHTS_API_KEY || '';

/**
 * GET /api/nearby - Search hotels near a location
 *
 * Uses live Google Hotels scraper first, falls back to Google Places Nearby.
 *
 * Query params:
 *   location  - place name or "lat,lng"
 *   radius    - search radius in meters (default 5000)
 *   checkIn   - check-in date YYYY-MM-DD (for live pricing)
 *   checkOut  - check-out date YYYY-MM-DD (for live pricing)
 *   currency  - currency code (default INR)
 */
export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get('location') || '';
  const radius = req.nextUrl.searchParams.get('radius') || '5000';
  const checkIn = req.nextUrl.searchParams.get('checkIn') || '';
  const checkOut = req.nextUrl.searchParams.get('checkOut') || '';
  const currency = req.nextUrl.searchParams.get('currency') || 'INR';

  if (!location) {
    return NextResponse.json({ places: [], source: 'none' });
  }

  try {
    // Try live hotel API first (Google Hotels scraper)
    if (FLIGHTS_API_URL && FLIGHTS_API_KEY && checkIn && checkOut) {
      const liveResult = await fetchLiveHotels(location, checkIn, checkOut, currency);
      if (liveResult && liveResult.length > 0) {
        // Enrich hotels without images using Google Places photos
        if (API_KEY) {
          const needsImages = liveResult.filter((h: any) => !h.images || !Array.isArray(h.images) || h.images.length === 0 || h.images.every((img: any) => !img?.thumbnail));
          if (needsImages.length > 0) {
            await Promise.allSettled(
              needsImages.slice(0, 10).map(async (h: any) => {
                try {
                  const hotelName = h.displayName?.text || '';
                  // Try multiple search queries for better coverage
                  const queries = [
                    `${hotelName} ${location}`,
                    hotelName.replace(/\s*\(.*?\)\s*/g, '').trim(), // Remove parenthetical text
                  ];
                  for (const query of queries) {
                    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': API_KEY,
                        'X-Goog-FieldMask': 'places.photos',
                      },
                      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
                    });
                    const searchData = await searchRes.json();
                    const photos = searchData.places?.[0]?.photos;
                    if (photos?.length > 0) {
                      h.images = photos.slice(0, 3).map((p: any) => ({
                        thumbnail: `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=200&maxWidthPx=300&key=${API_KEY}`,
                        original: `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=600&maxWidthPx=800&key=${API_KEY}`,
                      }));
                      break; // Found images, stop trying other queries
                    }
                  }
                } catch {}
              })
            );
          }
        }
        return NextResponse.json({ places: liveResult, source: 'live' });
      }
    }

    // Fallback to Google Places Nearby Search
    const placesResult = await fetchNearbyPlaces(location, parseInt(radius));
    return NextResponse.json({ places: placesResult, source: 'google_places' });
  } catch {
    return NextResponse.json({ places: [], source: 'error' });
  }
}

// ─── Live Google Hotels scraper ──────────────────────────────────────────────

async function fetchLiveHotels(location: string, checkIn: string, checkOut: string, currency: string) {
  // Use USD for hotel pricing (API returns empty rates for INR)
  // Convert to INR at display time
  const params = new URLSearchParams({
    engine: 'google_hotels',
    q: `Hotels in ${location}`,
    check_in_date: checkIn,
    check_out_date: checkOut,
    currency: 'USD',
    gl: 'us',
    hl: 'en',
  });

  const res = await fetch(`${FLIGHTS_API_URL}/search?${params}`, {
    headers: { 'X-API-Key': FLIGHTS_API_KEY },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const properties = data.properties || [];

  if (properties.length === 0) return null;

  const USD_TO_INR = 85; // Approximate conversion rate

  return properties.map((h: any) => {
    const usdRate = h.rate_per_night?.extracted_lowest || null;
    const inrRate = usdRate ? Math.round(usdRate * USD_TO_INR) : null;
    const usdTotal = h.total_rate?.extracted_lowest || null;
    const inrTotal = usdTotal ? Math.round(usdTotal * USD_TO_INR) : null;

    return {
    id: h.property_token || h.name?.replace(/\s+/g, '-').toLowerCase() || '',
    displayName: { text: h.name || '' },
    // Clean description: remove price text ($12 nightly), deal text (GREAT DEAL), etc.
    formattedAddress: (h.description || '').replace(/\$\d+.*$/i, '').replace(/DEAL|GREAT DEAL/gi, '').replace(/nightly/gi, '').trim() || '',
    rating: h.overall_rating || 0,
    priceLevel: '',
    ratePerNight: inrRate ? `\u20b9${inrRate.toLocaleString()}` : null,
    rateExtracted: inrRate,
    totalRate: inrTotal ? `\u20b9${inrTotal.toLocaleString()}` : null,
    totalExtracted: inrTotal,
    hotelClass: h.hotel_class || '',
    deal: h.deal || (h.deal_description ? h.deal_description : null),
    checkInTime: h.check_in_time || '',
    checkOutTime: h.check_out_time || '',
    amenities: h.amenities || [],
    images: (h.images || []).filter(Boolean).map((img: any) => ({
      thumbnail: typeof img === 'string' ? img : (img.thumbnail || ''),
      original: typeof img === 'string' ? img : (img.original_image || img.thumbnail || ''),
    })).filter((img: any) => img.thumbnail && !img.thumbnail.includes('default-user') && img.thumbnail.length > 50),
    link: h.link || '',
    mapsLink: `https://www.google.com/maps/search/${encodeURIComponent(h.name + ' ' + location)}`,
    bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.name + ', ' + location)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=2&no_rooms=1`,
    source: 'live',
  };
  });
}

// ─── Google Places Nearby Search (fallback) ──────────────────────────────────

async function fetchNearbyPlaces(location: string, radiusMeters: number) {
  if (!API_KEY) return [];

  // Geocode the location
  let lat: number, lng: number;

  if (location.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
    [lat, lng] = location.split(',').map(Number);
  } else {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${API_KEY}`
    );
    const geoData = await geoRes.json();
    if (geoData.status !== 'OK' || !geoData.results?.[0]) return [];
    lat = geoData.results[0].geometry.location.lat;
    lng = geoData.results[0].geometry.location.lng;
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.id,places.location,places.photos',
    },
    body: JSON.stringify({
      includedTypes: ['hotel', 'lodging', 'guest_house', 'hostel'],
      maxResultCount: 10,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
      rankPreference: 'DISTANCE',
      languageCode: 'en',
    }),
  });

  const data = await res.json();
  return (data.places || []).map((p: any) => ({
    ...p,
    source: 'google_places',
  }));
}
