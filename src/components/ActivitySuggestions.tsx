'use client';

import { useState, useRef } from 'react';
import { CITY_ATTRACTIONS } from '@/data/cityAttractions';

interface ActivitySuggestionsProps {
  cityName: string;
}

export default function ActivitySuggestions({ cityName }: ActivitySuggestionsProps) {
  const [expanded, setExpanded] = useState(false);
  const cacheRef = useRef<{ city: string; items: string[] } | null>(null);

  const getAttractions = (): string[] => {
    if (cacheRef.current?.city === cityName) return cacheRef.current.items;
    // Try exact match first, then case-insensitive partial match
    const attractions = CITY_ATTRACTIONS[cityName]
      || Object.entries(CITY_ATTRACTIONS).find(([key]) => key.toLowerCase() === cityName.toLowerCase())?.[1]
      || [];
    cacheRef.current = { city: cityName, items: attractions };
    return attractions;
  };

  const handleToggle = () => {
    setExpanded(prev => !prev);
  };

  const attractions = expanded ? getAttractions() : [];

  return (
    <div className="mt-1.5">
      <button
        onClick={handleToggle}
        className="text-[10px] text-text-muted hover:text-accent-cyan font-body transition-colors flex items-center gap-1"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        Things to do in {cityName}
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-0.5">
          {attractions.length > 0 ? (
            attractions.map((attraction, idx) => (
              <a
                key={idx}
                href={`https://www.google.com/maps/search/${encodeURIComponent(attraction + ' ' + cityName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-body text-text-secondary hover:text-accent-cyan transition-colors group"
              >
                <span className="text-text-muted group-hover:text-accent-cyan">&#8226;</span>
                <span>{attraction}</span>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ))
          ) : (
            <p className="text-[10px] text-text-muted font-body italic">No suggestions available for {cityName}</p>
          )}
        </div>
      )}
    </div>
  );
}
