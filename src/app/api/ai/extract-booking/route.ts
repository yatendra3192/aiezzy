import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trackApiCall } from '@/lib/apiTracker';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file as base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    // Determine media type
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const mediaType = isPDF ? 'application/pdf' : (file.type || 'image/jpeg');

    // For PDFs, use the file input type; for images use image_url
    const contentParts: any[] = [
      {
        type: 'input_text',
        text: `Extract booking details from this ${isPDF ? 'PDF' : 'image'}. Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "name": "Property/hotel name",
  "address": "Full street address including city and country",
  "pricePerNight": 0,
  "totalPrice": 0,
  "currency": "INR",
  "checkIn": "YYYY-MM-DD",
  "checkOut": "YYYY-MM-DD",
  "nights": 0,
  "guests": 0,
  "confirmationCode": ""
}

Rules:
- Extract the property/stay name exactly as shown
- Get the full address with street, city, state/region, postal code, country
- For price: extract the total amount paid and price per night. If only total is shown, divide by nights to get per-night price
- Convert all prices to INR (Indian Rupees). If price is in EUR multiply by 93, USD multiply by 85, GBP multiply by 108. If already INR, keep as is
- If a field is not found, use null for strings, 0 for numbers
- For dates, convert to YYYY-MM-DD format
- Extract number of guests if shown
- Extract confirmation/booking code if shown`
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        input: [{ role: 'user', content: contentParts }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI extract-booking error:', err);
      return NextResponse.json({ error: 'Failed to process booking' }, { status: 500 });
    }

    const data = await response.json();
    trackApiCall('openai_responses');
    const text = data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
      || data.output?.[0]?.content?.[0]?.text || '';

    // Parse JSON from response (strip markdown fences if present)
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Extract booking error:', err);
    return NextResponse.json({ error: 'Failed to extract booking details' }, { status: 500 });
  }
}
