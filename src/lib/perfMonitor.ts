// Lightweight performance monitoring using Web Vitals
// Reports Core Web Vitals (LCP, FID, CLS) to console and optionally to an endpoint

interface PerfMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: string;
}

const metrics: PerfMetric[] = [];

export function reportMetric(metric: { name: string; value: number; rating: string }) {
  const entry: PerfMetric = {
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating as PerfMetric['rating'],
    timestamp: new Date().toISOString(),
  };
  metrics.push(entry);

  if (process.env.NODE_ENV === 'development') {
    const color = entry.rating === 'good' ? '\u{1F7E2}' : entry.rating === 'needs-improvement' ? '\u{1F7E1}' : '\u{1F534}';
    console.log(`${color} [Perf] ${entry.name}: ${entry.value}ms (${entry.rating})`);
  }
}

export function getMetrics(): PerfMetric[] {
  return [...metrics];
}
