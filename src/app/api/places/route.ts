import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trackApiCall } from '@/lib/apiTracker';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const placesCache = new Map<string, { data: any; ts: number }>();
const PLACES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ suggestions: [], error: 'Unauthorized' }, { status: 401 });
  const input = req.nextUrl.searchParams.get('input') || '';
  const type = req.nextUrl.searchParams.get('type') || 'autocomplete';
  const scope = req.nextUrl.searchParams.get('scope') || 'cities'; // 'cities' or 'all'

  if (!input || !API_KEY) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    if (type === 'autocomplete') {
      // Check cache for autocomplete results
      const placesCacheKey = `${input}-${scope}`;
      const cachedPlaces = placesCache.get(placesCacheKey);
      if (cachedPlaces && Date.now() - cachedPlaces.ts < PLACES_CACHE_TTL) {
        return NextResponse.json(cachedPlaces.data);
      }

      // Uses the new Places API (New) - Autocomplete
      const res = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            input,
            ...(scope === 'cities'
              ? { includedPrimaryTypes: ['locality', 'administrative_area_level_1', 'country'] }
              : {}),
            languageCode: 'en',
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await res.json();
      trackApiCall('google_places_autocomplete');

      // Store in cache
      placesCache.set(placesCacheKey, { data, ts: Date.now() });
      if (placesCache.size > 1000) {
        const oldest = Array.from(placesCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) placesCache.delete(oldest[0]);
      }

      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    }

    if (type === 'details') {
      // input = placeId here
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${input}`,
        {
          headers: {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'displayName,formattedAddress,location,addressComponents',
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await res.json();
      trackApiCall('google_places_details');
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'API request failed' }, { status: 500 });
  }
}
