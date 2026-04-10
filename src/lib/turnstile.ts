/**
 * Server-side Cloudflare Turnstile token verification.
 * Returns true if token is valid, false if invalid, or true if Turnstile is not configured.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // If Turnstile is not configured, skip verification (graceful degradation)
  if (!secret) return true;

  // If no token provided but Turnstile is configured, reject
  if (!token) return false;

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });

    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification failed:', err);
    // Fail open on network errors — don't block signups due to Turnstile outage
    return true;
  }
}
