import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** GET /api/shared/[token] — Fetch a shared trip by share_token (no auth needed) */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      id, title, from_city, from_address, departure_date, adults, children, infants,
      trip_type, status, created_at, updated_at,
      trip_destinations(id, position, city, nights, selected_hotel),
      trip_transport_legs(id, position, transport_type, duration, distance, departure_time, arrival_time, selected_flight, selected_train)
    `)
    .eq('share_token', params.token)
    .single();

  if (error || !trip) {
    return NextResponse.json({ error: 'Shared trip not found' }, { status: 404 });
  }

  // Transform to frontend shape (same as GET /api/trips/[id])
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

  // Calculate costs
  const flightCost = transportLegs
    .filter((l: any) => l.selectedFlight)
    .reduce((s: number, l: any) => s + (l.selectedFlight?.pricePerAdult || 0), 0) * (trip.adults || 1);
  const trainCost = transportLegs
    .filter((l: any) => l.selectedTrain)
    .reduce((s: number, l: any) => s + (l.selectedTrain?.price || 0), 0) * (trip.adults || 1);
  const hotelCost = destinations
    .filter((d: any) => d.selectedHotel && d.nights > 0)
    .reduce((s: number, d: any) => s + (d.selectedHotel?.pricePerNight || 0) * d.nights, 0);
  const totalNights = destinations.reduce((s: number, d: any) => s + (d.nights || 0), 0);

  return NextResponse.json({
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
    totalNights,
    flightCost,
    trainCost,
    hotelCost,
    totalCost: flightCost + trainCost + hotelCost,
    createdAt: trip.created_at,
    updatedAt: trip.updated_at,
  });
}
