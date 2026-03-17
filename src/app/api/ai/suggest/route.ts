import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let prompt: string;
  try {
    const body = await req.json();
    prompt = body.prompt;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: return template-based suggestions when no API key
    return NextResponse.json(getFallbackSuggestion(prompt));
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a travel planner. Based on this request, suggest a trip plan as JSON.

Request: "${prompt}"

Return ONLY valid JSON in this format (no other text):
{
  "title": "Trip title",
  "destinations": [
    { "city": "City Name", "country": "Country", "nights": 2, "reason": "Why visit" }
  ],
  "estimatedBudget": "₹X,XX,XXX",
  "bestTimeToVisit": "Month - Month",
  "tips": ["tip1", "tip2"]
}

Include 2-5 destinations. Keep nights realistic (1-4 per city). Match the budget if specified.`
        }],
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return NextResponse.json(getFallbackSuggestion(prompt));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });

    const suggestion = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestion, source: 'ai' });
  } catch (err) {
    console.error('AI suggest error:', err);
    return NextResponse.json(getFallbackSuggestion(prompt));
  }
}

function getFallbackSuggestion(prompt: string) {
  // Simple keyword-based templates when no API key
  const lower = prompt.toLowerCase();

  const templates: Record<string, any> = {
    beach: {
      title: 'Beach Paradise Getaway',
      destinations: [
        { city: 'Goa', country: 'India', nights: 3, reason: 'Beautiful beaches, nightlife, Portuguese architecture' },
        { city: 'Pondicherry', country: 'India', nights: 2, reason: 'French Quarter, serene beaches, spiritual vibes' },
      ],
      estimatedBudget: '₹35,000 - ₹50,000',
      bestTimeToVisit: 'October - March',
      tips: ['Book beach shacks in advance during peak season', 'Try local seafood at beach-side restaurants'],
    },
    europe: {
      title: 'European Explorer',
      destinations: [
        { city: 'Paris', country: 'France', nights: 3, reason: 'Eiffel Tower, Louvre, French cuisine' },
        { city: 'Amsterdam', country: 'Netherlands', nights: 2, reason: 'Canals, Van Gogh Museum, cycling culture' },
        { city: 'Barcelona', country: 'Spain', nights: 3, reason: 'Sagrada Familia, beaches, tapas' },
      ],
      estimatedBudget: '₹1,50,000 - ₹2,50,000',
      bestTimeToVisit: 'April - October',
      tips: ['Get a Eurail pass for train travel between cities', 'Book museums online to skip queues'],
    },
    japan: {
      title: 'Japan Discovery',
      destinations: [
        { city: 'Tokyo', country: 'Japan', nights: 3, reason: 'Shibuya, temples, anime culture, street food' },
        { city: 'Kyoto', country: 'Japan', nights: 2, reason: 'Traditional temples, geisha district, bamboo forest' },
        { city: 'Osaka', country: 'Japan', nights: 2, reason: 'Street food capital, Osaka Castle, vibrant nightlife' },
      ],
      estimatedBudget: '₹1,20,000 - ₹1,80,000',
      bestTimeToVisit: 'March - May or October - November',
      tips: ['Get a Japan Rail Pass for bullet train travel', 'Cherry blossom season (late March-April) is magical'],
    },
    budget: {
      title: 'Budget-Friendly Adventure',
      destinations: [
        { city: 'Manali', country: 'India', nights: 3, reason: 'Mountains, adventure sports, scenic beauty' },
        { city: 'Rishikesh', country: 'India', nights: 2, reason: 'River rafting, yoga, spiritual vibes' },
      ],
      estimatedBudget: '₹15,000 - ₹25,000',
      bestTimeToVisit: 'March - June or September - November',
      tips: ['Travel by bus to save on flights', 'Stay in hostels for budget accommodation'],
    },
    honeymoon: {
      title: 'Romantic Honeymoon',
      destinations: [
        { city: 'Bali', country: 'Indonesia', nights: 4, reason: 'Romantic villas, temples, rice terraces, sunsets' },
        { city: 'Singapore', country: 'Singapore', nights: 2, reason: 'Gardens by the Bay, Marina Bay, shopping' },
      ],
      estimatedBudget: '₹80,000 - ₹1,20,000',
      bestTimeToVisit: 'April - October',
      tips: ['Book a private villa in Ubud for the best experience', 'Visit Sentosa Island for a day trip'],
    },
    thailand: {
      title: 'Thailand Explorer',
      destinations: [
        { city: 'Bangkok', country: 'Thailand', nights: 3, reason: 'Grand Palace, street food, vibrant nightlife' },
        { city: 'Chiang Mai', country: 'Thailand', nights: 2, reason: 'Temples, night bazaar, elephant sanctuaries' },
        { city: 'Phuket', country: 'Thailand', nights: 3, reason: 'Stunning beaches, island hopping, water sports' },
      ],
      estimatedBudget: '₹60,000 - ₹90,000',
      bestTimeToVisit: 'November - February',
      tips: ['Eat at local street stalls for authentic Thai food', 'Book island tours through your hotel for better rates'],
    },
    adventure: {
      title: 'Adventure Trail',
      destinations: [
        { city: 'Leh', country: 'India', nights: 3, reason: 'High-altitude desert, monasteries, Pangong Lake' },
        { city: 'Manali', country: 'India', nights: 2, reason: 'Rohtang Pass, river rafting, paragliding' },
      ],
      estimatedBudget: '₹25,000 - ₹40,000',
      bestTimeToVisit: 'June - September',
      tips: ['Acclimatize for 1-2 days in Leh before activities', 'Book a bike rental for the best Ladakh experience'],
    },
    culture: {
      title: 'Cultural Heritage Trail',
      destinations: [
        { city: 'Jaipur', country: 'India', nights: 2, reason: 'Amber Fort, Hawa Mahal, royal heritage' },
        { city: 'Udaipur', country: 'India', nights: 2, reason: 'Lake Palace, City Palace, romantic lakeside views' },
        { city: 'Varanasi', country: 'India', nights: 2, reason: 'Ganges ghats, ancient temples, spiritual experience' },
      ],
      estimatedBudget: '₹20,000 - ₹35,000',
      bestTimeToVisit: 'October - March',
      tips: ['Attend the Ganga Aarti ceremony in Varanasi at sunset', 'Hire a local guide for fort tours in Jaipur'],
    },
  };

  // Match keywords (try multiple)
  for (const [key, template] of Object.entries(templates)) {
    if (lower.includes(key)) return { suggestion: template, source: 'template' };
  }

  // Default
  return { suggestion: templates.europe, source: 'template' };
}
