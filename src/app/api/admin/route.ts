import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['yatendra3192@gmail.com'];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Get total users
    const { data: users } = await supabase.auth.admin.listUsers();
    const totalUsers = users?.users?.length || 0;

    // Get profiles for display names
    const { data: profiles } = await supabase.from('profiles').select('id, display_name, email');
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // Get user details
    const userList = (users?.users || []).map(u => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: profile?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0],
        provider: u.app_metadata?.provider || 'email',
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Get total trips
    const { count: totalTrips } = await supabase
      .from('trips')
      .select('*', { count: 'exact', head: true });

    // Get trips with details
    const { data: trips } = await supabase
      .from('trips')
      .select(`
        id, title, from_address, departure_date, adults, children, infants,
        trip_type, status, created_at, updated_at, user_id,
        trip_destinations(id, position, city, nights, selected_hotel),
        trip_transport_legs(id, position, transport_type, selected_flight, selected_train)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    // Process trips
    const tripList = (trips || []).map(t => {
      const dests = t.trip_destinations || [];
      const legs = t.trip_transport_legs || [];
      const flightCost = legs.filter((l: any) => l.selected_flight).reduce((s: number, l: any) => s + (l.selected_flight?.pricePerAdult || 0), 0) * (t.adults || 1);
      const trainCost = legs.filter((l: any) => l.selected_train).reduce((s: number, l: any) => s + (l.selected_train?.price || 0), 0) * ((t.adults || 1) + (t.children || 0));
      const hotelCost = dests.filter((d: any) => d.selected_hotel && d.nights > 0).reduce((s: number, d: any) => s + (d.selected_hotel?.pricePerNight || 0) * d.nights, 0);

      // Find user (check auth users first, then profiles for orphaned trips)
      const user = userList.find(u => u.id === t.user_id);
      const profile = profileMap.get(t.user_id);

      return {
        id: t.id,
        title: t.title,
        userName: user?.name || profile?.display_name || user?.email || profile?.email || 'Unknown',
        userEmail: user?.email || profile?.email || '',
        fromAddress: t.from_address,
        departureDate: t.departure_date,
        destinations: dests.sort((a: any, b: any) => a.position - b.position).map((d: any) => d.city?.name).filter(Boolean),
        destinationCount: dests.length,
        totalNights: dests.reduce((s: number, d: any) => s + (d.nights || 0), 0),
        adults: t.adults,
        tripType: t.trip_type,
        status: t.status,
        flightCost,
        trainCost,
        hotelCost,
        totalCost: flightCost + trainCost + hotelCost,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    // Stats
    const tripsWithFlights = tripList.filter(t => t.flightCost > 0).length;
    const tripsWithHotels = tripList.filter(t => t.hotelCost > 0).length;
    const totalTripValue = tripList.reduce((s, t) => s + t.totalCost, 0);

    // Signups per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSignups = userList.filter(u => new Date(u.createdAt) > thirtyDaysAgo);
    const signupsByDay: Record<string, number> = {};
    recentSignups.forEach(u => {
      const day = new Date(u.createdAt).toISOString().split('T')[0];
      signupsByDay[day] = (signupsByDay[day] || 0) + 1;
    });

    // Top destinations (across all fetched trips)
    const destCounts: Record<string, number> = {};
    for (const t of tripList) {
      for (const d of t.destinations) {
        destCounts[d] = (destCounts[d] || 0) + 1;
      }
    }
    const topDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }));

    // Provider breakdown
    const providerBreakdown: Record<string, number> = {};
    for (const u of userList) {
      providerBreakdown[u.provider] = (providerBreakdown[u.provider] || 0) + 1;
    }

    // Users with trips
    const userIdsWithTrips = new Set(tripList.map(t => t.userEmail).filter(Boolean));
    const usersWithTrips = userIdsWithTrips.size;

    // Trip velocity
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tripsToday = tripList.filter(t => t.createdAt?.startsWith(today)).length;
    const tripsThisWeek = tripList.filter(t => new Date(t.createdAt) > weekAgo).length;

    // Average trip size
    const tripsWithDests = tripList.filter(t => t.destinationCount > 0);
    const avgNights = tripsWithDests.length > 0
      ? Math.round(tripsWithDests.reduce((s, t) => s + t.totalNights, 0) / tripsWithDests.length * 10) / 10
      : 0;
    const avgCities = tripsWithDests.length > 0
      ? Math.round(tripsWithDests.reduce((s, t) => s + t.destinationCount, 0) / tripsWithDests.length * 10) / 10
      : 0;

    return NextResponse.json({
      stats: {
        totalUsers,
        totalTrips: totalTrips || 0,
        tripsWithFlights,
        tripsWithHotels,
        totalTripValue,
        recentSignups: recentSignups.length,
        topDestinations,
        providerBreakdown,
        usersWithTrips,
        usersWithoutTrips: totalUsers - usersWithTrips,
        avgNights,
        avgCities,
        tripsToday,
        tripsThisWeek,
      },
      signupsByDay,
      users: userList,
      trips: tripList,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
