export interface TripTemplate {
  id: string;
  title: string;
  description: string;
  duration: string;
  budget: string;
  image: string; // emoji
  tags: string[];
  from: { name: string; country: string; fullName: string };
  destinations: Array<{
    city: { name: string; country: string; fullName: string };
    nights: number;
  }>;
}

export const TRIP_TEMPLATES: TripTemplate[] = [
  {
    id: 'weekend-goa',
    title: 'Weekend in Goa',
    description: 'Beach vibes, nightlife, and Portuguese heritage',
    duration: '3 days',
    budget: '\u20B915,000 - \u20B925,000',
    image: '\uD83C\uDFD6\uFE0F',
    tags: ['Beach', 'Weekend', 'Budget'],
    from: { name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India' },
    destinations: [
      { city: { name: 'Goa', country: 'India', fullName: 'Goa, India' }, nights: 2 },
    ],
  },
  {
    id: 'rajasthan-heritage',
    title: 'Royal Rajasthan',
    description: 'Forts, palaces, deserts, and vibrant culture',
    duration: '7 days',
    budget: '\u20B940,000 - \u20B960,000',
    image: '\uD83C\uDFF0',
    tags: ['Culture', 'Heritage', 'Week'],
    from: { name: 'Delhi', country: 'India', fullName: 'New Delhi, Delhi, India' },
    destinations: [
      { city: { name: 'Jaipur', country: 'India', fullName: 'Jaipur, Rajasthan, India' }, nights: 2 },
      { city: { name: 'Udaipur', country: 'India', fullName: 'Udaipur, Rajasthan, India' }, nights: 2 },
      { city: { name: 'Jodhpur', country: 'India', fullName: 'Jodhpur, Rajasthan, India' }, nights: 2 },
    ],
  },
  {
    id: 'europe-classic',
    title: '10-Day Europe',
    description: 'Paris, Amsterdam, Barcelona \u2014 the classic route',
    duration: '10 days',
    budget: '\u20B91,50,000 - \u20B92,50,000',
    image: '\uD83D\uDDFC',
    tags: ['International', 'Culture', 'Popular'],
    from: { name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India' },
    destinations: [
      { city: { name: 'Paris', country: 'France', fullName: 'Paris, France' }, nights: 3 },
      { city: { name: 'Amsterdam', country: 'Netherlands', fullName: 'Amsterdam, Netherlands' }, nights: 3 },
      { city: { name: 'Barcelona', country: 'Spain', fullName: 'Barcelona, Spain' }, nights: 3 },
    ],
  },
  {
    id: 'honeymoon-bali',
    title: 'Honeymoon in Bali',
    description: 'Romantic villas, rice terraces, temples & sunsets',
    duration: '6 days',
    budget: '\u20B980,000 - \u20B91,20,000',
    image: '\uD83D\uDC91',
    tags: ['Romantic', 'International', 'Beach'],
    from: { name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India' },
    destinations: [
      { city: { name: 'Ubud', country: 'Indonesia', fullName: 'Ubud, Bali, Indonesia' }, nights: 3 },
      { city: { name: 'Seminyak', country: 'Indonesia', fullName: 'Seminyak, Bali, Indonesia' }, nights: 2 },
    ],
  },
  {
    id: 'japan-explorer',
    title: 'Japan Explorer',
    description: 'Tokyo, Kyoto, Osaka \u2014 temples, tech & street food',
    duration: '8 days',
    budget: '\u20B91,20,000 - \u20B91,80,000',
    image: '\uD83D\uDDFE',
    tags: ['International', 'Culture', 'Food'],
    from: { name: 'Delhi', country: 'India', fullName: 'New Delhi, Delhi, India' },
    destinations: [
      { city: { name: 'Tokyo', country: 'Japan', fullName: 'Tokyo, Japan' }, nights: 3 },
      { city: { name: 'Kyoto', country: 'Japan', fullName: 'Kyoto, Japan' }, nights: 2 },
      { city: { name: 'Osaka', country: 'Japan', fullName: 'Osaka, Japan' }, nights: 2 },
    ],
  },
  {
    id: 'kerala-backwaters',
    title: 'Kerala Backwaters',
    description: 'Houseboats, tea gardens, beaches & Ayurveda',
    duration: '5 days',
    budget: '\u20B925,000 - \u20B940,000',
    image: '\uD83D\uDEF6',
    tags: ['Nature', 'Relaxation', 'Budget'],
    from: { name: 'Bangalore', country: 'India', fullName: 'Bengaluru, Karnataka, India' },
    destinations: [
      { city: { name: 'Munnar', country: 'India', fullName: 'Munnar, Kerala, India' }, nights: 2 },
      { city: { name: 'Alleppey', country: 'India', fullName: 'Alappuzha, Kerala, India' }, nights: 2 },
    ],
  },
  {
    id: 'dubai-luxury',
    title: 'Dubai Luxury',
    description: 'Skyscrapers, desert safari, shopping & fine dining',
    duration: '4 days',
    budget: '\u20B960,000 - \u20B91,00,000',
    image: '\uD83C\uDFD9\uFE0F',
    tags: ['Luxury', 'International', 'Shopping'],
    from: { name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India' },
    destinations: [
      { city: { name: 'Dubai', country: 'UAE', fullName: 'Dubai, United Arab Emirates' }, nights: 3 },
    ],
  },
  {
    id: 'himachal-adventure',
    title: 'Himachal Adventure',
    description: 'Mountains, trekking, monasteries & snow',
    duration: '6 days',
    budget: '\u20B920,000 - \u20B935,000',
    image: '\uD83C\uDFD4\uFE0F',
    tags: ['Adventure', 'Mountains', 'Budget'],
    from: { name: 'Delhi', country: 'India', fullName: 'New Delhi, Delhi, India' },
    destinations: [
      { city: { name: 'Manali', country: 'India', fullName: 'Manali, Himachal Pradesh, India' }, nights: 3 },
      { city: { name: 'Shimla', country: 'India', fullName: 'Shimla, Himachal Pradesh, India' }, nights: 2 },
    ],
  },
];
