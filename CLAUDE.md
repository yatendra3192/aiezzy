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

**Supabase Storage**: `booking-docs` bucket for uploaded booking PDFs/images. Path: `userId/tripId/timestamp-filename`. Signed URLs (1-year expiry). Auto-creates bucket on first upload via service role.

**JSONB embedding pattern (no-migration):** Extra data stored inside existing JSONB columns:
- `places` → `_places` inside `trip_destinations.city` JSONB
- `additionalHotels` → `_additionalHotels` inside `trip_destinations.selected_hotel` JSONB
- `resolvedAirports` → `_resolvedAirports` inside `trip_transport_legs.selected_flight` JSONB
- `bookingDocs` → `_bookingDocs` inside `trips.from_city` JSONB
- `deepPlanData` → `_deepPlanData` inside `trips.from_city` JSONB
On save, API embeds; on load, extracts and returns separately. **Always null-safe** — old trips without new fields must not crash (use `|| {}`, `|| []`, `?.`).

### State Management

**TripContext** (`src/context/TripContext.tsx`): Core trip state with two data flows:
- **Places flow**: `userPlaces` → `addPlace`/`removePlace`/`reorderPlaces`/`updatePlaceNights` → `groupPlacesIntoCities()` auto-groups by `parentCity`
- **Destinations flow** (templates/AI): `addDestination` directly adds cities with `places: []`
- `groupPlacesIntoCities()` has two-pass normalization: normalizes parentCity from fullName when API fails, then cross-references against known city groups
- `setTripType` preserves removed return leg in `removedReturnLegRef` for restoration when toggling back to round trip
- Transport pricing: adults + children pay full fare, infants pay 15% on **flights only**. Trains: `price × (adults + children)` (no infant surcharge). Deep plan summary uses same formula.
- Hotel rooms: `Math.ceil((adults + children) / 2)` rooms per hotel
- `buildFullTrip()` creates entire trip (destinations + transport + hotels) in one atomic `setState` — avoids React batching issues with sequential `addDestination` calls
- `bookingDocs: BookingDoc[]` — uploaded PDFs/images stored in Supabase Storage, metadata persisted via `_bookingDocs` JSONB embedding
- `deepPlanData: DeepPlanData` — custom activities, day notes, start times, AI city activities cache, day themes persisted via `_deepPlanData` JSONB embedding

**CurrencyContext**: 10 currencies, all prices stored in INR, converted on display via `formatPrice()`. Live rates fetched from `open.er-api.com` on mount (1-hour cache), falls back to static rates.

### API Routes

- `/api/flights` — **Amadeus (primary) + Google scraper (parallel)**. Both run simultaneously, results merged and deduplicated. Tries top 3 arrival airports when nearest has no flights (e.g., PNY→MAA for Pondicherry). `exact=true` for specific airport. Amadeus returns per-person price (divides `grandTotal` by adults). IATA codes looked up in catalog DB.
- `/api/trains` — Google Directions transit mode. Returns `trains` (rail-only) and `allTransit` (including buses). Bus tab in transport modal filters `allTransit` for BUS vehicle type.
- `/api/nearby` — Google Hotels scraper + Google Places Photos enrichment. Hotels without scraper images get photos from Places API (up to 10 hotels, 3 photos each). Cleans description field (removes USD prices, deal text). Returns deal badges, amenities, hotel class.
- `/api/places` — Google Places Autocomplete (New v1) + Details; `scope=cities|all`.
- `/api/resolve-airport` — Geocodes city → finds IATA codes via PostGIS. Searches "city" appended first to avoid location-biased results (e.g., "Barcelona city" → Spain, not "North Barcelona" apartment in Mumbai). Returns all large airports within 1000km (no cap).
- `/api/trips` — CRUD with JSONB embedding for places/additionalHotels.
- `/api/weather` — Open-Meteo API (free). 1-hour cache. Only works ≤16 days out.
- `/api/ai/suggest` — **OpenAI GPT-4.1-mini (primary)**, Anthropic Claude (fallback), templates (last resort). Extracts origin city, departure date, travelers (adults/children/infants), and trip type from user prompt. System prompt for travel expertise.
- `/api/ai/extract-booking` — GPT-4.1-mini vision extracts hotel booking details (name, address, price, nights) from PDF/image.
- `/api/ai/extract-transport` — GPT-4.1-mini vision extracts flight/train details (carrier, number, times, airports/stations, IATA codes, duration, passengers, total price). Timezone-aware duration.
- `/api/ai/extract-trip` — Bulk extraction: all uploaded files → complete trip structure (origin, destinations, hotels, transport segments, travelers). Returns `fileDescriptions` for document mapping.
- `/api/ai/classify-doc` — Lightweight single-file classifier: returns `{type, from, to, city}`. Used to tag uploaded docs with correct cities/type. Each file gets its own AI call (parallel) for reliable mapping.
- `/api/ai/itinerary-activities` — GPT-4.1-mini generates city activities with durations, categories, opening hours, ticket prices. Multi-day aware: assigns `dayIndex` per activity + `dayThemes` for logical day progression (e.g., "Historic", "Outdoor"). Static fallback for no-API-key scenarios. Response cached in `deepPlanData.cityActivities`.
- `/api/booking-docs` — Upload/delete/refresh-URLs for booking documents in Supabase Storage.
- `/api/admin/migrate` — DB migrations.

### External Scraper API

Self-hosted at `FLIGHTS_API_URL` (Railway). Repo: `api4Aiezzy2`. Hotel parser extracts images, links, descriptions, amenities from Google Hotels HTML via cheerio.

### Plan Page (`/plan`) — Places-First Flow

Users add places/attractions. `PlacesAutocomplete` resolves `parentCity` with multi-level fallbacks: Google locality → known CITIES → secondaryText parsing → formattedAddress parsing. On "Plan My Route", groups places by city, then `optimizeRoute()` finds shortest path. Templates/AI use `addDestination()` bypassing places flow. Plan page shows `userPlaces` when present, falls back to `destinations`.

**Upload Bookings flow:** User uploads all booking PDFs/screenshots → `/api/ai/extract-trip` processes them in one batch → preview modal shows extracted trip → "Build My Trip" calls `buildFullTrip()` to create everything atomically. Each file is individually classified via `/api/ai/classify-doc` (parallel calls) for accurate document-to-booking mapping. Transport segments matched to legs by city name fuzzy matching (not index). This flow must NOT disturb the manual trip creation flow.

### Route Page (`/route`) — Key Behaviors

- **Auto-select:** Fetches flights AND trains in parallel using city names (not airport codes) for better nearby-airport coverage. Picks train if cheaper OR within 30% price and faster. Waits for `trip.from.name` to load before running (prevents empty city → no results). Resets via `prevTripIdRef` when trip changes. **Same-airport detection:** If from/to resolve to the same airport code (e.g., Goa intra-city = GOI), auto-selects drive/cab instead of flights.
- **Local stay detection:** `isLocalStay` flag detects when all destinations are in the same city as origin (checks `parentCity`, `name`, `fullName`, `fromAddress`). Hides home stops, transport legs, and arrival info. Shows green "Local Stay — no transport needed" banner with Deep Plan shortcut. Deep plan filters out travel/departure days for local stays (only explore days).
- **Same-city transport:** Dedicated `useEffect` replaces same-city flight/train selections with "Local Transfer" (~15 min). Runs on every trip change, checks both city names and `fromAddress` contents.
- **Auto-save:** 5s debounced after selection changes. Watches `selectedCount`, flight/train/hotel IDs+prices, `nights`, `adults`, `children`, `infants`, `departureDate`, `tripType`. Blocked until `tripStableRef` is true (500ms after trip loads). Must include selection IDs in dependency array — otherwise replacing a flight (same count) won't trigger save.
- **Reload stability:** `tripStableRef` prevents date/nights effects from re-fetching on initial load. Set after 500ms for ALL arrival paths (plan page, reload, new trip).
- **Manual refresh:** "Update Flights & Trains" button appears when date/nights change. No auto-refetch — user clicks when ready. Also fetches for empty legs (new return leg after one-way→round-trip toggle).
- **Editable trip info:** Date picker, adults/children/infants +/- buttons, trip type toggle inline on route page.
- **Full-screen modals:** Both transport and hotel modals are full-screen overlays with back arrow navigation.
- **Hotel modal:** Left sidebar with rating/price/amenity filters, list/grid toggle, Google Places photos, deal badges, Maps + Booking.com links with dates. "Add custom stay" with Google Places autocomplete for address + coordinates. Upload booking PDF/screenshot → GPT extracts address, price, nights.
- **Transport modal:** `TransportCompareModal` — tabs for Flights, Trains, Bus, Drive, Walk, Cycle, Boat, Tram. Dual airport dropdowns (departure + arrival), layover info from Amadeus segments, per-person + total price display. "Add your own flight/train" with manual entry. Upload ticket → GPT extracts all fields. Price field is TOTAL for all passengers — handlers divide by trip's passenger formula.
- **Bus selection:** Bus routes come from `/api/trains` `allTransit` filtered for BUS vehicles. Selected via `updateTransportLeg()` storing as `selectedTrain` with `type: 'bus'`. **Critical:** Must use single `updateTransportLeg()` call — NOT `selectTrain()` then `changeTransportType()` sequentially, because `changeTransportType()` clears `selectedTrain` to null.
- **Drive/Cab selection:** Drive tab shows two options: Self Drive (fuel ~₹8/km) + Hire Cab (~₹18/km). Selected via `updateTransportLeg()` storing as `selectedTrain` with `type: 'drive'`. Drive info (duration + distance) passed from modal to route page.
- **Price N/A:** When transport price is 0 or unavailable, display "Price N/A" instead of ₹0. Check `price > 0` before rendering price in route page and transport modal.
- **Color-coded cards:** Flight (blue), Train (amber), Bus (orange), Drive/Cab (slate), Hotel (rose) — each has colored left border, tinted background, and matching SVG icon. Same style on both route and deep plan pages.
- **Booking doc viewer:** Full-screen modal for viewing uploaded PDFs (iframe) and images. "Booking" links on cards matched by `docType` (hotel/transport) and city names. Transport docs require BOTH from AND to cities to match. Train cards fall back to station names when city names don't match (Brussels vs Bruges).
- **Hub-to-hotel distances:** Separate `arr-{di}` (arrival) and `dep-{di}` (departure) distances because airports can differ.
- **Hotel room calc:** `Math.ceil((adults + children) / 2)` rooms, displayed as "₹X/night × N × R rooms".

### Deep Plan Page (`/deep-plan`) — Day-by-Day Itinerary

**Layout:** 2-column desktop (itinerary 65% + sticky sidebar 35%). Single column on mobile. Sticky day navigation chips at top. Trip overview card with stats grid (days, cities, budget, travelers).

**Day types:** Travel Day (blue), Explore Day (green), Departure Day (orange), Arrival & Explore (violet — travel day with free time to explore). A day is a day — 24 hours. Same-date arrival + explore days merge into a single card.

**Day cards:** Collapsible (multiple can be open simultaneously). Collapsed state shows: activity count, travel time, activity preview names. Expanded shows full timeline. Action buttons (+, refresh) in day header. Print auto-expands all days via `beforeprint`/`afterprint` events.

**Smart itinerary generation:** Explore days use AI-generated activities with real durations instead of hardcoded 2-hour blocks. Activity source priority: user places (90min default) → AI-cached `cityActivities` → static `CITY_ATTRACTIONS` (typed with durations) → generic fallback. Activities scheduled into morning (start→12:30) and afternoon (13:15→18:30) blocks with 30min travel gaps, respecting `bestTime` preference and `durationMin`. Multi-day trips get themed days via `dayIndex` assignment.

**Activity cards:** Three-dot action menu with: View on map, Directions, Save activity, Book tickets, Move up/down, Remove. Category-colored cards with photo thumbnails. Drag-to-reorder on explore AND arrival days via HTML5 drag-and-drop. Pin/save promotes AI activities to custom (survives refreshes).

**Transport cards:** Vertical route stepper (DEP dot → journey line → ARR dot) for flights and trains. Color-coded: blue (flight), amber (train), orange (bus), slate (drive). Booking status badges (Booked/Pending) matched by city names in `bookingDocs`. "Replace" button opens full `TransportCompareModal` (same as route page).

**Meal blocks:** Orange pill/chip design with distinct emojis (coffee=breakfast, plate=lunch, moon=dinner) and contextual hints. Warning boxes (red) for "Leave by" and "Board" time-sensitive notes.

**Sidebar (desktop):** Trip Progress stats, Budget breakdown (color-coded dots), Booking Progress ring (SVG circle with percentage), Booking Checklist (per-item ✓/! for transport+hotels), Weather Forecast grid (5-day), Local Info (currency/timezone/emergency/language for 50+ countries), Quick Links. Sidebar scrolls independently with `max-h-[calc(100vh-80px)]`.

**City cards:** White card with gradient visual panel (city code watermark), hotel rating+price, action buttons (View on map, Explore suggestions), activity/day count stats.

**Start time adjustment:** Changing start time re-runs the full scheduling algorithm (not a flat offset). Activities are re-sorted and re-fit into morning/afternoon blocks based on new start time.

**Overnight flight handling:** Detects flights with `arrH < depH` (crossed midnight) or 24h+ duration. Creates "In Transit" days for genuinely multi-day flights. Same-day long flights (timezone gains where `arrH > depH`) stay on one card with full arrival timeline. Same-date arrival + explore days are merged automatically.

**Day merge logic:** After all days are built, consecutive days with same `day` number and `date` are merged. Duplicate meals are skipped, sleep/overnight is repositioned to end, costs are summed, type prefers explore > arrival > travel.

**Inter-activity travel times:** Real walk/transit/drive times fetched via Google Directions between consecutive stops on all day types. Dropdown (z-50) lets user switch modes; "Directions" link opens Google Maps with selected mode. On travel/departure days, changing mode recalculates "Leave by X to reach on time" note.

**Empty states:** Travel days with free time show "Auto-plan this day" card. Explore days with no attractions show "Add places" + "Auto-plan" buttons.

**Persisted to DB:** Custom activities, day notes, day start times, AI city activities cache, day themes, and activity order stored in `deepPlanData` (via `_deepPlanData` JSONB embedding).

### Key Patterns

- **City geocoding:** Search "city" appended to avoid India location bias (e.g., "Barcelona city" → Spain).
- **Airport resolution:** `resolveToAirports()` for IATA codes looks up name/city from catalog DB. For city names, geocodes + PostGIS nearby search.
- **Price display:** All prices in INR. `formatPrice(amountINR, currency)`. Live rates from `open.er-api.com` cached 1 hour. PDF uses ASCII-safe `Rs.` instead of `₹`.
- **Price calculation for custom transport:** Total price entered → divided by trip's passenger formula. Flights: `total / (adults + children + infants×0.15)`. Trains: `total / adults`. Route page multiplies back.
- **PDF export:** `exportTripPDFFromData()` — structured jsPDF (not html2canvas). Text truncation, right-aligned price columns.
- **TypeScript gotchas:** Don't use `for...of` on `Set` (needs `downlevelIteration`). Don't use `parseInt()` on numbers. Use `Array.from(set)` instead.
- **Null safety for new fields:** `bookingDocs` and `deepPlanData` may be undefined on trips saved before these features. Always use `trip.bookingDocs?.length`, `trip.deepPlanData || { customActivities: {}, dayNotes: {}, dayStartTimes: {} }`. `cityActivities` and `dayThemes` inside `deepPlanData` are also optional.
- **Hotel `address`/`lat`/`lng`:** Optional fields on `Hotel` interface. Custom stays and Google hotels store address for accurate distance calculations via Google Directions.
- **City name display:** Always use `city.parentCity || city.name` for display — never parse `fullName` by commas (e.g., "Jaipur, Rajasthan, India" would give "Rajasthan" not "Jaipur").
- **Transport type atomicity:** `changeTransportType()` clears both `selectedFlight` and `selectedTrain`. When selecting transport while also changing type (e.g., bus), use `updateTransportLeg()` with all fields in one call.
- **OpenAI Responses API:** PDF-handling endpoints (`extract-trip`, `extract-booking`, `extract-transport`, `classify-doc`) use `/v1/responses` (not `/v1/chat/completions`). Content types: `input_text`, `input_file`, `input_image`. Response: `data.output[].content[].text`.
- **From city on reload:** `loadTrip` extracts city name from `fromAddress` when `from_city.name` is empty (e.g., "42 Rue Jacob, Paris, France" → `parentCity: "Paris"`). Uses second-to-last comma-separated part.

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
