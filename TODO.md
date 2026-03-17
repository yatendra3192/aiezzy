# AIEzzy — Market Launch TODO

## Phase 1 — MVP Fix ✅ COMPLETE
- [x] Password reset / forgot password flow
- [x] Email verification on signup
- [x] User profile & settings page (edit name, change password, delete account)
- [x] Error boundaries + retry logic for failed API calls
- [x] "Prices are estimates" disclaimers on scraped flight/train/hotel prices
- [x] Google Analytics integration (G-XQEC68F0S9)
- [x] SEO: Open Graph tags, Twitter Cards, sitemap.xml, robots.txt
- [x] Train price disclaimer (currently estimated at €0.12/km, not real)

## Phase 2 — Viral Features (3 weeks)
- [ ] Trip sharing via link (public read-only view)
- [ ] PDF/image export of itinerary
- [ ] Map visualization on /route page (visual journey path)
- [ ] Multi-currency selector + real-time exchange rates
- [ ] Calendar export (Google Calendar / Apple Calendar .ics)
- [ ] Hotel filters (amenities, star rating, price range)
- [ ] Flight filters (airline, departure time range, stops)

## Phase 3 — Monetization (partial)
- [x] Affiliate booking links (Skyscanner, Booking.com, IRCTC/Trainline)
- [ ] Premium plan with Stripe/Razorpay (₹299/month) — needs account setup
- [x] AI trip suggestions (Claude API + fallback templates)
- [ ] Price alerts ("notify me when Mumbai→Paris drops below ₹50K") — needs email service
- [x] Trip templates (8 curated: Goa, Rajasthan, Europe, Bali, Japan, Kerala, Dubai, Himachal)
- [ ] Travel insurance integration — needs partnership
- [ ] Sponsored/featured hotel placements — needs partnership

## Phase 4 — Delight ✅ COMPLETE
- [x] Weather forecast per destination (Open-Meteo API, no key needed)
- [x] Visa requirements checker (34 countries, Indian passport)
- [x] Packing list generator (weather-adaptive, 6 categories, persistent checkboxes)
- [x] Activity recommendations per city (30 cities, Google Maps links)
- [x] Budget tracker (visual bar chart, percentage breakdown)
- [x] Trip notes/comments per destination
- [x] Trip duplicate/copy functionality

## Phase 5 — Technical Quality
- [ ] Accessibility audit + WCAG fixes (aria-labels, screen reader, focus indicators)
- [ ] PWA + offline mode (Service Worker, cache trip data locally)
- [ ] i18n (English + Hindi for India market, expandable)
- [ ] Sentry/error tracking integration
- [ ] Performance monitoring
- [ ] Amadeus production API (replace test environment)
- [ ] Real-time hotel availability (not just scraper snapshots)

## Revenue Model Options
- Affiliate commission: Booking.com, Skyscanner, MakeMyTrip (5-15%)
- Premium plan: ₹299/month (unlimited trips, PDF, price alerts, AI)
- Freemium: 2 trips/month free, unlimited paid
- Travel insurance: ₹500-2000 commission per policy
- Sponsored hotels: featured placement for partners
