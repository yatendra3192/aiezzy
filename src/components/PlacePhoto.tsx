'use client';

import { useState, useEffect, memo } from 'react';

// Module-level cache: key → url (null = no photo, undefined = not fetched)
const urlCache: Record<string, string | null | undefined> = {};

interface PlacePhotoProps {
  name: string;
  city: string;
  className?: string;
  fallbackIcon?: string;
}

export default memo(function PlacePhoto({ name, city, className = 'w-14 h-14', fallbackIcon }: PlacePhotoProps) {
  const key = `${name}|${city}`;
  const cached = urlCache[key];
  const [url, setUrl] = useState<string | null | undefined>(cached);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    // Already have a result in cache
    if (urlCache[key] !== undefined) {
      setUrl(urlCache[key]);
      return;
    }

    let cancelled = false;

    fetch(`/api/place-photo?q=${encodeURIComponent(name + ', ' + city)}`)
      .then(r => r.json())
      .then(data => {
        const photoUrl = data.url || null;
        urlCache[key] = photoUrl;
        if (!cancelled) setUrl(photoUrl);
      })
      .catch(() => {
        urlCache[key] = null;
        if (!cancelled) setUrl(null);
      });

    return () => { cancelled = true; };
  }, [name, city, key]);

  // Loading state (url is undefined = not yet fetched)
  if (url === undefined) {
    return (
      <div className={`bg-gray-200 animate-pulse rounded-lg flex-shrink-0 ${className}`} />
    );
  }

  // Image loaded successfully
  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        className={`object-cover rounded-lg flex-shrink-0 ${className}`}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  // No photo or image failed — show category icon fallback
  if (fallbackIcon) {
    return (
      <div className={`bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center ${className}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={fallbackIcon} />
        </svg>
      </div>
    );
  }

  return null;
});
