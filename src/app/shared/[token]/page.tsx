import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import SharedTripClient, { SharedTrip } from './SharedTripClient';

/** Fetch shared trip data from DB (used by both generateMetadata and the page) */
async function getSharedTrip(token: string): Promise<SharedTrip | null> {
  const supabase = createServiceClient();

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      id, title, from_city, from_address, departure_date, adults, children, infants,
      trip_type, status, created_at, updated_at,
      trip_destinations(id, position, city, nights, selected_hotel),
      trip_transport_legs(id, position, transport_type, duration, distance, departure_time, arrival_time, selected_flight, selected_train)
    `)
    .eq('share_token', token)
    .single();

  if (error || !trip) return null;

  // Transform to frontend shape (same as GET /api/shared/[token])
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
      // Strip _resolvedAirports from selectedFlight JSONB (internal field)
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

  // Strip internal fields from from_city (old trips may still have embedded data)
  const { _deepPlanData, _bookingDocs, ...fromCity } = (trip.from_city || {}) as any;

  return {
    title: trip.title || 'Shared Trip',
    from: fromCity,
    fromAddress: trip.from_address || '',
    departureDate: trip.departure_date,
    adults: trip.adults,
    children: trip.children,
    infants: trip.infants,
    tripType: trip.trip_type,
    destinations,
    transportLegs,
    totalNights,
    flightCost,
    trainCost,
    hotelCost,
    totalCost: flightCost + trainCost + hotelCost,
  };
}

/** Dynamic OG metadata for shared trip links */
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const trip = await getSharedTrip(params.token);

  if (!trip) {
    return {
      title: 'Trip Not Found — AIEzzy',
      description: 'This shared trip link is invalid or has been removed.',
    };
  }

  const cityNames = trip.destinations.map((d: any) => d.city?.parentCity || d.city?.name).filter(Boolean);
  const routeSummary = cityNames.length > 0 ? cityNames.join(' → ') : 'Multi-city trip';
  const depDate = trip.departureDate
    ? new Date(trip.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const description = [
    routeSummary,
    depDate ? `Departing ${depDate}` : '',
    `${trip.totalNights} nights`,
    `${trip.adults} traveler${trip.adults > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  return {
    title: `${trip.title} — AIEzzy`,
    description,
    openGraph: {
      title: trip.title,
      description,
      type: 'article',
      siteName: 'AIEzzy',
    },
    twitter: {
      card: 'summary',
      title: trip.title,
      description,
    },
  };
}

/** Server-rendered shared trip page */
export default async function SharedTripPage({ params }: { params: { token: string } }) {
  const trip = await getSharedTrip(params.token);

  if (!trip) {
    notFound();
  }

  return <SharedTripClient trip={trip} />;
}
