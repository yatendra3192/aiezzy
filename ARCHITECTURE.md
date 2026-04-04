# AIEzzy — Architecture & User Flow Document

## System Overview

AIEzzy is a multi-city travel planning application built on Next.js 14 (App Router). Users plan trips by adding places/destinations, the system finds optimal routes with flights/trains/hotels, and generates day-by-day itineraries with AI-powered activities.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  SessionProvider → LocaleProvider → CurrencyProvider → TripProvider  │
│                                                                 │
│  Pages: / → /signup → /my-trips → /plan → /route → /deep-plan  │
│  Shared: /shared/[token] (SSR, public)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ fetch / NextAuth
┌──────────────────────────▼──────────────────────────────────────┐
│                     NEXT.JS SERVER (Railway)                     │
│                                                                 │
│  Middleware ─── JWT check on protected routes                    │
│  API Routes ─── /api/trips, /api/flights, /api/ai/*, etc.       │
│  Auth ──────── NextAuth v4 (Credentials + Google OAuth)          │
│  Security ──── Rate limiting, Turnstile CAPTCHA, CSP, RLS JWTs  │
└───────┬──────────┬──────────┬──────────┬───────────┬────────────┘
        │          │          │          │           │
   ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼────┐ ┌───▼─────┐
   │Supabase│ │Google  │ │Amadeus│ │OpenAI  │ │Scraper  │
   │  Auth  │ │Maps/   │ │Flight │ │GPT-4.1 │ │API      │
   │  DB    │ │Places  │ │Search │ │mini    │ │(Railway)│
   │Storage │ │Directions│        │ │Anthropic│         │
   └────────┘ └────────┘ └──────┘ └────────┘ └─────────┘
```

---

## Provider Stack (Client)

Every page is wrapped in this context hierarchy (defined in `src/components/Providers.tsx`):

```
SessionProvider (NextAuth — JWT session)
  └─ LocaleProvider (language)
       └─ CurrencyProvider (10 currencies, live rates from open.er-api.com)
            └─ TripProvider (core trip state — 3 internal contexts)
                 ├─ TripActionsContext (stable — never re-renders)
                 ├─ TripStateContext (re-renders on state change)
                 └─ TripContext (combined — backward compatible)
```

---

## Database Schema

```
┌──────────────────────┐       ┌──────────────────────────┐
│       profiles       │       │          trips            │
├──────────────────────┤       ├──────────────────────────┤
│ id (UUID, PK)        │──┐    │ id (UUID, PK)            │
│ display_name         │  │    │ user_id (FK → profiles)  │◄──┐
│ email                │  │    │ title                    │   │
│ avatar_url           │  │    │ from_city (JSONB)        │   │
└──────────────────────┘  │    │ from_address             │   │
                          │    │ departure_date           │   │
                          │    │ adults / children / infants│  │
                          │    │ trip_type                 │   │
                          │    │ status                   │   │
                          │    │ share_token (unique)      │   │
                          │    │ deep_plan_data (JSONB)   │   │
                          │    │ booking_docs (JSONB)     │   │
                          │    └──────────┬───────────────┘   │
                          │               │                    │
               ┌──────────▼───────────┐   │   ┌──────────────▼────────────┐
               │  trip_destinations   │   │   │  trip_transport_legs      │
               ├──────────────────────┤   │   ├───────────────────────────┤
               │ id (UUID, PK)       │   │   │ id (UUID, PK)            │
               │ trip_id (FK)        │◄──┘   │ trip_id (FK)             │◄──┘
               │ position            │       │ position                 │
               │ city (JSONB)        │       │ transport_type           │
               │ nights              │       │ duration / distance      │
               │ selected_hotel (JSONB)│     │ departure_time / arrival_time │
               └──────────────────────┘     │ selected_flight (JSONB)  │
                                            │ selected_train (JSONB)   │
                                            └───────────────────────────┘

Supabase Storage: booking-docs bucket
  Path: {userId}/{tripId}/{timestamp}-{filename}

Catalog DB (separate Supabase): 47,830 airports with PostGIS
  RPC: nearby_airports(lat, lng, radius_km)
```

**RLS Policies** (enforced via signed JWT from `createUserClient`):
- `trips`: SELECT/INSERT/UPDATE/DELETE WHERE `auth.uid() = user_id`
- `trip_destinations`: ALL via join on `trips.user_id = auth.uid()`
- `trip_transport_legs`: ALL via join on `trips.user_id = auth.uid()`
- `profiles`: ALL WHERE `auth.uid() = id`
- `trips` (public): SELECT WHERE `share_token IS NOT NULL`

---

## Complete User Flow

### 1. Sign Up

```
User fills form (/signup)
  │
  ├─ Client validates: email format, pw 10+ chars, upper+lower+number
  │
  ▼
POST /api/auth/signup
  │
  ├─ Rate limit check (5/hr/IP)
  ├─ Turnstile CAPTCHA verify (if configured)
  ├─ validatePassword() server-side
  │
  ├─ EMAIL_VERIFY_ENABLED=true?
  │   ├─ YES → supabase.auth.signUp() → sends verification email
  │   │         → Response: { needsVerification: true }
  │   │         → Frontend redirects to /auth/verify-email
  │   │         → User clicks email link → /auth/verify-callback
  │   │         → Supabase confirms email → Redirect to / (sign-in)
  │   │
  │   └─ NO → supabase.auth.admin.createUser(email_confirm: true)
  │           → Response: { needsVerification: false }
  │           → Frontend auto-signs in via signIn('credentials')
  │           → Redirect to /my-trips
  │
  ▼
User is authenticated
```

### 2. Sign In

```
User fills email + password (/)
  │
  ▼
signIn('credentials', { email, password })
  │
  ▼
NextAuth CredentialsProvider.authorize()
  │
  ├─ supabase.auth.signInWithPassword(email, password)
  │   ├─ Email not confirmed? → Error: "Please verify your email"
  │   └─ Success → returns { id, email, name }
  │
  ▼
NextAuth JWT callback
  │
  ├─ Looks up profiles table by email → gets supabaseUserId
  ├─ Attaches supabaseUserId to JWT token
  │
  ▼
NextAuth Session callback
  │
  ├─ Copies supabaseUserId to session.user
  │
  ▼
Redirect to /my-trips
```

### 3. Google OAuth Sign In

```
User clicks "Sign in with Google"
  │
  ▼
signIn('google', { callbackUrl: '/my-trips' })
  │
  ▼
Google OAuth flow → returns profile
  │
  ▼
NextAuth signIn callback
  │
  ├─ Check profiles table for existing user
  ├─ If new: supabase.auth.admin.createUser() + insert profiles row
  │
  ▼
JWT callback → session callback → redirect to /my-trips
```

### 4. My Trips Dashboard

```
/my-trips loads
  │
  ├─ Middleware: getToken() → JWT valid? Continue : Redirect to /
  │
  ▼
useEffect: GET /api/trips
  │
  ├─ getServerSession → 401 if not authed
  ├─ createUserClient(userId) → RLS-scoped query
  ├─ SELECT trips + destinations + transport_legs WHERE user_id = auth.uid()
  ├─ Compute costs (flight + train + hotel per trip)
  │
  ▼
Display trip cards with: title, route, dates, cost summary
  │
  ├─ [Load Trip] → trip.loadTrip(id) → navigate to /route?id=xxx
  ├─ [Delete Trip] → DELETE /api/trips/{id} → cleanup storage files
  ├─ [New Trip] → trip.resetTrip() → navigate to /plan
  ├─ [AI Suggest] → opens AISuggestModal
  └─ [Use Template] → trip.buildFullTrip(template) → navigate to /route
```

### 5. Plan Page — Adding Places & Destinations

```
/plan loads
  │
  ├─ Restore trip from: URL ?id= > tripId > sessionStorage
  │
  ▼
User interaction branches:

  ┌─ [Add Place] ──────────────────────────────────────────────┐
  │  User types in PlacesAutocomplete                          │
  │    ├─ 300ms debounce                                       │
  │    ├─ Search local CITIES array (instant)                  │
  │    ├─ GET /api/places?input=...&scope=all (Google Places)  │
  │    ├─ User selects → getPlaceDetails(placeId)              │
  │    ├─ Resolve parentCity (5 fallback levels)               │
  │    └─ trip.addPlace(place) → adds to userPlaces[]          │
  │                                                            │
  │  [Plan My Route] button                                    │
  │    ├─ trip.groupPlacesIntoCities()                         │
  │    │   ├─ Two-pass normalization of parentCity              │
  │    │   ├─ Groups places by city (case-insensitive)          │
  │    │   └─ Creates destinations[] + transport legs[]         │
  │    ├─ optimizeRoute() → shortest path                      │
  │    └─ Navigate to /route                                   │
  └────────────────────────────────────────────────────────────┘

  ┌─ [AI Trip Suggest] ───────────────────────────────────────┐
  │  User types: "5 day trip to Europe on a budget"            │
  │    ├─ POST /api/ai/suggest { prompt }                      │
  │    │   ├─ OpenAI GPT-4.1-mini (primary)                    │
  │    │   ├─ Anthropic Claude Haiku (fallback)                 │
  │    │   └─ Keyword templates (last resort)                   │
  │    ├─ Response: { origin, destinations[], travelers }       │
  │    ├─ trip.addDestination() for each city                   │
  │    └─ Navigate to /route                                   │
  └────────────────────────────────────────────────────────────┘

  ┌─ [Upload Bookings] ───────────────────────────────────────┐
  │  User uploads PDFs/screenshots of flights + hotels          │
  │    ├─ POST /api/ai/extract-trip (all files, batch)          │
  │    │   └─ OpenAI Responses API (vision) → full trip struct  │
  │    ├─ POST /api/ai/classify-doc (per file, parallel)        │
  │    │   └─ Returns { type, from, to, city } per doc          │
  │    ├─ Preview modal shows extracted trip                     │
  │    ├─ "Build My Trip" → trip.buildFullTrip() (atomic)       │
  │    └─ Navigate to /route                                   │
  └────────────────────────────────────────────────────────────┘
```

### 6. Route Page — Transport & Hotel Selection

```
/route loads
  │
  ├─ Restore trip: URL ?id= > tripId > sessionStorage > trip.loadTrip()
  ├─ Mark tripStableRef = true after 500ms
  │
  ▼
AUTO-SELECT SEQUENCE (runs once per trip load)
  │
  ├─ Guard: destinations.length > 0, from.name loaded, not already selected
  ├─ Create AbortController for cancellation on cleanup
  │
  │  FOR EACH TRANSPORT LEG:
  │  ┌─────────────────────────────────────────────────────────┐
  │  │ 1. Same-city check → if from===to, set "Local Transfer"│
  │  │ 2. Skip if already has selection                        │
  │  │ 3. Parallel fetch:                                      │
  │  │    ├─ GET /api/flights?from=...&to=...&date=...         │
  │  │    │   ├─ Amadeus API (parallel)                        │
  │  │    │   ├─ Google Scraper (parallel)                     │
  │  │    │   ├─ Tries top 3 nearby airports                   │
  │  │    │   └─ Returns merged+deduped flights                │
  │  │    └─ GET /api/trains?from=...&to=...                   │
  │  │        └─ Google Directions (transit mode)               │
  │  │ 4. Same-airport check → if codes match, select drive    │
  │  │ 5. Pick best: train if cheaper OR <30% more + faster    │
  │  │ 6. trip.selectFlight() or trip.selectTrain()            │
  │  └─────────────────────────────────────────────────────────┘
  │
  │  FOR EACH DESTINATION WITHOUT HOTEL:
  │  ┌─────────────────────────────────────────────────────────┐
  │  │ 1. GET /api/nearby?location=...&checkIn=...&checkOut=.. │
  │  │    ├─ Google Hotels Scraper (primary)                   │
  │  │    └─ Google Places (fallback)                          │
  │  │ 2. Retry without dates if empty                         │
  │  │ 3. Retry with simplified city name if still empty       │
  │  │ 4. trip.updateDestinationHotel(cheapest)                │
  │  └─────────────────────────────────────────────────────────┘
  │
  ├─ Progress overlay shows per-leg/hotel status
  │
  ▼
USER CAN MANUALLY CHANGE SELECTIONS:
  │
  ├─ Click transport card → opens TransportCompareModal
  │   ├─ Tabs: Flight, Train, Bus, Drive, Walk, Cycle, Boat, Tram
  │   ├─ Shows all cached results + "Add your own" manual entry
  │   ├─ Upload ticket → /api/ai/extract-transport → auto-fill
  │   └─ Selection → trip.updateTransportLeg() (atomic)
  │
  ├─ Click hotel card → opens HotelModal
  │   ├─ Filters: rating, price, amenities
  │   ├─ Google Places photos enrichment
  │   ├─ "Add custom stay" with Google Places address search
  │   ├─ Upload booking → /api/ai/extract-booking → auto-fill
  │   └─ Selection → trip.updateDestinationHotel()
  │
  ├─ Edit date/travelers/nights inline
  │
  ▼
AUTO-SAVE (background, 5s debounce)
  │
  ├─ Watches: selectedCount, flight/train/hotel IDs+prices,
  │           nights, adults, children, infants, date, tripType
  ├─ Blocked until tripStableRef = true
  ├─ trip.saveTrip() → stateRef (latest) → saveMutex (sequential)
  │   ├─ POST /api/trips (new) or PUT /api/trips/{id} (existing)
  │   ├─ isDirty cleared only if state unchanged during save
  │   └─ Updates URL to /route?id={tripId}
  │
  ▼
[View Deep Plan] → Navigate to /deep-plan?id={tripId}
```

### 7. Deep Plan Page — Day-by-Day Itinerary

```
/deep-plan loads
  │
  ├─ Restore trip: URL ?id= > tripId > sessionStorage > trip.loadTrip()
  ├─ Mark deepPlanStableRef = true after 2s
  │
  ▼
AI AUTO-FILL (runs once on mount)
  │
  ├─ Scan all destinations for cities with 0 cached cityActivities
  ├─ Skip cities with cached data or nights < 1
  │
  │  FOR EACH CITY NEEDING ACTIVITIES (parallel via Promise.all):
  │  ┌────────────────────────────────────────────────────────────┐
  │  │ POST /api/ai/itinerary-activities                          │
  │  │   ├─ OpenAI GPT-4.1-mini: 7 activities/day + 3 extras     │
  │  │   │   Returns: activities[], dayThemes[], mealCosts,        │
  │  │   │            localTransport rates                         │
  │  │   ├─ Anthropic Claude (fallback)                            │
  │  │   └─ Static generic activities (last resort)                │
  │  │                                                             │
  │  │ cancelledRef checked BEFORE trip.updateDeepPlanData()       │
  │  │   └─ Prevents stale city data from merging into wrong trip  │
  │  └────────────────────────────────────────────────────────────┘
  │
  ├─ Progress overlay: per-city checkmarks
  ├─ Force save 1.5s after all complete (if same tripId)
  │
  ▼
DAYS GENERATION (useMemo, recomputed on dependency change)
  │
  │  For each destination:
  │  ┌────────────────────────────────────────────────────────────┐
  │  │ 1. TRAVEL DAY (blue)                                       │
  │  │    Transport card + "leave by" time + meals                 │
  │  │                                                             │
  │  │ 2. ARRIVAL DAY (violet) — always separate card              │
  │  │    Evening activities (fill free time) + dinner + sleep     │
  │  │    usedArrivalActivities set prevents repeats               │
  │  │                                                             │
  │  │ 3. EXPLORE DAYS (green) — one per night                    │
  │  │    Morning block (start→12:30) + Afternoon (1:15→6:30)     │
  │  │    Activity sources: user places > AI cached > static > fallback │
  │  │    30min travel gaps between activities                     │
  │  │    dayThemes for logical progression                        │
  │  │                                                             │
  │  │ 4. DEPARTURE DAY (orange) — for last leg                   │
  │  │    Morning activities + "leave by" time + transport          │
  │  └────────────────────────────────────────────────────────────┘
  │
  ├─ Overnight flights: arrH < depH detection, "In Transit" days for 36h+
  ├─ Day merge: consecutive same-day cards merged (edge cases only)
  │
  ▼
INTER-ACTIVITY TRAVEL TIMES (background fetch)
  │
  ├─ For consecutive stops: GET /api/directions (walk/transit/drive)
  ├─ Cached per stop-pair in travelFetchedRef
  ├─ User can switch mode via dropdown
  ├─ "Directions" link → opens Google Maps
  │
  ▼
USER INTERACTIONS:
  │
  ├─ Drag-to-reorder activities (Framer Motion Reorder)
  ├─ Add/remove/pin activities
  ├─ Edit start times → re-runs scheduling algorithm
  ├─ Edit meal times
  ├─ Replace transport → opens TransportCompareModal
  ├─ Replace hotel → opens HotelModal
  │
  ▼
AUTO-SAVE (background, 3s debounce)
  │
  ├─ Watches: JSON.stringify(deepPlanData)
  ├─ Blocked until deepPlanStableRef = true (2s)
  ├─ trip.saveTrip() → writes to deep_plan_data column
  │
  ▼
SIDEBAR (DeepPlanSidebar component):
  ├─ Trip Progress (days, cities, nights, activities)
  ├─ Budget breakdown (flights, trains, hotels, attractions, food, transport)
  ├─ Booking Progress ring (SVG, % booked)
  ├─ Booking Checklist (per transport leg + hotel)
  ├─ Weather Forecast (5-day grid via WeatherBadge)
  ├─ Local Info (currency, timezone, emergency, language)
  └─ Quick Links (back to route, print)
```

### 8. Trip Sharing

```
User clicks "Share" on route page
  │
  ▼
POST /api/trips/{id}/share
  │
  ├─ createUserClient(userId) — RLS-scoped
  ├─ Verify trip ownership
  ├─ Generate 16-char UUID token (or return existing)
  ├─ UPDATE trips SET share_token = ... WHERE id = ... AND user_id = ...
  │
  ▼
Returns: { shareUrl: "https://aiezzy.com/shared/{token}" }
  │
  ▼
Recipient opens /shared/{token}
  │
  ├─ SERVER COMPONENT — no auth required
  ├─ generateMetadata() → dynamic OG tags for social previews
  │   Title: "Trip 3 · Paris → Amsterdam — AIEzzy"
  │   Description: "Paris → Amsterdam · 12 Apr 2026 · 5 nights · 2 travelers"
  │
  ├─ getSharedTrip(token) → Supabase query by share_token
  │   ├─ Strips: _deepPlanData, _bookingDocs, _resolvedAirports
  │   ├─ Computes: totalNights, flightCost, trainCost, hotelCost
  │   └─ Returns SharedTrip or null → notFound()
  │
  ▼
SharedTripClient renders read-only view:
  ├─ Timeline with stop pins + transport cards + hotel cards
  ├─ Cost summary sidebar
  └─ CTA: "Plan Your Own Trip" → /signup
```

### 9. Password Reset Flow

```
User clicks "Forgot password" on sign-in page
  │
  ▼
/auth/forgot-password → form with email
  │
  ▼
POST /api/auth/forgot-password
  ├─ Rate limit: 3/email/hr + 10/IP/hr
  ├─ supabase.auth.resetPasswordForEmail(email)
  ├─ Always returns success (prevents email enumeration)
  │
  ▼
User clicks link in email → /auth/reset-callback#access_token=...
  │
  ├─ Extracts tokens from URL hash
  ├─ User enters new password (10+ chars, upper+lower+number)
  │
  ▼
POST /api/auth/reset-password
  ├─ Rate limit: 5/IP/15min
  ├─ validatePassword()
  ├─ supabase.auth.setSession(tokens) → auth.updateUser({ password })
  │
  ▼
Success → redirect to / (sign-in)
```

### 10. Account Deletion

```
User clicks "Delete Account" in /settings
  │
  ▼
DELETE /api/auth/delete-account
  │
  ├─ getServerSession → verify authenticated
  ├─ List all files in booking-docs/{userId}/ (all trip folders)
  ├─ Delete all storage files (best-effort)
  ├─ supabase.auth.admin.deleteUser(userId)
  │   └─ Cascade deletes: profiles, trips, destinations, transport legs
  │
  ▼
Frontend: signOut() → redirect to /
```

---

## API Route Map

| Route | Methods | Auth | Supabase Client | External APIs | Cache |
|-------|---------|------|-----------------|---------------|-------|
| `/api/flights` | GET | Session | Catalog (fetch) | Amadeus + Scraper + Google Geocoding + PostGIS | 30min |
| `/api/trains` | GET | Session | — | Google Directions (transit) | 30min |
| `/api/nearby` | GET | Session | — | Scraper + Google Places | 1hr |
| `/api/places` | GET | Session | — | Google Places Autocomplete + Details | 5min |
| `/api/weather` | GET | Session OR shareToken | — | Open-Meteo | 1hr |
| `/api/resolve-airport` | GET | Session | Catalog (fetch) | Google Places + PostGIS | 24hr |
| `/api/directions` | GET | Session | — | Google Directions | 1hr |
| `/api/place-photo` | GET | Session | — | Google Places | 2hr |
| `/api/ai/suggest` | POST | Session | — | OpenAI / Anthropic | — |
| `/api/ai/itinerary-activities` | POST | Session | — | OpenAI / Anthropic | — |
| `/api/ai/extract-booking` | POST | Session | — | OpenAI Responses API | — |
| `/api/ai/extract-transport` | POST | Session | — | OpenAI Responses API | — |
| `/api/ai/extract-trip` | POST | Session | — | OpenAI Responses API | — |
| `/api/ai/classify-doc` | POST | Session | — | OpenAI Responses API | — |
| `/api/booking-docs` | POST/DELETE/GET | Session | Service (storage) | — | — |
| `/api/trips` | GET/POST | Session | User (RLS) | — | — |
| `/api/trips/[id]` | GET/PUT/DELETE | Session | User (RLS) + Service (storage) | — | — |
| `/api/trips/[id]/share` | POST/DELETE | Session | User (RLS) | — | — |
| `/api/shared/[token]` | GET | **None** | Service | — | — |
| `/api/auth/signup` | POST | Rate limit + Turnstile | Service | Cloudflare Turnstile | — |
| `/api/auth/change-password` | POST | Session + Rate limit | Service | — | — |
| `/api/auth/delete-account` | DELETE | Session | Service | — | — |
| `/api/auth/forgot-password` | POST | Rate limit | Service | — | — |
| `/api/auth/reset-password` | POST | Rate limit | Direct (anon) | — | — |
| `/api/auth/resend-verification` | POST | Rate limit | Direct (anon) | — | — |
| `/api/profile` | GET/PUT | Session | User (RLS) | — | — |
| `/api/admin` | GET | Session + Email whitelist | Service | — | — |
| `/api/admin/migrate` | POST | Session + Email whitelist | Service | — | — |

---

## Security Architecture

```
                           Request
                              │
                    ┌─────────▼──────────┐
                    │    Middleware       │
                    │  (JWT check for    │
                    │   protected pages) │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Security Headers  │
                    │  CSP, HSTS, DENY,  │
                    │  nosniff, referrer │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼──────┐ ┌─────▼─────┐ ┌──────▼───────┐
     │  Auth Routes  │ │ Data APIs │ │ Public Route │
     │               │ │           │ │              │
     │ Rate Limiting │ │getServer  │ │ /shared/     │
     │ + Turnstile   │ │Session()  │ │  [token]     │
     │ + Password    │ │ → 401     │ │ (no auth)    │
     │   Validation  │ │           │ │              │
     └───────────────┘ └─────┬─────┘ └──────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Supabase Client │
                    │                  │
                    │ createUserClient │──── Signed JWT (HS256, 5min TTL)
                    │  (RLS enforced)  │     auth.uid() = user_id
                    │                  │
                    │ createService    │──── Service role key
                    │  Client (admin)  │     Bypasses RLS
                    └──────────────────┘
```

---

## Data Persistence Flow

```
Browser State (TripContext)
  │
  ├─ stateRef.current ← always latest state (useEffect sync)
  │
  ├─ saveTrip() called via:
  │   ├─ Route page auto-save (5s debounce)
  │   ├─ Deep-plan page auto-save (3s debounce)
  │   └─ Manual save / AI auto-fill completion
  │
  ▼
saveMutexRef (promise chain — sequential saves)
  │
  ├─ Read from stateRef.current (not closure)
  ├─ Build payload: from, destinations, transportLegs, deepPlanData, bookingDocs
  │
  ├─ tripId exists? → PUT /api/trips/{id}
  │   ├─ Zod validation
  │   ├─ createUserClient(userId) — RLS
  │   ├─ UPDATE trips SET ... (metadata + deep_plan_data + booking_docs)
  │   ├─ DELETE trip_destinations → INSERT new rows
  │   ├─ DELETE trip_transport_legs → INSERT new rows
  │   └─ Error checking on all 4 DB operations
  │
  └─ No tripId? → POST /api/trips
      ├─ Same validation + RLS
      ├─ INSERT trip → INSERT destinations → INSERT transport legs
      └─ Returns { id } → stored in state + sessionStorage + URL
  │
  ▼
setState: tripId set, isDirty cleared (only if state unchanged during save)
```
