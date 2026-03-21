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

**Dev server cache corruption:** Next.js 14.2.35 frequently corrupts its `.next` webpack cache when files change, causing "Cannot find module" errors and blank pages. After every code change, always do: `npx kill-port 3000; rm -rf .next; npm run dev` then verify pages return 200 with curl before telling the user a fix is done. This is non-negotiable.

**Production build check:** Always run `npx next build` before pushing to git. Railway deploys fail silently on TypeScript errors (e.g., `Set` iteration without `downlevelIteration`, `parseInt` on number types).

No test runner or linter configured.

## Architecture

**Next.js 14 App Router** — all pages `"use client"`. Responsive: mobile (430px) → desktop (680-900px via `md:`).

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary). Additional pages: `/settings`, `/admin`, `/shared/[token]`, `/auth/*`.

**Trip IDs in URLs:** All trip pages use `?id=xxx` query params. Pages use `useSearchParams()` wrapped in `<Suspense>` boundaries. Priority: URL param > context tripId > sessionStorage.

### Auth

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup`.

### Database

**App Supabase** (`NEXT_PUBLIC_SUPABASE_URL`): `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel. RLS on all.

**Catalog Supabase** (`CATALOG_SUPABASE_URL`): 47,830 airports with PostGIS. Used via `nearby_airports(lat, lng, radius_km)` RPC.

**JSONB embedding pattern (no-migration):** Extra data stored inside existing JSONB columns:
- `places` → `_places` inside `trip_destinations.city` JSONB
- `additionalHotels` → `_additionalHotels` inside `trip_destinations.selected_hotel` JSONB
- `resolvedAirports` → `_resolvedAirports` inside `trip_transport_legs.selected_flight` JSONB
On save, API embeds; on load, extracts and returns separately.

### State Management

**TripContext** (`src/context/TripContext.tsx`): Core trip state with two data flows:
- **Places flow**: `userPlaces` → `addPlace`/`removePlace`/`reorderPlaces`/`updatePlaceNights` → `groupPlacesIntoCities()` auto-groups by `parentCity`
- **Destinations flow** (templates/AI): `addDestination` directly adds cities with `places: []`
- `groupPlacesIntoCities()` has two-pass normalization: normalizes parentCity from fullName when API fails, then cross-references against known city groups
- `setTripType` preserves removed return leg in `removedReturnLegRef` for restoration when toggling back to round trip
- Transport pricing: adults + children pay full fare, infants pay 15% on flights/trains
- Hotel rooms: `Math.ceil((adults + children) / 2)` rooms per hotel

**CurrencyContext**: 10 currencies, all prices stored in INR, converted on display via `formatPrice()`.

### API Routes

- `/api/flights` — **Amadeus (primary) + Google scraper (parallel)**. Both run simultaneously, results merged and deduplicated. Tries top 3 arrival airports when nearest has no flights (e.g., PNY→MAA for Pondicherry). `exact=true` for specific airport. Amadeus returns per-person price (divides `grandTotal` by adults). IATA codes looked up in catalog DB.
- `/api/trains` — Google Directions transit mode. Filters to rail-only segments.
- `/api/nearby` — Google Hotels scraper + Google Places Photos enrichment. Hotels without scraper images get photos from Places API (up to 10 hotels, 3 photos each). Cleans description field (removes USD prices, deal text). Returns deal badges, amenities, hotel class.
- `/api/places` — Google Places Autocomplete (New v1) + Details; `scope=cities|all`.
- `/api/resolve-airport` — Geocodes city → finds IATA codes via PostGIS. Searches "city" appended first to avoid location-biased results (e.g., "Barcelona city" → Spain, not "North Barcelona" apartment in Mumbai). Returns all large airports within 1000km (no cap).
- `/api/trips` — CRUD with JSONB embedding for places/additionalHotels.
- `/api/weather` — Open-Meteo API (free). 1-hour cache. Only works ≤16 days out.
- `/api/ai/suggest` — **OpenAI GPT-4.1-mini (primary)**, Anthropic Claude (fallback), templates (last resort). System prompt for travel expertise.
- `/api/admin/migrate` — DB migrations.

### External Scraper API

Self-hosted at `FLIGHTS_API_URL` (Railway). Repo: `api4Aiezzy2`. Hotel parser extracts images, links, descriptions, amenities from Google Hotels HTML via cheerio.

### Plan Page (`/plan`) — Places-First Flow

Users add places/attractions. `PlacesAutocomplete` resolves `parentCity` with multi-level fallbacks: Google locality → known CITIES → secondaryText parsing → formattedAddress parsing. On "Plan My Route", groups places by city, then `optimizeRoute()` finds shortest path. Templates/AI use `addDestination()` bypassing places flow. Plan page shows `userPlaces` when present, falls back to `destinations`.

### Route Page (`/route`) — Key Behaviors

- **Auto-select:** Fetches flights AND trains in parallel using city names (not airport codes) for better nearby-airport coverage. Picks train if cheaper OR within 30% price and faster.
- **Auto-save:** 5s debounced after selection changes. Watches `selectedCount`, `nights`, `adults`, `children`, `infants`, `departureDate`, `tripType`. Blocked until `tripStableRef` is true (500ms after trip loads). No `autoSelectLoadingRef` guard (was causing infinite "Saving in a moment..." bug).
- **Reload stability:** `tripStableRef` prevents date/nights effects from re-fetching on initial load. Set after 500ms for ALL arrival paths (plan page, reload, new trip).
- **Manual refresh:** "Update Flights & Trains" button appears when date/nights change. No auto-refetch — user clicks when ready. Also fetches for empty legs (new return leg after one-way→round-trip toggle).
- **Editable trip info:** Date picker, adults/children/infants +/- buttons, trip type toggle inline on route page.
- **Full-screen modals:** Both transport and hotel modals are full-screen overlays with back arrow navigation.
- **Hotel modal:** Left sidebar with rating/price/amenity filters, list/grid toggle, Google Places photos, deal badges, Maps + Booking.com links with dates.
- **Transport modal:** Dual airport dropdowns (departure + arrival), layover info from Amadeus segments, per-person + total price display.
- **Hub-to-hotel distances:** Separate `arr-{di}` (arrival) and `dep-{di}` (departure) distances because airports can differ.
- **Hotel room calc:** `Math.ceil((adults + children) / 2)` rooms, displayed as "₹X/night × N × R rooms".

### Deep Plan Page (`/deep-plan`) — Day-by-Day Itinerary

10 features: Day type badges (Travel/Explore/Departure), daily budget, weather per day, editable activities (add/remove), meal slots (breakfast/lunch/dinner), adjustable start time, Google Maps links, day notes, color-coded timeline, print button.

**Overnight flight handling:** Detects flights >12h or next-day arrivals. Splits into departure day + optional "In Transit" days + arrival day. Each calendar date gets its own day card. No cramming overnight arrivals into departure day.

### Key Patterns

- **City geocoding:** Search "city" appended to avoid India location bias (e.g., "Barcelona city" → Spain).
- **Airport resolution:** `resolveToAirports()` for IATA codes looks up name/city from catalog DB. For city names, geocodes + PostGIS nearby search.
- **Price display:** All prices in INR. `formatPrice(amountINR, currency)`. PDF uses ASCII-safe `Rs.` instead of `₹`.
- **PDF export:** `exportTripPDFFromData()` — structured jsPDF (not html2canvas). Text truncation, right-aligned price columns.
- **TypeScript gotchas:** Don't use `for...of` on `Set` (needs `downlevelIteration`). Don't use `parseInt()` on numbers. Use `Array.from(set)` instead.

### Styling

Light theme. Tailwind: `bg-primary` (#FAF7F2), `accent-cyan` (#E8654A coral), `accent-gold` (#0D9488 teal). Fonts: Syne/Plus Jakarta Sans/Space Mono.

### Environment Variables

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
CATALOG_SUPABASE_URL / CATALOG_SUPABASE_ANON_KEY
NEXTAUTH_URL / NEXTAUTH_SECRET
FLIGHTS_API_URL / FLIGHTS_API_KEY
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
AMADEUS_API_KEY / AMADEUS_API_SECRET / AMADEUS_BASE_URL
OPENAI_API_KEY                # AI trip suggestions (primary)
ANTHROPIC_API_KEY             # AI trip suggestions (fallback)
NEXT_PUBLIC_GA_ID             # Google Analytics 4
NEXT_PUBLIC_SENTRY_DSN        # Optional: Sentry
```

### Path Alias

`@/*` → `./src/*`

### Deployment

GitHub: `yatendra3192/aiezzy` branch `dev`. Railway auto-deploys on push. Main branch has coming-soon page. Scraper API: `yatendra3192/google-travel-api` on Railway.
