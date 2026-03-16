import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

/** GET /api/trips/[id] - Load a single trip with all data */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const supabase = createServiceClient();

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      *,
      trip_destinations(*),
      trip_transport_legs(*)
    `)
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (error || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  // Transform to TripState shape
  const destinations = (trip.trip_destinations || [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((d: any) => ({
      id: d.id,
      city: d.city,
      nights: d.nights,
      selectedHotel: d.selected_hotel,
    }));

  const transportLegs = (trip.trip_transport_legs || [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((l: any) => ({
      id: l.id,
      type: l.transport_type,
      duration: l.duration,
      distance: l.distance,
      departureTime: l.departure_time,
      arrivalTime: l.arrival_time,
      selectedFlight: l.selected_flight,
      selectedTrain: l.selected_train,
    }));

  return NextResponse.json({
    tripId: trip.id,
    title: trip.title,
    from: trip.from_city,
    fromAddress: trip.from_address,
    departureDate: trip.departure_date,
    adults: trip.adults,
    children: trip.children,
    infants: trip.infants,
    tripType: trip.trip_type,
    status: trip.status,
    destinations,
    transportLegs,
    createdAt: trip.created_at,
    updatedAt: trip.updated_at,
  });
}

/** PUT /api/trips/[id] - Update trip (replace all destinations and legs) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const body = await req.json();
  const supabase = createServiceClient();

  // Verify trip belongs to user
  const { data: existing } = await supabase
    .from('trips')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!existing) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

  // Generate title: keep existing trip number if present, update route info
  const destNames = (body.destinations || []).map((d: any) => d.city?.name).filter(Boolean);
  const fromName = body.fromAddress?.split(',')[0] || 'Home';
  const lastDest = destNames[destNames.length - 1] || '';
  const depDate = body.departureDate ? new Date(body.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  // Extract trip number from existing title if present (e.g., "Trip 3 · ...")
  const existingNum = existing.title?.match(/^Trip (\d+)/)?.[1] || '';
  const tripPrefix = existingNum ? `Trip ${existingNum}` : 'Trip';

  const title = lastDest
    ? `${tripPrefix} · ${depDate} · ${fromName} to ${lastDest}`
    : `${tripPrefix} · ${depDate}`;

  // 1. Update trip metadata
  const { error: updateError } = await supabase
    .from('trips')
    .update({
      title,
      from_city: body.from || {},
      from_address: body.fromAddress || '',
      departure_date: body.departureDate,
      adults: body.adults || 1,
      children: body.children || 0,
      infants: body.infants || 0,
      trip_type: body.tripType || 'roundTrip',
    })
    .eq('id', params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // 2. Replace destinations (delete all, re-insert)
  await supabase.from('trip_destinations').delete().eq('trip_id', params.id);
  if (body.destinations?.length > 0) {
    const destRows = body.destinations.map((d: any, i: number) => ({
      trip_id: params.id,
      position: i,
      city: d.city || {},
      nights: d.nights ?? 2,
      selected_hotel: d.selectedHotel || null,
    }));
    await supabase.from('trip_destinations').insert(destRows);
  }

  // 3. Replace transport legs
  await supabase.from('trip_transport_legs').delete().eq('trip_id', params.id);
  if (body.transportLegs?.length > 0) {
    const legRows = body.transportLegs.map((l: any, i: number) => ({
      trip_id: params.id,
      position: i,
      transport_type: l.type || 'drive',
      duration: l.duration || null,
      distance: l.distance || null,
      departure_time: l.departureTime || null,
      arrival_time: l.arrivalTime || null,
      selected_flight: l.selectedFlight || null,
      selected_train: l.selectedTrain || null,
    }));
    await supabase.from('trip_transport_legs').insert(legRows);
  }

  return NextResponse.json({ id: params.id, updated: true });
}

/** DELETE /api/trips/[id] - Delete a trip */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
