import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createUserClient, createServiceClient } from '@/lib/supabase/server';
import { validateTripPayload } from '@/lib/tripValidation';

/** GET /api/trips/[id] - Load a single trip with all data */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const supabase = await createUserClient(userId);

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
    .map((d: any) => {
      const { _places, ...cityData } = d.city || {};
      const { _additionalHotels, ...hotelData } = d.selected_hotel || {};
      return {
        id: d.id,
        city: cityData,
        nights: d.nights,
        selectedHotel: d.selected_hotel ? hotelData : null,
        additionalHotels: _additionalHotels || [],
        places: _places || [],
      };
    });

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

  // Extract deepPlanData and bookingDocs: prefer dedicated columns, fall back to from_city embedding
  const { _deepPlanData, _bookingDocs, ...cleanFromCity } = (trip.from_city || {}) as any;
  const deepPlanData = trip.deep_plan_data || _deepPlanData || null;
  const bookingDocs = trip.booking_docs || _bookingDocs || null;

  return NextResponse.json({
    tripId: trip.id,
    title: trip.title,
    from: cleanFromCity,
    fromAddress: trip.from_address,
    departureDate: trip.departure_date,
    adults: trip.adults,
    children: trip.children,
    infants: trip.infants,
    tripType: trip.trip_type,
    status: trip.status,
    destinations,
    transportLegs,
    deepPlanData,
    bookingDocs,
    createdAt: trip.created_at,
    updatedAt: trip.updated_at,
  });
}

/** PUT /api/trips/[id] - Update trip atomically (single DB transaction) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const raw = await req.json();
  const validation = validateTripPayload(raw);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;
  const supabase = await createUserClient(userId);

  // Verify trip belongs to user (needed for title generation + optimistic locking)
  const { data: existing } = await supabase
    .from('trips')
    .select('id, title, updated_at')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!existing) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

  // Optimistic locking: reject if another tab/session modified the trip since last load
  if (raw.expectedUpdatedAt && existing.updated_at) {
    const expected = new Date(raw.expectedUpdatedAt).getTime();
    const actual = new Date(existing.updated_at).getTime();
    // Allow 2s tolerance for clock drift
    if (actual > expected + 2000) {
      return NextResponse.json({ error: 'Trip was modified in another tab. Please reload.', stale: true }, { status: 409 });
    }
  }

  // Generate title: keep existing trip number if present, update route info
  const destNames = (body.destinations || []).map((d: any) => d.city?.name).filter(Boolean);
  const fromName = body.fromAddress?.split(',')[0] || 'Home';
  const lastDest = destNames[destNames.length - 1] || '';
  const depDate = body.departureDate ? new Date(body.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const existingNum = existing.title?.match(/^Trip (\d+)/)?.[1] || '';
  const tripPrefix = existingNum ? `Trip ${existingNum}` : 'Trip';
  const title = lastDest
    ? `${tripPrefix} · ${depDate} · ${fromName} to ${lastDest}`
    : `${tripPrefix} · ${depDate}`;

  // Strip _deepPlanData and _bookingDocs from from_city (now stored in dedicated columns)
  const { _deepPlanData, _bookingDocs, ...cleanFrom } = (body.from || {}) as any;

  // Build destination rows for the atomic function
  const destRows = (body.destinations || []).map((d: any, i: number) => ({
    position: i,
    city: { ...(d.city || {}), _places: d.places || [] },
    nights: d.nights ?? 2,
    selected_hotel: d.selectedHotel ? { ...d.selectedHotel, _additionalHotels: d.additionalHotels || [] } : null,
  }));

  // Build transport leg rows for the atomic function
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
  const { data: rpcResult, error: rpcError } = await supabase.rpc('update_trip_atomic', {
    p_trip_id: params.id,
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

  if (!rpcError) {
    // Fetch server timestamp for optimistic locking on next save
    const { data: ts } = await supabase.from('trips').select('updated_at').eq('id', params.id).single();
    return NextResponse.json({ id: params.id, updated: true, updatedAt: ts?.updated_at });
  }

  // RPC function may not exist yet (pre-migration) — fall back to sequential operations
  if (rpcError.message?.includes('update_trip_atomic') || rpcError.code === '42883') {
    console.warn('[trip-update] atomic RPC not available, falling back to sequential operations');
    return updateTripSequential(supabase, params.id, userId, title, cleanFrom, body, destRows, legRows);
  }

  // Handle specific errors from the atomic function
  if (rpcError.message?.includes('TRIP_NOT_FOUND')) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  console.error('[trip-update] atomic error:', rpcError.message);
  return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
}

/** Fallback: sequential update for pre-migration databases (non-atomic) */
async function updateTripSequential(
  supabase: any, tripId: string, userId: string, title: string,
  cleanFrom: any, body: any, destRows: any[], legRows: any[]
) {
  // 1. Update trip metadata
  const updatePayload: Record<string, any> = {
    title,
    from_city: cleanFrom,
    from_address: body.fromAddress || '',
    departure_date: body.departureDate,
    adults: body.adults || 1,
    children: body.children || 0,
    infants: body.infants || 0,
    trip_type: body.tripType || 'roundTrip',
  };
  if (body.deepPlanData !== undefined) updatePayload.deep_plan_data = body.deepPlanData;
  if (body.bookingDocs !== undefined) updatePayload.booking_docs = body.bookingDocs;

  const { error: updateError } = await supabase
    .from('trips').update(updatePayload).eq('id', tripId).eq('user_id', userId);
  if (updateError) {
    console.error('[trip-update] metadata error:', updateError.message);
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
  }

  // 2. Replace destinations
  const { error: delDestError } = await supabase.from('trip_destinations').delete().eq('trip_id', tripId);
  if (delDestError) {
    console.error('[trip-update] delete destinations error:', delDestError.message);
    return NextResponse.json({ error: 'Failed to update destinations' }, { status: 500 });
  }
  if (destRows.length > 0) {
    const rows = destRows.map(d => ({ ...d, trip_id: tripId }));
    const { error: insDestError } = await supabase.from('trip_destinations').insert(rows);
    if (insDestError) {
      console.error('[trip-update] insert destinations error:', insDestError.message);
      return NextResponse.json({ error: 'Failed to save destinations' }, { status: 500 });
    }
  }

  // 3. Replace transport legs
  const { error: delLegError } = await supabase.from('trip_transport_legs').delete().eq('trip_id', tripId);
  if (delLegError) {
    console.error('[trip-update] delete legs error:', delLegError.message);
    return NextResponse.json({ error: 'Failed to update transport' }, { status: 500 });
  }
  if (legRows.length > 0) {
    const rows = legRows.map(l => ({ ...l, trip_id: tripId }));
    const { error: insLegError } = await supabase.from('trip_transport_legs').insert(rows);
    if (insLegError) {
      console.error('[trip-update] insert legs error:', insLegError.message);
      return NextResponse.json({ error: 'Failed to save transport' }, { status: 500 });
    }
  }

  const { data: ts } = await supabase.from('trips').select('updated_at').eq('id', tripId).single();
  return NextResponse.json({ id: tripId, updated: true, updatedAt: ts?.updated_at });
}

/** DELETE /api/trips/[id] - Delete a trip and clean up storage files */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  // Service client for storage operations (storage doesn't support RLS JWTs)
  const storageClient = createServiceClient();
  // User client for the trip delete (RLS enforced)
  const supabase = await createUserClient(userId);

  // Clean up booking documents in storage before deleting the trip
  try {
    const { data: files } = await storageClient.storage
      .from('booking-docs')
      .list(`${userId}/${params.id}`);
    if (files && files.length > 0) {
      const paths = files.map(f => `${userId}/${params.id}/${f.name}`);
      await storageClient.storage.from('booking-docs').remove(paths);
    }
  } catch {
    // Storage cleanup is best-effort — don't block trip deletion
    console.error('[trip-delete] storage cleanup failed for', params.id);
  }

  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) {
    console.error('[trip-delete] error:', error.message);
    return NextResponse.json({ error: 'Failed to delete trip' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
