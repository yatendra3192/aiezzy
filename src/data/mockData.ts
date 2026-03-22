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
  address?: string;
  lat?: number;
  lng?: number;
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

// ─── Place (user-selected attraction/landmark) ──────────────────────────────
export interface Place {
  id: string;
  name: string;        // "Louvre Museum"
  fullName: string;    // "Louvre Museum, Paris, France"
  placeId?: string;    // Google Places ID
  parentCity: string;  // "Paris" — from Google locality
  country: string;
  nights: number;      // nights for this place
}

// ─── Trip data types ─────────────────────────────────────────────────────────
export interface HotelStay {
  hotel: Hotel;
  nights: number;
}

export interface Destination {
  id: string;
  city: City;
  nights: number;
  selectedHotel: Hotel | null;
  additionalHotels?: HotelStay[];
  notes?: string;
  places: Place[];     // user's original places grouped here
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

// ─── Flights, Trains, Hotels ─────────────────────────────────────────────────
// Mock data removed — app uses live APIs exclusively.

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
/** @deprecated Mock data removed — app uses live APIs. Returns empty array. */
export function getFlightsForRoute(_fromCode: string, _toCode: string): Flight[] {
  return [];
}

/** @deprecated Mock data removed — app uses live APIs. Returns empty array. */
export function getTrainsForRoute(_fromCity: string, _toCity: string): TrainOption[] {
  return [];
}

/** @deprecated Mock data removed — app uses live APIs. Returns empty array. */
export function getHotelsForCity(_cityName: string): Hotel[] {
  return [];
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
