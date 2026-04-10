import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createUserClient } from '@/lib/supabase/server';
import { validateTripPayload } from '@/lib/tripValidation';

/** GET /api/trips - List user's trips */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).supabaseUserId;
  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 });
  }

  const supabase = await createUserClient(userId);

  // Dashboard query: fetch only fields needed for trip cards (skip deep_plan_data, booking_docs)
  // Note: city JSONB includes embedded _places but we only read city.name — acceptable overhead for now
  const { data: trips, error } = await supabase
    .from('trips')
    .select(`
      id, title, from_address, departure_date, adults, children, infants,
      trip_type, status, created_at, updated_at,
      trip_destinations(id, position, city, nights, selected_hotel),
      trip_transport_legs(id, position, transport_type, selected_flight, selected_train)
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform for frontend: add destination count, cost summary
  const result = (trips || []).map(trip => {
    const dests = (trip.trip_destinations || []).sort((a: any, b: any) => a.position - b.position);
    const legs = (trip.trip_transport_legs || []).sort((a: any, b: any) => a.position - b.position);
    const totalNights = dests.reduce((s: number, d: any) => s + (d.nights || 0), 0);

    // Calculate costs
    const flightCost = legs
      .filter((l: any) => l.selected_flight)
      .reduce((s: number, l: any) => s + (l.selected_flight?.pricePerAdult || 0), 0) * (trip.adults || 1);
    const trainCost = legs
      .filter((l: any) => l.selected_train)
      .reduce((s: number, l: any) => s + (l.selected_train?.price || 0), 0) * ((trip.adults || 1) + (trip.children || 0));
    const hotelCost = dests
      .filter((d: any) => d.selected_hotel && d.nights > 0)
      .reduce((s: number, d: any) => s + (d.selected_hotel?.pricePerNight || 0) * d.nights, 0);

    return {
      id: trip.id,
      title: trip.title || `${trip.from_address} Trip`,
      fromAddress: trip.from_address,
      departureDate: trip.departure_date,
      adults: trip.adults,
      children: trip.children,
      infants: trip.infants,
      tripType: trip.trip_type,
      status: trip.status,
      destinationCount: dests.length,
      destinations: dests.map((d: any) => d.city?.name).filter(Boolean),
      totalNights,
      flightCost,
      trainCost,
      hotelCost,
      totalCost: flightCost + trainCost + hotelCost,
      createdAt: trip.created_at,
      updatedAt: trip.updated_at,
    };
  });

  return NextResponse.json({ trips: result });
}

/** POST /api/trips - Create new trip atomically */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).supabaseUserId;
  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 });
  }

  const raw = await req.json();
  const validation = validateTripPayload(raw);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;
  const supabase = await createUserClient(userId);

  // Generate title: "Trip 4 · 26 Jan · Mumbai to Paris"
  const { count: tripCount } = await supabase
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const tripNum = (tripCount || 0) + 1;

  const destNames = (body.destinations || []).map((d: any) => d.city?.name).filter(Boolean);
  const fromName = body.fromAddress?.split(',')[0] || 'Home';
  const lastDest = destNames[destNames.length - 1] || '';
  const depDate = body.departureDate ? new Date(body.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  const title = lastDest
    ? `Trip ${tripNum} · ${depDate} · ${fromName} to ${lastDest}`
    : `Trip ${tripNum} · ${depDate}`;

  // Strip _deepPlanData and _bookingDocs from from_city (now stored in dedicated columns)
  const { _deepPlanData, _bookingDocs, ...cleanFrom } = (body.from || {}) as any;

  // Build destination rows
  const destRows = (body.destinations || []).map((d: any, i: number) => ({
    position: i,
    city: { ...(d.city || {}), _places: d.places || [] },
    nights: d.nights ?? 2,
    selected_hotel: d.selectedHotel ? { ...d.selectedHotel, _additionalHotels: d.additionalHotels || [] } : null,
  }));

  // Build transport leg rows
  const legRows = (body.transportLegs || []).map((l: any, i: number) => ({
    position: i,
    transport_type: l.type || 'drive',
    duration: l.duration || null,
    distance: l.distance || null,
    departure_time: l.departureTime || null,
    arrival_time: l.arrivalTime || null,
    selected_flight: l.selectedFlight || null,
    selected_train: l.selectedTrain || null,
  }));

  // Try atomic RPC first (single transaction — all or nothing)
  const { data: tripId, error: rpcError } = await supabase.rpc('create_trip_atomic', {
    p_user_id: userId,
    p_title: title,
    p_from_city: cleanFrom,
    p_from_address: body.fromAddress || '',
    p_departure_date: body.departureDate,
    p_adults: body.adults || 1,
    p_children: body.children || 0,
    p_infants: body.infants || 0,
    p_trip_type: body.tripType || 'roundTrip',
    p_deep_plan_data: body.deepPlanData !== undefined ? body.deepPlanData : null,
    p_booking_docs: body.bookingDocs !== undefined ? body.bookingDocs : null,
    p_destinations: destRows,
    p_legs: legRows,
  });

  if (!rpcError && tripId) {
    // Fetch server timestamp for optimistic locking on future saves
    const { data: ts } = await supabase.from('trips').select('updated_at').eq('id', tripId).single();
    return NextResponse.json({ id: tripId, updatedAt: ts?.updated_at }, { status: 201 });
  }

  // RPC function may not exist yet (pre-migration) — fall back to sequential operations
  if (rpcError?.message?.includes('create_trip_atomic') || rpcError?.code === '42883') {
    console.warn('[trip-create] atomic RPC not available, falling back to sequential operations');
    return createTripSequential(supabase, userId, title, cleanFrom, body, destRows, legRows);
  }

  console.error('[trip-create] atomic error:', rpcError?.message);
  return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 });
}

/** Fallback: sequential create for pre-migration databases (non-atomic) */
async function createTripSequential(
  supabase: any, userId: string, title: string, cleanFrom: any,
  body: any, destRows: any[], legRows: any[]
) {
  const insertPayload: Record<string, any> = {
    user_id: userId,
    title,
    from_city: cleanFrom,
    from_address: body.fromAddress || '',
    departure_date: body.departureDate,
    adults: body.adults || 1,
    children: body.children || 0,
    infants: body.infants || 0,
    trip_type: body.tripType || 'roundTrip',
    status: 'draft',
  };
  if (body.deepPlanData !== undefined) insertPayload.deep_plan_data = body.deepPlanData;
  if (body.bookingDocs !== undefined) insertPayload.booking_docs = body.bookingDocs;

  const { data: trip, error: tripError } = await supabase
    .from('trips').insert(insertPayload).select('id').single();
  if (tripError || !trip) {
    console.error('[trip-create] error:', tripError?.message);
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 });
  }

  if (destRows.length > 0) {
    const rows = destRows.map(d => ({ ...d, trip_id: trip.id }));
    const { error: destError } = await supabase.from('trip_destinations').insert(rows);
    if (destError) {
      await supabase.from('trips').delete().eq('id', trip.id);
      return NextResponse.json({ error: destError.message }, { status: 500 });
    }
  }

  if (legRows.length > 0) {
    const rows = legRows.map(l => ({ ...l, trip_id: trip.id }));
    const { error: legError } = await supabase.from('trip_transport_legs').insert(rows);
    if (legError) {
      await supabase.from('trips').delete().eq('id', trip.id);
      return NextResponse.json({ error: legError.message }, { status: 500 });
    }
  }

  const { data: ts } = await supabase.from('trips').select('updated_at').eq('id', trip.id).single();
  return NextResponse.json({ id: trip.id, updatedAt: ts?.updated_at }, { status: 201 });
}
