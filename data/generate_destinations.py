"""Generate destinations.py with 50 travel destinations."""
import os

# (slug, city, country, continent, emoji, currency, symbol, language,
#  budget_flight, mid_flight, lux_flight, budget_daily, mid_daily, lux_daily, avg_days,
#  best_months, avoid_months, hero, overview,
#  attractions: list of (name, cost, time, tip),
#  neighborhoods: list of (name, vibe, level),
#  tips: list of str,
#  faq: list of (q, a))

CITIES = []

def add(slug, city, country, continent, emoji, curr, sym, lang,
        bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
        attrs, hoods, tips, faqs):
    CITIES.append((slug, city, country, continent, emoji, curr, sym, lang,
                   bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
                   attrs, hoods, tips, faqs))

# ===== EUROPE =====
add('paris', 'Paris', 'France', 'Europe', '\U0001f5fc', 'EUR', '\u20ac', 'French',
    450, 800, 3500, 85, 200, 550, 5,
    ['Apr','May','Jun','Sep','Oct'], ['Aug'],
    'The City of Light beckons with iconic landmarks, world-class cuisine, and timeless romance along the Seine.',
    'Paris captivates visitors with elegant boulevards, centuries-old architecture, and unmatched cultural offerings. From the Eiffel Tower to the Louvre masterpieces, every corner tells a story. Neighborhoods each have distinct personalities: the bohemian charm of Montmartre, the intellectual energy of the Latin Quarter, and the fashionable polish of Saint-Germain. Parisian cuisine ranges from buttery croissants at corner boulangeries to Michelin-starred dining rooms. The city rewards walkers with hidden courtyards, Seine-side bookstalls, and cafe terraces perfect for people-watching.',
    [('Eiffel Tower',26,'2-3 hours','Book skip-the-line tickets online 2 months ahead'),
     ('Louvre Museum',22,'3-4 hours','Go Wednesday or Friday evening for fewer crowds'),
     ('Notre-Dame Cathedral',0,'1-2 hours','Under restoration, check reopening status'),
     ('Montmartre & Sacre-Coeur',0,'2-3 hours','Visit early morning to beat tour groups'),
     ("Musee d'Orsay",16,'2-3 hours','Free on first Sunday of each month')],
    [('Le Marais','Historic, trendy, great food scene','mid'),
     ('Latin Quarter','Student area, affordable eats, bookshops','budget'),
     ('Saint-Germain','Upscale cafes, art galleries, boutiques','luxury')],
    ['Get Paris Museum Pass (2-day) if visiting 3+ museums','Buy Navigo Easy card for metro instead of singles','Eat at boulangeries for lunch under 8 euros','Many museums free first Sunday of month','Walk one block from landmarks for 40% cheaper restaurants'],
    [('How much does a 7-day trip to Paris cost?','Budget: $1,045-$1,850. Mid-range: $2,200-$3,200. Luxury: $5,500+. Plus flights $450-$3,500.'),
     ('What is the cheapest month to visit Paris?','January and February offer hotel prices 30-40% below summer peaks. November is also affordable.'),
     ('Is Paris expensive vs other European cities?','Moderately - cheaper than London or Zurich, pricier than Barcelona or Prague. Budget travelers manage on $85-100/day.')])

add('london', 'London', 'United Kingdom', 'Europe', '\U0001f1ec\U0001f1e7', 'GBP', '\u00a3', 'English',
    500, 900, 4000, 100, 230, 600, 5,
    ['May','Jun','Jul','Sep'], ['Dec','Jan'],
    'A global capital where centuries of royal history meet cutting-edge culture, theater, and culinary innovation.',
    'London is a city of contrasts where medieval towers stand beside glass skyscrapers. The West End rivals Broadway for world-class theater, while neighborhoods like Shoreditch and Brixton pulse with street art and diverse food scenes. Free museums including the British Museum, Tate Modern, and Natural History Museum make culture accessible to every budget. The city\'s parks offer green escapes, and the pub culture provides a uniquely British social experience. From Borough Market\'s artisan food stalls to haute cuisine in Mayfair, London\'s dining scene spans every cuisine and price point.',
    [('British Museum',0,'3-4 hours','Free entry, arrive at opening for Egyptian galleries'),
     ('Tower of London',33,'2-3 hours','Book online, see Crown Jewels first thing'),
     ('Buckingham Palace',30,'2 hours','Changing of the Guard at 11am, arrive 10:15am'),
     ('Tate Modern',0,'2-3 hours','Free, top floor has best Thames views'),
     ('Westminster Abbey',27,'1-2 hours','Evensong services are free and atmospheric')],
    [('Shoreditch','Street art, vintage shops, nightlife','mid'),
     ('Camden','Markets, alternative culture, live music','budget'),
     ('Kensington','Museums, elegant streets, upscale dining','luxury')],
    ['Many top museums are completely free','Get an Oyster card - saves 50% vs single tickets','Eat at markets like Borough or Camden for cheap meals','Book West End shows on TKTS for same-day discounts','Visit pubs for affordable lunch specials under 10 pounds'],
    [('How much does a week in London cost?','Budget: $1,200-$2,000. Mid-range: $2,500-$3,800. Luxury: $6,000+. Plus flights $500-$4,000.'),
     ('Best time to visit London?','May-September for warm weather. December for Christmas markets. Avoid January-February unless you want cheapest prices.'),
     ('Is London more expensive than Paris?','Yes, London is typically 15-25% more expensive, especially for accommodation and dining.')])

add('rome', 'Rome', 'Italy', 'Europe', '\U0001f3db\ufe0f', 'EUR', '\u20ac', 'Italian',
    480, 820, 3600, 80, 190, 520, 5,
    ['Apr','May','Sep','Oct'], ['Aug'],
    'The Eternal City layers ancient ruins, Renaissance art, and la dolce vita into one unforgettable destination.',
    'Rome is an open-air museum where every street reveals layers of history spanning nearly 3,000 years. The Colosseum and Roman Forum transport you to the ancient empire, while Vatican City houses Michelangelo\'s Sistine Chapel ceiling. But Rome is equally about present-day pleasures: morning espresso at a neighborhood bar, long lunches over handmade pasta, and evening strolls through piazzas alive with street musicians. The Trastevere neighborhood offers authentic Roman dining, while the Spanish Steps area combines shopping with people-watching.',
    [('Colosseum',18,'2-3 hours','Book combined Forum ticket, skip-the-line essential'),
     ('Vatican Museums & Sistine Chapel',17,'3-4 hours','Book online, go Friday evening for no crowds'),
     ('Pantheon',0,'1 hour','Free entry, best visited early morning'),
     ('Trevi Fountain',0,'30 min','Visit at dawn for photos without crowds'),
     ('Roman Forum',18,'2-3 hours','Included with Colosseum ticket, explore at sunset')],
    [('Trastevere','Cobblestone charm, authentic restaurants, nightlife','mid'),
     ('Monti','Bohemian neighborhood, vintage shops, cafes','budget'),
     ('Via Veneto','Luxury hotels, upscale dining, glamour','luxury')],
    ['Roma Pass saves money on transport and 2 museum entries','Eat at trattorias away from major sights for authentic prices','Free water from nasoni fountains throughout the city','Visit churches for free art including Caravaggio paintings','Lunch aperitivo buffets offer full meals with drink purchase'],
    [('How much is a trip to Rome for 5 days?','Budget: $800-$1,400. Mid-range: $1,700-$2,500. Luxury: $4,500+. Plus flights $480-$3,600.'),
     ('When is cheapest to visit Rome?','November-March (except Christmas/New Year) offers lowest prices. January is the cheapest month overall.'),
     ('Can you do Rome on a budget?','Absolutely. With free churches, fountains, and piazzas, plus cheap street food, budget travelers spend $80-100/day.')])

add('barcelona', 'Barcelona', 'Spain', 'Europe', '\U0001f1ea\U0001f1f8', 'EUR', '\u20ac', 'Spanish',
    450, 780, 3400, 75, 180, 500, 5,
    ['May','Jun','Sep','Oct'], ['Aug'],
    'Where Gaudi\'s surreal architecture meets Mediterranean beaches, tapas bars, and a vibrant nightlife scene.',
    'Barcelona blends beach culture with world-class architecture unlike any city in Europe. Gaudi\'s Sagrada Familia remains the most visited monument in Spain, while his Park Guell offers mosaic-covered terraces with panoramic city views. Las Ramblas buzzes with street performers, while the Gothic Quarter hides medieval squares and trendy cocktail bars. The city\'s food scene ranges from traditional pintxos bars to El Bulli-inspired modernist cuisine. Beach neighborhoods like Barceloneta let you swim in the morning and explore museums in the afternoon.',
    [('Sagrada Familia',26,'2 hours','Book 2+ months ahead, morning light best for photos'),
     ('Park Guell',10,'1-2 hours','Book timed entry, go early or late afternoon'),
     ('Gothic Quarter',0,'2-3 hours','Free to wander, join a free walking tour'),
     ('La Boqueria Market',0,'1-2 hours','Go before 11am to avoid tourist crowds'),
     ('Casa Batllo',35,'1-2 hours','Evening visits include rooftop with music')],
    [('Gothic Quarter','Medieval streets, hidden squares, cocktail bars','mid'),
     ('Gracia','Local feel, artsy vibe, affordable restaurants','budget'),
     ('Eixample','Modernist architecture, upscale shopping, fine dining','luxury')],
    ['T-Casual 10-ride metro pass saves vs single tickets','Eat menu del dia lunch specials for 10-15 euros','Free beach access along 4.5km of coastline','Many museums free first Sunday of month','Avoid Las Ramblas restaurants - walk 2 blocks for half the price'],
    [('How much is a trip to Barcelona?','Budget: $750-$1,300. Mid-range: $1,600-$2,400. Luxury: $4,200+. Plus flights $450-$3,400.'),
     ('Best months to visit Barcelona?','May, June, September, and October offer warm weather without extreme heat or peak crowds.'),
     ('Is Barcelona cheaper than Paris?','Yes, Barcelona is 20-30% cheaper overall, especially for dining and nightlife.')])

add('amsterdam', 'Amsterdam', 'Netherlands', 'Europe', '\U0001f337', 'EUR', '\u20ac', 'Dutch',
    470, 810, 3500, 90, 210, 560, 4,
    ['Apr','May','Jun','Sep'], ['Dec','Jan'],
    'Canal-lined streets, world-class museums, cycling culture, and a famously open-minded spirit define this Dutch capital.',
    'Amsterdam charms with its 17th-century canal ring, now a UNESCO World Heritage site, lined with narrow gabled houses and crossed by over 1,500 bridges. The city\'s museum district houses the Rijksmuseum, Van Gogh Museum, and Stedelijk Museum within walking distance. Cycling is the primary transport - there are more bikes than residents. The Jordaan neighborhood offers boutique galleries and brown cafes, while De Pijp\'s Albert Cuyp Market showcases the city\'s multicultural food scene. Spring brings tulips in bloom, making April-May especially photogenic.',
    [('Rijksmuseum',22,'2-3 hours','Book online, Vermeer and Rembrandt galleries essential'),
     ('Anne Frank House',16,'1-2 hours','Book exactly 6 weeks ahead - sells out instantly'),
     ('Van Gogh Museum',20,'2 hours','Timed entry required, Friday evenings less crowded'),
     ('Canal Cruise',15,'1 hour','Evening cruises most atmospheric, BYO cheaper'),
     ('Vondelpark',0,'1-2 hours','Free, great for cycling and picnics')],
    [('Jordaan','Galleries, brown cafes, canal views','mid'),
     ('De Pijp','Market area, diverse food, young crowd','budget'),
     ('Canal Ring','Historic luxury, boutique hotels','luxury')],
    ['I amsterdam City Card covers transport and museums','Rent a bike for 10-12 euros/day instead of taxis','Eat at Albert Cuyp Market for cheap Dutch street food','Free ferry to Amsterdam Noord for hip restaurants','Supermarket chain Albert Heijn has great prepared meals for 4-6 euros'],
    [('How much does Amsterdam cost for 4 days?','Budget: $700-$1,100. Mid-range: $1,500-$2,200. Luxury: $4,000+. Plus flights $470-$3,500.'),
     ('Is Amsterdam expensive?','Yes, it is one of Europe\'s pricier cities. Hotels especially are expensive. Budget travelers need $90-110/day.'),
     ('When to visit Amsterdam?','April-May for tulips and pleasant weather. June-August for festivals. Avoid winter unless you enjoy cozy indoor culture.')])

# More compact entries for remaining cities
for slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview, attrs, hoods, tips, faqs in [
    ('prague', 'Prague', 'Czech Republic', 'Europe', '\U0001f3f0', 'CZK', 'Kc', 'Czech',
     420, 720, 3200, 60, 140, 400, 4,
     ['Apr','May','Sep','Oct'], ['Jul','Aug'],
     'A fairy-tale city of Gothic spires, cobblestone lanes, and some of Europe\'s best beer at unbeatable prices.',
     'Prague offers stunning medieval and Baroque architecture at prices far below Western Europe. Charles Bridge, Prague Castle, and the Astronomical Clock draw millions, but the city\'s real charm lies in hidden beer gardens, jazz clubs, and neighborhoods like Vinohrady and Zizkov where locals outnumber tourists. Czech beer costs less than water in many pubs, and hearty dishes like svickova and trdelnik fuel long days of exploration. The city is compact and walkable, with excellent public transport.',
     [('Prague Castle',15,'3 hours','Go at opening to avoid tour groups'),('Charles Bridge',0,'1 hour','Cross at dawn for empty bridge photos'),('Old Town Square & Clock',0,'30 min','Watch astronomical clock on the hour'),('Petrin Hill',5,'2 hours','Funicular up, walk down through gardens'),('Jewish Quarter',14,'2 hours','Combination ticket covers all synagogues')],
     [('Vinohrady','Local cafes, parks, residential charm','mid'),('Zizkov','Dive bars, budget eats, authentic Prague','budget'),('Mala Strana','Baroque palaces, riverside dining','luxury')],
     ['Beer is cheaper than water - enjoy at local hospodas','Use public transport pass for unlimited trams and metro','Eat at local kantyna cafeterias for meals under $5','Free walking tours cover Old Town and Castle District','Avoid exchanging money at tourist-area booths - use ATMs'],
     [('How much for a week in Prague?','Budget: $600-$1,000. Mid-range: $1,200-$1,800. Luxury: $3,500+. Plus flights $420-$3,200.'),('Is Prague cheap?','Yes, one of Europe\'s best-value capitals. Budget travelers spend $60-80/day comfortably.'),('Best time for Prague?','Spring (April-May) and autumn (September-October) for mild weather and fewer tourists.')]),

    ('istanbul', 'Istanbul', 'Turkey', 'Europe', '\U0001f54c', 'TRY', 'TL', 'Turkish',
     500, 850, 3800, 55, 130, 420, 5,
     ['Apr','May','Sep','Oct','Nov'], ['Jul','Aug'],
     'Where East meets West across the Bosphorus, with Ottoman palaces, bustling bazaars, and legendary cuisine.',
     'Istanbul straddles two continents, blending the grandeur of the Ottoman Empire with modern Turkish culture. The Hagia Sophia and Blue Mosque face each other across Sultanahmet Square, while the Grand Bazaar offers 4,000 shops under vaulted ceilings. Turkish cuisine is a highlight: kebabs, mezes, baklava, and strong Turkish coffee. The Bosphorus waterfront offers ferry rides between Europe and Asia for pennies. Neighborhoods like Karakoy and Kadikoy showcase Istanbul\'s contemporary art and cafe culture.',
     [('Hagia Sophia',25,'2 hours','Now a mosque, free but long queues - go early'),('Blue Mosque',0,'1 hour','Free, dress modestly, closed during prayers'),('Grand Bazaar',0,'2-3 hours','Bargain hard - start at 50% of asking price'),('Topkapi Palace',20,'2-3 hours','Harem section costs extra but worth it'),('Bosphorus Ferry',2,'2 hours','Public ferry is 10x cheaper than tour boats')],
     [('Sultanahmet','Historic center, walkable to major sights','mid'),('Kadikoy','Asian side, food markets, local vibe','budget'),('Nisantasi','Upscale shopping, fine dining, chic hotels','luxury')],
     ['Use Istanbulkart for transport - huge savings over cash','Eat at lokantasi (steam-tray restaurants) for $3-5 meals','Ferries are cheapest Bosphorus experience at $0.50','Haggle at bazaars - never pay the first price','Free mosque visits throughout the city for stunning architecture'],
     [('How much is a trip to Istanbul?','Budget: $550-$900. Mid-range: $1,100-$1,700. Luxury: $3,800+. Plus flights $500-$3,800.'),('Is Istanbul safe for tourists?','Yes, tourist areas are well-policed. Normal big-city precautions apply.'),('How many days in Istanbul?','4-5 days covers major sights. Add 1-2 days for Asian side and day trips.')])
]:
    add(slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview, attrs, hoods, tips, faqs)

# Add remaining cities with standard format
remaining = [
    ('santorini','Santorini','Greece','Europe','🇬🇷','EUR','€','Greek',550,900,4200,120,280,700,4,['May','Jun','Sep','Oct'],['Jul','Aug'],'Whitewashed villages perched on volcanic cliffs overlooking the Aegean Sea create Greece\'s most iconic scenery.','Santorini is the crown jewel of the Greek islands, famous for its blue-domed churches, sunset views from Oia, and dramatic caldera cliffs. The island offers volcanic black and red sand beaches, ancient ruins at Akrotiri, and some of Greece\'s best wineries. While it can be pricey in peak season, visiting in shoulder months offers the same beauty at lower costs. The local cuisine features fresh seafood, fava beans, and cherry tomatoes unique to the volcanic soil.'),
    ('dublin','Dublin','Ireland','Europe','🍀','EUR','€','English',450,800,3600,90,200,520,4,['May','Jun','Jul','Sep'],['Nov','Dec'],'Literary heritage, legendary pubs, and warm hospitality make Ireland\'s capital a uniquely social travel experience.','Dublin pulses with literary history and musical energy. Walk in the footsteps of Joyce and Wilde, then settle into a pub for live traditional music and a perfectly poured Guinness. Trinity College houses the stunning Book of Kells, while Temple Bar buzzes day and night. The Georgian architecture of Merrion Square and the Phoenix Park deer add elegance, while neighborhoods like Stoneybatter and Smithfield offer authentic local dining away from tourist prices.'),
    ('lisbon','Lisbon','Portugal','Europe','🇵🇹','EUR','€','Portuguese',420,750,3200,65,160,450,4,['Mar','Apr','May','Sep','Oct'],['Aug'],'Sun-drenched hills, vintage trams, and Europe\'s best-value dining make Lisbon a rising star among travelers.','Lisbon cascades across seven hills above the Tagus River, its pastel buildings and red rooftops creating a photographer\'s dream. Ride the iconic Tram 28 through narrow Alfama streets, feast on custard tarts at Pasteis de Belem, and watch sunset from a miradouro viewpoint. The city offers excellent value compared to Western Europe, with fresh seafood dinners for under 15 euros and craft cocktails for 6-8 euros. The nearby beaches of Cascais and the fairy-tale palaces of Sintra make easy day trips.'),
    ('vienna','Vienna','Austria','Europe','🎵','EUR','€','German',460,800,3500,85,200,540,4,['Apr','May','Jun','Sep','Oct'],['Jan','Feb'],'Imperial palaces, classical music heritage, and legendary coffee house culture define this elegant Austrian capital.','Vienna is a city of grandeur and refinement. The Hofburg and Schonbrunn palaces showcase Habsburg imperial splendor, while the Vienna State Opera and Musikverein host world-class performances nightly. The city\'s coffee house tradition is UNESCO-recognized - order a melange and linger for hours. The Naschmarkt food market brings multicultural flavors, and neighborhoods like the MuseumsQuartier blend historic architecture with contemporary art. Vienna consistently ranks among the world\'s most livable cities.'),
    ('berlin','Berlin','Germany','Europe','🇩🇪','EUR','€','German',430,760,3300,70,170,480,4,['May','Jun','Jul','Sep'],['Jan','Feb'],'A creative capital where Cold War history, underground nightlife, and world-class museums coexist at affordable prices.','Berlin is Europe\'s most dynamic cultural capital. The Berlin Wall remnants, Brandenburg Gate, and Holocaust Memorial anchor powerful historical experiences, while neighborhoods like Kreuzberg and Neukolln thrive with street art, international food, and legendary nightlife. Museum Island houses five world-class museums on a single stretch of the Spree River. Berlin remains remarkably affordable for a European capital, with kebabs for 4 euros, craft beer for 3 euros, and excellent public transport connecting a sprawling city.'),
    ('edinburgh','Edinburgh','Scotland','Europe','🏴','GBP','£','English',480,830,3700,85,200,530,4,['May','Jun','Jul','Aug','Sep'],['Nov','Dec'],'A dramatic city of castle-topped crags, medieval alleys, and the world\'s largest arts festival.','Edinburgh layers medieval Old Town atmosphere with Georgian New Town elegance. The Royal Mile stretches from Edinburgh Castle to Holyrood Palace, hiding narrow closes and hidden courtyards along the way. Arthur\'s Seat offers a wilderness hike within city limits, while Calton Hill provides panoramic views. The August Festival season transforms the city into the world\'s largest arts venue. Whisky heritage runs deep, with excellent distillery experiences nearby. The food scene has modernized dramatically, with Scottish ingredients starring in innovative restaurants.'),
    ('copenhagen','Copenhagen','Denmark','Europe','🇩🇰','DKK','kr','Danish',500,870,3800,110,250,650,4,['May','Jun','Jul','Aug','Sep'],['Nov','Dec'],'Scandinavian design, cycling culture, and New Nordic cuisine define this hygge-filled Danish capital.','Copenhagen epitomizes Scandinavian cool with colorful Nyhavn canal houses, the Tivoli Gardens amusement park, and a cycling infrastructure that makes bikes the fastest way around. The city pioneered New Nordic cuisine, led by restaurants like Noma, though excellent food exists at every price point at places like Torvehallerne food market. The free-spirited Christiania neighborhood offers alternative culture, while the Design Museum and Louisiana Museum showcase world-class art. Copenhagen is expensive but rewards those who embrace its outdoor lifestyle.'),
    ('dubrovnik','Dubrovnik','Croatia','Europe','🏖️','EUR','€','Croatian',500,850,3600,80,190,520,4,['May','Jun','Sep','Oct'],['Jul','Aug'],'Walled medieval city on the Adriatic coast where Game of Thrones meets crystal-clear Mediterranean waters.','Dubrovnik\'s massive stone walls encircle a perfectly preserved medieval old town perched above the Adriatic Sea. Walking the walls offers stunning views, while the Stradun main street leads past Baroque churches and marble squares. The city gained fame as King\'s Landing in Game of Thrones, but its appeal goes far deeper - nearby islands offer secluded beaches, the cable car reveals panoramic coastline views, and sunset from the old town bars is unforgettable. Visit in shoulder season to avoid cruise ship crowds.'),
    ('reykjavik','Reykjavik','Iceland','Europe','🇮🇸','ISK','kr','Icelandic',500,850,4000,120,280,700,5,['Jun','Jul','Aug'],['Dec','Jan'],'Gateway to otherworldly landscapes of glaciers, geysers, waterfalls, and the Northern Lights.','Reykjavik is the world\'s northernmost capital and base camp for Iceland\'s extraordinary natural wonders. The Golden Circle day trip covers Thingvellir National Park, Geysir geothermal area, and Gullfoss waterfall. The Blue Lagoon geothermal spa is iconic, while the Ring Road reveals volcanoes, black sand beaches, and glacial lagoons. The city itself is colorful and compact, with a thriving music scene, excellent seafood, and Harpa Concert Hall. Iceland is expensive but offers landscapes found nowhere else on Earth.'),
]

for slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview in remaining:
    add(slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
        [('Top Attraction 1',15,'2 hours','Book in advance for best experience'),
         ('Top Attraction 2',12,'2-3 hours','Visit early morning for fewer crowds'),
         ('Top Attraction 3',0,'1-2 hours','Free entry, great photo opportunity'),
         ('Local Market',0,'1-2 hours','Best for authentic food and souvenirs'),
         ('Scenic Viewpoint',5,'1 hour','Sunset visits are most memorable')],
        [('City Center','Walkable, close to attractions, lively','mid'),
         ('Local Quarter','Authentic atmosphere, affordable eats','budget'),
         ('Upscale District','Fine dining, luxury hotels, boutiques','luxury')],
        [f'Use public transport passes for savings in {city}',
         f'Eat at local markets for authentic {city} cuisine at lower prices',
         f'Visit free attractions and parks to balance your {city} budget',
         f'Book popular attractions online to skip queues',
         f'Walk between central sights - {city} rewards exploration on foot'],
        [(f'How much does a trip to {city} cost?', f'Budget: ${bd*days+bf}-${int(bd*days*1.5+bf)}. Mid-range: ${md*days+mf}-${int(md*days*1.3+mf)}. Luxury: ${ld*days+lf}+. Costs vary by season.'),
         (f'Best time to visit {city}?', f'Best months are {", ".join(best)}. Avoid {", ".join(avoid)} for crowds/weather. Shoulder season offers best value.'),
         (f'How many days in {city}?', f'{days} days is ideal. This gives enough time for major attractions plus exploring local neighborhoods.')])

# Asia destinations
asia_cities = [
    ('tokyo','Tokyo','Japan','Asia','🗼','JPY','¥','Japanese',700,1200,5000,100,230,600,6,['Mar','Apr','Oct','Nov'],['Jul','Aug'],'Where ancient temples and futuristic technology create the world\'s most fascinating urban experience.','Tokyo defies expectations at every turn. Shibuya\'s famous crossing and Shinjuku\'s neon towers represent the hyper-modern side, while Meiji Shrine and Senso-ji temple in Asakusa preserve centuries of tradition. The city has more Michelin stars than any other, yet incredible ramen costs $8 and conveyor-belt sushi is $1 per plate. Neighborhoods like Shimokitazawa offer vintage shopping, Harajuku showcases youth fashion, and Akihabara immerses you in anime culture. The train system is impossibly efficient.'),
    ('bangkok','Bangkok','Thailand','Asia','🇹🇭','THB','฿','Thai',600,1000,4500,45,110,350,5,['Nov','Dec','Jan','Feb'],['Apr','May'],'Street food capital of the world, with ornate temples, floating markets, and legendary nightlife.','Bangkok is sensory overload in the best way. Golden temple spires pierce the skyline, tuk-tuks weave through traffic, and street vendors serve some of the world\'s best food for under $2. The Grand Palace and Wat Pho are essential, while Chatuchak Weekend Market is Asia\'s largest outdoor market. Chinatown comes alive at night with seafood stalls, and rooftop bars offer skyline views for a fraction of Western prices. Thai massage for $8 and Michelin-starred street food make Bangkok an incredible value destination.'),
    ('bali','Bali','Indonesia','Asia','🌺','IDR','Rp','Indonesian',650,1100,4800,40,100,350,7,['Apr','May','Jun','Sep','Oct'],['Dec','Jan'],'Tropical paradise of rice terraces, Hindu temples, surf breaks, and wellness retreats.','Bali offers something for every traveler: surfers flock to Uluwatu and Canggu, yogis retreat to Ubud\'s rice terrace studios, and honeymooners seek out clifftop infinity pools in Seminyak. The island\'s Hindu culture creates a unique Indonesian experience with daily flower offerings, ornate temple ceremonies, and artistic traditions. Affordable luxury is Bali\'s calling card - private villas with pools start at $50/night, and a Balinese massage costs $10-15. The Tegallalang rice terraces and Tanah Lot sea temple are iconic photo spots.'),
    ('singapore','Singapore','Singapore','Asia','🇸🇬','SGD','S$','English',700,1200,5200,90,210,580,4,['Feb','Mar','Apr','Oct','Nov'],['Jun','Jul'],'Ultra-modern city-state where hawker centers, futuristic gardens, and multicultural neighborhoods create Asia\'s most polished destination.','Singapore packs extraordinary diversity into a tiny island nation. Marina Bay Sands and Gardens by the Bay represent futuristic architecture, while Little India, Chinatown, and Kampong Glam preserve distinct cultural quarters. The food is legendary: hawker centers serve Michelin-starred chicken rice for $3, and the city\'s multicultural population means Malay, Chinese, Indian, and Peranakan cuisines coexist beautifully. Despite its reputation as expensive, budget travelers can eat incredibly well and use an efficient MRT system for $1-2 rides.'),
    ('seoul','Seoul','South Korea','Asia','🇰🇷','KRW','₩','Korean',680,1100,4800,65,160,450,5,['Mar','Apr','May','Sep','Oct'],['Jul','Aug'],'K-pop energy meets centuries of royal palaces, sizzling BBQ, and Asia\'s most dynamic nightlife scene.','Seoul blends 600 years of Joseon Dynasty heritage with cutting-edge K-pop culture. Gyeongbokgung Palace offers hanbok rental for traditional dress photos, while Gangnam and Hongdae pulse with contemporary Korean energy. Korean BBQ restaurants, jimjilbangs (spa houses), and pojangmacha (street tent bars) provide uniquely Korean experiences. The city is tech-forward with free WiFi everywhere and an exceptional subway system. Bukchon Hanok Village\'s traditional houses and Namsan Tower\'s panoramic views round out the experience.'),
    ('dubai','Dubai','UAE','Asia','🏙️','AED','AED','Arabic',600,1000,5500,100,250,700,4,['Nov','Dec','Jan','Feb','Mar'],['Jun','Jul','Aug'],'Record-breaking skyscrapers, desert adventures, and luxury shopping define this Middle Eastern megacity.','Dubai is a city of superlatives: the world\'s tallest building (Burj Khalifa), largest mall, and most luxurious hotel (Burj Al Arab). Beyond the glitz, Old Dubai\'s creek-side souks sell gold and spices, and desert safaris offer dune bashing and Bedouin camps. The food scene spans every cuisine thanks to a 90% expat population. While known for luxury, Dubai offers value in off-peak months, and many beaches, mosque visits, and cultural experiences are free. The Dubai Metro is clean, modern, and affordable.'),
    ('hanoi','Hanoi','Vietnam','Asia','🇻🇳','VND','₫','Vietnamese',650,1050,4500,35,80,250,5,['Oct','Nov','Mar','Apr'],['Jun','Jul','Aug'],'Chaotic charm of motorbike-filled streets, French colonial architecture, and the world\'s best pho.','Hanoi is Vietnam\'s captivating capital where French colonial boulevards meet ancient Vietnamese temples. The Old Quarter\'s 36 streets each historically sold different goods, and many retain that character today. Street food is Hanoi\'s crown jewel: pho served from dawn, bun cha at lunch, and egg coffee as an afternoon treat - all for $1-3. Hoan Kiem Lake provides a peaceful center, while Ho Chi Minh\'s Mausoleum and the Temple of Literature offer historical depth. Hanoi is also the gateway to Halong Bay and Sapa\'s rice terraces.'),
    ('kyoto','Kyoto','Japan','Asia','⛩️','JPY','¥','Japanese',720,1250,5200,90,210,580,4,['Mar','Apr','Oct','Nov'],['Jul','Aug'],'Japan\'s cultural heart with over 2,000 temples, traditional geisha districts, and serene zen gardens.','Kyoto served as Japan\'s imperial capital for over a millennium, leaving a legacy of 17 UNESCO World Heritage sites. The golden Kinkaku-ji, the thousands of vermilion torii gates at Fushimi Inari, and the bamboo groves of Arashiyama are iconic. The Gion district preserves geisha culture, while Nishiki Market reveals Kyoto\'s culinary traditions. Traditional ryokan inns and kaiseki multi-course dinners offer immersive Japanese cultural experiences. Cherry blossom season (late March-early April) and fall foliage (November) transform the city.'),
    ('hong-kong','Hong Kong','China','Asia','🇭🇰','HKD','HK$','Cantonese',680,1150,5000,80,200,550,4,['Oct','Nov','Dec','Mar','Apr'],['Jun','Jul','Aug'],'Vertical city of skyscrapers, dim sum restaurants, harbor views, and hiking trails with stunning vistas.','Hong Kong packs incredible density with surprising natural beauty. Victoria Peak offers iconic skyline views, while the Star Ferry crossing costs just $0.50 for one of the world\'s best harbor perspectives. The food scene is extraordinary: Michelin-starred dim sum restaurants, dai pai dong street stalls, and rooftop cocktail bars. Despite its urban intensity, 75% of Hong Kong is actually countryside - hiking trails on Lantau Island and the Dragon\'s Back offer stunning coastal views. The MTR system is world-class and connects to mainland China.'),
    ('maldives','Maldives','Maldives','Asia','🏝️','MVR','MVR','Dhivehi',800,1400,6000,150,350,1000,5,['Jan','Feb','Mar','Apr','Nov','Dec'],['Jun','Jul'],'"Overwater villas, crystal-clear lagoons, and world-class diving in the Indian Ocean\'s most exclusive paradise.','The Maldives comprises 1,192 coral islands grouped into 26 atolls, with some of the world\'s most pristine beaches and marine life. Overwater bungalows are iconic, and snorkeling from your villa reveals manta rays, sea turtles, and colorful reef fish. While known for luxury, guesthouse tourism on local islands has made the Maldives accessible to mid-range travelers at $80-120/night including meals. The underwater world is the real attraction: whale shark encounters, night diving, and some of the world\'s best surf breaks.'),
    ('mumbai','Mumbai','India','Asia','🇮🇳','INR','₹','Hindi',650,1050,4500,30,75,300,4,['Oct','Nov','Dec','Jan','Feb'],['Jun','Jul','Aug'],'India\'s maximum city of Bollywood glamour, colonial architecture, and street food that packs a punch.','Mumbai is India at its most intense and rewarding. The Gateway of India and Taj Mahal Palace Hotel anchor the colonial-era waterfront, while Dharavi - one of Asia\'s largest slums - showcases incredible entrepreneurial spirit. Bollywood studios offer tours, and Mumbai\'s food scene ranges from iconic vada pav ($0.30) to celebrity-chef restaurants. Marine Drive\'s sunset promenade, the chaos of Crawford Market, and peaceful Elephanta Island caves provide diverse experiences. Mumbai is India\'s most expensive city but still remarkably affordable by Western standards.'),
    ('phuket','Phuket','Thailand','Asia','🏖️','THB','฿','Thai',620,1020,4600,45,110,350,5,['Nov','Dec','Jan','Feb','Mar'],['May','Jun','Sep'],'Thailand\'s largest island with stunning beaches, vibrant nightlife, and island-hopping adventures.','Phuket offers Thailand\'s best beach resort experience with options for every budget. Patong Beach buzzes with nightlife, while Kata and Karon offer family-friendly shores. The island\'s interior features lush jungle, elephan sanctuaries, and the Big Buddha statue. Nearby Phi Phi Islands and Phang Nga Bay (James Bond Island) make spectacular day trips. Old Phuket Town surprises with Sino-Portuguese architecture and local restaurants far cheaper than beach areas. Thai massage, cooking classes, and diving courses are popular activities.'),
    ('amman','Amman','Jordan','Asia','🏛️','JOD','JD','Arabic',600,1000,4500,50,120,380,5,['Mar','Apr','May','Oct','Nov'],['Jun','Jul','Aug'],'Ancient Roman ruins meet modern Middle Eastern culture, and the gateway to Petra and the Dead Sea.','Amman is the perfect base for exploring Jordan\'s world-class archaeological sites. The city itself features a well-preserved Roman amphitheater, the hilltop Citadel, and the vibrant Rainbow Street dining scene. Day trips to Petra (one of the New Seven Wonders), the Dead Sea (Earth\'s lowest point), and Wadi Rum\'s Mars-like desert landscapes make Amman essential. Jordanian hospitality is legendary, and the food - mansaf, falafel, and fresh-baked bread - is extraordinary. The Jordan Pass covers Petra entry and visa fees.'),
    ('marrakech','Marrakech','Morocco','Africa','🇲🇦','MAD','MAD','Arabic',550,900,4000,40,100,350,4,['Mar','Apr','May','Oct','Nov'],['Jul','Aug'],'Sensory explosion of spice-filled souks, ornate riads, and the Atlas Mountains on the horizon.','Marrakech assaults and delights the senses simultaneously. The Jemaa el-Fnaa main square transforms from daytime market to nighttime food circus with snake charmers and storytellers. The medina\'s labyrinthine souks sell leather, ceramics, and spices, while hidden riads (traditional courtyard houses) offer oasis-like accommodation. Majorelle Garden and Bahia Palace showcase Islamic artistry, and hammam spa experiences are essential. The Atlas Mountains are just an hour away for hiking and Berber village visits. Marrakech offers extraordinary value for the experience it delivers.'),
]

for slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview in asia_cities:
    add(slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
        [('Top Attraction 1',15,'2 hours','Book in advance'),('Top Attraction 2',10,'2-3 hours','Visit early'),
         ('Top Attraction 3',0,'1-2 hours','Free entry'),('Local Market',0,'1-2 hours','Great for food'),
         ('Scenic Viewpoint',5,'1 hour','Best at sunset')],
        [('City Center','Central, walkable, close to sights','mid'),('Local Quarter','Authentic, affordable, vibrant','budget'),
         ('Upscale Area','Luxury hotels, fine dining','luxury')],
        [f'Use public transport in {city} for savings',f'Street food in {city} is incredible and cheap',
         f'Book popular {city} attractions online',f'Visit free temples and parks',f'{city} rewards early risers - beat crowds by starting early'],
        [(f'How much does a trip to {city} cost?',f'Budget: ${bd*days+bf}-${int(bd*days*1.5+bf)}. Mid-range: ${md*days+mf}-${int(md*days*1.3+mf)}. Luxury: ${ld*days+lf}+.'),
         (f'Best time to visit {city}?',f'Best: {", ".join(best)}. Avoid: {", ".join(avoid)}.'),
         (f'How many days for {city}?',f'{days} days is ideal for major sights and local exploration.')])

# Americas
americas_cities = [
    ('new-york','New York','United States','Americas','🗽','USD','$','English',200,400,2000,120,280,700,5,['Apr','May','Jun','Sep','Oct'],['Jan','Feb'],'The city that never sleeps - Broadway shows, world-class museums, iconic skyline, and endless energy.','New York City is the ultimate urban destination. The Statue of Liberty, Times Square, and Central Park are just the starting points. World-class museums like the Met and MoMA, Broadway theaters, and neighborhoods each with distinct identities - from Brooklyn\'s artisan culture to Harlem\'s musical heritage - create endless exploration. The food scene spans $1 pizza slices to three-Michelin-star restaurants, with every world cuisine represented. The subway runs 24/7, connecting an endlessly diverse city.'),
    ('cancun','Cancun','Mexico','Americas','🏖️','MXN','$','Spanish',350,600,3000,60,150,450,5,['Dec','Jan','Feb','Mar','Apr'],['Sep','Oct'],'Caribbean beaches, Mayan ruins, and all-inclusive resorts where turquoise waters meet ancient history.','Cancun offers powdery white sand beaches along the Caribbean Sea with the Mayan ruins of Chichen Itza and Tulum as cultural counterpoints. The Hotel Zone stretches along a narrow peninsula with resorts for every budget. Beyond the beach, cenotes (natural sinkholes) offer unique swimming experiences, and Isla Mujeres provides a laid-back island escape by ferry. The downtown area offers authentic Mexican food at a fraction of hotel zone prices. Xcaret and Xel-Ha eco-parks showcase Mexico\'s biodiversity.'),
    ('rio-de-janeiro','Rio de Janeiro','Brazil','Americas','🇧🇷','BRL','R$','Portuguese',600,1000,4500,60,150,450,5,['May','Jun','Jul','Aug','Sep'],['Feb','Mar'],'Samba rhythms, iconic beaches, and the Christ the Redeemer statue overlooking one of Earth\'s most beautiful cities.','Rio de Janeiro is a city defined by its dramatic landscape. Sugarloaf Mountain and Christ the Redeemer frame a coastline of legendary beaches - Copacabana and Ipanema are globally famous. Carnival is the world\'s biggest party, but Rio pulses with music year-round in samba clubs and botecos (neighborhood bars). The Tijuca Forest is the world\'s largest urban rainforest, offering hiking trails with stunning views. While safety requires awareness, Rio\'s beauty, culture, and infectious energy make it unmissable.'),
    ('buenos-aires','Buenos Aires','Argentina','Americas','🇦🇷','ARS','$','Spanish',650,1050,4800,50,120,380,5,['Mar','Apr','May','Sep','Oct','Nov'],['Jan','Feb'],'The Paris of South America, where tango, steak, wine, and European-style boulevards create an intoxicating blend.','Buenos Aires seduces with its combination of European architecture and Latin American passion. Tango shows and milongas (dance halls) keep the national dance alive, while parrilla restaurants serve some of the world\'s best steak. Neighborhoods like San Telmo (antiques and Sunday market), Palermo (parks and nightlife), and La Boca (colorful Caminito street) each offer distinct experiences. The city is remarkably affordable due to currency dynamics, making fine dining and boutique hotels accessible. Malbec wine flows freely and cheaply.'),
]

for slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview in americas_cities:
    add(slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
        [('Top Attraction 1',15,'2 hours','Book in advance'),('Top Attraction 2',10,'2-3 hours','Visit early'),
         ('Top Attraction 3',0,'1-2 hours','Free entry'),('Local Market',0,'1-2 hours','Great for food'),
         ('Scenic Viewpoint',5,'1 hour','Best at sunset')],
        [('City Center','Central, walkable','mid'),('Local Quarter','Authentic, affordable','budget'),
         ('Upscale Area','Luxury, fine dining','luxury')],
        [f'Public transport saves money in {city}',f'Local food in {city} is great value',
         f'Book {city} attractions online',f'Free parks and beaches available',f'Walk central {city} to discover hidden gems'],
        [(f'How much does a trip to {city} cost?',f'Budget: ${bd*days+bf}-${int(bd*days*1.5+bf)}. Mid-range: ${md*days+mf}-${int(md*days*1.3+mf)}. Luxury: ${ld*days+lf}+.'),
         (f'Best time to visit {city}?',f'Best: {", ".join(best)}. Avoid: {", ".join(avoid)}.'),
         (f'How many days for {city}?',f'{days} days covers major sights.')])

# Add remaining Americas + Oceania + Africa
more_cities = [
    ('vancouver','Vancouver','Canada','Americas','🇨🇦','CAD','C$','English',300,500,2500,90,210,560,4,['Jun','Jul','Aug','Sep'],['Nov','Dec'],'Mountains meet ocean in this stunning Pacific Coast city known for outdoor adventures and diverse cuisine.','Vancouver sits between the Pacific Ocean and the Coast Mountains, offering skiing and beach days in the same week. Stanley Park, Granville Island Market, and Gastown\'s steam clock are iconic, while nearby Whistler and the Sea-to-Sky Highway provide world-class outdoor adventures.'),
    ('havana','Havana','Cuba','Americas','🇨🇺','CUP','CUP','Spanish',400,700,3200,40,90,280,4,['Nov','Dec','Jan','Feb','Mar','Apr'],['Aug','Sep'],'Frozen-in-time vintage cars, salsa music, and crumbling colonial grandeur on the Caribbean.','Havana is a living museum of 1950s American cars, Spanish colonial architecture, and revolutionary history. The Malecon waterfront, Old Havana\'s restored squares, and vibrant music scene make it utterly unique. Casa particulares (homestays) provide authentic experiences, and the food scene is rapidly improving.'),
    ('lima','Lima','Peru','Americas','🇵🇪','PEN','S/','Spanish',550,900,4200,45,110,350,4,['May','Jun','Jul','Aug','Sep'],['Jan','Feb'],'South America\'s culinary capital with pre-Inca ruins, colonial architecture, and a booming food scene.','Lima has emerged as a world-class food destination, with restaurants like Central and Maido ranking among the globe\'s best. The historic center is UNESCO-listed, Miraflores offers Pacific Ocean cliff walks, and the Larco Museum houses pre-Columbian gold. Ceviche is a must, and pisco sours flow freely.'),
    ('costa-rica','San Jose','Costa Rica','Americas','🌿','CRC','₡','Spanish',350,600,3000,55,130,400,6,['Dec','Jan','Feb','Mar','Apr'],['Sep','Oct'],'Rainforests, volcanoes, and wildlife encounters in Central America\'s eco-tourism paradise.','Costa Rica packs incredible biodiversity into a small country. Monteverde\'s cloud forests, Arenal Volcano\'s hot springs, and Manuel Antonio\'s beaches with monkeys offer diverse nature experiences. The pura vida lifestyle is infectious, and eco-lodges range from budget to luxury.'),
    ('cartagena','Cartagena','Colombia','Americas','🇨🇴','COP','COP','Spanish',450,750,3500,40,100,320,4,['Dec','Jan','Feb','Mar'],['Sep','Oct'],'Walled colonial city on the Caribbean coast with colorful streets, salsa, and stunning beaches.','Cartagena\'s UNESCO-listed old town features bougainvillea-draped balconies, cobblestone streets, and colonial churches within massive stone walls. Nearby Rosario Islands offer Caribbean beach escapes, and the local food scene blends Caribbean and Colombian flavors at excellent prices.'),
    ('mexico-city','Mexico City','Mexico','Americas','🇲🇽','MXN','$','Spanish',300,500,2500,45,110,350,5,['Mar','Apr','May','Oct','Nov'],['Jun','Jul'],'Ancient Aztec ruins, world-class museums, street tacos, and a cultural scene rivaling any global capital.','Mexico City is Latin America\'s largest metropolis and one of its most exciting. The Zocalo and Templo Mayor reveal Aztec foundations, while the Frida Kahlo Museum and Palace of Fine Arts showcase artistic brilliance. Neighborhoods like Roma and Condesa offer tree-lined streets with outstanding restaurants. Street tacos cost $0.50 each, making it one of the world\'s best food cities at any budget level.'),
    ('cusco','Cusco','Peru','Americas','🏔️','PEN','S/','Spanish',550,900,4200,40,100,320,5,['May','Jun','Jul','Aug','Sep'],['Jan','Feb'],'Ancient Inca capital and gateway to Machu Picchu, set high in the Andes Mountains.','Cusco was the capital of the Inca Empire and today blends Inca stone walls with Spanish colonial churches. The Plaza de Armas is the heart of the city, while the Sacred Valley and Machu Picchu make essential multi-day excursions. Altitude (3,400m) requires acclimatization, but the reward is one of South America\'s most magical destinations.'),
    ('honolulu','Honolulu','United States','Americas','🌺','USD','$','English',350,600,3000,100,230,600,5,['Apr','May','Jun','Sep','Oct'],['Dec','Jan'],'Pacific paradise of volcanic beaches, pearl harbor history, and year-round tropical warmth.','Honolulu combines Waikiki Beach resort culture with genuine Hawaiian traditions and stunning natural beauty. Diamond Head crater offers panoramic views, Pearl Harbor provides powerful history, and the North Shore delivers world-class surfing. The food scene blends Pacific Rim cuisines with local plate lunch culture and farm-to-table dining.'),
    ('sydney','Sydney','Australia','Oceania','🇦🇺','AUD','A$','English',900,1500,6000,100,230,600,5,['Sep','Oct','Nov','Mar','Apr','May'],['Jun','Jul'],'Harbor city icon with the Opera House, golden beaches, and a laid-back outdoor lifestyle.','Sydney centers on one of the world\'s most beautiful harbors, framed by the Opera House and Harbour Bridge. Bondi to Coogee coastal walk, the historic Rocks district, and Taronga Zoo offer diverse experiences. The food scene thrives on fresh seafood and multicultural influences, while nearby Blue Mountains provide dramatic day-trip scenery.'),
    ('auckland','Auckland','New Zealand','Oceania','🇳🇿','NZD','NZ$','English',950,1600,6500,90,210,560,4,['Nov','Dec','Jan','Feb','Mar'],['Jun','Jul'],'City of Sails surrounded by harbors, volcanic islands, and lush rainforest day trips.','Auckland straddles two harbors and dozens of volcanic cones, creating a city where sailing, hiking, and wine tasting are everyday activities. Waiheke Island offers vineyards and beaches by ferry, while Rangitoto Island provides volcanic hiking. The Sky Tower dominates the skyline, and neighborhoods like Ponsonby offer excellent dining.'),
    ('cape-town','Cape Town','South Africa','Africa','🇿🇦','ZAR','R','English',800,1300,5500,50,130,400,5,['Oct','Nov','Dec','Jan','Feb','Mar'],['Jun','Jul'],'Table Mountain backdrop, world-class wine regions, and stunning coastal drives at incredible value.','Cape Town is regularly voted the world\'s best city, and it\'s easy to see why. Table Mountain\'s flat top dominates the skyline, the V&A Waterfront buzzes with restaurants and shops, and the Cape Winelands are 45 minutes away. Boulders Beach penguins, the Cape of Good Hope, and Kirstenbosch Botanical Gardens round out the natural attractions. The favorable exchange rate makes luxury accessible.'),
    ('nairobi','Nairobi','Kenya','Africa','🇰🇪','KES','KSh','Swahili',750,1200,5000,40,100,350,4,['Jun','Jul','Aug','Sep','Jan','Feb'],['Apr','May'],'Gateway to world-famous safari experiences and a rapidly modernizing East African capital.','Nairobi is the safari capital of Africa, with Nairobi National Park offering wildlife viewing against a city skyline backdrop. The David Sheldrick Elephant Orphanage and Giraffe Centre provide intimate animal encounters. The Maasai Mara, Amboseli, and other legendary parks are accessible by short flights. The city itself has a growing food and art scene.'),
    ('nadi','Nadi','Fiji','Oceania','🌴','FJD','FJ$','English',900,1500,6000,60,150,450,5,['May','Jun','Jul','Aug','Sep','Oct'],['Jan','Feb'],'Gateway to tropical island paradise with crystal lagoons, friendly locals, and Bula spirit.','Fiji is the quintessential South Pacific paradise. Nadi serves as the gateway to the Mamanuca and Yasawa island chains, where overwater bures, pristine reefs, and village visits create unforgettable experiences. Fijian hospitality is legendary, and the diverse marine life makes snorkeling and diving world-class.'),
    ('queenstown','Queenstown','New Zealand','Oceania','🏔️','NZD','NZ$','English',950,1600,6500,100,230,600,5,['Dec','Jan','Feb','Mar','Jun','Jul','Aug'],['May','Nov'],'Adventure capital of the world with bungee jumping, skiing, and stunning mountain lake scenery.','Queenstown sits on the shores of Lake Wakatipu surrounded by the Remarkables mountain range. It invented commercial bungee jumping and offers jet boating, skydiving, and skiing alongside more peaceful pursuits like wine tours and scenic cruises. Milford Sound day trips reveal New Zealand\'s most famous fjord.'),
    ('cairo','Cairo','Egypt','Africa','🔺','EGP','E£','Arabic',550,900,4000,35,85,300,4,['Oct','Nov','Dec','Jan','Feb','Mar'],['Jun','Jul','Aug'],'Ancient pyramids, pharaonic treasures, and the vibrant chaos of the Arab world\'s largest city.','Cairo delivers bucket-list experiences: the Pyramids of Giza and Sphinx are just the beginning. The Egyptian Museum houses Tutankhamun\'s treasures, Islamic Cairo\'s mosques and bazaars date back a millennium, and the Nile corniche offers evening walks. The Grand Egyptian Museum is the world\'s largest archaeological museum. Egyptian food - koshari, ful medames, and fresh juices - is delicious and incredibly cheap.'),
    ('zanzibar','Zanzibar','Tanzania','Africa','🌴','TZS','TSh','Swahili',700,1100,5000,40,100,350,5,['Jun','Jul','Aug','Sep','Jan','Feb'],['Apr','May'],'Spice island with pristine beaches, Stone Town\'s winding alleys, and world-class diving.','Zanzibar combines African, Arab, and Indian influences into a unique island culture. Stone Town\'s UNESCO-listed alleys hide carved wooden doors, spice markets, and rooftop restaurants. The east coast beaches offer powder-white sand and turquoise waters, while Mnemba Atoll provides world-class snorkeling. Spice tours reveal the island\'s clove, vanilla, and cinnamon heritage.'),
]

for slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview in more_cities:
    add(slug, city, country, cont, emoji, curr, sym, lang, bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
        [('Top Attraction 1',15,'2 hours','Book in advance'),('Top Attraction 2',10,'2-3 hours','Visit early'),
         ('Top Attraction 3',0,'1-2 hours','Free entry'),('Local Market',0,'1-2 hours','Great for food'),
         ('Scenic Viewpoint',5,'1 hour','Best at sunset')],
        [('City Center','Central, walkable','mid'),('Local Quarter','Authentic, affordable','budget'),
         ('Upscale Area','Luxury, fine dining','luxury')],
        [f'Use public transport in {city}',f'Local food in {city} is great value',
         f'Book {city} attractions online',f'Free parks and nature available',f'Walk to discover hidden gems'],
        [(f'How much does a trip to {city} cost?',f'Budget: ${bd*days+bf}-${int(bd*days*1.5+bf)}. Mid-range: ${md*days+mf}-${int(md*days*1.3+mf)}. Luxury: ${ld*days+lf}+.'),
         (f'Best time to visit {city}?',f'Best: {", ".join(best)}. Avoid: {", ".join(avoid)}.'),
         (f'How many days for {city}?',f'{days} days covers major sights.')])

# Now generate the file
lines = ['DESTINATIONS = {']
for (slug, city, country, continent, emoji, curr, sym, lang,
     bf, mf, lf, bd, md, ld, days, best, avoid, hero, overview,
     attrs, hoods, tips, faqs) in CITIES:

    # Calculate cost tiers
    bh = int(bd * 0.45)  # hotel
    bm = int(bd * 0.22)  # meals
    ba = int(bd * 0.18)  # activities
    bt = int(bd * 0.15)  # transport
    mh = int(md * 0.50)
    mm = int(md * 0.22)
    ma = int(md * 0.16)
    mt = int(md * 0.12)
    lh = int(ld * 0.55)
    lm = int(ld * 0.18)
    la = int(ld * 0.15)
    lt = int(ld * 0.12)

    lines.append(f"    {repr(slug)}: {{")
    lines.append(f"        'slug': {repr(slug)}, 'city': {repr(city)}, 'country': {repr(country)}, 'continent': {repr(continent)}, 'image_emoji': {repr(emoji)},")
    lines.append(f"        'hero_description': {repr(hero)},")
    lines.append(f"        'overview': {repr(overview)},")
    lines.append(f"        'costs': {{")
    lines.append(f"            'budget': {{'daily_total': {bd}, 'flights_from_us': {bf}, 'hotel_per_night': {bh}, 'meals_per_day': {bm}, 'activities_per_day': {ba}, 'local_transport_per_day': {bt}}},")
    lines.append(f"            'mid': {{'daily_total': {md}, 'flights_from_us': {mf}, 'hotel_per_night': {mh}, 'meals_per_day': {mm}, 'activities_per_day': {ma}, 'local_transport_per_day': {mt}}},")
    lines.append(f"            'luxury': {{'daily_total': {ld}, 'flights_from_us': {lf}, 'hotel_per_night': {lh}, 'meals_per_day': {lm}, 'activities_per_day': {la}, 'local_transport_per_day': {lt}}},")
    lines.append(f"        }},")
    lines.append(f"        'currency': {repr(curr)}, 'currency_symbol': {repr(sym)}, 'language': {repr(lang)},")
    lines.append(f"        'best_months': {repr(best)}, 'avoid_months': {repr(avoid)}, 'avg_trip_days': {days},")

    # Attractions
    lines.append(f"        'top_attractions': [")
    for name, cost, time, tip in attrs:
        lines.append(f"            {{'name': {repr(name)}, 'cost': {cost}, 'time_needed': {repr(time)}, 'tip': {repr(tip)}}},")
    lines.append(f"        ],")

    # Neighborhoods
    lines.append(f"        'neighborhoods': [")
    for name, vibe, level in hoods:
        lines.append(f"            {{'name': {repr(name)}, 'vibe': {repr(vibe)}, 'budget_level': {repr(level)}}},")
    lines.append(f"        ],")

    # Tips
    lines.append(f"        'money_saving_tips': {repr(tips)},")

    # FAQ
    lines.append(f"        'faq': [")
    for q, a in faqs:
        lines.append(f"            {{'question': {repr(q)}, 'answer': {repr(a)}}},")
    lines.append(f"        ],")
    lines.append(f"    }},")

lines.append('}')
lines.append('')
lines.append('')
lines.append('def get_destination(slug):')
lines.append('    return DESTINATIONS.get(slug)')
lines.append('')
lines.append('')
lines.append('def get_related_destinations(slug, limit=6):')
lines.append('    dest = DESTINATIONS.get(slug)')
lines.append('    if not dest:')
lines.append('        return []')
lines.append("    return [d for s, d in DESTINATIONS.items() if d['continent'] == dest['continent'] and s != slug][:limit]")
lines.append('')
lines.append('')
lines.append('def get_destinations_by_continent():')
lines.append('    by_continent = {}')
lines.append('    for slug, dest in DESTINATIONS.items():')
lines.append("        continent = dest['continent']")
lines.append('        if continent not in by_continent:')
lines.append('            by_continent[continent] = []')
lines.append('        by_continent[continent].append(dest)')
lines.append('    return by_continent')
lines.append('')
lines.append('')
lines.append('def get_all_destination_slugs():')
lines.append('    return list(DESTINATIONS.keys())')
lines.append('')

output = '\n'.join(lines)
outpath = os.path.join(os.path.dirname(__file__), 'destinations.py')
with open(outpath, 'w', encoding='utf-8') as f:
    f.write(output)
print(f'Generated {outpath} with {len(CITIES)} destinations, {len(output)} bytes')
