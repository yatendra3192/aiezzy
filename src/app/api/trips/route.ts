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

  const { data: trips, error } = await supabase
    .from('trips')
    .select(`
      id, title, from_address, departure_date, adults, children, infants,
      trip_type, status, created_at, updated_at,
      trip_destinations(id, position, city, nights, selected_hotel),
      trip_transport_legs(id, position, transport_type, duration, distance, selected_flight, selected_train)
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
      .reduce((s: number, l: any) => s + (l.selected_train?.price || 0), 0) * (trip.adults || 1);
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

/** POST /api/trips - Create new trip */
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
  // Count existing trips for numbering
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

  // 1. Create trip
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
  // Write deepPlanData and bookingDocs to dedicated columns if provided
  if (body.deepPlanData !== undefined) insertPayload.deep_plan_data = body.deepPlanData;
  if (body.bookingDocs !== undefined) insertPayload.booking_docs = body.bookingDocs;

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert(insertPayload)
    .select('id')
    .single();

  if (tripError || !trip) {
    console.error('[trip-create] error:', tripError?.message);
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 });
  }

  // 2. Insert destinations
  if (body.destinations?.length > 0) {
    const destRows = body.destinations.map((d: any, i: number) => ({
      trip_id: trip.id,
      position: i,
      city: { ...(d.city || {}), _places: d.places || [] },
      nights: d.nights ?? 2,
      selected_hotel: d.selectedHotel ? { ...d.selectedHotel, _additionalHotels: d.additionalHotels || [] } : null,
    }));

    const { error: destError } = await supabase.from('trip_destinations').insert(destRows);
    if (destError) {
      // Cleanup: delete the trip if destinations fail
      await supabase.from('trips').delete().eq('id', trip.id);
      return NextResponse.json({ error: destError.message }, { status: 500 });
    }
  }

  // 3. Insert transport legs
  if (body.transportLegs?.length > 0) {
    const legRows = body.transportLegs.map((l: any, i: number) => ({
      trip_id: trip.id,
      position: i,
      transport_type: l.type || 'drive',
      duration: l.duration || null,
      distance: l.distance || null,
      departure_time: l.departureTime || null,
      arrival_time: l.arrivalTime || null,
      selected_flight: l.selectedFlight || null,
      selected_train: l.selectedTrain || null,
    }));

    const { error: legError } = await supabase.from('trip_transport_legs').insert(legRows);
    if (legError) {
      await supabase.from('trips').delete().eq('id', trip.id);
      return NextResponse.json({ error: legError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: trip.id }, { status: 201 });
}
