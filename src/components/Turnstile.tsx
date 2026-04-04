'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

/**
 * Cloudflare Turnstile CAPTCHA widget.
 * Renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * In managed mode — invisible for most users, shows challenge only when suspicious.
 */
export default function Turnstile({ onToken, onExpire }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return;
    if (widgetIdRef.current) return; // Already rendered

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onToken(token),
      'expired-callback': () => {
        onExpire?.();
        onToken(''); // Clear token on expiry
      },
      theme: 'light',
      appearance: 'interaction-only', // Only shows when needed
    });
  }, [siteKey, onToken, onExpire]);

  useEffect(() => {
    if (!siteKey) return;

    // If script already loaded, render immediately
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Load the Turnstile script
    const existing = document.querySelector('script[src*="turnstile"]');
    if (!existing) {
      window.onTurnstileLoad = renderWidget;
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad';
      script.async = true;
      document.head.appendChild(script);
    } else {
      // Script exists but hasn't loaded yet
      window.onTurnstileLoad = renderWidget;
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, renderWidget]);

  // Don't render anything if no site key configured
  if (!siteKey) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
