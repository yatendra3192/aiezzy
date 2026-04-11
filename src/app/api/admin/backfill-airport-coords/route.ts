import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['yatendra3192@gmail.com'];

const CATALOG_URL = process.env.CATALOG_SUPABASE_URL || '';
const CATALOG_KEY = process.env.CATALOG_SUPABASE_ANON_KEY || '';

interface AirportInfo {
  iata_code: string;
  name: string;
  municipality: string;
  latitude_deg: number;
  longitude_deg: number;
}

/**
 * POST /api/admin/backfill-airport-coords
 *
 * Backfills GPS coordinates for all existing flights in the database.
 * Looks up IATA codes in the catalog airports table and adds lat/lng
 * to both selectedFlight and _resolvedAirports in the JSONB.
 *
 * Idempotent — only updates legs that are missing coordinates.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!CATALOG_URL || !CATALOG_KEY) {
    return NextResponse.json({ error: 'Catalog Supabase not configured' }, { status: 500 });
  }

  const supabase = createServiceClient();

  try {
    // Step 1: Fetch ALL transport legs with selected_flight
    const { data: legs, error: fetchError } = await supabase
      .from('trip_transport_legs')
      .select('id, selected_flight')
      .not('selected_flight', 'is', null);

    if (fetchError) {
      return NextResponse.json({ error: `Failed to fetch legs: ${fetchError.message}` }, { status: 500 });
    }

    if (!legs || legs.length === 0) {
      return NextResponse.json({ success: true, message: 'No transport legs with flights found', processed: 0, updated: 0 });
    }

    // Step 2: Identify legs needing backfill and collect unique IATA codes
    const iataCodes = new Set<string>();
    const legsToUpdate: Array<{
      id: string;
      selectedFlight: any;
      needsDepCoords: boolean;
      needsArrCoords: boolean;
      depCode: string;
      arrCode: string;
    }> = [];

    for (const leg of legs) {
      const flight = leg.selected_flight;
      if (!flight) continue;

      // Extract IATA codes: from depAirportCode/arrAirportCode, or parse from route (e.g., "IDR-IXJ")
      let depCode = (flight.depAirportCode || '') as string;
      let arrCode = (flight.arrAirportCode || '') as string;
      if ((!depCode || !arrCode) && flight.route) {
        const routeMatch = String(flight.route).match(/^([A-Z]{3})\s*[-–→]\s*([A-Z]{3})$/);
        if (routeMatch) {
          if (!depCode) depCode = routeMatch[1];
          if (!arrCode) arrCode = routeMatch[2];
        }
      }
      // Also try _resolvedAirports fromCode/toCode
      const resolvedCodes = flight._resolvedAirports || {};
      if (!depCode && resolvedCodes.fromCode) depCode = resolvedCodes.fromCode;
      if (!arrCode && resolvedCodes.toCode) arrCode = resolvedCodes.toCode;

      // Check if coordinates are missing on the flight itself
      const needsDepCoords = !!depCode && (!flight.depAirportLat || !flight.depAirportLng);
      const needsArrCoords = !!arrCode && (!flight.arrAirportLat || !flight.arrAirportLng);

      // Also check _resolvedAirports
      const resolved = flight._resolvedAirports || {};
      const needsResolvedFrom = !!depCode && (!resolved.fromAirportLat || !resolved.fromAirportLng);
      const needsResolvedTo = !!arrCode && (!resolved.toAirportLat || !resolved.toAirportLng);

      if (needsDepCoords || needsArrCoords || needsResolvedFrom || needsResolvedTo) {
        if (depCode) iataCodes.add(depCode);
        if (arrCode) iataCodes.add(arrCode);
        legsToUpdate.push({
          id: leg.id,
          selectedFlight: flight,
          needsDepCoords: needsDepCoords || needsResolvedFrom,
          needsArrCoords: needsArrCoords || needsResolvedTo,
          depCode,
          arrCode,
        });
      }
    }

    if (legsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All flights already have coordinates',
        processed: legs.length,
        updated: 0,
      });
    }

    // Step 3: Batch lookup all unique IATA codes from catalog DB
    const codesArray = Array.from(iataCodes);
    const airportMap = new Map<string, AirportInfo>();

    // Supabase REST API has query length limits, batch in groups of 50
    const batchSize = 50;
    for (let i = 0; i < codesArray.length; i += batchSize) {
      const batch = codesArray.slice(i, i + batchSize);
      const quotedCodes = batch.map(c => `"${c}"`).join(',');
      const res = await fetch(
        `${CATALOG_URL}/rest/v1/airports?iata_code=in.(${quotedCodes})&select=iata_code,name,municipality,latitude_deg,longitude_deg`,
        {
          headers: {
            'apikey': CATALOG_KEY,
            'Authorization': `Bearer ${CATALOG_KEY}`,
          },
        }
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const airport of data) {
          if (airport.iata_code && airport.latitude_deg != null && airport.longitude_deg != null) {
            airportMap.set(airport.iata_code, airport);
          }
        }
      }
    }

    // Step 4: Update each leg with coordinates
    let updated = 0;
    const errors: string[] = [];

    for (const leg of legsToUpdate) {
      const flight = { ...leg.selectedFlight };
      let changed = false;

      const depAirport = leg.depCode ? airportMap.get(leg.depCode) : null;
      const arrAirport = leg.arrCode ? airportMap.get(leg.arrCode) : null;

      // Update flight-level coords and codes
      if (depAirport) {
        if (!flight.depAirportLat) { flight.depAirportLat = depAirport.latitude_deg; changed = true; }
        if (!flight.depAirportLng) { flight.depAirportLng = depAirport.longitude_deg; changed = true; }
        if (!flight.depAirportCode) { flight.depAirportCode = depAirport.iata_code; changed = true; }
      }
      if (arrAirport) {
        if (!flight.arrAirportLat) { flight.arrAirportLat = arrAirport.latitude_deg; changed = true; }
        if (!flight.arrAirportLng) { flight.arrAirportLng = arrAirport.longitude_deg; changed = true; }
        if (!flight.arrAirportCode) { flight.arrAirportCode = arrAirport.iata_code; changed = true; }
      }

      // Update _resolvedAirports (embedded inside selected_flight JSONB)
      const resolved = flight._resolvedAirports || {};
      if (depAirport && (!resolved.fromAirportLat || !resolved.fromAirportLng)) {
        resolved.fromAirportLat = depAirport.latitude_deg;
        resolved.fromAirportLng = depAirport.longitude_deg;
        if (!resolved.fromCity) resolved.fromCity = depAirport.municipality || '';
        if (!resolved.fromAirport) resolved.fromAirport = depAirport.name || '';
        if (!resolved.fromCode) resolved.fromCode = depAirport.iata_code;
        changed = true;
      }
      if (arrAirport && (!resolved.toAirportLat || !resolved.toAirportLng)) {
        resolved.toAirportLat = arrAirport.latitude_deg;
        resolved.toAirportLng = arrAirport.longitude_deg;
        if (!resolved.toCity) resolved.toCity = arrAirport.municipality || '';
        if (!resolved.toAirport) resolved.toAirport = arrAirport.name || '';
        if (!resolved.toCode) resolved.toCode = arrAirport.iata_code;
        changed = true;
      }

      // Only write _resolvedAirports back if it has data
      if (Object.keys(resolved).length > 0) {
        flight._resolvedAirports = resolved;
      }

      if (changed) {
        const { error: updateError } = await supabase
          .from('trip_transport_legs')
          .update({ selected_flight: flight })
          .eq('id', leg.id);

        if (updateError) {
          errors.push(`Leg ${leg.id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfill complete. ${updated} of ${legsToUpdate.length} legs updated.`,
      processed: legs.length,
      legsNeedingUpdate: legsToUpdate.length,
      updated,
      uniqueIataCodes: codesArray.length,
      iataCodes: codesArray,
      airportsFound: airportMap.size,
      airportsFoundCodes: Array.from(airportMap.keys()),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
