# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev        # Start Next.js dev server (port 3000)
npm run build      # Production build
npm run start      # Start production server
npm run restart    # Kill port 3000 and restart dev server (safe for Claude Code)
```

**Important:** Never use `taskkill //F //IM node.exe` — it kills Claude Code. Use `npx kill-port 3000` instead.

No test runner or linter configured.

## Architecture

**Next.js 14 App Router** — all pages `"use client"`. Responsive: mobile (430px) → desktop (680-900px via `md:`).

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary). Admin at `/admin`.

### Auth

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup`. Profile auto-created by DB trigger.

### Database

**App Supabase** (`NEXT_PUBLIC_SUPABASE_URL`): `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel. RLS on all. Schema: `supabase/schema.sql`.

**Catalog Supabase** (`CATALOG_SUPABASE_URL`): 47,830 airports with PostGIS coordinates, cities, countries. Used for airport resolution via `nearby_airports(lat, lng, radius_km)` RPC function. Schema in separate `Aiezzy2catalog` repo.

### State Management

`src/context/TripContext.tsx`. Key methods: `selectFlight`/`selectTrain`, `changeTransportType`, `saveTrip` (setState callback for latest state), `loadTrip`/`resetTrip`, `reorderDestinations`, `updateNights`. `isDirty` tracks unsaved changes. Transport legs = destinations + 1 for round trips. `sessionStorage('currentTripId')` persists the active trip ID so route/plan/deep-plan pages auto-restore from DB on page reload.

### API Routes

- `/api/flights` — Parallel Supabase airport search + Google Flights scraper. Geocodes city → queries Supabase `nearby_airports()` → tries multiple airports in parallel via `Promise.allSettled` → returns first success. No dummy/estimated data — returns empty if no live flights found.
- `/api/resolve-airport` — Geocodes city via Google Places → searches "international airport" with location restriction (rectangle bias) → extracts IATA codes from results using OpenFlights DB city name matching → falls back to nearest major airport from curated database. 24h in-memory cache.
- `/api/trains` — Google Directions transit mode. Filters to routes where ALL segments are rail types (RAIL, HEAVY_RAIL, METRO_RAIL, SUBWAY, TRAM, etc.). Mixed routes (bus+metro) excluded — they appear in Bus tab only.
- `/api/directions` — Google Directions (driving/transit/walking/bicycling) with `alternatives=true`.
- `/api/places` — Google Places Autocomplete (New v1) + Details (returns `locality` for city name); `scope=cities|all`
- `/api/nearby` — Live Google Hotels scraper (USD→INR ×85), falls back to Google Places Nearby
- `/api/trips` — CRUD. Auto-generates titles like "Trip 4 · 23 Mar · Mumbai to Paris". Trip numbering per user.
- `/api/admin` — Admin stats (users, trips, costs). Auth via NEXTAUTH_SECRET as key.

### External Scraper API

Self-hosted Google Flights/Hotels scraper at `FLIGHTS_API_URL` (Railway). Code in separate `api4Aiezzy2` repo. Uses scrape.do with residential proxies. Parser extracts flight data from aria-label attributes. **Limitation:** Google server-renders flights only for popular routes; smaller routes (IDR→AMS) use client-side rendering that the scraper can't capture. The parallel airport approach handles this by trying multiple airports.

### Route Page (`/route`) — Key Behaviors

- **Smart auto-select:** Fetches flights AND trains in parallel for each leg. Picks train if cheaper OR within 30% price and faster. Caches results in `flightCacheRef` so the modal doesn't re-fetch.
- **Auto-save:** 5s debounced save after any selection change (flight, train, hotel, nights). Watches `selectedCount` + nights changes. No manual save button. Status shown: "Saving in a moment..." → "Auto-saved".
- **Date calculation:** `calcDepartureDate(stopIdx)` walks through the trip accounting for hotel nights AND overnight flights (+1 day detection from departure/arrival times and duration).
- **Night change re-fetch:** When user changes nights, all downstream transport legs re-fetch flights for their new dates. Toast shows "Updating X flights for new dates...".
- **Flight cache:** Auto-select caches API results per leg index. Modal uses cached flights instantly on open (no re-fetch spinner). After reload (no cache), modal seeds with the selected flight to maintain price consistency while fetching fresh results.
- **Airport display:** Transport line shows "Ahmedabad (AMD) - Amsterdam (AMS)" using resolved city names from Supabase `municipality` field. Distance warning below stop name when airport is far (only when transport is flight), with nearest airport info if it differs from the flight airport. Return leg shows "Flight will land in" message.
- **Resolved airports persistence:** `ResolvedAirports` data (codes, city names, distances) stored as `_resolvedAirports` inside the `selected_flight` JSONB column (no DB migration needed). Extracted on load to `leg.resolvedAirports`. `resolvedAirportsRef` (runtime) is populated from saved data on mount.
- **Return leg:** Ensures return leg exists in `transportLegs` for round trips. Reuses resolved departure airport for the return (AMS→AMD if outbound was AMD→AMS). Tries all destination airports in parallel.

### Transport Compare Modal

`TransportCompareModal` — all 8 transport types in a single scrollable row. No greyed-out tabs; unavailable modes show "No routes found" message. Bus tab fetches Google transit data with multiple routes. Timezone display (`AIRPORT_TZ` map) on flight times. Overnight detection computed from times + duration, not just `isNextDay` flag.

### Key Patterns

- **City data from Google:** `parentCity` on City from Place Details `locality` component. Used for display and airport lookup.
- **Airport resolution chain:** `findAirportCode()` returns `city.airportCode` → `city.fullName` (with country, to avoid wrong geocoding e.g., "Barcelona" restaurant in Mumbai). The flights API geocodes + Supabase parallel search, returns resolved codes + city names (municipality from airports table). Response includes `nearestFrom` when the closest airport has no flights but a farther one does.
- **Curated city→airport map** (`CITY_TO_AIRPORT` in flights route): Fast cache for known cities (Mumbai→BOM, etc.) to avoid API calls. Falls back to Supabase for unknown cities.
- **Major airports fallback** (`src/data/major-airports.ts`): ~100 international hub airports with lat/lng. Used when Supabase is unavailable.
- **OpenFlights DB** (`src/data/airports.ts`): 5,599 city→IATA mappings. Used for IATA extraction from Google Places results.
- **Route optimization:** Brute-force (≤6) or nearest-neighbor (7+) using Google Directions distances. Before/after modal.
- **Drag-and-drop:** Framer Motion `Reorder.Group` axis="y".
- **Portal autocomplete:** `createPortal(document.body)`. Opens on click/type not tab-switch. Repositions on scroll.

### Styling

Light theme. Tailwind: `bg-primary` (#FAF7F2), `accent-cyan` (#E8654A coral), `accent-gold` (#0D9488 teal). Fonts: Syne/Plus Jakarta Sans/Space Mono. `scrollbar-hide` utility class for horizontal scroll areas.

### Environment Variables

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CATALOG_SUPABASE_URL          # Catalog DB with airports table
CATALOG_SUPABASE_ANON_KEY     # Catalog DB anon key
NEXTAUTH_URL
NEXTAUTH_SECRET
FLIGHTS_API_URL               # Google Flights scraper API
FLIGHTS_API_KEY               # Scraper API key
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### Path Alias

`@/*` → `./src/*`

### Deployment

GitHub: `yatendra3192/aiezzy` branch `dev`. Railway auto-deploys on push. Main branch has coming-soon page. Scraper API: `yatendra3192/google-travel-api` on Railway.
