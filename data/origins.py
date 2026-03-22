ORIGINS = {
    'new-york': {
        'slug': 'new-york',
        'city': 'New York',
        'city_short': 'NYC',
        'country': 'United States',
        'airport': 'JFK',
        'continent': 'North America',
    },
    'los-angeles': {
        'slug': 'los-angeles',
        'city': 'Los Angeles',
        'city_short': 'LAX',
        'country': 'United States',
        'airport': 'LAX',
        'continent': 'North America',
    },
    'chicago': {
        'slug': 'chicago',
        'city': 'Chicago',
        'city_short': 'CHI',
        'country': 'United States',
        'airport': 'ORD',
        'continent': 'North America',
    },
    'london': {
        'slug': 'london',
        'city': 'London',
        'city_short': 'LON',
        'country': 'United Kingdom',
        'airport': 'LHR',
        'continent': 'Europe',
    },
    'toronto': {
        'slug': 'toronto',
        'city': 'Toronto',
        'city_short': 'YYZ',
        'country': 'Canada',
        'airport': 'YYZ',
        'continent': 'North America',
    },
    'sydney': {
        'slug': 'sydney',
        'city': 'Sydney',
        'city_short': 'SYD',
        'country': 'Australia',
        'airport': 'SYD',
        'continent': 'Oceania',
    },
    'singapore': {
        'slug': 'singapore',
        'city': 'Singapore',
        'city_short': 'SIN',
        'country': 'Singapore',
        'airport': 'SIN',
        'continent': 'Asia',
    },
    'dubai': {
        'slug': 'dubai',
        'city': 'Dubai',
        'city_short': 'DXB',
        'country': 'United Arab Emirates',
        'airport': 'DXB',
        'continent': 'Asia',
    },
    'san-francisco': {
        'slug': 'san-francisco',
        'city': 'San Francisco',
        'city_short': 'SFO',
        'country': 'United States',
        'airport': 'SFO',
        'continent': 'North America',
    },
    'houston': {
        'slug': 'houston',
        'city': 'Houston',
        'city_short': 'IAH',
        'country': 'United States',
        'airport': 'IAH',
        'continent': 'North America',
    },
    'miami': {
        'slug': 'miami',
        'city': 'Miami',
        'city_short': 'MIA',
        'country': 'United States',
        'airport': 'MIA',
        'continent': 'North America',
    },
    'dallas': {
        'slug': 'dallas',
        'city': 'Dallas',
        'city_short': 'DFW',
        'country': 'United States',
        'airport': 'DFW',
        'continent': 'North America',
    },
    'seattle': {
        'slug': 'seattle',
        'city': 'Seattle',
        'city_short': 'SEA',
        'country': 'United States',
        'airport': 'SEA',
        'continent': 'North America',
    },
    'boston': {
        'slug': 'boston',
        'city': 'Boston',
        'city_short': 'BOS',
        'country': 'United States',
        'airport': 'BOS',
        'continent': 'North America',
    },
    'washington-dc': {
        'slug': 'washington-dc',
        'city': 'Washington DC',
        'city_short': 'DCA',
        'country': 'United States',
        'airport': 'IAD',
        'continent': 'North America',
    },
}


def get_origin(slug):
    return ORIGINS.get(slug)


def get_all_origin_slugs():
    return list(ORIGINS.keys())


def get_origins_by_continent():
    by_continent = {}
    for slug, origin in ORIGINS.items():
        continent = origin['continent']
        if continent not in by_continent:
            by_continent[continent] = []
        by_continent[continent].append(origin)
    return by_continent
