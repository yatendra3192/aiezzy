import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const dirCache = new Map<string, { data: any; ts: number }>();
const DIR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const origin = req.nextUrl.searchParams.get('origin') || '';
  const destination = req.nextUrl.searchParams.get('destination') || '';
  const mode = req.nextUrl.searchParams.get('mode') || 'driving';

  if (!origin || !destination || !API_KEY) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${origin}-${destination}-${mode}`;
  const cached = dirCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DIR_CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      alternatives: 'true',
      key: API_KEY,
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const data = await res.json();

    // Store in cache
    dirCache.set(cacheKey, { data, ts: Date.now() });
    if (dirCache.size > 1000) {
      const oldest = Array.from(dirCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) dirCache.delete(oldest[0]);
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'API request failed' }, { status: 500 });
  }
}
