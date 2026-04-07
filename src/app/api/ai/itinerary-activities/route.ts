import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface ItineraryActivity {
  name: string;
  category: string;
  durationMin: number;
  bestTime: string;
  note?: string;
  openingHours?: string;
  ticketPrice?: string;
  dayIndex?: number;
  lat?: number;
  lng?: number;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let city: string, country: string, days: number, userPlaces: string[], month: string | undefined;
  // Rich context: hotel, time windows, dates for smarter planning
  let hotel: string | undefined, timeWindows: Array<{ dayIndex: number; date: string; slots: Array<{ from: string; to: string; label: string }> }> | undefined;
  try {
    const body = await req.json();
    city = body.city;
    country = body.country || '';
    days = body.days || 2;
    userPlaces = body.userPlaces || [];
    month = body.month;
    hotel = body.hotel;
    timeWindows = body.timeWindows;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!city) return NextResponse.json({ error: 'City required' }, { status: 400 });

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const perDay = 7;
  const extras = 3;
  const targetCount = days * perDay + extras;

  if (!openaiKey && !anthropicKey) {
    return NextResponse.json({ activities: [], error: 'No AI API key configured' });
  }

  const userPlacesSection = userPlaces.length > 0
    ? `\nThe user has already added these places (MUST include them in your output with appropriate durations):\n${userPlaces.map(p => `- ${p}`).join('\n')}\n`
    : '';

  const monthHint = month ? ` The trip is in ${month}.` : '';

  // Build rich context from time windows
  let scheduleContext = '';
  if (timeWindows && timeWindows.length > 0) {
    scheduleContext = `\n\nDETAILED SCHEDULE — fill EVERY time slot with activities:\n`;
    for (const tw of timeWindows) {
      scheduleContext += `Day ${tw.dayIndex + 1} (${tw.date}):\n`;
      for (const slot of tw.slots) {
        scheduleContext += `  ${slot.from} - ${slot.to}: ${slot.label}\n`;
      }
    }
    scheduleContext += `\nAssign each activity a "dayIndex" (0-based) matching the day above. Fill ALL slots — morning AND afternoon. Each slot should have 2-4 activities depending on duration.\n`;
  }

  const hotelContext = hotel ? `\nStaying at: ${hotel} (suggest activities near the hotel and plan an efficient walking route)\n` : '';

  const systemPrompt = `You are an expert local travel guide who creates detailed, realistic day plans. You know opening hours, ticket prices, and the best order to visit places. You fill EVERY available time slot with activities — no empty afternoons. Prefer well-known landmarks, cultural sites, and unique local experiences.`;

  const userPrompt = `Plan ${targetCount} activities for ${days} day${days > 1 ? 's' : ''} in ${city}${country ? ', ' + country : ''}.${monthHint}
${hotelContext}${userPlacesSection}${scheduleContext}
Return ONLY valid JSON (no other text):
{
  "activities": [
    { "name": "Place Name", "category": "landmark|museum|park|market|experience|religious|neighborhood|viewpoint", "durationMin": 45, "bestTime": "morning|afternoon|evening|anytime", "note": "One-line practical tip", "openingHours": "9 AM - 5 PM", "ticketPrice": "Free or e.g. €15", "dayIndex": 0, "lat": 52.3676, "lng": 4.9041 }
  ],
  "dayThemes": ["Historic & Cultural", "Outdoor & Nature"],
  "mealCosts": { "currency": "EUR", "breakfast": 12, "lunch": 18, "dinner": 30 },
  "localTransport": { "currency": "EUR", "metroSingleRide": 2, "busSingleRide": 2, "taxiPerKm": 2.5, "dailyPass": 8 }
}

Rules:
- Return EXACTLY ${targetCount} activities — this is critical. ${days} days × ${perDay} activities + ${extras} extras
- Distribute EVENLY: each dayIndex must have ${perDay} activities. Do NOT put all on day 0
- Duration: photo stops 20-30min, parks/neighborhoods 45-60, museums 90-120, landmarks 60-90, experiences 30-60
- bestTime: museums morning, parks/viewpoints afternoon, markets morning, religious sites morning
- Mix of categories — not all landmarks
- Use REAL specific place names (e.g., "National Museum" not "Prague Museum", "Old Town Square" not "Main Square")
- Notes: specific and practical (e.g., "Buy tickets online to skip 2h queue", "Free entry first Sunday")
- openingHours: ALWAYS include for indoor places (e.g., "9 AM - 5 PM"). Use "Open 24h" for outdoor/parks
- ticketPrice: ALWAYS include for EVERY activity — use "Free" for free places, local currency for paid (e.g., "€20", "CZK 250", "$15"). Never omit this field
- NO duplicate activities
- lat/lng: ALWAYS include precise GPS coordinates (decimal degrees, 4+ decimals) for EVERY activity. Use the exact location of the entrance/main point
- Plan an efficient route — nearby activities should be on the same day
- mealCosts: average PER PERSON in local currency. breakfast=cafe, lunch=casual, dinner=mid-range
- localTransport: per-ride/km costs. metroSingleRide, busSingleRide, taxiPerKm, dailyPass (0 if unavailable)`;

  try {
    let text = '';

    if (openaiKey) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-5.4',
            input: [
              { role: 'user', content: [{ type: 'input_text', text: systemPrompt + '\n\n' + userPrompt }] },
            ],
            text: { format: { type: 'text' } },
            reasoning: { effort: 'medium', summary: 'auto' },
            store: true,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          text = data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
            || data.output?.[0]?.content?.[0]?.text || '';
        } else {
          console.error('OpenAI itinerary-activities error:', response.status);
        }
      } catch (e: any) {
        console.error('OpenAI itinerary-activities timeout/error:', e.name === 'AbortError' ? 'timeout (20s)' : e.message);
      } finally {
        clearTimeout(timeout);
      }
    }

    // Fallback to Anthropic
    if (!text && anthropicKey) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          text = data.content?.[0]?.text || '';
        }
      } catch (e: any) {
        console.error('Anthropic itinerary-activities timeout/error:', e.name === 'AbortError' ? 'timeout (20s)' : e.message);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!text) {
      return NextResponse.json({ activities: [] });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ activities: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const activities: ItineraryActivity[] = (parsed.activities || []).map((a: any) => ({
      name: String(a.name || ''),
      category: String(a.category || 'landmark'),
      durationMin: Number(a.durationMin) || 60,
      bestTime: String(a.bestTime || 'anytime'),
      note: a.note ? String(a.note) : undefined,
      openingHours: a.openingHours ? String(a.openingHours) : undefined,
      ticketPrice: a.ticketPrice ? String(a.ticketPrice) : undefined,
      dayIndex: typeof a.dayIndex === 'number' ? a.dayIndex : undefined,
    })).filter((a: ItineraryActivity) => a.name);

    const dayThemes: string[] | undefined = parsed.dayThemes && Array.isArray(parsed.dayThemes)
      ? parsed.dayThemes.map((t: any) => String(t))
      : undefined;

    const mealCosts = parsed.mealCosts ? (() => {
      const cur = String(parsed.mealCosts.currency || 'USD').toUpperCase();
      let breakfast = Number(parsed.mealCosts.breakfast) || 0;
      let lunch = Number(parsed.mealCosts.lunch) || 0;
      let dinner = Number(parsed.mealCosts.dinner) || 0;
      // Sanity check: AI sometimes returns USD values labeled as local currency
      // Minimum reasonable lunch costs per currency (if below, values are likely in USD)
      const minLunch: Record<string, number> = { THB: 50, JPY: 500, INR: 100, IDR: 15000, VND: 30000, KRW: 5000, CZK: 80, HUF: 1500, KHR: 3000, NPR: 200, LKR: 300, PHP: 100 };
      const minVal = minLunch[cur];
      if (minVal && lunch > 0 && lunch < minVal) {
        // Values look like USD — convert using approximate USD-to-local rates
        const usdRate: Record<string, number> = { THB: 33, JPY: 160, INR: 93, IDR: 16800, VND: 26000, KRW: 1500, CZK: 25, HUF: 400, KHR: 4100, NPR: 140, LKR: 330, PHP: 60 };
        const r = usdRate[cur] || 1;
        breakfast = Math.round(breakfast * r);
        lunch = Math.round(lunch * r);
        dinner = Math.round(dinner * r);
      }
      return { currency: cur, breakfast, lunch, dinner };
    })() : undefined;

    const localTransport = parsed.localTransport ? (() => {
      const cur = String(parsed.localTransport.currency || 'USD').toUpperCase();
      let metroSingleRide = Number(parsed.localTransport.metroSingleRide) || 0;
      let busSingleRide = Number(parsed.localTransport.busSingleRide) || 0;
      let taxiPerKm = Number(parsed.localTransport.taxiPerKm) || 0;
      let dailyPass = Number(parsed.localTransport.dailyPass) || 0;
      // Sanity check: if taxi/km seems like USD but currency is local
      const minTaxi: Record<string, number> = { THB: 5, JPY: 50, INR: 10, IDR: 2000, VND: 5000, KRW: 500, CZK: 10, HUF: 200, KHR: 500, PHP: 10 };
      const minVal = minTaxi[cur];
      if (minVal && taxiPerKm > 0 && taxiPerKm < minVal) {
        const usdRate: Record<string, number> = { THB: 35, JPY: 155, INR: 85, IDR: 16000, VND: 25000, KRW: 1400, CZK: 24, HUF: 380, KHR: 4100, PHP: 58 };
        const r = usdRate[cur] || 1;
        metroSingleRide = Math.round(metroSingleRide * r);
        busSingleRide = Math.round(busSingleRide * r);
        taxiPerKm = Math.round(taxiPerKm * r * 10) / 10;
        dailyPass = Math.round(dailyPass * r);
      }
      return { currency: cur, metroSingleRide, busSingleRide, taxiPerKm, dailyPass };
    })() : undefined;

    return NextResponse.json({ activities, dayThemes, mealCosts, localTransport, source: 'ai' });
  } catch (err) {
    console.error('AI itinerary-activities error:', err);
    return NextResponse.json({ activities: [] });
  }
}

