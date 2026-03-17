'use client';

import { useState, useEffect } from 'react';

interface WeatherBadgeProps {
  city: string;
  date: string; // YYYY-MM-DD
}

function weatherEmoji(code: number): string {
  if (code === 0) return '\u2600\uFE0F'; // sun
  if (code >= 1 && code <= 3) return '\u26C5'; // partly cloudy
  if (code >= 45 && code <= 48) return '\uD83C\uDF2B\uFE0F'; // fog
  if (code >= 51 && code <= 57) return '\uD83C\uDF27\uFE0F'; // drizzle
  if (code >= 61 && code <= 67) return '\uD83C\uDF27\uFE0F'; // rain
  if (code >= 71 && code <= 77) return '\u2744\uFE0F'; // snow
  if (code >= 80 && code <= 82) return '\uD83C\uDF26\uFE0F'; // showers
  if (code >= 85 && code <= 86) return '\uD83C\uDF28\uFE0F'; // snow showers
  if (code >= 95 && code <= 99) return '\u26C8\uFE0F'; // thunderstorm
  return '\u2600\uFE0F';
}

export default function WeatherBadge({ city, date }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<{
    temp_max: number;
    temp_min: number;
    weathercode: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!city || !date) { setLoading(false); return; }

    // Open-Meteo only supports ~16 days forecast; skip if too far out or in the past
    const dateObj = new Date(date);
    const now = new Date();
    const diffDays = (dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 15 || diffDays < 0) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/weather?city=${encodeURIComponent(city)}&date=${date}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then(data => {
        if (!cancelled && data.temp_max !== undefined) {
          setWeather(data);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [city, date]);

  // Loading: small shimmer placeholder
  if (loading) {
    return (
      <span className="inline-block w-16 h-4 bg-bg-card rounded-full animate-pulse" />
    );
  }

  // Error or no data: don't show anything
  if (!weather) return null;

  return (
    <span className="text-[10px] font-mono text-text-muted bg-bg-card rounded-full px-2 py-0.5 inline-flex items-center gap-1">
      {weatherEmoji(weather.weathercode)} {Math.round(weather.temp_max)}&deg;/{Math.round(weather.temp_min)}&deg;
    </span>
  );
}
