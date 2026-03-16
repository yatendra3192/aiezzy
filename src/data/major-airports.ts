/**
 * Major commercial hub airports with coordinates.
 * These are airports that Google Flights reliably returns search results for.
 * Used as fallback when a city resolves to a small/regional airport that the scraper can't handle.
 */
export interface MajorAirport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

export const MAJOR_AIRPORTS: MajorAirport[] = [
  // ─── India ──────────────────────────────────────────────────────────────────
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai', lat: 19.0896, lng: 72.8656 },
  { code: 'DEL', name: 'Indira Gandhi Intl', city: 'New Delhi', lat: 28.5562, lng: 77.1000 },
  { code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', lat: 13.1986, lng: 77.7066 },
  { code: 'MAA', name: 'Chennai Intl', city: 'Chennai', lat: 12.9941, lng: 80.1709 },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose Intl', city: 'Kolkata', lat: 22.6547, lng: 88.4467 },
  { code: 'HYD', name: 'Rajiv Gandhi Intl', city: 'Hyderabad', lat: 17.2403, lng: 78.4294 },
  { code: 'GOI', name: 'Manohar Intl', city: 'Goa', lat: 15.3808, lng: 73.8314 },
  { code: 'COK', name: 'Cochin Intl', city: 'Kochi', lat: 10.1520, lng: 76.4019 },
  { code: 'AMD', name: 'Sardar Vallabhbhai Patel Intl', city: 'Ahmedabad', lat: 23.0772, lng: 72.6347 },
  { code: 'PNQ', name: 'Pune Airport', city: 'Pune', lat: 18.5822, lng: 73.9197 },
  { code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', lat: 26.8242, lng: 75.8122 },
  { code: 'TRV', name: 'Trivandrum Intl', city: 'Thiruvananthapuram', lat: 8.4821, lng: 76.9201 },
  { code: 'GAU', name: 'Lokpriya Gopinath Bordoloi Intl', city: 'Guwahati', lat: 26.1061, lng: 91.5859 },
  { code: 'LKO', name: 'Chaudhary Charan Singh Intl', city: 'Lucknow', lat: 26.7606, lng: 80.8893 },

  // ─── Middle East ────────────────────────────────────────────────────────────
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', lat: 25.2528, lng: 55.3644 },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', lat: 25.2731, lng: 51.6081 },
  { code: 'AUH', name: 'Abu Dhabi Intl', city: 'Abu Dhabi', lat: 24.4330, lng: 54.6511 },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', lat: 41.2753, lng: 28.7519 },
  { code: 'JED', name: 'King Abdulaziz Intl', city: 'Jeddah', lat: 21.6796, lng: 39.1565 },
  { code: 'RUH', name: 'King Khalid Intl', city: 'Riyadh', lat: 24.9578, lng: 46.6989 },
  { code: 'BAH', name: 'Bahrain Intl', city: 'Bahrain', lat: 26.2708, lng: 50.6336 },
  { code: 'AMM', name: 'Queen Alia Intl', city: 'Amman', lat: 31.7226, lng: 35.9932 },
  { code: 'MCT', name: 'Muscat Intl', city: 'Muscat', lat: 23.5933, lng: 58.2844 },
  // AYT (Antalya) omitted — scraper can't parse from BOM
  { code: 'SAW', name: 'Sabiha Gökçen Intl', city: 'Istanbul', lat: 40.8986, lng: 29.3092 },
  // ESB (Ankara) omitted — scraper can't parse, IST used as fallback

  // ─── Europe ─────────────────────────────────────────────────────────────────
  { code: 'LHR', name: 'Heathrow', city: 'London', lat: 51.4700, lng: -0.4543 },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', lat: 49.0097, lng: 2.5479 },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdam', lat: 52.3086, lng: 4.7639 },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', lat: 50.0379, lng: 8.5622 },
  { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas', city: 'Madrid', lat: 40.4983, lng: -3.5676 },
  { code: 'BCN', name: 'Josep Tarradellas Barcelona–El Prat', city: 'Barcelona', lat: 41.2974, lng: 2.0833 },
  { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino', city: 'Rome', lat: 41.8003, lng: 12.2389 },
  { code: 'MXP', name: 'Milan Malpensa', city: 'Milan', lat: 45.6306, lng: 8.7281 },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', lat: 48.3538, lng: 11.7861 },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', lat: 47.4647, lng: 8.5492 },
  { code: 'VIE', name: 'Vienna Intl', city: 'Vienna', lat: 48.1103, lng: 16.5697 },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', lat: 50.9014, lng: 4.4844 },
  { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', lat: 55.6181, lng: 12.6561 },
  { code: 'ARN', name: 'Stockholm Arlanda', city: 'Stockholm', lat: 59.6519, lng: 17.9186 },
  { code: 'OSL', name: 'Oslo Gardermoen', city: 'Oslo', lat: 60.1939, lng: 11.1004 },
  { code: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', lat: 60.3172, lng: 24.9633 },
  { code: 'ATH', name: 'Athens Intl', city: 'Athens', lat: 37.9364, lng: 23.9445 },
  { code: 'LIS', name: 'Lisbon Portela', city: 'Lisbon', lat: 38.7813, lng: -9.1359 },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', lat: 53.4264, lng: -6.2499 },
  { code: 'PRG', name: 'Václav Havel Prague', city: 'Prague', lat: 50.1008, lng: 14.2600 },
  { code: 'BER', name: 'Berlin Brandenburg', city: 'Berlin', lat: 52.3667, lng: 13.5033 },
  { code: 'HAM', name: 'Hamburg Airport', city: 'Hamburg', lat: 53.6304, lng: 9.9882 },
  { code: 'GVA', name: 'Geneva Airport', city: 'Geneva', lat: 46.2381, lng: 6.1089 },
  { code: 'WAW', name: 'Warsaw Chopin', city: 'Warsaw', lat: 52.1657, lng: 20.9671 },
  { code: 'BUD', name: 'Budapest Ferenc Liszt', city: 'Budapest', lat: 47.4369, lng: 19.2556 },
  { code: 'OTP', name: 'Henri Coandă Intl', city: 'Bucharest', lat: 44.5711, lng: 26.0850 },
  { code: 'KEF', name: 'Keflavík Intl', city: 'Reykjavik', lat: 63.9850, lng: -22.6056 },
  { code: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', lat: 55.9500, lng: -3.3725 },
  { code: 'MAN', name: 'Manchester Airport', city: 'Manchester', lat: 53.3537, lng: -2.2750 },

  // ─── Americas ───────────────────────────────────────────────────────────────
  { code: 'JFK', name: 'John F. Kennedy Intl', city: 'New York', lat: 40.6413, lng: -73.7781 },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', lat: 33.9425, lng: -118.4081 },
  { code: 'ORD', name: "O'Hare Intl", city: 'Chicago', lat: 41.9742, lng: -87.9073 },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', lat: 37.6213, lng: -122.3790 },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta Intl', city: 'Atlanta', lat: 33.6407, lng: -84.4277 },
  { code: 'DFW', name: 'Dallas/Fort Worth Intl', city: 'Dallas', lat: 32.8998, lng: -97.0403 },
  { code: 'DEN', name: 'Denver Intl', city: 'Denver', lat: 39.8561, lng: -104.6737 },
  { code: 'SEA', name: 'Seattle-Tacoma Intl', city: 'Seattle', lat: 47.4502, lng: -122.3088 },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', lat: 25.7959, lng: -80.2870 },
  { code: 'BOS', name: 'Boston Logan Intl', city: 'Boston', lat: 42.3656, lng: -71.0096 },
  { code: 'IAD', name: 'Washington Dulles Intl', city: 'Washington', lat: 38.9531, lng: -77.4565 },
  { code: 'EWR', name: 'Newark Liberty Intl', city: 'Newark', lat: 40.6895, lng: -74.1745 },
  { code: 'PHL', name: 'Philadelphia Intl', city: 'Philadelphia', lat: 39.8721, lng: -75.2411 },
  { code: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', lat: 29.9902, lng: -95.3368 },
  { code: 'MCO', name: 'Orlando Intl', city: 'Orlando', lat: 28.4312, lng: -81.3081 },
  { code: 'MSP', name: 'Minneapolis–Saint Paul Intl', city: 'Minneapolis', lat: 44.8848, lng: -93.2223 },
  { code: 'DTW', name: 'Detroit Metro Wayne County', city: 'Detroit', lat: 42.2162, lng: -83.3554 },
  { code: 'CLT', name: 'Charlotte Douglas Intl', city: 'Charlotte', lat: 35.2141, lng: -80.9431 },
  { code: 'LAS', name: 'Harry Reid Intl', city: 'Las Vegas', lat: 36.0840, lng: -115.1537 },
  { code: 'PHX', name: 'Phoenix Sky Harbor Intl', city: 'Phoenix', lat: 33.4373, lng: -112.0078 },
  { code: 'SAN', name: 'San Diego Intl', city: 'San Diego', lat: 32.7338, lng: -117.1933 },
  { code: 'PDX', name: 'Portland Intl', city: 'Portland', lat: 45.5898, lng: -122.5951 },
  { code: 'TPA', name: 'Tampa Intl', city: 'Tampa', lat: 27.9755, lng: -82.5332 },
  { code: 'AUS', name: 'Austin-Bergstrom Intl', city: 'Austin', lat: 30.1975, lng: -97.6664 },
  { code: 'HNL', name: 'Daniel K. Inouye Intl', city: 'Honolulu', lat: 21.3187, lng: -157.9225 },
  { code: 'YYZ', name: 'Toronto Pearson Intl', city: 'Toronto', lat: 43.6777, lng: -79.6248 },
  { code: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', lat: 49.1947, lng: -123.1792 },
  { code: 'MEX', name: 'Mexico City Intl', city: 'Mexico City', lat: 19.4363, lng: -99.0721 },
  { code: 'CUN', name: 'Cancún Intl', city: 'Cancún', lat: 21.0365, lng: -86.8771 },
  { code: 'GRU', name: 'São Paulo–Guarulhos Intl', city: 'São Paulo', lat: -23.4356, lng: -46.4731 },
  { code: 'EZE', name: 'Ministro Pistarini Intl', city: 'Buenos Aires', lat: -34.8222, lng: -58.5358 },
  { code: 'BOG', name: 'El Dorado Intl', city: 'Bogotá', lat: 4.7016, lng: -74.1469 },
  // LIM (Lima) omitted — scraper can't parse from BOM
  { code: 'SCL', name: 'Arturo Merino Benítez Intl', city: 'Santiago', lat: -33.3930, lng: -70.7858 },
  { code: 'PTY', name: 'Tocumen Intl', city: 'Panama City', lat: 9.0714, lng: -79.3835 },
  { code: 'UIO', name: 'Mariscal Sucre Intl', city: 'Quito', lat: -0.1292, lng: -78.3575 },
  { code: 'GIG', name: 'Galeão Intl', city: 'Rio de Janeiro', lat: -22.8100, lng: -43.2506 },

  // ─── Asia-Pacific ───────────────────────────────────────────────────────────
  { code: 'SIN', name: 'Singapore Changi', city: 'Singapore', lat: 1.3644, lng: 103.9915 },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', lat: 13.6900, lng: 100.7501 },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', lat: 22.3080, lng: 113.9185 },
  { code: 'NRT', name: 'Narita Intl', city: 'Tokyo', lat: 35.7647, lng: 140.3864 },
  { code: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', lat: 35.5494, lng: 139.7798 },
  { code: 'ICN', name: 'Incheon Intl', city: 'Seoul', lat: 37.4602, lng: 126.4407 },
  { code: 'PEK', name: 'Beijing Capital Intl', city: 'Beijing', lat: 40.0799, lng: 116.6031 },
  { code: 'PVG', name: 'Shanghai Pudong Intl', city: 'Shanghai', lat: 31.1443, lng: 121.8083 },
  { code: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', lat: 2.7456, lng: 101.7099 },
  { code: 'CGK', name: 'Soekarno-Hatta Intl', city: 'Jakarta', lat: -6.1256, lng: 106.6558 },
  { code: 'DPS', name: 'Ngurah Rai Intl', city: 'Bali', lat: -8.7482, lng: 115.1672 },
  { code: 'MNL', name: 'Ninoy Aquino Intl', city: 'Manila', lat: 14.5086, lng: 121.0198 },
  { code: 'TPE', name: 'Taiwan Taoyuan Intl', city: 'Taipei', lat: 25.0797, lng: 121.2342 },
  { code: 'HAN', name: 'Noi Bai Intl', city: 'Hanoi', lat: 21.2187, lng: 105.8050 },
  { code: 'SGN', name: 'Tan Son Nhat Intl', city: 'Ho Chi Minh City', lat: 10.8188, lng: 106.6520 },
  { code: 'HKT', name: 'Phuket Intl', city: 'Phuket', lat: 8.1132, lng: 98.3169 },
  { code: 'CMB', name: 'Bandaranaike Intl', city: 'Colombo', lat: 7.1808, lng: 79.8841 },
  { code: 'MLE', name: 'Velana Intl', city: 'Malé', lat: 4.1918, lng: 73.5292 },
  { code: 'KTM', name: 'Tribhuvan Intl', city: 'Kathmandu', lat: 27.6966, lng: 85.3591 },
  { code: 'DAC', name: 'Hazrat Shahjalal Intl', city: 'Dhaka', lat: 23.8433, lng: 90.3978 },
  { code: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', lat: -33.9461, lng: 151.1772 },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', lat: -37.6733, lng: 144.8433 },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', lat: -37.0082, lng: 174.7850 },
  // CHC (Christchurch) omitted — scraper can't parse, AKL used as fallback

  // ─── Africa ─────────────────────────────────────────────────────────────────
  { code: 'JNB', name: 'O.R. Tambo Intl', city: 'Johannesburg', lat: -26.1392, lng: 28.2460 },
  { code: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', lat: -33.9649, lng: 18.6017 },
  { code: 'NBO', name: 'Jomo Kenyatta Intl', city: 'Nairobi', lat: -1.3192, lng: 36.9278 },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', lat: 30.1219, lng: 31.4056 },
  { code: 'ADD', name: 'Bole Intl', city: 'Addis Ababa', lat: 8.9779, lng: 38.7993 },
  { code: 'CMN', name: 'Mohammed V Intl', city: 'Casablanca', lat: 33.3675, lng: -7.5898 },
  { code: 'RAK', name: 'Marrakech Menara', city: 'Marrakech', lat: 31.6069, lng: -8.0363 },
  { code: 'DAR', name: 'Julius Nyerere Intl', city: 'Dar es Salaam', lat: -6.8781, lng: 39.2026 },
  // ZNZ (Zanzibar) omitted — scraper can't parse, DAR (70km) used as fallback
  { code: 'LOS', name: 'Murtala Muhammed Intl', city: 'Lagos', lat: 6.5774, lng: 3.3213 },
];

/** Find the nearest major airport to a given lat/lng */
export function findNearestMajorAirport(lat: number, lng: number, maxDistanceKm: number = 1200): MajorAirport | null {
  let nearest: MajorAirport | null = null;
  let minDist = Infinity;

  for (const airport of MAJOR_AIRPORTS) {
    const dist = haversineKm(lat, lng, airport.lat, airport.lng);
    if (dist < minDist && dist <= maxDistanceKm) {
      minDist = dist;
      nearest = airport;
    }
  }

  return nearest;
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}
