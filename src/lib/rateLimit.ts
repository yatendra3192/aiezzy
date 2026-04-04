/**
 * Simple in-memory rate limiter for API route protection.
 *
 * Limits: per-key sliding window with automatic cleanup.
 * For production at scale, swap to @upstash/ratelimit with Redis.
 * In-memory is acceptable on Railway single-instance deployments.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory growth (every 5 minutes)
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    const keys = Array.from(store.keys());
    for (let i = 0; i < keys.length; i++) {
      const entry = store.get(keys[i]);
      if (entry && now > entry.resetAt) store.delete(keys[i]);
    }
  }, 5 * 60 * 1000);
}

/**
 * Check if a request is within the rate limit.
 * @param key   Unique key (e.g., "signup:1.2.3.4" or "forgot:user@email.com")
 * @param limit Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 * @returns { allowed: boolean; remaining: number; resetAt: number }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  scheduleCleanup();
  const now = Date.now();
  const entry = store.get(key);

  // Window expired or first request — start fresh
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  // Within window — check limit
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract client IP from request headers (works behind Railway/Vercel proxy).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
