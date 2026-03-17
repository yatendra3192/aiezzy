// ─── Transport Hub ───────────────────────────────────────────────────────────
export interface TransportHub {
  name: string;
  code?: string;
  /** Time from hub to city center / typical hotel area */
  transitToCenter: { durationMin: number; distance: string; type: 'drive' | 'publicTransit' | 'walk' };
}

// ─── City ────────────────────────────────────────────────────────────────────
export interface City {
  name: string;
  country: string;
  fullName: string;
  /** City name extracted from Google Places secondaryText (e.g., "Indore" from "Indore, Madhya Pradesh, India") */
  parentCity?: string;
  airport?: TransportHub;
  /** Shorthand kept for quick lookups */
  airportCode?: string;
  trainStation?: TransportHub;
  busStation?: TransportHub;
  /** Minutes from "from address" to this city's airport (only relevant for departure city) */
  homeToAirportMin?: number;
  /** Minutes from "from address" to this city's train station */
  homeToStationMin?: number;
}

// ─── Flight ──────────────────────────────────────────────────────────────────
export interface Flight {
  id: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  departure: string;   // "HH:MM"
  arrival: string;     // "HH:MM" (local at destination)
  duration: string;
  stops: string;
  route: string;
  pricePerAdult: number;
  color: string;
}

// ─── Train ───────────────────────────────────────────────────────────────────
export interface TrainOption {
  id: string;
  operator: string;
  trainName: string;
  trainNumber: string;
  departure: string;   // "HH:MM"
  arrival: string;     // "HH:MM"
  duration: string;
  stops: string;
  fromStation: string;
  toStation: string;
  price: number;       // per person
  color: string;
}

// ─── Hotel ───────────────────────────────────────────────────────────────────
export interface Hotel {
  id: string;
  name: string;
  rating: number;
  pricePerNight: number;
  ratingColor: string;
}

// ─── Transit (local, within-city) ────────────────────────────────────────────
export interface TransitRoute {
  id: string;
  departure: string;
  arrival: string;
  duration: string;
  steps: TransitStep[];
  fromStation: string;
  price: number;
}

export interface TransitStep {
  type: 'walk' | 'metro' | 'train' | 'bus';
  label: string;
  color?: string;
  duration: string;
}

// ─── Trip data types ─────────────────────────────────────────────────────────
export interface Destination {
  id: string;
  city: City;
  nights: number;
  selectedHotel: Hotel | null;
}

export interface ResolvedAirports {
  fromCode: string; toCode: string;
  fromAirport: string; toAirport: string;
  fromCity: string; toCity: string;
  fromDistance: number; toDistance: number;
  nearestFromCode?: string; nearestFromCity?: string; nearestFromDist?: number;
}

export interface TransportLeg {
  id: string;
  type: 'flight' | 'train' | 'bus' | 'drive';
  duration: string;
  distance: string;
  selectedFlight: Flight | null;
  selectedTrain: TrainOption | null;
  /** Departure time from the terminal (airport/station), not from home */
  departureTime: string | null;
  /** Arrival time at arrival terminal */
  arrivalTime: string | null;
  /** Resolved airport info (persisted for display after reload) */
  resolvedAirports?: ResolvedAirports | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

export const CITIES: City[] = [
  {
    name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India',
    airportCode: 'BOM',
    airport: { name: 'Chhatrapati Shivaji Maharaj International Airport', code: 'BOM', transitToCenter: { durationMin: 35, distance: '22 mi', type: 'drive' } },
    trainStation: { name: 'Chhatrapati Shivaji Maharaj Terminus (CSMT)', transitToCenter: { durationMin: 15, distance: '2.5 mi', type: 'drive' } },
    homeToAirportMin: 27,
    homeToStationMin: 40,
  },
  {
    name: 'Amsterdam', country: 'Netherlands', fullName: 'Amsterdam, Netherlands',
    airportCode: 'AMS',
    airport: { name: 'Amsterdam Airport Schiphol', code: 'AMS', transitToCenter: { durationMin: 19, distance: '12.2 mi', type: 'drive' } },
    trainStation: { name: 'Amsterdam Centraal', transitToCenter: { durationMin: 8, distance: '0.5 mi', type: 'walk' } },
  },
  {
    name: 'Bruges', country: 'Belgium', fullName: 'Bruges, Belgium',
    trainStation: { name: 'Brugge Station', transitToCenter: { durationMin: 12, distance: '0.8 mi', type: 'walk' } },
    busStation: { name: 'Bruges Bus Station', transitToCenter: { durationMin: 10, distance: '0.6 mi', type: 'walk' } },
  },
  {
    name: 'Paris', country: 'France', fullName: 'Paris, France',
    airportCode: 'CDG',
    airport: { name: 'Charles de Gaulle Airport', code: 'CDG', transitToCenter: { durationMin: 35, distance: '20 mi', type: 'publicTransit' } },
    trainStation: { name: 'Paris Gare du Nord', transitToCenter: { durationMin: 10, distance: '1.2 mi', type: 'publicTransit' } },
  },
  {
    name: 'Barcelona', country: 'Spain', fullName: 'Barcelona, Spain',
    airportCode: 'BCN',
    airport: { name: 'Barcelona-El Prat Airport', code: 'BCN', transitToCenter: { durationMin: 25, distance: '13 mi', type: 'publicTransit' } },
    trainStation: { name: 'Barcelona Sants', transitToCenter: { durationMin: 12, distance: '2 mi', type: 'publicTransit' } },
  },
  {
    name: 'London', country: 'UK', fullName: 'London, United Kingdom',
    airportCode: 'LHR',
    airport: { name: 'Heathrow Airport', code: 'LHR', transitToCenter: { durationMin: 40, distance: '18 mi', type: 'publicTransit' } },
    trainStation: { name: 'London St Pancras International', transitToCenter: { durationMin: 5, distance: '0.3 mi', type: 'walk' } },
  },
  {
    name: 'Rome', country: 'Italy', fullName: 'Rome, Italy',
    airportCode: 'FCO',
    airport: { name: 'Leonardo da Vinci Airport', code: 'FCO', transitToCenter: { durationMin: 32, distance: '20 mi', type: 'publicTransit' } },
    trainStation: { name: 'Roma Termini', transitToCenter: { durationMin: 8, distance: '0.7 mi', type: 'walk' } },
  },
  {
    name: 'Berlin', country: 'Germany', fullName: 'Berlin, Germany',
    airportCode: 'BER',
    airport: { name: 'Berlin Brandenburg Airport', code: 'BER', transitToCenter: { durationMin: 30, distance: '14 mi', type: 'publicTransit' } },
    trainStation: { name: 'Berlin Hauptbahnhof', transitToCenter: { durationMin: 10, distance: '1 mi', type: 'publicTransit' } },
  },
  {
    name: 'Prague', country: 'Czech Republic', fullName: 'Prague, Czech Republic',
    airportCode: 'PRG',
    airport: { name: 'V\u00e1clav Havel Airport', code: 'PRG', transitToCenter: { durationMin: 30, distance: '11 mi', type: 'publicTransit' } },
    trainStation: { name: 'Praha hlavn\u00ed n\u00e1dra\u017e\u00ed', transitToCenter: { durationMin: 5, distance: '0.3 mi', type: 'walk' } },
  },
  {
    name: 'Vienna', country: 'Austria', fullName: 'Vienna, Austria',
    airportCode: 'VIE',
    airport: { name: 'Vienna International Airport', code: 'VIE', transitToCenter: { durationMin: 22, distance: '12 mi', type: 'publicTransit' } },
    trainStation: { name: 'Wien Hauptbahnhof', transitToCenter: { durationMin: 8, distance: '1 mi', type: 'publicTransit' } },
  },
  { name: 'Delhi', country: 'India', fullName: 'New Delhi, India', airportCode: 'DEL', airport: { name: 'Indira Gandhi International Airport', code: 'DEL', transitToCenter: { durationMin: 40, distance: '14 mi', type: 'drive' } }, trainStation: { name: 'New Delhi Railway Station', transitToCenter: { durationMin: 10, distance: '1 mi', type: 'drive' } } },
  { name: 'Dubai', country: 'UAE', fullName: 'Dubai, UAE', airportCode: 'DXB', airport: { name: 'Dubai International Airport', code: 'DXB', transitToCenter: { durationMin: 15, distance: '7 mi', type: 'drive' } } },
  { name: 'Goa', country: 'India', fullName: 'Goa, India', airportCode: 'GOI', airport: { name: 'Goa International Airport', code: 'GOI', transitToCenter: { durationMin: 30, distance: '16 mi', type: 'drive' } }, trainStation: { name: 'Madgaon Junction', transitToCenter: { durationMin: 20, distance: '5 mi', type: 'drive' } } },
  { name: 'Bangkok', country: 'Thailand', fullName: 'Bangkok, Thailand', airportCode: 'BKK', airport: { name: 'Suvarnabhumi Airport', code: 'BKK', transitToCenter: { durationMin: 30, distance: '18 mi', type: 'publicTransit' } } },
  { name: 'Singapore', country: 'Singapore', fullName: 'Singapore', airportCode: 'SIN', airport: { name: 'Changi Airport', code: 'SIN', transitToCenter: { durationMin: 25, distance: '12 mi', type: 'publicTransit' } } },
];

// ─── Flights ─────────────────────────────────────────────────────────────────
export const FLIGHTS: Record<string, Flight[]> = {
  'BOM-AMS': [
    { id: 'f1', airline: 'IndiGo', airlineCode: '6E', flightNumber: '6E21', departure: '05:40', arrival: '11:15', duration: '9h 5m', stops: 'Nonstop', route: 'BOM-AMS', pricePerAdult: 18612, color: '#4f46e5' },
    { id: 'f2', airline: 'Air India', airlineCode: 'AI', flightNumber: 'AI123', departure: '08:30', arrival: '18:55', duration: '13h 55m', stops: '1 stop \u00b7 1h 50m in DEL', route: 'BOM-AMS', pricePerAdult: 22144, color: '#dc2626' },
    { id: 'f3', airline: 'Air India Express', airlineCode: 'IX', flightNumber: 'IX456', departure: '06:05', arrival: '18:55', duration: '16h 20m', stops: '1 stop \u00b7 4h 15m in DEL', route: 'BOM-AMS', pricePerAdult: 25719, color: '#2563eb' },
    { id: 'f4', airline: 'Etihad', airlineCode: 'EY', flightNumber: 'EY789', departure: '23:10', arrival: '19:10', duration: '23h 30m', stops: '1 stop \u00b7 13h 20m in AUH', route: 'BOM-AMS', pricePerAdult: 26082, color: '#b45309' },
  ],
  'AMS-BRU': [
    { id: 'f5', airline: 'KLM', airlineCode: 'KL', flightNumber: 'KL1723', departure: '07:00', arrival: '08:10', duration: '1h 10m', stops: 'Nonstop', route: 'AMS-BRU', pricePerAdult: 8500, color: '#0284c7' },
  ],
  'CDG-BCN': [
    { id: 'f6', airline: 'Vueling', airlineCode: 'VY', flightNumber: 'VY8001', departure: '10:30', arrival: '12:30', duration: '2h', stops: 'Nonstop', route: 'CDG-BCN', pricePerAdult: 7200, color: '#eab308' },
  ],
  'BCN-BOM': [
    { id: 'f7', airline: 'Air India', airlineCode: 'AI', flightNumber: 'AI145', departure: '14:00', arrival: '03:30', duration: '10h 30m', stops: '1 stop \u00b7 2h in DEL', route: 'BCN-BOM', pricePerAdult: 24500, color: '#dc2626' },
  ],
};

// ─── Trains ──────────────────────────────────────────────────────────────────
export const TRAINS: Record<string, TrainOption[]> = {
  'Amsterdam-Bruges': [
    { id: 't1', operator: 'Thalys', trainName: 'Thalys', trainNumber: 'THA 9325', departure: '07:16', arrival: '10:01', duration: '2h 45m', stops: '1 stop \u00b7 Brussels-Midi', fromStation: 'Amsterdam Centraal', toStation: 'Brugge Station', price: 4200, color: '#8b0041' },
    { id: 't2', operator: 'NS / NMBS', trainName: 'IC Direct + IC', trainNumber: 'IC 9225', departure: '08:30', arrival: '11:55', duration: '3h 25m', stops: '2 stops \u00b7 Antwerp, Ghent', fromStation: 'Amsterdam Centraal', toStation: 'Brugge Station', price: 2800, color: '#003082' },
    { id: 't3', operator: 'Thalys', trainName: 'Thalys', trainNumber: 'THA 9327', departure: '09:16', arrival: '12:01', duration: '2h 45m', stops: '1 stop \u00b7 Brussels-Midi', fromStation: 'Amsterdam Centraal', toStation: 'Brugge Station', price: 3800, color: '#8b0041' },
    { id: 't4', operator: 'FlixTrain', trainName: 'FlixTrain', trainNumber: 'FLX 1234', departure: '06:45', arrival: '10:45', duration: '4h 0m', stops: '3 stops', fromStation: 'Amsterdam Centraal', toStation: 'Brugge Station', price: 1900, color: '#73d700' },
  ],
  'Bruges-Paris': [
    { id: 't5', operator: 'Thalys', trainName: 'Thalys', trainNumber: 'THA 9346', departure: '08:42', arrival: '11:05', duration: '2h 23m', stops: '1 stop \u00b7 Brussels-Midi', fromStation: 'Brugge Station', toStation: 'Paris Gare du Nord', price: 5200, color: '#8b0041' },
    { id: 't6', operator: 'Thalys', trainName: 'Thalys', trainNumber: 'THA 9348', departure: '10:42', arrival: '13:05', duration: '2h 23m', stops: '1 stop \u00b7 Brussels-Midi', fromStation: 'Brugge Station', toStation: 'Paris Gare du Nord', price: 4800, color: '#8b0041' },
    { id: 't7', operator: 'NMBS / SNCF', trainName: 'IC + TGV', trainNumber: 'TGV 6214', departure: '07:15', arrival: '11:02', duration: '3h 47m', stops: '2 stops \u00b7 Brussels, Lille', fromStation: 'Brugge Station', toStation: 'Paris Gare du Nord', price: 3500, color: '#003082' },
  ],
  'Paris-Barcelona': [
    { id: 't8', operator: 'Renfe-SNCF', trainName: 'TGV-AVE', trainNumber: 'AVE 9713', departure: '09:42', arrival: '16:12', duration: '6h 30m', stops: 'Nonstop', fromStation: 'Paris Gare de Lyon', toStation: 'Barcelona Sants', price: 8500, color: '#6f1d77' },
    { id: 't9', operator: 'Renfe-SNCF', trainName: 'TGV-AVE', trainNumber: 'AVE 9715', departure: '14:07', arrival: '20:37', duration: '6h 30m', stops: 'Nonstop', fromStation: 'Paris Gare de Lyon', toStation: 'Barcelona Sants', price: 7200, color: '#6f1d77' },
    { id: 't10', operator: 'Ouigo', trainName: 'Ouigo', trainNumber: 'OGO 7601', departure: '07:05', arrival: '13:55', duration: '6h 50m', stops: '1 stop \u00b7 Perpignan', fromStation: 'Paris Gare de Lyon', toStation: 'Barcelona Sants', price: 4500, color: '#0096db' },
  ],
  'Barcelona-Paris': [
    { id: 't11', operator: 'Renfe-SNCF', trainName: 'TGV-AVE', trainNumber: 'AVE 9714', departure: '09:25', arrival: '15:55', duration: '6h 30m', stops: 'Nonstop', fromStation: 'Barcelona Sants', toStation: 'Paris Gare de Lyon', price: 7800, color: '#6f1d77' },
  ],
  'Amsterdam-Paris': [
    { id: 't12', operator: 'Thalys', trainName: 'Thalys', trainNumber: 'THA 9323', departure: '07:00', arrival: '10:18', duration: '3h 18m', stops: 'Nonstop', fromStation: 'Amsterdam Centraal', toStation: 'Paris Gare du Nord', price: 6500, color: '#8b0041' },
  ],
};

// ─── Hotels ──────────────────────────────────────────────────────────────────
export const HOTELS: Record<string, Hotel[]> = {
  Amsterdam: [
    { id: 'h1', name: 'The Flying Pig Downtown Hostel', rating: 4.3, pricePerNight: 3524, ratingColor: '#22c55e' },
    { id: 'h2', name: 'Ramada by Wyndham Amsterdam Airport Schiphol', rating: 4.0, pricePerNight: 8787, ratingColor: '#22c55e' },
    { id: 'h3', name: 'SUPPER Hotel', rating: 4.1, pricePerNight: 9631, ratingColor: '#22c55e' },
    { id: 'h4', name: 'DoubleTree by Hilton Amsterdam \u2013 NDSM Wharf', rating: 4.4, pricePerNight: 9889, ratingColor: '#22c55e' },
    { id: 'h5', name: 'Hotel NH Amsterdam Leidseplein', rating: 4.1, pricePerNight: 14332, ratingColor: '#22c55e' },
    { id: 'h6', name: 'Hotel NH City Centre Amsterdam', rating: 4.2, pricePerNight: 17471, ratingColor: '#22c55e' },
  ],
  Bruges: [
    { id: 'h7', name: 'Hotel Dukes\' Palace', rating: 4.6, pricePerNight: 12500, ratingColor: '#22c55e' },
    { id: 'h8', name: 'Hotel Montanus', rating: 4.3, pricePerNight: 8900, ratingColor: '#22c55e' },
    { id: 'h9', name: 'Snuffel Hostel', rating: 4.1, pricePerNight: 2800, ratingColor: '#22c55e' },
  ],
  Paris: [
    { id: 'h10', name: 'Generator Paris', rating: 4.0, pricePerNight: 4200, ratingColor: '#22c55e' },
    { id: 'h11', name: 'H\u00f4tel de Lille', rating: 4.5, pricePerNight: 15600, ratingColor: '#22c55e' },
    { id: 'h12', name: 'Novotel Paris Centre Gare Montparnasse', rating: 4.2, pricePerNight: 11200, ratingColor: '#22c55e' },
  ],
  Barcelona: [
    { id: 'h13', name: 'Casa Gracia Barcelona', rating: 4.4, pricePerNight: 6800, ratingColor: '#22c55e' },
    { id: 'h14', name: 'Hotel 1898', rating: 4.5, pricePerNight: 13400, ratingColor: '#22c55e' },
    { id: 'h15', name: 'Sant Jordi Hostels Rock Palace', rating: 4.1, pricePerNight: 3200, ratingColor: '#22c55e' },
  ],
};

// ─── Transit (local routes within city) ──────────────────────────────────────
export const TRANSIT_ROUTES: TransitRoute[] = [
  { id: 'tr1', departure: '11:17 AM', arrival: '11:53 AM', duration: '36 mins', fromStation: 'Waterlooplein', price: 273, steps: [{ type: 'walk', label: '', duration: '4 mins' }, { type: 'metro', label: '54 (6)', color: '#22c55e', duration: '' }, { type: 'walk', label: '', duration: '1 min' }, { type: 'train', label: 'Intercity direct (2)', color: '#f97316', duration: '' }, { type: 'walk', label: '', duration: '5 mins' }] },
  { id: 'tr2', departure: '11:13 AM', arrival: '11:53 AM', duration: '40 mins', fromStation: 'Waterlooplein', price: 273, steps: [{ type: 'walk', label: '', duration: '4 mins' }, { type: 'metro', label: '54 (2)', color: '#22c55e', duration: '' }, { type: 'walk', label: '', duration: '5 mins' }, { type: 'train', label: 'Sprinter (3)', color: '#ec4899', duration: '' }, { type: 'walk', label: '', duration: '4 mins' }] },
  { id: 'tr3', departure: '11:17 AM', arrival: '12:00 PM', duration: '43 mins', fromStation: 'Waterlooplein', price: 273, steps: [{ type: 'walk', label: '', duration: '4 mins' }, { type: 'metro', label: '54 (8)', color: '#22c55e', duration: '' }, { type: 'walk', label: '', duration: '1 min' }, { type: 'train', label: 'Intercity (3)', color: '#ec4899', duration: '' }, { type: 'walk', label: '', duration: '5 mins' }] },
];

// ─── Default transport legs (between each stop) ─────────────────────────────
export const DEFAULT_TRANSPORT_LEGS: TransportLeg[] = [
  { id: 'tl1', type: 'flight', duration: '9h 5m', distance: '6,272 mi', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null },
  { id: 'tl2', type: 'train', duration: '2h 45m', distance: '164 mi', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null },
  { id: 'tl3', type: 'train', duration: '2h 23m', distance: '182 mi', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null },
  { id: 'tl4', type: 'train', duration: '6h 30m', distance: '644 mi', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null },
  { id: 'tl5', type: 'flight', duration: '10h 30m', distance: '6,409 mi', selectedFlight: null, selectedTrain: null, departureTime: null, arrivalTime: null },
];

// ─── City-specific attractions for explore days ─────────────────────────────
export const CITY_ATTRACTIONS: Record<string, string[]> = {
  Amsterdam: ['Rijksmuseum', 'Vondelpark', 'Anne Frank House', 'Dam Square'],
  Bruges: ['Markt Square', 'Belfry of Bruges', 'Church of Our Lady', 'Bruges Canals'],
  Paris: ['Eiffel Tower', 'Louvre Museum', 'Montmartre', 'Notre-Dame Cathedral'],
  Barcelona: ['La Sagrada Familia', 'Park Guell', 'La Rambla', 'Gothic Quarter'],
  London: ['Tower of London', 'British Museum', 'Hyde Park', 'Buckingham Palace'],
  Rome: ['Colosseum', 'Vatican City', 'Trevi Fountain', 'Pantheon'],
  Berlin: ['Brandenburg Gate', 'Museum Island', 'East Side Gallery', 'Reichstag'],
  Prague: ['Charles Bridge', 'Old Town Square', 'Prague Castle', 'John Lennon Wall'],
  Vienna: ['Sch\u00f6nbrunn Palace', 'St. Stephen\'s Cathedral', 'Belvedere Palace', 'Prater Park'],
  Mumbai: ['Gateway of India', 'Marine Drive', 'Elephanta Caves', 'Colaba Causeway'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getFlightsForRoute(fromCode: string, toCode: string): Flight[] {
  return FLIGHTS[`${fromCode}-${toCode}`] || FLIGHTS['BOM-AMS'];
}

export function getTrainsForRoute(fromCity: string, toCity: string): TrainOption[] {
  return TRAINS[`${fromCity}-${toCity}`] || TRAINS[`${toCity}-${fromCity}`] || [];
}

export function getHotelsForCity(cityName: string): Hotel[] {
  return HOTELS[cityName] || HOTELS['Amsterdam'];
}

/** Get the departure hub for a leg: airport for flights, train station for trains */
export function getDepartureHub(city: City, type: TransportLeg['type']): TransportHub | null {
  if (type === 'flight') return city.airport || null;
  if (type === 'train') return city.trainStation || null;
  if (type === 'bus') return city.busStation || city.trainStation || null;
  return null;
}

/** Get the arrival hub for a leg */
export function getArrivalHub(city: City, type: TransportLeg['type']): TransportHub | null {
  return getDepartureHub(city, type);
}

/** Drive distance estimates between city pairs (km, for display) */
export const DRIVE_ESTIMATES: Record<string, { duration: string; distance: string }> = {
  'Amsterdam-Bruges': { duration: '2 hr 50 min', distance: '264 km' },
  'Bruges-Paris': { duration: '3 hr 0 min', distance: '294 km' },
  'Paris-Barcelona': { duration: '10 hr 30 min', distance: '1,035 km' },
  'Barcelona-Mumbai': { duration: '~', distance: '~' },
  'Mumbai-Amsterdam': { duration: '~', distance: '~' },
};

export function getDriveEstimate(from: string, to: string): { duration: string; distance: string } {
  return DRIVE_ESTIMATES[`${from}-${to}`] || DRIVE_ESTIMATES[`${to}-${from}`] || { duration: '~', distance: '~' };
}
