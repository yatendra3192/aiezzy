/**
 * Google Maps / Places API integration via Next.js API proxy routes.
 * Uses the new Places API (v1) and Routes API.
 */

// ─── Places Autocomplete ─────────────────────────────────────────────────────

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export async function searchPlaces(input: string, scope: 'cities' | 'all' = 'cities'): Promise<PlacePrediction[]> {
  if (!input || input.length < 2) return [];

  try {
    const res = await fetch(`/api/places?input=${encodeURIComponent(input)}&type=autocomplete&scope=${scope}`);
    const data = await res.json();

    // New Places API format: { suggestions: [{ placePrediction: { placeId, text, structuredFormat } }] }
    if (!data.suggestions) return [];

    return data.suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => {
        const p = s.placePrediction;
        return {
          placeId: p.placeId || p.place_id || '',
          description: p.text?.text || '',
          mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
          secondaryText: p.structuredFormat?.secondaryText?.text || '',
        };
      });
  } catch {
    return [];
  }
}

// ─── Place Details ───────────────────────────────────────────────────────────

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  country: string;
  /** City name from Google's address components (locality type) */
  city: string;
  /** State/province from address components */
  state: string;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!placeId) return null;

  try {
    const res = await fetch(`/api/places?input=${encodeURIComponent(placeId)}&type=details`);
    const data = await res.json();

    // New API format
    const components = data.addressComponents || [];
    const country = components.find((c: any) => c.types?.includes('country'))?.longText || '';
    // For landmarks, Google may not return 'locality' — use fallbacks
    const city = components.find((c: any) => c.types?.includes('locality'))?.longText
      || components.find((c: any) => c.types?.includes('postal_town'))?.longText
      || components.find((c: any) => c.types?.includes('administrative_area_level_2'))?.longText
      || components.find((c: any) => c.types?.includes('sublocality_level_1'))?.longText
      || components.find((c: any) => c.types?.includes('sublocality'))?.longText
      || '';
    const state = components.find((c: any) => c.types?.includes('administrative_area_level_1'))?.longText || '';

    return {
      placeId,
      name: data.displayName?.text || '',
      formattedAddress: data.formattedAddress || '',
      lat: data.location?.latitude || 0,
      lng: data.location?.longitude || 0,
      country,
      city,
      state,
    };
  } catch {
    return null;
  }
}

// ─── Directions ──────────────────────────────────────────────────────────────

export interface DirectionsResult {
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  startAddress: string;
  endAddress: string;
}

// ─── Nearby Hotels ───────────────────────────────────────────────────────────

export interface NearbyHotel {
  id: string;
  name: string;
  address: string;
  rating: number;
  priceLevel: string;
  /** Live price per night (from scraper), null if not available */
  livePrice: number | null;
  liveCurrency: string | null;
  source: 'live' | 'google_places';
  images: string[];
  link: string;
}

export async function searchNearbyHotels(
  location: string,
  radiusMeters = 5000,
  checkIn?: string,
  checkOut?: string
): Promise<NearbyHotel[]> {
  if (!location) return [];

  try {
    const params = new URLSearchParams({
      location,
      radius: String(radiusMeters),
    });
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);

    const res = await fetch(`/api/nearby?${params}`);
    const data = await res.json();

    if (!data.places) return [];

    return data.places.map((p: any) => ({
      id: p.id || p.property_token || '',
      name: p.displayName?.text || p.name || '',
      address: p.formattedAddress || p.description || '',
      rating: p.rating || p.overall_rating || 0,
      priceLevel: p.priceLevel || '',
      livePrice: p.rateExtracted || null,
      liveCurrency: p.rateExtracted ? 'INR' : null,
      source: p.source || 'google_places',
      images: p.images || [],
      link: p.link || '',
    }));
  } catch {
    return [];
  }
}

// ─── Directions ──────────────────────────────────────────────────────────────

export async function getDirections(
  origin: string,
  destination: string,
  mode: 'driving' | 'transit' | 'walking' = 'driving'
): Promise<DirectionsResult | null> {
  if (!origin || !destination) return null;

  try {
    const params = new URLSearchParams({ origin, destination, mode });
    const res = await fetch(`/api/directions?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) return null;

    const leg = data.routes[0].legs[0];
    return {
      distanceText: leg.distance.text,
      distanceMeters: leg.distance.value,
      durationText: leg.duration.text,
      durationSeconds: leg.duration.value,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
    };
  } catch {
    return null;
  }
}
