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
        type: 'text',
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
  ]
}

Rules:
- Analyze ALL documents together to build one complete trip itinerary
- Deduce the origin city from the first departure point
- Order destinations chronologically based on travel dates
- For hotels: extract full street address, calculate nights from check-in/check-out, calculate per-night price from total if needed
- Convert ALL prices to INR (EUR×93, USD×85, GBP×108, THB×2.5, JPY×0.57). If already INR keep as-is
- If travelers count is shown (e.g., "3 guests", "2 passengers"), extract it. Otherwise default to adults=1
- Determine tripType: if there's a return flight/train to origin city, it's "roundTrip", else "oneWay"
- Combine info across documents — a flight booking and hotel booking for the same city should create one destination entry
- Use null for any field you cannot determine
- segments array should contain every individual booking (each flight, each hotel) in chronological order
- destinations array should be the deduplicated city-level summary in travel order
- sourceFileIndex: 0-based index of which uploaded file/image this segment was extracted from (first file=0, second=1, etc). This is critical for linking documents to bookings`
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
          type: 'file',
          file: {
            filename: file.name,
            file_data: `data:${mediaType};base64,${base64}`,
          },
        });
      } else {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${mediaType};base64,${base64}`,
            detail: 'high',
          },
        });
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: contentParts }],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI extract-trip error:', err);
      return NextResponse.json({ error: 'Failed to process bookings' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Extract trip error:', err);
    return NextResponse.json({ error: err.message || 'Failed to extract trip details' }, { status: 500 });
  }
}
