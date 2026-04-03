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
  try {
    const body = await req.json();
    city = body.city;
    country = body.country || '';
    days = body.days || 2;
    userPlaces = body.userPlaces || [];
    month = body.month;
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

  const multiDayInstruction = days > 1
    ? `\nOrganize activities into ${days} logical day themes (e.g., Day 1: historic/cultural, Day 2: outdoor/nature, Day 3: local life/markets). Set "dayIndex" (0-based) for each activity to assign it to a day. Distribute activities evenly across days (~${perDay} per day + ${extras} extras without dayIndex).`
    : '';

  const systemPrompt = `You are an expert travel guide. Suggest specific activities and attractions for a city visit. Be practical: include realistic durations, best times of day, and useful visitor info. Prefer well-known landmarks, cultural sites, and unique local experiences over generic suggestions.`;

  const userPrompt = `Suggest ${targetCount} activities for ${days} day${days > 1 ? 's' : ''} in ${city}${country ? ', ' + country : ''}.${monthHint}
${userPlacesSection}${multiDayInstruction}
Return ONLY valid JSON (no other text):
{
  "activities": [
    { "name": "Place Name", "category": "landmark|museum|park|market|experience|religious|neighborhood|viewpoint", "durationMin": 45, "bestTime": "morning|afternoon|evening|anytime", "note": "One-line tip (optional)", "openingHours": "9 AM - 5 PM (optional, skip if unknown)", "ticketPrice": "Free or e.g. $15 (optional, skip if unknown)"${days > 1 ? ', "dayIndex": 0' : ''} }
  ]${days > 1 ? ',\n  "dayThemes": ["Historic & Cultural", "Outdoor & Nature"]' : ''},
  "mealCosts": { "currency": "EUR", "breakfast": 12, "lunch": 18, "dinner": 30 },
  "localTransport": { "currency": "EUR", "metroSingleRide": 2, "busSingleRide": 2, "taxiPerKm": 2.5, "dailyPass": 8 }
}

Rules:
- Return exactly ${targetCount} activities
- Duration in minutes: quick photo stops 20-30, parks/neighborhoods 45-60, museums 90-120, major landmarks 60-90, experiences 30-60
- bestTime: museums/indoor morning, parks/viewpoints afternoon or evening, markets morning, religious sites morning
- Include a mix of categories — not all landmarks
- Notes should be specific and practical (skip if obvious)
- openingHours: include only if you know them — use local format. Skip for outdoor/24h places
- ticketPrice: include only if you know — use local currency or "Free". Skip if unsure
- No duplicates
- mealCosts: average cost PER PERSON for a typical meal in this city. Use local currency. breakfast = cafe/bakery, lunch = casual restaurant, dinner = mid-range restaurant
- localTransport: typical per-ride or per-km costs in this city. metroSingleRide = one metro/subway ticket, busSingleRide = one bus ticket, taxiPerKm = taxi/cab rate per kilometer, dailyPass = day pass for public transport if available (0 if not)`;

  try {
    let text = '';

    if (openaiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
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
    }

    // Fallback to Anthropic
    if (!text && anthropicKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
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
