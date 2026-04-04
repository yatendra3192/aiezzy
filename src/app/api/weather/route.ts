import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Map WMO weather codes to descriptions
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers',
  81: 'Moderate showers',
  82: 'Violent showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

// In-memory cache (city+date -> response), 1 hour TTL
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  // Allow authenticated users OR shared-trip access via token param
  const shareToken = req.nextUrl.searchParams.get('shareToken');
  if (!shareToken) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const city = req.nextUrl.searchParams.get('city');
  const date = req.nextUrl.searchParams.get('date');

  if (!city || !date) {
    return NextResponse.json({ error: 'Missing city or date parameter' }, { status: 400 });
  }

  const cacheKey = `${city.toLowerCase()}-${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Step 1: Geocode the city using Open-Meteo geocoding
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`,
      { signal: AbortSignal.timeout(10000) }
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    const { latitude, longitude } = geoData.results[0];

    // Step 2: Fetch weather forecast
    // Open-Meteo free tier supports up to 16 days forecast
    // For dates beyond that, return null gracefully
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&start_date=${date}&end_date=${date}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const weatherData = await weatherRes.json();

    if (!weatherData.daily || !weatherData.daily.time || weatherData.daily.time.length === 0) {
      return NextResponse.json({ error: 'No weather data available for this date' }, { status: 404 });
    }

    const weathercode = weatherData.daily.weathercode[0];
    const result = {
      temp_max: weatherData.daily.temperature_2m_max[0],
      temp_min: weatherData.daily.temperature_2m_min[0],
      precipitation: weatherData.daily.precipitation_sum[0],
      weathercode,
      description: WEATHER_DESCRIPTIONS[weathercode] || 'Unknown',
    };

    // Cache the result
    cache.set(cacheKey, { data: result, ts: Date.now() });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (e) {
    console.error('[weather] Error:', e);
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
  }
}
