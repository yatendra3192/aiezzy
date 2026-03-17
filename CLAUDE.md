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

**Flow:** `/` (sign-in) → `/signup` → `/my-trips` (dashboard) → `/plan` (trip builder) → `/route` (transport/hotel selection) → `/deep-plan` (day-by-day itinerary). Additional pages: `/settings` (profile/security), `/admin`, `/shared/[token]` (public trip view), `/auth/forgot-password`, `/auth/reset-callback`, `/auth/verify-email`, `/auth/verify-callback`.

### Auth

NextAuth v4 JWT in `src/lib/auth.ts`. CredentialsProvider (Supabase Auth) + GoogleProvider. Signup via `POST /api/auth/signup` (uses `admin.createUser` with `email_confirm: true`). Profile auto-created by DB trigger. Password reset via Supabase `resetPasswordForEmail()`. Auth API routes: `/api/auth/signup`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/change-password`, `/api/auth/delete-account`, `/api/auth/resend-verification`.

### Database

**App Supabase** (`NEXT_PUBLIC_SUPABASE_URL`): `profiles`, `trips`, `trip_destinations`, `trip_transport_legs`. JSONB for City/Flight/Train/Hotel. RLS on all. `trips.share_token` (TEXT UNIQUE) enables public sharing. Schema: `supabase/schema.sql`.

**Catalog Supabase** (`CATALOG_SUPABASE_URL`): 47,830 airports with PostGIS coordinates, cities, countries. Used for airport resolution via `nearby_airports(lat, lng, radius_km)` RPC function.

### State Management

**TripContext** (`src/context/TripContext.tsx`): Core trip state. Key methods: `selectFlight`/`selectTrain`, `changeTransportType`, `saveTrip`, `loadTrip`/`resetTrip`/`clearTripId`, `reorderDestinations`, `updateNights`, `updateDestinationNotes`. `isDirty` tracks unsaved changes. Transport legs = destinations + 1 for round trips. `sessionStorage('currentTripId')` persists active trip ID so route/plan/deep-plan pages auto-restore from DB on page reload. IDs use `Date.now()-randomSuffix` to prevent collisions in loops.

**CurrencyContext** (`src/context/CurrencyContext.tsx`): Selected currency persisted in localStorage. 10 currencies (INR, USD, EUR, GBP, JPY, AUD, CAD, SGD, AED, THB). All prices stored in INR, converted on display via `formatPrice()` from `src/lib/currency.ts`.

**LocaleContext** (`src/context/LocaleContext.tsx`): English/Hindi i18n. ~70 translation keys. `useLocale()` provides `t()` function. Infrastructure ready for incremental adoption — most UI still uses hardcoded English.

### API Routes

- `/api/flights` — Parallel Supabase airport search + Google Flights scraper + Amadeus fallback. Returns resolved airport codes + city names.
- `/api/trains` — Google Directions transit mode. Filters to routes where ALL segments are rail types. Mixed bus+metro routes excluded.
- `/api/nearby` — Live Google Hotels scraper (USD→INR ×85), falls back to Google Places Nearby.
- `/api/directions` — Google Directions (driving/transit/walking/bicycling) with `alternatives=true`.
- `/api/places` — Google Places Autocomplete (New v1) + Details; `scope=cities|all`.
- `/api/resolve-airport` — Geocodes city → finds IATA codes. 24h in-memory cache.
- `/api/trips` — CRUD. Auto-generates titles. Trip numbering per user.
- `/api/trips/[id]/share` — POST generates share_token, DELETE removes it.
- `/api/shared/[token]` — Public trip fetch by share_token (no auth, uses service role).
- `/api/profile` — GET/PUT user profile (display_name).
- `/api/weather` — Open-Meteo API (free, no key). 1-hour server cache. Only works for dates within ~16 days.
- `/api/ai/suggest` — Claude API trip suggestions (claude-haiku-4-5) with template fallback when `ANTHROPIC_API_KEY` not set.
- `/api/admin` — Admin stats. Auth via NEXTAUTH_SECRET as key.
- `/api/admin/migrate` — Runs DB migrations (add share_token column).

### External Scraper API

Self-hosted Google Flights/Hotels scraper at `FLIGHTS_API_URL` (Railway). Code in separate `api4Aiezzy2` repo. **Limitation:** Google server-renders flights only for popular routes; the parallel airport approach handles this by trying multiple airports.

### Route Page (`/route`) — Key Behaviors

- **Smart auto-select:** Fetches flights AND trains in parallel. Picks train if cheaper OR within 30% price and faster. Caches results in `flightCacheRef`.
- **Auto-save:** 5s debounced save after selection changes. No manual save button.
- **Resolved airports persistence:** `ResolvedAirports` data stored as `_resolvedAirports` inside `selected_flight` JSONB column (no DB migration needed). Extracted on load to `leg.resolvedAirports`.
- **Airport distance warnings:** Show for all stops when transport is flight. "Flights from X, Y km away" for departures, "Flight will land in X, Y km away" for return home.
- **Weather badges:** `WeatherBadge` component shows forecast inline next to destination names (Open-Meteo, skips dates >15 days out).
- **Visa badges:** Color-coded visa requirements from Indian passport perspective (34+ countries in `src/data/visaRequirements.ts`).
- **Activity suggestions:** Expandable "Things to do" per destination from `src/data/cityAttractions.ts` (30 cities).
- **Trip notes:** Collapsible textarea per destination, auto-saves on blur.
- **Budget visualization:** Stacked bar chart in Trip Estimate sidebar with percentage breakdown.
- **Multi-currency:** Currency selector in sidebar, all prices use `formatPrice()`.
- **Action buttons:** Download PDF, Add to Calendar (.ics), Packing List, Share Trip, Deep Plan.
- **Affiliate links:** "Book" links on flights (Skyscanner), hotels (Booking.com), trains (IRCTC/Trainline).
- **Flight/hotel filters:** Stops + max price filters for flights (3+ results). Rating + price filters for hotels.

### Transport Compare Modal

`TransportCompareModal` — 8 transport types. Flight/train sorting with filters. Affiliate booking links per result. Selected flight seeded on reload for price consistency.

### Key Components

- **ShareTripModal** — Generates share link, copy button, unshare option. Resets state across trips.
- **AISuggestModal** — Natural language trip planner. Claude API or template fallback. Example prompt chips.
- **TripTemplatesSection** — 8 curated templates (Goa, Rajasthan, Europe, Bali, Japan, Kerala, Dubai, Himachal). Horizontal scroll on my-trips.
- **PackingListModal** — Smart packing list by destinations/duration/climate. Persistent checkboxes in localStorage.
- **WeatherBadge** — Compact inline weather for destinations.
- **ActivitySuggestions** — Expandable city attractions with Google Maps links.

### Key Patterns

- **City data from Google:** `parentCity` on City from Place Details `locality` component.
- **Airport resolution chain:** `findAirportCode()` → flights API geocodes + Supabase parallel search → resolved codes + city names.
- **Affiliate links:** `src/lib/affiliateLinks.ts` — Skyscanner, Booking.com, IRCTC/Trainline URL generators. Indian route detection via city name + airport code matching.
- **Price display:** All prices stored in INR. Display via `formatPrice(amountINR, currency)` from `src/lib/currency.ts`. Hardcoded `₹` symbols should be replaced with `formatPrice()` when encountered.
- **Error handling:** `src/app/error.tsx` (route-level) + `src/app/global-error.tsx` (root-level). `src/lib/fetchWithRetry.ts` for retrying failed fetches (2 retries, exponential backoff). `src/lib/errorReporter.ts` captures unhandled errors.
- **PDF export:** `src/lib/pdfExport.ts` using html2canvas + jsPDF. Captures `#trip-content` element.
- **Calendar export:** `src/lib/calendarExport.ts` generates .ics with flights, trains, hotels as VEVENTs.
- **Visa data:** `src/data/visaRequirements.ts` — Indian passport perspective, 34+ countries with aliases (UK/United Kingdom, UAE/United Arab Emirates).

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
