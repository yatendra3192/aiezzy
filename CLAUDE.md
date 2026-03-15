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

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary)

### Auth

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup`. Profile auto-created by DB trigger. Wrapped in `<Providers>` (`SessionProvider` + `TripProvider`).

### Database (Supabase PostgreSQL)

Schema: `supabase/schema.sql`. Tables: `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel objects. RLS on all tables.

### State Management

`src/context/TripContext.tsx`. Key: `selectFlight`/`selectTrain`, `changeTransportType`, `saveTrip` (uses setState callback for latest state), `loadTrip`/`resetTrip`, `reorderDestinations`. `isDirty` tracks unsaved changes. Transport legs = destinations + 1 for round trips.

### API Routes

- `/api/places` — Google Places Autocomplete (New v1) + Details (returns `locality` for city name); `scope=cities|all`
- `/api/directions` — Google Directions (driving/transit/walking/bicycling)
- `/api/flights` — Live Google Flights scraper (FLIGHTS_API_URL) with `resolveAirportCode()` city→IATA mapping + `isNearbyAirport()` detection. Falls back to estimated pricing.
- `/api/trains` — Google Directions transit mode; tries train-only, falls back to all transit, then retries without departure_time
- `/api/nearby` — Live Google Hotels scraper (USD→INR ×85 conversion), falls back to Google Places Nearby
- `/api/trips` — CRUD with cost calculations (flights/trains/hotels)
- `/api/auth/signup`, `/api/auth/[...nextauth]`

### Key Patterns

- **City data from Google:** `parentCity` field on City comes from Google Place Details API `locality` address component. Used for display and airport code lookup. No reliance on static city list for names.
- **Airport code resolution:** `findAirportCode()` checks `airportCode` → `parentCity` in CITIES → `fullName` in CITIES → regional patterns → returns `parentCity` as fallback for API-side resolution. Server-side `resolveAirportCode()` in `/api/flights` maps 60+ city names to IATA codes.
- **Nearby airport detection:** `isNearbyAirport()` distinguishes cities with own airports (Indore→IDR) from cities using another city's airport (Bruges→BRU). Only shows "No airport" prompt for truly nearby airports.
- **Unified transport modal:** `TransportCompareModal` — tabs for Flight/Train/Bus/Drive/Walk/Cycle/Boat/Tram. Availability based on driving distance. Shows Best Value/Fastest badges, CO₂, layover details, airport codes, +1 day.
- **Auto-selection:** Route page auto-selects cheapest flight and first hotel on load. Shows "Setting up your trip" overlay. Uses correct date per leg (departure + cumulative nights).
- **Route optimization:** On "Plan My Route", brute-force permutation (≤6) or nearest-neighbor (7+) using Google Directions distances. Shows before/after modal with km savings.
- **Transport leg display:** Shows selected flight/train duration+route when available, falls back to driving time/distance.
- **Drag-and-drop:** Destinations use Framer Motion `Reorder.Group` axis="y".
- **Portal autocomplete:** `PlacesAutocomplete` uses `createPortal(document.body)`. Opens on click/type (not tab-switch). Shows loading in dropdown. Repositions on scroll.

### Data Model

`src/data/mockData.ts`: `City` (with `parentCity`, `TransportHub`), `TransportLeg`, `Destination`, `Flight`, `TrainOption`, `Hotel`.

### Styling

Light theme. Tailwind: `bg-primary` (#FAF7F2), `accent-cyan` (#E8654A coral), `accent-gold` (#0D9488 teal). Fonts: Syne/Plus Jakarta Sans/Space Mono.

### Environment Variables

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET
FLIGHTS_API_URL                    # Google Travel scraper
FLIGHTS_API_KEY
```

### Path Alias

`@/*` → `./src/*`
