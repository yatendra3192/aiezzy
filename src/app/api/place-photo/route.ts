import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trackApiCall } from '@/lib/apiTracker';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Server-side cache: query → photo URL (persists across requests in same process)
const photoCache = new Map<string, { url: string | null; ts: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ url: null, error: 'Unauthorized' }, { status: 401 });
  const query = req.nextUrl.searchParams.get('q') || '';
  if (!query || !API_KEY) {
    return NextResponse.json({ url: null });
  }

  // Check cache
  const cached = photoCache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ url: cached.url }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  try {
    // Google Places (New) Text Search — find the place and get photo references
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.photos',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        languageCode: 'en',
      }),
    });

    const searchData = await searchRes.json();
    trackApiCall('google_places_text_search');
    const photos = searchData.places?.[0]?.photos;

    if (!photos || photos.length === 0) {
      photoCache.set(query, { url: null, ts: Date.now() });
      return NextResponse.json({ url: null });
    }

    // Build direct photo URL (same pattern as /api/nearby hotel enrichment)
    const photoName = photos[0].name;
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=800&key=${API_KEY}`;

    photoCache.set(query, { url, ts: Date.now() });

    // Evict oldest entries if cache grows too large
    if (photoCache.size > 500) {
      const oldest = Array.from(photoCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) photoCache.delete(oldest[0]);
    }

    return NextResponse.json({ url }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    photoCache.set(query, { url: null, ts: Date.now() });
    return NextResponse.json({ url: null });
  }
}
