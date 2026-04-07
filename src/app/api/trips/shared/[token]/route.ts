import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** GET /api/trips/shared/[token] — Load full trip data by share token (no auth, read-only) */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      id, title, from_city, from_address, departure_date, adults, children, infants,
      trip_type, status, created_at, updated_at, deep_plan_data, booking_docs,
      trip_destinations(id, position, city, nights, selected_hotel),
      trip_transport_legs(id, position, transport_type, duration, distance, departure_time, arrival_time, selected_flight, selected_train)
    `)
    .eq('share_token', params.token)
    .single();

  if (error || !trip) {
    return NextResponse.json({ error: 'Shared trip not found' }, { status: 404 });
  }

  // Transform to TripState shape (same as GET /api/trips/[id])
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
    .map((l: any) => {
      const { _resolvedAirports, ...flightData } = l.selected_flight || {};
      return {
        id: l.id,
        type: l.transport_type,
        duration: l.duration,
        distance: l.distance,
        departureTime: l.departure_time,
        arrivalTime: l.arrival_time,
        selectedFlight: l.selected_flight ? flightData : null,
        selectedTrain: l.selected_train,
      };
    });

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
