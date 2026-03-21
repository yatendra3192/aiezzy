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

**Dev server cache corruption:** Next.js 14.2.35 frequently corrupts its `.next` webpack cache when files change, causing "Cannot find module" errors and blank pages. After every code change, always do: `npx kill-port 3000; rm -rf .next; npm run dev` then verify pages return 200 with curl before telling the user a fix is done.

No test runner or linter configured.

## Architecture

**Next.js 14 App Router** — all pages `"use client"`. Responsive: mobile (430px) → desktop (680-900px via `md:`).

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary). Additional pages: `/settings` (profile/security), `/admin`, `/shared/[token]` (public trip view), `/auth/forgot-password`, `/auth/reset-callback`, `/auth/verify-email`, `/auth/verify-callback`.

**Trip IDs in URLs:** All trip pages use `?id=xxx` query params for bookmarkable URLs. Pages use `useSearchParams()` wrapped in `<Suspense>` boundaries. Priority: URL param > context tripId > sessionStorage.

### Auth

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup` (uses `admin.createUser` with `email_confirm: true`). Profile auto-created by DB trigger. Password reset via Supabase `resetPasswordForEmail()`. Auth API routes: `/api/auth/signup`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/change-password`, `/api/auth/delete-account`, `/api/auth/resend-verification`.

### Database

**App Supabase** (`NEXT_PUBLIC_SUPABASE_URL`): `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel. RLS on all. `trips.share_token` (TEXT UNIQUE) enables public sharing. Schema: `supabase/schema.sql`.

**Catalog Supabase** (`CATALOG_SUPABASE_URL`): 47,830 airports with PostGIS coordinates, cities, countries. Used for airport resolution via `nearby_airports(lat, lng, radius_km)` RPC function.

**JSONB embedding pattern (no-migration):** Extra data is stored inside existing JSONB columns to avoid DB migrations:
- `places` → stored as `_places` inside `trip_destinations.city` JSONB
- `additionalHotels` → stored as `_additionalHotels` inside `trip_destinations.selected_hotel` JSONB
- `resolvedAirports` → stored as `_resolvedAirports` inside `trip_transport_legs.selected_flight` JSONB
On save, the API embeds the data; on load, it extracts and returns separately.

### State Management

**TripContext** (`src/context/TripContext.tsx`): Core trip state with two parallel data flows:
- **Places flow** (new): `userPlaces` → `addPlace`/`removePlace`/`reorderPlaces`/`updatePlaceNights` → `groupPlacesIntoCities()` auto-groups by `parentCity` into destinations
- **Destinations flow** (legacy/templates/AI): `addDestination` directly adds cities with `places: []`
- Key methods: `selectFlight`/`selectTrain`, `changeTransportType`, `saveTrip`, `loadTrip`/`resetTrip`/`clearTripId`, `reorderDestinations`, `updateNights`, `addAdditionalHotel`/`removeAdditionalHotel`/`updateAdditionalHotelNights`
- `isDirty` tracks unsaved changes. Transport legs = destinations + 1 for round trips. IDs use `Date.now()-randomSuffix`.
- `groupPlacesIntoCities()` has two-pass normalization: first normalizes parentCity from fullName when API fails, then cross-references against known city groups.

**CurrencyContext** (`src/context/CurrencyContext.tsx`): Selected currency persisted in localStorage. 10 currencies (INR, USD, EUR, GBP, JPY, AUD, CAD, SGD, AED, THB). All prices stored in INR, converted on display via `formatPrice()` from `src/lib/currency.ts`.

**LocaleContext** (`src/context/LocaleContext.tsx`): English/Hindi i18n. ~70 translation keys. `useLocale()` provides `t()` function. Infrastructure ready for incremental adoption — most UI still uses hardcoded English.

### API Routes

- `/api/flights` — Parallel Supabase airport search + Google Flights scraper + Amadeus fallback. Returns resolved airport codes + city names. Supports `exact=true` to search only the specified airport code (no fallback to nearby). IATA codes are looked up in catalog DB for name/city.
- `/api/trains` — Google Directions transit mode. Filters to routes where ALL segments are rail types. Mixed bus+metro routes excluded.
- `/api/nearby` — Live Google Hotels scraper (USD→INR ×85), falls back to Google Places Nearby.
- `/api/directions` — Google Directions (driving/transit/walking/bicycling) with `alternatives=true`.
- `/api/places` — Google Places Autocomplete (New v1) + Details; `scope=cities|all`.
- `/api/resolve-airport` — Geocodes city → finds IATA codes via PostGIS. 24h in-memory cache. Returns all large airports within 1000km (no cap).
- `/api/trips` — CRUD. Auto-generates titles. Trip numbering per user. Embeds `_places` in city JSONB and `_additionalHotels` in selected_hotel JSONB.
- `/api/trips/[id]/share` — POST generates share_token, DELETE removes it.
- `/api/shared/[token]` — Public trip fetch by share_token (no auth, uses service role).
- `/api/profile` — GET/PUT user profile (display_name).
- `/api/weather` — Open-Meteo API (free, no key). 1-hour server cache. Only works for dates within ~16 days.
- `/api/ai/suggest` — Claude API trip suggestions (claude-haiku-4-5) with template fallback when `ANTHROPIC_API_KEY` not set.
- `/api/admin` — Admin stats. Auth via NEXTAUTH_SECRET as key.
- `/api/admin/migrate` — Runs DB migrations (add share_token column, places column).

### External Scraper API

Self-hosted Google Flights/Hotels scraper at `FLIGHTS_API_URL` (Railway). Code in separate `api4Aiezzy2` repo. **Limitation:** Google server-renders flights only for popular routes; the parallel airport approach handles this by trying multiple airports.

### Plan Page (`/plan`) — Places-First Flow

Users add **places/attractions** (e.g., "Louvre Museum", "Anne Frank House") instead of cities. The `PlacesAutocomplete` component resolves `parentCity` from Google Place Details API with multi-level fallbacks: Google locality → known CITIES match → secondaryText parsing → formattedAddress parsing → place name.

On "Plan My Route", `groupPlacesIntoCities()` groups places by `parentCity` (case-insensitive), creates Destination entries with summed nights, then `optimizeRoute()` finds shortest path. Templates/AI use `addDestination()` which bypasses the places flow.

The Plan page shows `userPlaces` when present, falls back to showing `destinations` for backward compatibility (templates, AI, loaded old trips).

### Route Page (`/route`) — Key Behaviors

- **Smart auto-select:** Fetches flights AND trains in parallel. Picks train if cheaper OR within 30% price and faster. Caches results in `flightCacheRef`.
- **Auto-save:** 5s debounced save after selection changes. No manual save button.
- **Reload stability:** `tripStableRef` prevents date/nights change effects from re-fetching flights on initial trip load from DB. Trip must be loaded + 500ms settled before user changes trigger re-fetches.
- **Debounced re-fetch:** Nights and date changes are debounced 1.5s — rapid clicking doesn't spam API calls. Toast shows "Dates changed — will update transport options...".
- **Editable trip info:** Departure date (date picker), adults (+/- buttons), trip type (toggle) are editable inline on the route page.
- **Resolved airports persistence:** `ResolvedAirports` data stored as `_resolvedAirports` inside `selected_flight` JSONB column (no DB migration needed). Extracted on load to `leg.resolvedAirports`.
- **Airport/station distance info:** Teal "Arriving at..." badge above each hotel shows airport→hotel distance. Orange "Departing from..." above each flight/train shows hotel→airport distance. Uses Google Directions API for real road distances (cached per hotel). Home-to-airport also uses real road distance.
- **Multi-hotel per city:** Each destination can have multiple hotels via `additionalHotels`. Primary hotel nights = total - additional hotel nights. "+ Add another hotel" replaces the old "Add note" feature.
- **Dual airport dropdowns:** Transport modal has both departure AND arrival airport selectors with nearby airports. Filters out same-airport (no BOM→BOM). `exact=true` prevents API fallback when user picks specific airport.
- **Places sub-list:** Destinations show bullet list of user's places with nights (hidden when place name = city name).
- **Weather badges:** `WeatherBadge` component shows forecast inline next to destination names (Open-Meteo, skips dates >15 days out).
- **Visa badges:** Color-coded visa requirements from Indian passport perspective (34+ countries in `src/data/visaRequirements.ts`).
- **Budget visualization:** Stacked bar chart in Trip Estimate sidebar with percentage breakdown.
- **Multi-currency:** Currency selector in sidebar, all prices use `formatPrice()`.
- **Action buttons:** Download PDF (structured jsPDF), Add to Calendar (.ics), Packing List, Share Trip, Deep Plan.
- **Affiliate links:** "Book" links on flights (Skyscanner), hotels (Booking.com), trains (IRCTC/Trainline).
- **Flight/hotel filters:** Stops + max price filters for flights (3+ results). Rating + price filters for hotels.

### Transport Compare Modal

`TransportCompareModal` — 8 transport types. Flight/train sorting with filters. Dual airport dropdowns (departure + arrival nearby airports within 1000km). `exact=true` API param for specific airport search. Affiliate booking links per result. Passes `airportInfo` back to route page when user selects from different airport.

### Key Components

- **ShareTripModal** — Generates share link, copy button, unshare option. Resets state across trips.
- **AISuggestModal** — Natural language trip planner. Claude API or template fallback. Example prompt chips. Uses `addDestination()` (bypasses places flow).
- **TripTemplatesSection** — 8 curated templates (Goa, Rajasthan, Europe, Bali, Japan, Kerala, Dubai, Himachal). Uses `addDestination()`.
- **PackingListModal** — Smart packing list by destinations/duration/climate. Persistent checkboxes in localStorage.
- **WeatherBadge** — Compact inline weather for destinations.
- **ActivitySuggestions** — Expandable city attractions with Google Maps links. Accepts `userPlaces` prop to show user's places first, supplemented by catalog attractions.

### Key Patterns

- **City data from Google:** `parentCity` on City from Place Details `locality` component. Fallback chain in `getPlaceDetails`: locality → postal_town → administrative_area_level_2 → sublocality_level_1 → sublocality.
- **Airport resolution chain:** `findAirportCode()` → flights API geocodes + Supabase parallel search → resolved codes + city names. When input is IATA code, looks up name/city from catalog DB.
- **Affiliate links:** `src/lib/affiliateLinks.ts` — Skyscanner, Booking.com, IRCTC/Trainline URL generators. Indian route detection via city name + airport code matching.
- **Price display:** All prices stored in INR. Display via `formatPrice(amountINR, currency)` from `src/lib/currency.ts`. Hardcoded `₹` symbols should be replaced with `formatPrice()` when encountered.
- **Error handling:** `src/app/error.tsx` (route-level) + `src/app/global-error.tsx` (root-level). `src/lib/fetchWithRetry.ts` for retrying failed fetches (2 retries, exponential backoff). `src/lib/errorReporter.ts` captures unhandled errors.
- **PDF export:** `src/lib/pdfExport.ts` — `exportTripPDFFromData()` generates structured PDF using jsPDF directly (not html2canvas). ASCII-safe rendering (Rs. instead of ₹, > instead of →). Text truncation for long names. Right-aligned price columns.
- **Calendar export:** `src/lib/calendarExport.ts` generates .ics with flights, trains, hotels as VEVENTs.
- **Visa data:** `src/data/visaRequirements.ts` — Indian passport perspective, 34+ countries with aliases (UK/United Kingdom, UAE/United Arab Emirates).
- **Hub-to-hotel distances:** Route page fetches real Google Directions distances from airport/station to each hotel. Stored separately as `arr-{di}` (arrival) and `dep-{di}` (departure) because arrival and departure airports can differ.

### Styling

Light theme. Tailwind: `bg-primary` (#FAF7F2), `accent-cyan` (#E8654A coral), `accent-gold` (#0D9488 teal). Fonts: Syne/Plus Jakarta Sans/Space Mono. `scrollbar-hide` utility. `focus-visible` outline (2px coral) for accessibility.

### Accessibility

WCAG basics implemented: `aria-label` on all icon buttons, `role="dialog"` + `aria-modal` on all modals, `role="tablist"` + `role="tab"` + `aria-selected` on transport tabs, `role="alert"` on errors, `role="status"` + `aria-live="polite"` on auto-save.

### PWA

`public/manifest.json` (standalone, start_url `/my-trips`), `public/sw.js` (cache-first static, network-first API), registered via `ServiceWorkerRegister` component.

### Monitoring

- **Google Analytics:** `GoogleAnalytics` component loads GA4 via `NEXT_PUBLIC_GA_ID`.
- **Error tracking:** `ErrorReporterInit` captures `window.error` + `unhandledrejection`. Ready for Sentry via `NEXT_PUBLIC_SENTRY_DSN`.
- **Web Vitals:** `WebVitals` component measures LCP, FID, TTFB via PerformanceObserver.

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
NEXT_PUBLIC_GA_ID             # Google Analytics 4 measurement ID
ANTHROPIC_API_KEY             # Optional: enables AI trip suggestions (falls back to templates)
NEXT_PUBLIC_SENTRY_DSN        # Optional: enables Sentry error reporting
```

### Path Alias

`@/*` → `./src/*`

### Deployment

GitHub: `yatendra3192/aiezzy` branch `dev`. Railway auto-deploys on push. Main branch has coming-soon page. Scraper API: `yatendra3192/google-travel-api` on Railway.
