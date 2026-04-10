import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/** Lightweight document classifier — determines type and cities from ONE file */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });

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
        text: `What type of travel document is this? Return ONLY valid JSON (no markdown):
{"type":"flight or train or hotel","from":"departure city or null","to":"arrival city or null","city":"hotel city or null"}

Rules:
- type: "flight" for airline tickets, "train" for rail tickets, "hotel" for accommodation bookings
- from/to: departure and arrival CITY names (not airport/station names) for transport
- city: the city where the accommodation is located for hotels
- Use simple city names (e.g., "Mumbai" not "Chhatrapati Shivaji Maharaj International Airport")`
      },
    ];

    if (isPDF) {
      contentParts.push({ type: 'input_file', filename: file.name, file_data: `data:${mediaType};base64,${base64}` });
    } else {
      contentParts.push({ type: 'input_image', image_url: `data:${mediaType};base64,${base64}` });
    }

    // Use Responses API for PDF support
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-5.4',
        input: [{ role: 'user', content: contentParts }],
        temperature: 0,
      }),
    });

    if (!response.ok) return NextResponse.json({ type: 'general', from: null, to: null, city: null });

    const data = await response.json();
    const text = data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
      || data.output?.[0]?.content?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ type: 'general', from: null, to: null, city: null });
  }
}
