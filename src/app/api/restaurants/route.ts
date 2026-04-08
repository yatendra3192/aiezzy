import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// In-memory cache: "lat,lng,mealType" → { data, ts }
const cache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const MEAL_TYPES: Record<string, string[]> = {
  breakfast: ['cafe', 'bakery', 'breakfast_restaurant', 'coffee_shop'],
  lunch: ['restaurant', 'cafe', 'fast_food_restaurant', 'sandwich_shop'],
  dinner: ['restaurant', 'fine_dining_restaurant', 'steak_house', 'seafood_restaurant'],
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const mealType = searchParams.get('mealType') || 'lunch';

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  if (!API_KEY) {
    return NextResponse.json({ restaurants: [] });
  }

  // Check cache
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${mealType}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ restaurants: cached.data });
  }

  try {
    const includedTypes = MEAL_TYPES[mealType] || MEAL_TYPES.lunch;
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.id,places.location,places.primaryType,places.photos',
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 5,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 800 } },
        rankPreference: 'DISTANCE',
        languageCode: 'en',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error('Google Places restaurants error:', res.status);
      return NextResponse.json({ restaurants: [] });
    }

    const data = await res.json();
    const restaurants = (data.places || []).map((p: any) => ({
      placeId: p.id || '',
      name: p.displayName?.text || '',
      rating: p.rating || 0,
      priceLevel: p.priceLevel || '',
      cuisineType: (p.primaryType || 'restaurant').replace(/_/g, ' '),
      lat: p.location?.latitude || 0,
      lng: p.location?.longitude || 0,
      address: p.formattedAddress || '',
      photoRef: p.photos?.[0]?.name || '',
    }));

    cache.set(cacheKey, { data: restaurants, ts: Date.now() });
    return NextResponse.json({ restaurants });
  } catch (e: any) {
    console.error('Restaurants API error:', e.message);
    return NextResponse.json({ restaurants: [] });
  }
}
