import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trackApiCall } from '@/lib/apiTracker';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const trainCache = new Map<string, { data: any; ts: number }>();
const TRAIN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/trains - Search train routes using Google Directions API (transit mode)
 *
 * Query params:
 *   from    - departure city/station
 *   to      - arrival city/station
 *   date    - departure date YYYY-MM-DD (optional)
 *   time    - departure time HH:MM (optional)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || '';
  const date = req.nextUrl.searchParams.get('date') || '';
  const time = req.nextUrl.searchParams.get('time') || '08:00';

  if (!from || !to || !API_KEY) {
    return NextResponse.json({ error: 'Missing params: from, to required' }, { status: 400 });
  }

  // Check cache
  const trainCacheKey = `${from}-${to}-${date}`;
  const cachedTrain = trainCache.get(trainCacheKey);
  if (cachedTrain && Date.now() - cachedTrain.ts < TRAIN_CACHE_TTL) {
    return NextResponse.json(cachedTrain.data);
  }

  try {
    // Build departure_time as Unix timestamp
    let departureTime = '';
    if (date) {
      const dt = new Date(`${date}T${time}:00`);
      departureTime = Math.floor(dt.getTime() / 1000).toString();
    }

    // Try all 4 combinations in parallel: (train|rail / all transit) × (with time / without time)
    let data: any = null;

    const combinations: Array<{ transitMode: string; useTime: boolean }> = [
      { transitMode: 'train|rail', useTime: true },
      { transitMode: 'train|rail', useTime: false },
      { transitMode: '', useTime: true },
      { transitMode: '', useTime: false },
    ];

    const results = await Promise.allSettled(
      combinations.map(({ transitMode, useTime }) => {
        const params = new URLSearchParams({
          origin: from,
          destination: to,
          mode: 'transit',
          alternatives: 'true',
          key: API_KEY,
        });
        if (transitMode) params.set('transit_mode', transitMode);
        if (useTime && departureTime) params.set('departure_time', departureTime);

        return fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, { signal: AbortSignal.timeout(15000) })
          .then(res => res.json());
      })
    );

    // Track successful Google Directions fetches
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.status === 'OK') {
        trackApiCall('google_directions');
      }
    }

    // Pick the first successful result that has routes (in priority order)
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.status === 'OK' && r.value?.routes?.length) {
        data = r.value;
        break;
      }
    }

    if (!data || data.status !== 'OK' || !data.routes?.length) {
      return NextResponse.json({ trains: [], source: 'google_transit', message: 'No transit routes found' });
    }

    // Parse each route into a train option
    const trains = data.routes.map((route: any, i: number) => {
      const leg = route.legs[0];
      const totalDuration = leg.duration.value; // seconds
      const totalDistance = leg.distance.value; // meters

      // Extract transit steps (trains/rails)
      const transitSteps = leg.steps.filter((s: any) => s.travel_mode === 'TRANSIT');
      const walkSteps = leg.steps.filter((s: any) => s.travel_mode === 'WALKING');

      // Build operator and train info from transit details
      const operators: string[] = [];
      const trainNames: string[] = [];
      const trainNumbers: string[] = [];
      let stops = 0;

      transitSteps.forEach((step: any) => {
        const td = step.transit_details;
        if (td) {
          if (td.line?.agencies?.[0]?.name) operators.push(td.line.agencies[0].name);
          if (td.line?.short_name) trainNames.push(td.line.short_name);
          if (td.line?.name) trainNumbers.push(td.line.name);
          if (td.num_stops) stops += td.num_stops;
        }
      });

      const depTime = leg.departure_time?.text || '';
      const arrTime = leg.arrival_time?.text || '';
      const depValue = leg.departure_time?.value || '';
      const arrValue = leg.arrival_time?.value || '';

      // Convert 12h time to 24h
      const dep24 = convertTo24h(depTime);
      const arr24 = convertTo24h(arrTime);

      // Format duration
      const durHrs = Math.floor(totalDuration / 3600);
      const durMins = Math.floor((totalDuration % 3600) / 60);
      const durationStr = durHrs > 0 ? `${durHrs}h ${durMins}m` : `${durMins}m`;

      // Estimate price (Google doesn't provide train prices)
      // Use distance-based estimation: ~€0.10-0.15/km for European trains
      const distKm = totalDistance / 1000;
      const priceEur = Math.round(distKm * 0.12);
      const priceInr = Math.round(priceEur * 92); // EUR to INR

      const operator = Array.from(new Set(operators)).join(' / ') || 'Rail';
      const trainName = Array.from(new Set(trainNames)).join(' + ') || 'Train';

      // Build stops description
      let stopsText = 'Direct';
      if (transitSteps.length > 1) {
        stopsText = `${transitSteps.length - 1} change${transitSteps.length > 2 ? 's' : ''}`;
      }

      // Get departure/arrival station names
      const depStation = transitSteps[0]?.transit_details?.departure_stop?.name || from;
      const arrStation = transitSteps[transitSteps.length - 1]?.transit_details?.arrival_stop?.name || to;

      return {
        id: `train-${i}`,
        operator,
        trainName,
        trainNumber: trainNumbers[0] || `${trainName} ${i + 1}`,
        departure: dep24,
        arrival: arr24,
        departureText: depTime,
        arrivalText: arrTime,
        duration: durationStr,
        durationSeconds: totalDuration,
        stops: stopsText,
        totalStops: stops,
        fromStation: depStation,
        toStation: arrStation,
        price: priceInr,
        priceEstimated: true,
        currency: 'INR',
        distance: `${Math.round(distKm)} km`,
        transitSteps: transitSteps.map((s: any) => ({
          line: s.transit_details?.line?.short_name || s.transit_details?.line?.name || '',
          operator: s.transit_details?.line?.agencies?.[0]?.name || '',
          departure: s.transit_details?.departure_stop?.name || '',
          arrival: s.transit_details?.arrival_stop?.name || '',
          stops: s.transit_details?.num_stops || 0,
          duration: s.duration?.text || '',
          color: s.transit_details?.line?.color || '#6b7280',
          vehicle: s.transit_details?.line?.vehicle?.type || 'RAIL',
        })),
        walkingTime: walkSteps.reduce((s: number, w: any) => s + (w.duration?.value || 0), 0),
        source: 'google_transit',
      };
    });

    // Filter: only keep routes where ALL transit segments are rail/train
    // Mixed routes (bus + metro) belong in the Bus tab, not Trains
    const RAIL_TYPES = new Set(['RAIL', 'HEAVY_RAIL', 'COMMUTER_TRAIN', 'HIGH_SPEED_TRAIN', 'LONG_DISTANCE_TRAIN', 'METRO_RAIL', 'MONORAIL', 'SUBWAY', 'TRAM']);
    const BUS_TYPES = new Set(['BUS', 'INTERCITY_BUS', 'TROLLEYBUS']);
    const trainOnly = trains.filter((t: any) =>
      t.transitSteps?.length > 0 &&
      t.transitSteps.every((s: any) => RAIL_TYPES.has(s.vehicle)) &&
      !t.transitSteps.some((s: any) => BUS_TYPES.has(s.vehicle))
    );

    // Sort by duration
    const result = trainOnly.length > 0 ? trainOnly : trains;
    result.sort((a: any, b: any) => a.durationSeconds - b.durationSeconds);

    // Tag each route: is it a real train or mixed/bus?
    result.forEach((t: any) => {
      const hasRail = t.transitSteps?.some((s: any) => RAIL_TYPES.has(s.vehicle));
      t.isRail = hasRail;
    });

    const responseData = {
      trains: trainOnly.length > 0 ? trainOnly : [], // Only return actual train routes
      allTransit: trains, // Include all transit for reference
      source: 'google_transit',
      hasTrains: trainOnly.length > 0,
    };

    // Store in cache
    trainCache.set(trainCacheKey, { data: responseData, ts: Date.now() });
    if (trainCache.size > 500) {
      const oldest = Array.from(trainCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) trainCache.delete(oldest[0]);
    }

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    });
  } catch (e) {
    return NextResponse.json({ trains: [], error: 'Failed to fetch transit routes' }, { status: 500 });
  }
}

function convertTo24h(timeStr: string): string {
  if (!timeStr) return '08:00';
  // Handle formats like "8:30 AM", "2:15 PM", "14:30"
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '08:00';

  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const ampm = match[3]?.toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
