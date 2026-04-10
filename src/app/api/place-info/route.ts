import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Cache: "place_city" → { data, ts }
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const place = req.nextUrl.searchParams.get('place') || '';
  const city = req.nextUrl.searchParams.get('city') || '';
  if (!place) return NextResponse.json({ error: 'place required' }, { status: 400 });

  const cacheKey = `${place}_${city}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Fetch photos from Google Places
  let photos: string[] = [];
  let address = '';
  let rating = 0;
  let placeTypes: string[] = [];

  if (API_KEY) {
    try {
      const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.photos,places.formattedAddress,places.rating,places.types,places.displayName',
        },
        body: JSON.stringify({ textQuery: `${place}, ${city}`, maxResultCount: 1, languageCode: 'en' }),
        signal: AbortSignal.timeout(8000),
      });
      const searchData = await searchRes.json();
      const p = searchData.places?.[0];
      if (p) {
        address = p.formattedAddress || '';
        rating = p.rating || 0;
        placeTypes = (p.types || []).slice(0, 5);
        // Get up to 5 photo URLs
        const photoRefs = (p.photos || []).slice(0, 5);
        for (const photo of photoRefs) {
          if (photo.name) {
            photos.push(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=600&key=${API_KEY}`);
          }
        }
      }
    } catch (e) {
      console.error('Place info photos error:', e);
    }
  }

  // Generate description with Gemini
  let description = '';
  let keyFacts: string[] = [];

  if (GEMINI_KEY) {
    try {
      const prompt = `Write about "${place}" in ${city || 'the world'} for a traveler. Return ONLY valid JSON:
{
  "description": "2-3 paragraphs about the place — history, what makes it special, what visitors experience. Write engagingly like a travel guide.",
  "keyFacts": ["Location: ...", "Built: ...", "Best time to visit: ...", "Tip: ..."]
}
Keep keyFacts to 4-6 bullet points. Focus on practical visitor info.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          description = parsed.description || '';
          keyFacts = parsed.keyFacts || [];
        }
      }
    } catch (e) {
      console.error('Place info AI error:', e);
    }
  }

  const result = { place, city, photos, address, rating, placeTypes, description, keyFacts };
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return NextResponse.json(result);
}
