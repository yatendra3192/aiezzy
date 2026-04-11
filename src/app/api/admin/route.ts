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
    // Get total users — paginate to get ALL (default is 50 per page)
    let allAuthUsers: any[] = [];
    let page = 1;
    while (true) {
      const { data: batch } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      const batchUsers = batch?.users || [];
      allAuthUsers = allAuthUsers.concat(batchUsers);
      if (batchUsers.length < 1000) break;
      page++;
    }
    const totalUsers = allAuthUsers.length;

    // Get profiles for display names
    const { data: profiles } = await supabase.from('profiles').select('id, display_name, email');
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // Get user details
    const userList = allAuthUsers.map(u => {
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

    // Get trips with details (display list, limited to 50)
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

    // All trips query for accurate stats (funnel, costs, destinations)
    const { data: allTripsForFunnel } = await supabase
      .from('trips')
      .select(`
        user_id, deep_plan_data, from_address, created_at, adults, children,
        trip_destinations(city, nights, selected_hotel),
        trip_transport_legs(selected_flight, selected_train)
      `);

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
        userId: t.user_id,
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

    // All stats computed from ALL trips (not just the 50 display trips)
    const allTrips = allTripsForFunnel || [];

    // Funnel + cost stats
    const funnelUserIdsWithTrips = new Set<string>();
    const funnelUserIdsWithFlights = new Set<string>();
    const funnelUserIdsWithHotels = new Set<string>();
    const funnelUserIdsWithDeepPlan = new Set<string>();
    let tripsWithFlightsCount = 0;
    let tripsWithHotelsCount = 0;
    let totalTripValue = 0;
    const destCounts: Record<string, number> = {};
    const routeCounts: Record<string, number> = {};
    let totalNightsSum = 0;
    let totalDestsSum = 0;
    let tripsWithDestsCount = 0;
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let tripsToday = 0;
    let tripsThisWeek = 0;

    for (const ft of allTrips) {
      if (ft.user_id) funnelUserIdsWithTrips.add(ft.user_id);

      const ftLegs: any[] = ft.trip_transport_legs || [];
      const ftDests: any[] = ft.trip_destinations || [];

      // Flights
      const hasFlights = ftLegs.some((l: any) => l.selected_flight != null);
      if (hasFlights) {
        tripsWithFlightsCount++;
        if (ft.user_id) funnelUserIdsWithFlights.add(ft.user_id);
      }
      const flightCost = ftLegs.filter((l: any) => l.selected_flight).reduce((s: number, l: any) => s + (l.selected_flight?.pricePerAdult || 0), 0) * (ft.adults || 1);

      // Hotels
      const hasHotels = ftDests.some((d: any) => d.selected_hotel != null);
      if (hasHotels) {
        tripsWithHotelsCount++;
        if (ft.user_id) funnelUserIdsWithHotels.add(ft.user_id);
      }
      const hotelCost = ftDests.filter((d: any) => d.selected_hotel && d.nights > 0).reduce((s: number, d: any) => s + (d.selected_hotel?.pricePerNight || 0) * d.nights, 0);

      // Trains
      const trainCost = ftLegs.filter((l: any) => l.selected_train).reduce((s: number, l: any) => s + (l.selected_train?.price || 0), 0) * ((ft.adults || 1) + (ft.children || 0));

      totalTripValue += flightCost + trainCost + hotelCost;

      // Deep plan
      const dpd = ft.deep_plan_data as Record<string, unknown> | null;
      if (dpd && ft.user_id) {
        const hasContent = Object.keys(dpd).some(k => {
          const val = dpd[k];
          if (val == null) return false;
          if (typeof val === 'object' && Object.keys(val as Record<string, unknown>).length === 0) return false;
          return true;
        });
        if (hasContent) funnelUserIdsWithDeepPlan.add(ft.user_id);
      }

      // Destinations
      const destNames = ftDests.map((d: any) => d.city?.name).filter(Boolean);
      for (const d of destNames) {
        destCounts[d] = (destCounts[d] || 0) + 1;
      }
      if (destNames.length > 0) {
        tripsWithDestsCount++;
        totalDestsSum += destNames.length;
        totalNightsSum += ftDests.reduce((s: number, d: any) => s + (d.nights || 0), 0);
      }

      // Popular routes
      if (ft.from_address && destNames.length > 0) {
        const originCity = ft.from_address.split(',')[0].trim();
        if (originCity && destNames[0]) {
          const routeKey = `${originCity} → ${destNames[0]}`;
          routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
        }
      }

      // Trip velocity
      if (ft.created_at?.startsWith(today)) tripsToday++;
      if (ft.created_at && new Date(ft.created_at) > weekAgo) tripsThisWeek++;
    }

    const topDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }));

    const popularRoutes = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([route, count]) => ({ route, count }));

    const avgNights = tripsWithDestsCount > 0 ? Math.round(totalNightsSum / tripsWithDestsCount * 10) / 10 : 0;
    const avgCities = tripsWithDestsCount > 0 ? Math.round(totalDestsSum / tripsWithDestsCount * 10) / 10 : 0;

    // Provider breakdown
    const providerBreakdown: Record<string, number> = {};
    for (const u of userList) {
      providerBreakdown[u.provider] = (providerBreakdown[u.provider] || 0) + 1;
    }

    // Signups per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSignups = userList.filter(u => new Date(u.createdAt) > thirtyDaysAgo);
    const signupsByDay: Record<string, number> = {};
    recentSignups.forEach(u => {
      const day = new Date(u.createdAt).toISOString().split('T')[0];
      signupsByDay[day] = (signupsByDay[day] || 0) + 1;
    });

    return NextResponse.json({
      stats: {
        totalUsers,
        totalTrips: totalTrips || 0,
        tripsWithFlights: tripsWithFlightsCount,
        tripsWithHotels: tripsWithHotelsCount,
        totalTripValue,
        recentSignups: recentSignups.length,
        topDestinations,
        providerBreakdown,
        usersWithTrips: funnelUserIdsWithTrips.size,
        usersWithoutTrips: totalUsers - funnelUserIdsWithTrips.size,
        avgNights,
        avgCities,
        tripsToday,
        tripsThisWeek,
        // Funnel stats (from all trips, not just display 50)
        funnelUsersWithTrips: funnelUserIdsWithTrips.size,
        usersWithFlights: funnelUserIdsWithFlights.size,
        usersWithHotels: funnelUserIdsWithHotels.size,
        usersWithDeepPlan: funnelUserIdsWithDeepPlan.size,
        popularRoutes,
      },
      signupsByDay,
      users: userList,
      trips: tripList,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
