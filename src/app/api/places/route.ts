import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input') || '';
  const type = req.nextUrl.searchParams.get('type') || 'autocomplete';
  const scope = req.nextUrl.searchParams.get('scope') || 'cities'; // 'cities' or 'all'

  if (!input || !API_KEY) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    if (type === 'autocomplete') {
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
        }
      );
      const data = await res.json();
      return NextResponse.json(data);
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
        }
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'API request failed' }, { status: 500 });
  }
}
