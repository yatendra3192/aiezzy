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

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary). Additional pages: `/settings`, `/admin`, `/shared/[token]` (SSR with `generateMetadata` for OG tags), `/auth/*`.

**Trip IDs in URLs:** All trip pages use `?id=xxx` query params. Pages use `useSearchParams()` wrapped in `<Suspense>` boundaries. Priority: URL param > context tripId > sessionStorage.

### Auth & Security

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup`.

**Middleware** (`src/middleware.ts`): Server-side route protection for `/my-trips`, `/plan`, `/route`, `/deep-plan`, `/settings`. Redirects unauthenticated users to `/`.

**Security headers** in `next.config.mjs`: X-Frame-Options DENY, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Content-Security-Policy (whitelists Google Maps/Places, Supabase, Open-Meteo, Amadeus, GA, Sentry).

**Admin routes** use session-based auth with email whitelist (`ADMIN_EMAILS` array), NOT query-param secrets.

**ALL API routes require `getServerSession`** — returns 401 for unauthenticated requests. This includes `/api/flights`, `/api/trains`, `/api/nearby`, `/api/places`, `/api/weather`, `/api/resolve-airport`, `/api/directions`, `/api/place-photo`, all AI routes, and trip CRUD. Exception: `/api/weather` allows unauthenticated access when `?shareToken=` param is present (for shared trip pages).

**Rate limiting** (`src/lib/rateLimit.ts`): In-memory fixed-window rate limiter on all auth endpoints. Limits: signup 5/hr/IP, forgot-password 3/hr/email + 10/hr/IP, change-password 5/15min/user, reset-password 5/15min/IP, resend-verification 3/hr/email. Resets on deploy. For scale, swap to `@upstash/ratelimit` with Redis.

**Password policy** (`src/lib/validatePassword.ts`): Min 10 chars, 1 uppercase, 1 lowercase, 1 number. Used in signup, change-password, reset-password (both server API and client-side forms in `/signup`, `/settings`, `/auth/reset-callback`).

**Input validation** (`src/lib/tripValidation.ts`): Zod schema validates trip create/update payloads — caps `destinations` at 50, `transportLegs` at 51, `adults` 1-20, enforces YYYY-MM-DD date format, string length limits. Applied to both `POST /api/trips` and `PUT /api/trips/[id]`.

**Env validation** (`src/instrumentation.ts`): Validates required env vars at server startup, warns about weak `NEXTAUTH_SECRET`.

**Error boundaries:** Route-level `error.tsx` files in `/route`, `/deep-plan`, `/plan`, `/my-trips`, `/settings` — each with page-specific messaging and navigation. Uses `reportError()` from `src/lib/errorReporter.ts`.

### Database

**App Supabase** (`NEXT_PUBLIC_SUPABASE_URL`): `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel. RLS on all. Two Supabase client modes in `src/lib/supabase/server.ts`:
- `createUserClient(userId)` — signs a short-lived JWT with the user's ID via `jose`, creates a Supabase client that enforces RLS (`auth.uid() = user_id`). Used for trip CRUD, profile, share routes. Falls back to service client if `SUPABASE_JWT_SECRET` is not set.
- `createServiceClient()` — service role key, bypasses RLS. Used ONLY for admin ops, auth (signup/password), storage (booking-docs), shared trip public access, and NextAuth callbacks.

**Catalog Supabase** (`CATALOG_SUPABASE_URL`): 47,830 airports with PostGIS. Used via `nearby_airports(lat, lng, radius_km)` RPC.

**Supabase Storage**: `booking-docs` bucket for uploaded booking PDFs/images. Path: `userId/tripId/timestamp-filename`. Signed URLs (1-year expiry). Auto-creates bucket on first upload via service role.

**Dedicated columns:** `trips.deep_plan_data` and `trips.booking_docs` (JSONB) store deep plan and booking data separately from `from_city`. Run `POST /api/admin/migrate` to create these columns.

**JSONB embedding pattern (legacy + current):** Extra data stored inside existing JSONB columns:
- `places` → `_places` inside `trip_destinations.city` JSONB
- `additionalHotels` → `_additionalHotels` inside `trip_destinations.selected_hotel` JSONB
- `resolvedAirports` → `_resolvedAirports` inside `trip_transport_legs.selected_flight` JSONB
- ~~`bookingDocs`/`deepPlanData` were embedded in `trips.from_city`~~ — now use dedicated columns. On load, API checks dedicated columns first, falls back to `from_city` embedding for old trips.
On save, API embeds remaining fields; on load, extracts and returns separately. **Always null-safe** — old trips without new fields must not crash (use `|| {}`, `|| []`, `?.`).

### State Management

**TripContext** (`src/context/TripContext.tsx`): Core trip state split into three React contexts for performance:
- `TripActionsContext` — stable action functions (never re-renders). Access via `useTripActions()`.
- `TripStateContext` — trip data (re-renders on change). Access via `useTripState()`.
- `TripContext` — combined backward-compatible context. Access via `useTrip()` (re-renders on any change).
All 34 action callbacks have `[]` deps and are `useMemo`'d into a stable actions object. Components that only need actions should use `useTripActions()` to avoid unnecessary re-renders.

Two data flows:
- **Places flow**: `userPlaces` → `addPlace`/`removePlace`/`reorderPlaces`/`updatePlaceNights` → `groupPlacesIntoCities()` auto-groups by `parentCity`
- **Destinations flow** (templates/AI): `addDestination` directly adds cities with `places: []`
- `groupPlacesIntoCities()` has two-pass normalization: normalizes parentCity from fullName when API fails, then cross-references against known city groups
- `setTripType` preserves removed return leg in `removedReturnLegRef` for restoration when toggling back to round trip. **Ref is cleared on `loadTrip`/`resetTrip`** to prevent cross-trip contamination.
- Transport pricing: adults + children pay full fare, infants pay 15% on **flights only**. Trains: `price × (adults + children)` (no infant surcharge). Deep plan summary uses same formula.
- Hotel rooms: `Math.ceil((adults + children) / 2)` rooms per hotel
- `buildFullTrip()` creates entire trip (destinations + transport + hotels) in one atomic `setState` — avoids React batching issues with sequential `addDestination` calls
- `bookingDocs: BookingDoc[]` — uploaded PDFs/images stored in Supabase Storage, metadata persisted via `_bookingDocs` JSONB embedding
- `deepPlanData: DeepPlanData` — custom activities, day notes, start times, AI city activities cache, day themes persisted via `_deepPlanData` JSONB embedding
- **`saveTrip` concurrency safety:** Uses `stateRef` (always latest state) instead of `setState` hack. `saveMutexRef` queues saves sequentially via promise chain. `isDirty` only cleared if state hasn't changed during the network round-trip. Checks `tripId` staleness to prevent overwriting a different trip loaded mid-save.
- **Destination reorder/move/remove syncs transport legs:** `moveDestination` swaps corresponding legs + clears the adjacent leg after the swap pair. `removeDestination` clears the leg that slides into the gap. `reorderDestinations` clears ALL transport leg selections (every city pair changes). All three prevent stale flight/train data from persisting on wrong city pairs.

**CurrencyContext**: 10 currencies, all prices stored in INR, converted on display via `formatPrice()`. Live rates fetched from `open.er-api.com` on mount (1-hour cache), falls back to static rates.

### API Routes

- `/api/flights` — **Amadeus (primary) + Google scraper (parallel)**. Both run simultaneously, results merged and deduplicated. Tries top 3 arrival airports when nearest has no flights (e.g., PNY→MAA for Pondicherry). `exact=true` for specific airport. Amadeus returns per-person price (divides `grandTotal` by adults). IATA codes looked up in catalog DB.
- `/api/trains` — Google Directions transit mode. Returns `trains` (rail-only) and `allTransit` (including buses). Bus tab in transport modal filters `allTransit` for BUS vehicle type.
- `/api/nearby` — Google Hotels scraper + Google Places Photos enrichment. Hotels without scraper images get photos from Places API (up to 10 hotels, 3 photos each). Cleans description field (removes USD prices, deal text). Returns deal badges, amenities, hotel class.
- `/api/places` — Google Places Autocomplete (New v1) + Details; `scope=cities|all`.
- `/api/resolve-airport` — Geocodes city → finds IATA codes via PostGIS. Searches "city" appended first to avoid location-biased results (e.g., "Barcelona city" → Spain, not "North Barcelona" apartment in Mumbai). Returns all large airports within 1000km (no cap).
- `/api/trips` — CRUD with JSONB embedding for places/additionalHotels. Zod-validated payloads. PUT handler checks errors on all 4 DB operations (delete/insert destinations + legs) — never silent failures. DELETE cleans up booking docs from Supabase Storage. Auth endpoints: `/api/auth/signup`, `/api/auth/change-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/resend-verification`, `/api/auth/delete-account` (cleans up all user storage files).
- `/api/weather` — Open-Meteo API (free). 1-hour cache. Only works ≤16 days out.
- `/api/ai/suggest` — **OpenAI GPT-4.1-mini (primary)**, Anthropic Claude (fallback), templates (last resort). Extracts origin city, departure date, travelers (adults/children/infants), and trip type from user prompt. System prompt for travel expertise.
- `/api/ai/extract-booking` — GPT-4.1-mini vision extracts hotel booking details (name, address, price, nights) from PDF/image.
- `/api/ai/extract-transport` — GPT-4.1-mini vision extracts flight/train details (carrier, number, times, airports/stations, IATA codes, duration, passengers, total price). Timezone-aware duration.
- `/api/ai/extract-trip` — Bulk extraction: all uploaded files → complete trip structure (origin, destinations, hotels, transport segments, travelers). Returns `fileDescriptions` for document mapping.
- `/api/ai/classify-doc` — Lightweight single-file classifier: returns `{type, from, to, city}`. Used to tag uploaded docs with correct cities/type. Each file gets its own AI call (parallel) for reliable mapping.
- `/api/ai/itinerary-activities` — GPT-4.1-mini generates city activities with durations, categories, opening hours, ticket prices. Multi-day aware: assigns `dayIndex` per activity + `dayThemes` for logical day progression (e.g., "Historic", "Outdoor"). Static fallback for no-API-key scenarios. Response cached in `deepPlanData.cityActivities`. Requests 7 activities per day + 3 extras. `max_tokens: 4096` to avoid truncation with many activities. **All AI routes require authentication** (`getServerSession`).
- `/api/booking-docs` — Upload/delete/refresh-URLs for booking documents in Supabase Storage.
- `/api/admin/migrate` — DB migrations.

### External Scraper API

Self-hosted at `FLIGHTS_API_URL` (Railway). Repo: `api4Aiezzy2`. Hotel parser extracts images, links, descriptions, amenities from Google Hotels HTML via cheerio.

### Plan Page (`/plan`) — Places-First Flow

Users add places/attractions. `PlacesAutocomplete` resolves `parentCity` with multi-level fallbacks: Google locality → known CITIES → secondaryText parsing → formattedAddress parsing. On "Plan My Route", groups places by city, then `optimizeRoute()` finds shortest path. Templates/AI use `addDestination()` bypassing places flow. Plan page shows `userPlaces` when present, falls back to `destinations`.

**Upload Bookings flow:** User uploads all booking PDFs/screenshots → `/api/ai/extract-trip` processes them in one batch → preview modal shows extracted trip → "Build My Trip" calls `buildFullTrip()` to create everything atomically. Each file is individually classified via `/api/ai/classify-doc` (parallel calls) for accurate document-to-booking mapping. Transport segments matched to legs by city name fuzzy matching (not index). This flow must NOT disturb the manual trip creation flow.

### Route Page (`/route`) — Key Behaviors

- **Auto-select:** Fetches flights AND trains in parallel using city names (not airport codes) for better nearby-airport coverage. Picks train if cheaper OR within 30% price and faster. Waits for `trip.from.name` to load before running (prevents empty city → no results). Resets via `prevTripIdRef` when trip changes. **Same-airport detection:** If from/to resolve to the same airport code (e.g., Goa intra-city = GOI), auto-selects drive/cab instead of flights. **AbortController:** All fetch calls use `signal` from `autoSelectAbortRef` — aborted on cleanup/re-run. Callbacks check `signal.aborted` before applying state.
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

**Day types:** Travel Day (blue), Explore Day (green), Departure Day (orange), Arrival (violet — separate card with evening activities + dinner + sleep). Arrival days are NEVER merged with explore days — they always get their own card. Explore days start the next calendar day.

**Day cards:** Collapsible (multiple can be open simultaneously). Collapsed state shows: activity count, travel time, activity preview names. Expanded shows full timeline. Action buttons (+, refresh) in day header. Print auto-expands all days via `beforeprint`/`afterprint` events.

**Smart itinerary generation:** Explore days use AI-generated activities with real durations instead of hardcoded 2-hour blocks. Activity source priority: user places (90min default) → AI-cached `cityActivities` → static `CITY_ATTRACTIONS` (typed with durations) → generic fallback. Activities scheduled into morning (start→12:30) and afternoon (13:15→18:30) blocks with 30min travel gaps, respecting `bestTime` preference and `durationMin`. Multi-day trips get themed days via `dayIndex` assignment.

**Activity cards:** Three-dot action menu with: View on map, Directions, Save activity, Book tickets, Move up/down, Remove. Category-colored cards with photo thumbnails. Drag-to-reorder on explore AND arrival days via **Framer Motion `Reorder.Group`/`Reorder.Item`** (same as plan page). `Reorder.Item` must only render inside `Reorder.Group` (days with 2+ activities) — single-activity days use regular divs to avoid "Cannot destructure property 'axis'" crash. Pin/save promotes AI activities to custom (survives refreshes).

**Transport cards:** Vertical route stepper (DEP dot → journey line → ARR dot) for flights and trains. Color-coded: blue (flight), amber (train), orange (bus), slate (drive). Booking status badges (Booked/Pending) matched by city names in `bookingDocs`. "Replace" button opens full `TransportCompareModal` (same as route page).

**Meal blocks:** Orange pill/chip design with distinct emojis (coffee=breakfast, plate=lunch, moon=dinner) and contextual hints. Warning boxes (red) for "Leave by" and "Board" time-sensitive notes.

**Sidebar (desktop):** Extracted to `src/components/deep-plan/DeepPlanSidebar.tsx`. Trip Progress stats, Budget breakdown (color-coded dots), Booking Progress ring (SVG circle with percentage), Booking Checklist (per-item ✓/! for transport+hotels), Weather Forecast grid (5-day), Local Info (currency/timezone/emergency/language for 50+ countries), Quick Links. Receives computed values as props. Sidebar scrolls independently with `max-h-[calc(100vh-80px)]`.

**City cards:** White card with gradient visual panel (city code watermark), hotel rating+price, action buttons (View on map, Explore suggestions), activity/day count stats.

**Start time adjustment:** Changing start time re-runs the full scheduling algorithm (not a flat offset). Activities are re-sorted and re-fit into morning/afternoon blocks based on new start time.

**Overnight flight handling:** Detects flights with `arrH < depH` (crossed midnight) or `durHrs >= 24`. Do NOT use `durHrs >= 12` — cross-timezone flights (e.g., BOM→AMS 12h20m) arrive same day due to timezone gain. Scraper `isNextDay` is unreliable for cross-timezone flights — use hour-based detection only. Creates "In Transit" days for genuinely multi-day flights (36h+).

**Arrival day separation:** Arrival days ALWAYS get their own card with dinner + sleep. `dayNum` is incremented after every arrival day so explore days start the next calendar day. This prevents confusing 24h+ merged cards where 7 PM dinner flows into 9 AM breakfast.

**Arrival day activities:** Fill as many activities as fit in free time (no cap). Track used activities in `usedArrivalActivities` set — explore days exclude these to prevent repeats across days in the same city.

**Auto-fill on mount:** When deep plan loads, auto-detects all cities needing AI activities and fetches them in **parallel** (Promise.all). Shows progress overlay with per-city checklist. Includes 1-night arrival-only destinations (not just 2+ nights). **Staleness guard:** Captures `effectTripId` at start; callbacks skip state updates if `cancelled` flag is set (cleanup sets it). Post-fill save only fires if the same `tripId` is still loaded.

**Day merge logic:** After all days are built, consecutive days with same `day` number and `date` are merged. Duplicate meals are skipped, sleep/overnight is repositioned to end, costs are summed. Since arrival days always increment dayNum, merges now only happen for edge cases.

**Inter-activity travel times:** Real walk/transit/drive times fetched via Google Directions between consecutive stops on all day types. Dropdown (z-50) lets user switch modes; "Directions" link opens Google Maps with selected mode. On travel/departure days, changing mode recalculates "Leave by X to reach on time" note. **City context for directions:** stops before the transport leg use `departureCity`, stops after use `day.city` (destination). The cascade code accounts for activity durations: `departureMin = stopStartTime + durationMin` for attractions (not just `stopStartTime`). When activities are reordered, new stop pairs trigger fresh direction lookups (dependency includes stop names). Failed fetches show "N/A" via `_fetched` marker instead of infinite "Loading...".

**Empty states:** Travel days with free time show "Auto-plan this day" card. Explore days with no attractions show "Add places" + "Auto-plan" buttons.

**Persisted to DB:** Custom activities, day notes, day start times, AI city activities cache, day themes, and activity order stored in `deepPlanData` (via `_deepPlanData` JSONB embedding).

### Key Patterns

- **City geocoding:** Search "city" appended to avoid India location bias (e.g., "Barcelona city" → Spain).
- **Airport resolution:** `resolveToAirports()` for IATA codes looks up name/city from catalog DB. For city names, geocodes + PostGIS nearby search.
- **Price display:** All prices in INR. `formatPrice(amountINR, currency)`. Live rates from `open.er-api.com` cached 1 hour. PDF uses ASCII-safe `Rs.` instead of `₹`.
- **Price calculation for custom transport:** Total price entered → divided by trip's passenger formula. Flights: `total / (adults + children + infants×0.15)`. Trains: `total / adults`. Route page multiplies back.
- **PDF export:** `exportTripPDFFromData()` — structured jsPDF (not html2canvas). Text truncation, right-aligned price columns.
- **TypeScript gotchas:** Don't use `for...of` on `Set` or `Map` (needs `downlevelIteration`). Don't use `parseInt()` on numbers. Use `Array.from(set)` or `Array.from(map.keys())` instead.
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
SUPABASE_JWT_SECRET           # Optional: enables per-user RLS (Supabase Dashboard > Settings > API > JWT Secret)
EMAIL_VERIFY_ENABLED          # Optional: set "true" to require email verification on signup
NEXT_PUBLIC_TURNSTILE_SITE_KEY # Optional: Cloudflare Turnstile CAPTCHA site key
TURNSTILE_SECRET_KEY          # Optional: Cloudflare Turnstile secret key
NEXT_PUBLIC_GA_ID             # Google Analytics 4
NEXT_PUBLIC_SENTRY_DSN        # Optional: Sentry
```

### Path Alias

`@/*` → `./src/*`

### Deployment

GitHub: `yatendra3192/aiezzy` branch `dev`. Railway auto-deploys on push (Railpack builder — use `"node": "20.x"` in engines, NOT `>=18.0.0` ranges). Main branch has coming-soon page. Scraper API: `yatendra3192/google-travel-api` on Railway.

**Scraper `isNextDay` bug:** The Google Flights scraper returns unreliable arrival dates for cross-timezone flights. The flights API now uses hour-based detection (`arrH < depH && durHrs > 2 || durHrs >= 24`) instead of trusting scraper date comparisons. Do NOT add `durHrs >= 12` as a shortcut — westbound flights gain timezone hours and arrive same day even at 12h+ duration.
