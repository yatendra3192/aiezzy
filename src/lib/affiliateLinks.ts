// Generate booking affiliate links
// These are direct search URLs (no affiliate ID needed to start)
// Add affiliate IDs later when partnerships are established

export function getFlightBookingUrl(from: string, to: string, date: string, adults: number): string {
  // Skyscanner deep link format
  const fromCode = from.replace(/[^A-Z]/g, '').slice(0, 3);
  const toCode = to.replace(/[^A-Z]/g, '').slice(0, 3);
  const dateFormatted = date.replace(/-/g, '');
  return `https://www.skyscanner.co.in/transport/flights/${fromCode.toLowerCase()}/${toCode.toLowerCase()}/${dateFormatted.slice(2)}/?adults=${adults}&ref=aiezzy`;
}

export function getHotelBookingUrl(hotelName: string, city: string, checkIn: string, checkOut: string): string {
  // Booking.com search URL
  const query = encodeURIComponent(`${hotelName} ${city}`);
  return `https://www.booking.com/searchresults.html?ss=${query}&checkin=${checkIn}&checkout=${checkOut}&ref=aiezzy`;
}

export function getTrainBookingUrl(from: string, to: string, date: string, fromCode?: string, toCode?: string): string {
  // For Indian trains: IRCTC
  // For European trains: Trainline
  const indianCities = ['mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'ahmedabad', 'pune', 'goa', 'jaipur', 'indore', 'lucknow', 'chandigarh', 'kochi', 'thiruvananthapuram', 'varanasi', 'agra', 'udaipur', 'jodhpur', 'manali', 'shimla', 'rishikesh', 'amritsar', 'bhopal', 'patna', 'ranchi', 'guwahati', 'srinagar', 'dehradun'];
  const INDIAN_CODES = ['BOM', 'DEL', 'BLR', 'MAA', 'CCU', 'HYD', 'AMD', 'PNQ', 'GOI', 'JAI', 'IDR'];
  const isIndia = indianCities.some(city => from.toLowerCase().includes(city) || to.toLowerCase().includes(city))
    || (fromCode && INDIAN_CODES.includes(fromCode))
    || (toCode && INDIAN_CODES.includes(toCode));
  if (isIndia) {
    return `https://www.irctc.co.in/nget/train-search`;
  }
  const fromEnc = encodeURIComponent(from);
  const toEnc = encodeURIComponent(to);
  return `https://www.thetrainline.com/book/results?origin=${fromEnc}&destination=${toEnc}&outwardDate=${date}&ref=aiezzy`;
}

export function getMakeMyTripUrl(from: string, to: string, date: string, adults: number): string {
  const dateFormatted = date.replace(/-/g, '');
  return `https://www.makemytrip.com/flight/search?itinerary=${from}-${to}-${dateFormatted}&tripType=O&paxType=A-${adults}_C-0_I-0&cabinClass=E&ref=aiezzy`;
}
