import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.searchParams.get('origin') || '';
  const destination = req.nextUrl.searchParams.get('destination') || '';
  const mode = req.nextUrl.searchParams.get('mode') || 'driving';

  if (!origin || !destination || !API_KEY) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      key: API_KEY,
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params}`
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'API request failed' }, { status: 500 });
  }
}
