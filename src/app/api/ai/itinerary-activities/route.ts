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
    return NextResponse.json({ activities: getStaticFallback(city, days, targetCount, userPlaces) });
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
    { "name": "Place Name", "category": "landmark|museum|park|market|experience|religious|neighborhood|viewpoint", "durationMin": 45, "bestTime": "morning|afternoon|evening|anytime", "note": "One-line practical tip", "openingHours": "9 AM - 5 PM", "ticketPrice": "Free or e.g. €15", "dayIndex": 0 }
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
- Notes: specific and practical (e.g., "Buy tickets online to skip 2h queue", "Free entry first Sunday")
- openingHours: include if known. Skip for outdoor/24h places
- ticketPrice: ALWAYS include — use "Free" for free places, local currency for paid (e.g., "€20", "$15")
- NO duplicate activities
- Plan an efficient route — nearby activities should be on the same day
- mealCosts: average PER PERSON in local currency. breakfast=cafe, lunch=casual, dinner=mid-range
- localTransport: per-ride/km costs. metroSingleRide, busSingleRide, taxiPerKm, dailyPass (0 if unavailable)`;

  try {
    let text = '';

    if (openaiKey) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            max_tokens: 4096,
            temperature: 0.7,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          text = data.choices?.[0]?.message?.content || '';
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
      return NextResponse.json({ activities: getStaticFallback(city, days, targetCount, userPlaces) });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ activities: getStaticFallback(city, days, targetCount, userPlaces) });
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

    const mealCosts = parsed.mealCosts ? {
      currency: String(parsed.mealCosts.currency || 'USD'),
      breakfast: Number(parsed.mealCosts.breakfast) || 0,
      lunch: Number(parsed.mealCosts.lunch) || 0,
      dinner: Number(parsed.mealCosts.dinner) || 0,
    } : undefined;

    const localTransport = parsed.localTransport ? {
      currency: String(parsed.localTransport.currency || 'USD'),
      metroSingleRide: Number(parsed.localTransport.metroSingleRide) || 0,
      busSingleRide: Number(parsed.localTransport.busSingleRide) || 0,
      taxiPerKm: Number(parsed.localTransport.taxiPerKm) || 0,
      dailyPass: Number(parsed.localTransport.dailyPass) || 0,
    } : undefined;

    return NextResponse.json({ activities, dayThemes, mealCosts, localTransport, source: 'ai' });
  } catch (err) {
    console.error('AI itinerary-activities error:', err);
    return NextResponse.json({ activities: getStaticFallback(city, days, targetCount, userPlaces) });
  }
}

function getStaticFallback(city: string, days: number, count: number, userPlaces: string[]): ItineraryActivity[] {
  const activities: ItineraryActivity[] = [];

  // Include user places first
  for (const place of userPlaces) {
    activities.push({ name: place, category: 'landmark', durationMin: 90, bestTime: 'anytime' });
  }

  // Generic activities grouped by day theme
  const dayGroups: ItineraryActivity[][] = [
    // Day 0: Cultural
    [
      { name: `${city} Old Town`, category: 'neighborhood', durationMin: 90, bestTime: 'morning', dayIndex: 0 },
      { name: `${city} Museum`, category: 'museum', durationMin: 90, bestTime: 'morning', dayIndex: 0 },
      { name: `${city} Cathedral / Temple`, category: 'religious', durationMin: 45, bestTime: 'morning', dayIndex: 0 },
      { name: `${city} Main Square`, category: 'landmark', durationMin: 45, bestTime: 'anytime', dayIndex: 0 },
    ],
    // Day 1: Outdoor / Local
    [
      { name: `${city} City Park`, category: 'park', durationMin: 60, bestTime: 'afternoon', dayIndex: 1 },
      { name: `${city} Viewpoint`, category: 'viewpoint', durationMin: 30, bestTime: 'evening', note: 'Great for sunset', dayIndex: 1 },
      { name: `${city} Local Market`, category: 'market', durationMin: 60, bestTime: 'morning', note: 'Best visited early', dayIndex: 1 },
      { name: `${city} Waterfront`, category: 'neighborhood', durationMin: 60, bestTime: 'afternoon', dayIndex: 1 },
    ],
    // Day 2: Experiences
    [
      { name: `${city} Walking Tour`, category: 'experience', durationMin: 120, bestTime: 'morning', note: 'Explore the city on foot', dayIndex: 2 },
      { name: `${city} Food Street`, category: 'experience', durationMin: 60, bestTime: 'evening', note: 'Try local street food', dayIndex: 2 },
      { name: `${city} Art District`, category: 'neighborhood', durationMin: 75, bestTime: 'afternoon', dayIndex: 2 },
      { name: `${city} Night Market`, category: 'market', durationMin: 60, bestTime: 'evening', dayIndex: 2 },
    ],
  ];

  const usedNames = new Set(activities.map(a => a.name.toLowerCase()));
  for (let d = 0; d < Math.min(days, dayGroups.length); d++) {
    for (const g of dayGroups[d]) {
      if (activities.length >= count) break;
      if (!usedNames.has(g.name.toLowerCase())) {
        activities.push(g);
        usedNames.add(g.name.toLowerCase());
      }
    }
  }
  // Fill remaining from any day group
  for (const group of dayGroups) {
    for (const g of group) {
      if (activities.length >= count) break;
      if (!usedNames.has(g.name.toLowerCase())) {
        activities.push(g);
        usedNames.add(g.name.toLowerCase());
      }
    }
  }

  return activities.slice(0, count);
}
