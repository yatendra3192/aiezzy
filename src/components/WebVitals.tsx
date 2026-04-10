'use client';
import { useEffect } from 'react';
import { reportMetric } from '@/lib/perfMonitor';

export default function WebVitals() {
  useEffect(() => {
    // Use PerformanceObserver for basic metrics
    if (typeof window === 'undefined' || !window.PerformanceObserver) return;

    // Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          const value = last.startTime;
          reportMetric({ name: 'LCP', value, rating: value < 2500 ? 'good' : value < 4000 ? 'needs-improvement' : 'poor' });
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          const value = entry.processingStart - entry.startTime;
          reportMetric({ name: 'FID', value, rating: value < 100 ? 'good' : value < 300 ? 'needs-improvement' : 'poor' });
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch {}

    // Navigation timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.domContentLoadedEventEnd) {
            reportMetric({ name: 'TTFB', value: entry.responseStart, rating: entry.responseStart < 800 ? 'good' : entry.responseStart < 1800 ? 'needs-improvement' : 'poor' });
          }
        });
      });
      navObserver.observe({ type: 'navigation', buffered: true });
    } catch {}
  }, []);
  return null;
}
