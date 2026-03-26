import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const mediaType = isPDF ? 'application/pdf' : (file.type || 'image/jpeg');

    const contentParts: any[] = [
      {
        type: 'input_text',
        text: `Extract flight or train ticket details from this ${isPDF ? 'PDF' : 'image'}. Return ONLY valid JSON (no markdown, no code fences):
{
  "type": "flight or train",
  "carrier": "Airline or train operator name (e.g., IndiGo, SNCF, Eurostar)",
  "number": "Flight or train number (e.g., 6E-21, TGV 6213)",
  "departure": "HH:MM (24h format)",
  "arrival": "HH:MM (24h format)",
  "duration": "Xh Ym format (e.g., 9h 5m)",
  "fromHub": "Full departure airport or station name (e.g., Chhatrapati Shivaji Maharaj International Airport)",
  "toHub": "Full arrival airport or station name (e.g., Amsterdam Airport Schiphol)",
  "fromCode": "3-letter IATA departure airport code (e.g., BOM) or null for trains",
  "toCode": "3-letter IATA arrival airport code (e.g., AMS) or null for trains",
  "from": "Departure city name",
  "to": "Arrival city name",
  "date": "YYYY-MM-DD",
  "adults": 1,
  "children": 0,
  "infants": 0,
  "priceTotal": 0,
  "currency": "INR",
  "bookingRef": "PNR or booking reference code",
  "stops": "Nonstop or 1 stop or 2 stops",
  "class": "Economy or Business or First"
}

Rules:
- Extract the airline/operator name (NOT the airport name)
- For flights: extract flight number (e.g., 6E-21, AI-101, EY-206)
- For trains: extract train number/name (e.g., TGV 6213, ECD9500)
- fromHub: FULL airport name (e.g., "Chhatrapati Shivaji Maharaj International Airport") or station name (e.g., "Paris Gare du Nord")
- toHub: FULL arrival airport or station name
- fromCode/toCode: 3-letter IATA codes for flights (e.g., BOM, AMS, CDG). Use null for trains
- Times must be in 24-hour HH:MM format (use LOCAL times at each airport/station)
- DURATION (critical — timezone-aware):
  - ALWAYS use the duration explicitly shown on the ticket if available (e.g., "09h 50m", "6h 15m")
  - For multi-segment/connecting flights: sum ALL segment durations + layover times to get total journey duration
  - Example: BCN 10:00 → AUH 19:15 (6h15m) + 1h55m layover + AUH 21:10 → BOM 01:50 (3h10m) = total 11h 20m
  - Do NOT simply subtract arrival time from departure time — different cities have different timezones!
  - Naive subtraction (01:50 - 10:00 = 15h50m) gives WRONG results for cross-timezone flights
- PASSENGER BREAKDOWN (critical): Carefully identify from the ticket:
  - adults: number of adult passengers (age 12+)
  - children: number of child passengers (age 2-11)
  - infants: number of infant passengers (age 0-2). Look for "INF", "infant", baby names, or age indicators
  - A single ticket may cover multiple passengers — look for passenger list, names, or "2 Adults + 1 Infant" type text
  - If ticket says "3 passengers" with no age breakdown, check names for clues (baby/infant names are often listed)
- PRICING: Extract the TOTAL price paid for ALL passengers combined as priceTotal
  - This must be the grand total shown on the ticket/booking (e.g., ₹80,322 for all passengers)
  - Do NOT divide by number of passengers — always return the full total
  - If only per-person price is shown, multiply by total passengers to get priceTotal
- Convert ALL prices to INR (EUR×93, USD×85, GBP×108). If already INR keep as-is
- Use null for fields you cannot determine`
      },
    ];

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

    // Use Responses API for PDF support
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: contentParts }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI extract-transport error:', err);
      return NextResponse.json({ error: 'Failed to process ticket' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
      || data.output?.[0]?.content?.[0]?.text || '';
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return NextResponse.json(JSON.parse(jsonMatch));
  } catch (err: any) {
    console.error('Extract transport error:', err);
    return NextResponse.json({ error: err.message || 'Failed to extract ticket details' }, { status: 500 });
  }
}
