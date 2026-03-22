from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, make_response
import os
import datetime
import requests as http_requests

from data.destinations import DESTINATIONS, get_destination, get_related_destinations, get_destinations_by_continent, get_all_destination_slugs
from data.origins import ORIGINS, get_origin
from data.trip_pairs import TRIP_PAIRS, get_trip_pair, get_pairs_from_origin, get_pairs_to_destination, get_all_pair_slugs
from data.guides import GUIDES, TRAVEL_TOOLS

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'aiezzy-travel-2026')

CURRENT_YEAR = 2026
TODAY = datetime.date.today().isoformat()

# ===== Security Headers =====
@app.after_request
def add_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://www.google-analytics.com; "
        "frame-ancestors 'self'"
    )
    response.headers['Content-Security-Policy'] = csp
    return response


# ===== Homepage - Travel Planner Announcement =====
@app.route('/')
def home():
    return render_template('index.html')


# ===== Waitlist signup endpoint =====
GOOGLE_SHEET_WEBHOOK = os.environ.get('GOOGLE_SHEET_WEBHOOK', 'https://script.google.com/macros/s/AKfycbxyyxHfTwU7bOzbZ2edtE-O4UcHilt81sMMiNUdZD1aQkBK5mDI-GvphU33ZSkwrjbh/exec')

@app.route('/api/waitlist', methods=['POST'])
def waitlist_signup():
    data = request.get_json()
    email = data.get('email', '').strip()
    if not email or '@' not in email:
        return jsonify({'error': 'Invalid email'}), 400

    # Send to Google Sheets via Apps Script webhook
    if GOOGLE_SHEET_WEBHOOK:
        try:
            http_requests.post(GOOGLE_SHEET_WEBHOOK, json={
                'email': email,
                'timestamp': datetime.datetime.now().isoformat(),
                'source': request.headers.get('Referer', 'direct')
            }, timeout=5)
        except Exception:
            pass  # Don't fail the signup if Sheets is down

    return jsonify({'success': True, 'message': 'You\'re on the list!'})


# ===== Static files =====
@app.route('/robots.txt')
def robots():
    return send_from_directory('static', 'robots.txt', mimetype='text/plain')

@app.route('/favicon.png')
def favicon():
    return send_from_directory('static', 'favicon.png')

@app.route('/logo.png')
def logo():
    return send_from_directory('static', 'logo.png')


# ===== SEO Tool Landing Pages =====
# These pages drive 200-400 daily visitors - preserve them during pivot

SEO_PAGES = [
    'ai-image-generator', 'text-to-video', 'pdf-converter',
    'word-to-pdf', 'pdf-to-word', 'excel-to-pdf', 'pdf-to-excel',
    'jpg-to-pdf', 'pdf-to-jpg', 'png-to-pdf', 'pdf-to-png',
    'ppt-to-pdf', 'pdf-to-ppt', 'docx-to-pdf', 'pdf-to-text',
    'compress-pdf', 'merge-pdf', 'split-pdf', 'rotate-pdf',
    'pdf-to-csv', 'csv-to-pdf', 'html-to-pdf', 'pdf-to-html',
    'resize-image', 'compress-image', 'jpeg-to-png', 'png-to-jpeg',
    'webp-to-png', 'webp-to-jpeg', 'heic-to-jpeg', 'gif-to-png',
    'qr-code-generator', 'word-counter', 'video-to-gif', 'mp4-to-mp3',
    'case-converter', 'barcode-generator', 'audio-converter',
    'compress-video', 'compress-audio', 'text-formatter',
    'lorem-ipsum-generator', 'password-generator',
    'trim-audio', 'trim-video', 'change-video-speed',
    'chatgpt-alternative',
]

def create_seo_route(page_slug):
    """Create a route handler for an SEO landing page"""
    def handler():
        template_name = f'landing/{page_slug}.html'
        try:
            return render_template(template_name)
        except Exception:
            return redirect('/')
    handler.__name__ = f'seo_{page_slug.replace("-", "_")}'
    return handler

for slug in SEO_PAGES:
    app.route(f'/{slug}')(create_seo_route(slug))


# ===== Travel Content Pages =====

# Destination cost guides — 50 pages
@app.route('/trip-cost/<slug>')
def trip_cost(slug):
    dest = get_destination(slug)
    if not dest:
        return render_template('404.html'), 404
    related = get_related_destinations(slug, limit=6)
    trip_plans = get_pairs_to_destination(slug)
    return render_template('travel/trip-cost.html',
        dest=dest,
        related=related,
        trip_plans=trip_plans,
        origins=ORIGINS,
        current_year=CURRENT_YEAR,
    )

# City-pair trip plans — 100 pages
@app.route('/trip/<pair_slug>')
def trip_plan(pair_slug):
    pair = get_trip_pair(pair_slug)
    if not pair:
        return render_template('404.html'), 404
    origin = get_origin(pair['origin_slug'])
    dest = get_destination(pair['dest_slug'])
    if not origin or not dest:
        return render_template('404.html'), 404
    other_from_origin = [p for p in get_pairs_from_origin(pair['origin_slug']) if p['slug'] != pair_slug][:6]
    other_to_dest = [p for p in get_pairs_to_destination(pair['dest_slug']) if p['slug'] != pair_slug][:6]
    return render_template('travel/trip-plan.html',
        pair=pair,
        origin=origin,
        dest=dest,
        other_from_origin=other_from_origin,
        other_to_dest=other_to_dest,
        origins=ORIGINS,
        destinations=DESTINATIONS,
        current_year=CURRENT_YEAR,
    )

# Destination hub
@app.route('/destinations')
def destinations():
    destinations_by_continent = get_destinations_by_continent()
    return render_template('travel/destinations.html',
        destinations_by_continent=destinations_by_continent,
        current_year=CURRENT_YEAR,
    )

# Travel tools — 6 pages
@app.route('/tools/<slug>')
def travel_tool(slug):
    tool = TRAVEL_TOOLS.get(slug)
    if not tool:
        return render_template('404.html'), 404
    top_destinations = [DESTINATIONS[s] for s in list(DESTINATIONS.keys())[:5]]
    return render_template('travel/tool.html',
        tool=tool,
        top_destinations=top_destinations,
        current_year=CURRENT_YEAR,
    )

# How-to guides — 15 pages
@app.route('/guide/<slug>')
def guide(slug):
    guide_data = GUIDES.get(slug)
    if not guide_data:
        return render_template('404.html'), 404
    related_destinations = [DESTINATIONS[s] for s in guide_data.get('related_destinations', []) if s in DESTINATIONS]
    return render_template('travel/guide.html',
        guide=guide_data,
        related_destinations=related_destinations,
        current_year=CURRENT_YEAR,
    )

# Blog
BLOG_POSTS = [
    {
        'slug': 'how-ai-is-changing-travel-planning',
        'title': 'How AI Is Changing Travel Planning in 2026',
        'excerpt': 'From itinerary generation to real-time price tracking, AI tools are transforming how we plan trips. Here\'s what\'s different now and what to expect next.',
        'date': '2026-03-20',
        'author': 'Aiezzy Team',
        'category': 'Travel Tech',
        'meta_description': 'Discover how AI is revolutionizing travel planning in 2026 — from smart itineraries to real-time pricing.',
        'keywords': ['ai travel planning', 'travel technology 2026', 'ai trip planner'],
        'content': '''
<p>Travel planning used to mean juggling a dozen browser tabs — one for flights, another for hotels, a spreadsheet for budgeting, and maybe a shared Google Doc for the itinerary. In 2026, artificial intelligence is collapsing all of that into a single, intelligent experience.</p>

<h2>The Old Way vs. The AI Way</h2>
<p>Traditional trip planning requires you to be your own travel agent. You search for flights on Skyscanner, compare hotels on Booking.com, estimate meal costs by Googling "average food cost in Paris," and manually piece together an itinerary using blog posts and YouTube videos. A week-long European trip can take 15-20 hours of planning.</p>
<p>AI trip planners like Aiezzy are changing this by doing what humans do — but faster and with access to real-time data. Instead of searching across ten platforms, you describe your trip once: "NYC to Paris and Rome, 10 days, mid-range budget, 2 travelers." The AI handles the rest — finding flights, matching hotels to your dates, calculating transfer costs between airports and hotels, estimating daily meal budgets by neighborhood, and building a minute-by-minute itinerary.</p>

<h2>Real Prices, Not Guesses</h2>
<p>One of the biggest limitations of early AI travel tools was their reliance on outdated training data. Ask ChatGPT how much a flight to Tokyo costs and you might get a number from 2023. Modern AI trip planners solve this by integrating with live pricing APIs — pulling real flight prices from aggregators, current hotel rates, and up-to-date activity costs.</p>
<p>This matters because travel costs fluctuate dramatically. A flight from New York to London might cost $380 in January but $920 in July. An AI planner that understands seasonality and pulls live data gives you a budget you can actually trust.</p>

<h2>Doorstep-to-Doorstep Planning</h2>
<p>Perhaps the most transformative feature of AI travel planning is the shift from "destination planning" to "doorstep-to-doorstep planning." Traditional tools help you once you arrive. AI planners account for every segment of travel: the Uber from your house to the airport, the time through security, the flight itself, the train from the airport to your hotel, the walking route from your hotel to the restaurant.</p>
<p>This level of detail means you know exactly what your trip costs — not just the big-ticket items, but the $30 airport transfer, the $12 metro card, and the $8 museum entry fee that add up to hundreds of dollars over a week.</p>

<h2>What to Expect Next</h2>
<p>The AI travel space is evolving quickly. We expect to see real-time rebooking suggestions (your flight is delayed, here's an alternative), collaborative trip planning with AI mediation (it finds compromises when travel partners disagree), and predictive pricing that tells you the optimal booking window for your specific route and dates.</p>
<p>At Aiezzy, we're building toward all of this — starting with the fundamentals: real prices, real schedules, and a complete picture of what your trip actually costs.</p>
''',
    },
    {
        'slug': 'cheapest-countries-to-visit-2026',
        'title': 'The 15 Cheapest Countries to Visit in 2026',
        'excerpt': 'Stretch your travel budget further with these affordable destinations where you can live well on $30-60 per day.',
        'date': '2026-03-18',
        'author': 'Aiezzy Team',
        'category': 'Budget Travel',
        'meta_description': 'The 15 cheapest countries to visit in 2026 — affordable destinations where your budget goes furthest.',
        'keywords': ['cheapest countries to visit', 'budget travel 2026', 'affordable travel destinations'],
        'content': '''
<p>You don't need a massive budget to see the world. These 15 countries offer incredible experiences at a fraction of what you'd spend in Western Europe or North America. We've calculated daily costs including accommodation, meals, transport, and activities.</p>

<h2>1. Vietnam — $25-40/day</h2>
<p>Vietnam remains one of the best-value destinations on Earth. A bowl of pho costs $1.50, a comfortable hotel room runs $15-25, and domestic flights between Hanoi and Ho Chi Minh City are under $40. From the limestone karsts of Ha Long Bay to the lantern-lit streets of Hoi An, Vietnam delivers extraordinary experiences at budget prices.</p>

<h2>2. Indonesia (Bali & Beyond) — $30-50/day</h2>
<p>While Bali's tourist zones have crept up in price, the island still offers great value — especially in Ubud and the north coast. Beyond Bali, islands like Lombok, Flores, and Java offer even lower prices. Budget travelers can find guesthouses for $10-15, eat local meals for $2-3, and rent a scooter for $5/day.</p>

<h2>3. Thailand — $30-50/day</h2>
<p>Thailand's infrastructure for travelers is unmatched in Southeast Asia. Bangkok's street food scene lets you eat incredibly well for $3-5 per meal, night trains between major cities cost $15-25, and islands like Koh Lanta offer beach bungalows for $20/night. The country's temple complexes, night markets, and cooking classes make it a bucket-list destination at hostel prices.</p>

<h2>4. India — $20-40/day</h2>
<p>India is the ultimate budget travel destination for those willing to embrace its intensity. A thali meal costs $1-2, train tickets between major cities are $5-15, and budget hotels start at $8-12. From the Taj Mahal to the backwaters of Kerala, India packs more diversity into one country than most continents.</p>

<h2>5. Mexico — $35-55/day</h2>
<p>Mexico offers the rare combination of proximity to the US, excellent food, rich culture, and genuinely low prices. Street tacos run $0.50-1 each, comfortable Airbnbs in cities like Oaxaca and Guanajuato cost $25-35/night, and domestic flights are surprisingly cheap on Volaris and VivaAerobus.</p>

<h2>More Affordable Destinations</h2>
<p>Rounding out our list: <strong>Cambodia</strong> ($25-35/day), <strong>Nepal</strong> ($20-35/day), <strong>Bolivia</strong> ($25-40/day), <strong>Georgia</strong> ($30-45/day), <strong>Morocco</strong> ($30-50/day), <strong>Portugal</strong> ($45-65/day), <strong>Colombia</strong> ($30-50/day), <strong>Peru</strong> ($30-50/day), <strong>Sri Lanka</strong> ($25-40/day), and <strong>Egypt</strong> ($25-45/day).</p>

<p>Use our <a href="/tools/trip-cost-calculator">trip cost calculator</a> to estimate the total cost of your trip to any of these destinations, including flights from your home city.</p>
''',
    },
    {
        'slug': 'first-trip-to-europe-mistakes',
        'title': '10 Mistakes First-Time Europe Travelers Make (And How to Avoid Them)',
        'excerpt': 'Planning your first European trip? Avoid these common pitfalls that waste money, time, and energy.',
        'date': '2026-03-15',
        'author': 'Aiezzy Team',
        'category': 'Travel Tips',
        'meta_description': '10 common mistakes first-time Europe travelers make and practical tips to avoid them.',
        'keywords': ['first trip to europe', 'europe travel mistakes', 'europe travel tips'],
        'content': '''
<p>Europe is the most popular international destination for American travelers, but first-timers consistently make the same mistakes. Here's what to watch out for — and how to plan smarter.</p>

<h2>1. Trying to See Too Many Countries</h2>
<p>The most common mistake is cramming 6-8 countries into a 2-week trip. You'll spend more time on trains and at airports than actually experiencing the places you visit. A better approach: pick 2-3 countries (or even 2-3 cities) and explore them deeply. You'll save money on transport, reduce travel fatigue, and actually remember the trip.</p>

<h2>2. Only Visiting Capital Cities</h2>
<p>Paris, London, and Rome are incredible — but they're also the most expensive and most crowded cities in Europe. Some of the continent's best experiences are in smaller cities: Porto instead of Lisbon, Lyon instead of Paris, Bologna instead of Rome. These second cities often have better food, friendlier locals, and half the prices.</p>

<h2>3. Not Budgeting for "Hidden" Costs</h2>
<p>First-timers budget for flights and hotels but forget about airport transfers ($15-40 per city), city taxes ($2-7/night), luggage storage ($8-12), museum tickets ($15-25 each), and the constant small expenses of travel. A good rule of thumb: add 30% to whatever you think the trip will cost.</p>

<h2>4. Exchanging Money at the Airport</h2>
<p>Airport currency exchange booths charge 7-12% markups. Instead, use a no-foreign-transaction-fee credit card (like Chase Sapphire or Capital One Venture) for purchases and withdraw cash from ATMs in the city. You'll save hundreds over a two-week trip.</p>

<h2>5. Skipping Travel Insurance</h2>
<p>A medical emergency abroad without insurance can cost $10,000-50,000+. Good travel insurance costs $50-100 for a two-week trip and covers medical emergencies, trip cancellation, lost luggage, and delays. It's not optional — it's essential.</p>

<h2>6. Not Validating Train Tickets</h2>
<p>In many European countries (Italy, France, Belgium), you must validate your train ticket at a small machine on the platform before boarding. Riding with an unvalidated ticket can result in a fine of €50-200, even if you bought the ticket legitimately.</p>

<h2>7. Eating Near Tourist Attractions</h2>
<p>Restaurants within sight of major landmarks charge 2-3x normal prices for mediocre food. Walk just 2-3 blocks away from any major attraction and you'll find better food at local prices. Use Google Maps to find restaurants with 4.3+ ratings and 200+ reviews — those are the local favorites.</p>

<h2>8. Overpacking</h2>
<p>You don't need a checked bag for a European trip. Pack one carry-on and a personal item. You'll move faster, avoid baggage fees ($30-60 per flight on budget airlines), and never wait at luggage carousels. European cities have laundromats everywhere — do a wash mid-trip instead of packing 14 outfits.</p>

<h2>9. Ignoring Free Walking Tours</h2>
<p>Almost every major European city has free walking tours (tip-based) that are genuinely excellent. They're the best way to orient yourself in a new city, learn the history, and get restaurant recommendations from a local guide. Book them on the first day in each city.</p>

<h2>10. Not Booking Attractions in Advance</h2>
<p>The Vatican, Uffizi, Alhambra, Anne Frank House, and many other top attractions require advance booking — sometimes weeks ahead. Check booking requirements for every attraction on your list before you leave. Showing up without a reservation often means missing out entirely.</p>

<p>Planning your first European trip? Our <a href="/guide/how-to-plan-a-trip-to-europe">complete Europe planning guide</a> walks you through every step, from choosing destinations to booking flights.</p>
''',
    },
    {
        'slug': 'best-time-to-book-flights-2026',
        'title': 'The Best Time to Book Flights in 2026 — Data-Backed Guide',
        'excerpt': 'When should you book your flights for the cheapest prices? We break down the data by destination, season, and booking window.',
        'date': '2026-03-12',
        'author': 'Aiezzy Team',
        'category': 'Travel Tips',
        'meta_description': 'When to book flights for the cheapest prices in 2026 — optimal booking windows by destination and season.',
        'keywords': ['best time to book flights', 'cheap flights 2026', 'when to book flights'],
        'content': '''
<p>Flight prices follow predictable patterns. Understanding when to book — and when to fly — can save you 20-40% on airfare. Here's what the data shows for 2026.</p>

<h2>The General Rule: 1-3 Months Ahead</h2>
<p>For domestic US flights, the sweet spot is 1-3 months before departure. For international flights, it's 2-8 months. Booking too early (6+ months for domestic) or too late (under 2 weeks) almost always costs more.</p>

<h2>By Destination Type</h2>
<p><strong>US Domestic:</strong> Book 28-60 days ahead. Tuesday and Wednesday departures are typically 15-20% cheaper than Friday/Sunday flights.</p>
<p><strong>Europe from the US:</strong> Book 2-6 months ahead. The cheapest months to fly are January, February, and November. Peak summer (June-August) prices are 60-100% higher.</p>
<p><strong>Asia from the US:</strong> Book 3-6 months ahead. Prices are most stable for this corridor, but Chinese New Year and cherry blossom season (late March-April) drive spikes.</p>
<p><strong>Caribbean/Mexico:</strong> Book 1-3 months ahead. Avoid booking during hurricane season (June-November) unless you're comfortable with the risk — prices are low but so is the weather predictability.</p>

<h2>The Best Days to Fly</h2>
<p>Tuesday, Wednesday, and Saturday are consistently the cheapest days to depart. Friday and Sunday are the most expensive. For international flights, midweek departures can save $50-150 per ticket.</p>

<h2>Fare Tracking Tools</h2>
<p>Set up price alerts on Google Flights for your route 4-6 months before your trip. The "price graph" feature shows you historical pricing and helps you identify whether current prices are above or below average. Hopper and Kayak also offer predictive pricing, but Google Flights remains the most reliable for real-time data.</p>

<p>Want to see real flight costs for your specific route? Check our <a href="/destinations">destination guides</a> for current pricing estimates.</p>
''',
    },
    {
        'slug': 'travel-budget-templates-2026',
        'title': 'Travel Budget Templates — Plan Your Trip Finances Like a Pro',
        'excerpt': 'Free budget frameworks for every type of trip — from weekend getaways to month-long international adventures.',
        'date': '2026-03-10',
        'author': 'Aiezzy Team',
        'category': 'Budget Travel',
        'meta_description': 'Free travel budget templates and frameworks to plan your trip finances. Covers all trip types and budgets.',
        'keywords': ['travel budget template', 'trip budget planner', 'vacation budget calculator'],
        'content': '''
<p>A trip without a budget is just a series of expensive surprises. Whether you're planning a weekend road trip or a month in Southeast Asia, having a clear financial framework prevents overspending and reduces stress.</p>

<h2>The 40/30/20/10 Rule</h2>
<p>A simple framework that works for most trips:</p>
<ul>
<li><strong>40% — Accommodation:</strong> Hotels, Airbnbs, or hostels. This is typically your biggest expense.</li>
<li><strong>30% — Transport:</strong> Flights, trains, buses, taxis, car rentals, and fuel.</li>
<li><strong>20% — Food & Drink:</strong> Restaurants, groceries, coffee, and nightlife.</li>
<li><strong>10% — Activities & Extras:</strong> Museums, tours, shopping, tips, and unexpected costs.</li>
</ul>

<h2>Budget by Destination Type</h2>
<p><strong>Western Europe/Japan/Australia:</strong> Budget $100-150/day (budget), $200-300/day (mid-range), $400+/day (luxury).</p>
<p><strong>Eastern Europe/South America:</strong> Budget $40-70/day (budget), $100-150/day (mid-range), $250+/day (luxury).</p>
<p><strong>Southeast Asia/India:</strong> Budget $25-45/day (budget), $60-100/day (mid-range), $150+/day (luxury).</p>

<h2>Hidden Costs to Include</h2>
<p>Most travelers forget these line items: travel insurance ($50-100 per trip), visa fees ($0-160), airport parking or transport ($20-80), luggage fees on budget airlines ($30-60 per flight), phone/data costs ($20-40 for an eSIM), and tips/service charges (varies by culture).</p>

<h2>The Emergency Buffer</h2>
<p>Always add a 15-20% buffer to your total budget. Missed connections, medical issues, weather changes, and "I can't leave without trying that restaurant" moments are inevitable. A buffer turns potential crises into minor adjustments.</p>

<p>For destination-specific budget breakdowns, check our <a href="/destinations">destination cost guides</a> covering 50+ cities worldwide with daily costs at every budget level.</p>
''',
    },
]

@app.route('/blog')
def blog_index():
    return render_template('blog/index.html',
        posts=BLOG_POSTS,
        current_year=CURRENT_YEAR,
    )

@app.route('/blog/<slug>')
def blog_post(slug):
    post = next((p for p in BLOG_POSTS if p['slug'] == slug), None)
    if not post:
        return render_template('404.html'), 404
    recent_posts = [p for p in BLOG_POSTS if p['slug'] != slug][:3]
    return render_template('blog/post.html',
        post=post,
        recent_posts=recent_posts,
        current_year=CURRENT_YEAR,
    )


# ===== About / Info pages =====
@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/tools')
def tools_page():
    return render_template('tools.html')


# ===== Dynamic Sitemap =====
@app.route('/sitemap.xml')
def sitemap():
    urls = []

    # Homepage
    urls.append({'loc': 'https://aiezzy.com/', 'lastmod': TODAY, 'changefreq': 'daily', 'priority': '1.0'})

    # Static pages
    urls.append({'loc': 'https://aiezzy.com/about', 'lastmod': TODAY, 'changefreq': 'monthly', 'priority': '0.6'})
    urls.append({'loc': 'https://aiezzy.com/tools', 'lastmod': TODAY, 'changefreq': 'weekly', 'priority': '0.7'})
    urls.append({'loc': 'https://aiezzy.com/destinations', 'lastmod': TODAY, 'changefreq': 'weekly', 'priority': '0.9'})
    urls.append({'loc': 'https://aiezzy.com/blog', 'lastmod': TODAY, 'changefreq': 'weekly', 'priority': '0.7'})

    # Destination cost guide pages (high priority — primary SEO content)
    for slug in get_all_destination_slugs():
        urls.append({
            'loc': f'https://aiezzy.com/trip-cost/{slug}',
            'lastmod': TODAY,
            'changefreq': 'weekly',
            'priority': '0.9',
        })

    # City-pair trip plan pages
    for slug in get_all_pair_slugs():
        urls.append({
            'loc': f'https://aiezzy.com/trip/{slug}',
            'lastmod': TODAY,
            'changefreq': 'weekly',
            'priority': '0.8',
        })

    # Travel tool pages
    for slug in TRAVEL_TOOLS:
        urls.append({
            'loc': f'https://aiezzy.com/tools/{slug}',
            'lastmod': TODAY,
            'changefreq': 'monthly',
            'priority': '0.8',
        })

    # Guide pages
    for slug in GUIDES:
        urls.append({
            'loc': f'https://aiezzy.com/guide/{slug}',
            'lastmod': TODAY,
            'changefreq': 'monthly',
            'priority': '0.8',
        })

    # Blog posts
    for post in BLOG_POSTS:
        urls.append({
            'loc': f'https://aiezzy.com/blog/{post["slug"]}',
            'lastmod': post['date'],
            'changefreq': 'monthly',
            'priority': '0.7',
        })

    # Legacy SEO tool pages
    for slug in SEO_PAGES:
        urls.append({
            'loc': f'https://aiezzy.com/{slug}',
            'lastmod': '2026-03-15',
            'changefreq': 'weekly',
            'priority': '0.8',
        })

    response = make_response(render_template('sitemap.xml', urls=urls))
    response.headers['Content-Type'] = 'application/xml'
    return response


# ===== Error handlers =====
@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)
