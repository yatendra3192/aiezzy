import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Build content parts with all uploaded files
    const contentParts: any[] = [
      {
        type: 'input_text',
        text: `You are analyzing travel booking documents (flight tickets, hotel confirmations, Airbnb bookings, train tickets, etc). Extract ALL trip information and return a single unified trip plan.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "origin": {
    "city": "Home/departure city name",
    "country": "Country"
  },
  "departureDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD or null if one-way",
  "travelers": {
    "adults": 1,
    "children": 0,
    "infants": 0
  },
  "tripType": "roundTrip or oneWay",
  "segments": [
    {
      "type": "flight or train or hotel",
      "sourceFileIndex": 0,
      "from": "Departure city (for transport)",
      "to": "Arrival city (for transport)",
      "departureDate": "YYYY-MM-DD",
      "departureTime": "HH:MM",
      "arrivalDate": "YYYY-MM-DD",
      "arrivalTime": "HH:MM",
      "carrier": "Airline/train operator name",
      "flightNumber": "Flight/train number",
      "fromHub": "Full airport or station name (e.g., Chhatrapati Shivaji Maharaj International Airport)",
      "toHub": "Full arrival airport or station name",
      "fromCode": "3-letter IATA code (for flights, e.g., BOM) or null",
      "toCode": "3-letter IATA code (for flights, e.g., AMS) or null",
      "duration": "Total journey duration in Xh Ym format",
      "stops": "Nonstop or 1 stop or 2 stops or Direct",
      "bookingRef": "Confirmation/PNR code",
      "priceTotal": 0,
      "priceCurrency": "INR",
      "hotelName": "Property name (for hotels)",
      "hotelAddress": "Full address (for hotels)",
      "checkIn": "YYYY-MM-DD (for hotels)",
      "checkOut": "YYYY-MM-DD (for hotels)",
      "nights": 0,
      "pricePerNight": 0,
      "city": "City where hotel is located"
    }
  ],
  "destinations": [
    {
      "city": "City name",
      "country": "Country",
      "nights": 2,
      "hotel": {
        "name": "Hotel/property name or null",
        "address": "Full address or null",
        "pricePerNight": 0
      }
    }
  ],
  "fileDescriptions": [
    {
      "fileIndex": 0,
      "type": "flight or train or hotel",
      "from": "Departure city (for transport) or null",
      "to": "Arrival city (for transport) or null",
      "city": "City name (for hotels) or null",
      "carrier": "Airline or train operator (for transport) or null",
      "summary": "Brief description e.g. 'IndiGo Mumbai to Amsterdam flight ticket'"
    }
  ]
}

Rules:
- Analyze ALL documents together to build one complete trip itinerary
- Deduce the origin city from the first departure point
- Order destinations chronologically based on travel dates
- DESTINATIONS must match the cities where the traveler STAYS (has a hotel). Do NOT add transit cities as destinations
  - Example: if train goes Amsterdam → Brussels but hotel is in Bruges, the destination is "Bruges" NOT "Brussels"
- For hotels: extract full street address, calculate nights from check-in/check-out, calculate per-night price from total if needed
- Convert ALL prices to INR (EUR×93, USD×85, GBP×108, THB×2.5, JPY×0.57). If already INR keep as-is
- TRAVELERS (critical): Carefully identify adults vs children vs infants:
  - adults: passengers age 12+
  - children: passengers age 2-11
  - infants: passengers age 0-2. Look for "INF", "infant", baby names, age indicators
  - Do NOT count infants as adults. "2 adults + 1 infant" means adults=2, infants=1
- Determine tripType: if there's a return flight/train to origin city, it's "roundTrip", else "oneWay"
- Combine info across documents — a flight booking and hotel booking for the same city should create one destination entry
- Use null for any field you cannot determine
- SEGMENTS: each flight, hotel, or train as a separate entry in chronological order
  - For transport: include fromHub (full airport/station name), toHub, fromCode (IATA), toCode
  - For transport: use duration shown on ticket, NOT naive time subtraction (different timezones!)
  - For multi-leg flights: include total duration including layovers
  - priceTotal must be the TOTAL price for ALL passengers (do NOT divide)
- DESTINATIONS must be exactly the cities where hotels are booked, in travel order
- segments should map 1:1 to legs: first transport segment = origin→dest[0], second = dest[0]→dest[1], etc.
- sourceFileIndex: 0-based index of source file (first uploaded file=0, second=1, etc)
- fileDescriptions: MUST have one entry per uploaded file/image. For each file, describe what it contains:
  - fileIndex: 0-based matching the upload order
  - type: "flight", "train", or "hotel" based on content
  - from/to: departure and arrival city for transport documents
  - city: city name for hotel/accommodation documents
  - This is critical for linking each PDF/image to the correct booking on the trip`
      }
    ];

    for (const file of files) {
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const mediaType = isPDF ? 'application/pdf' : (file.type || 'image/jpeg');

      if (isPDF) {
        contentParts.push({
          type: 'input_file',
          filename: file.name,
          file_data: `data:${mediaType};base64,${base64}`,
        });
      } else {
        contentParts.push({
          type: 'input_image',
          image_url: `data:${mediaType};base64,${base64}`,
        });
      }
    }

    // Use Responses API for PDF support (Chat Completions doesn't accept PDF files)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: contentParts }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI extract-trip error:', err);
      return NextResponse.json({ error: 'Failed to process bookings' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
      || data.output?.[0]?.content?.[0]?.text || '';
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Extract trip error:', err);
    return NextResponse.json({ error: err.message || 'Failed to extract trip details' }, { status: 500 });
  }
}
