import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

/** Server-side Supabase client with service role (bypasses RLS).
 *  Use ONLY for admin operations (auth, migrations, shared trips). */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Create a Supabase client that impersonates a specific user via a signed JWT.
 * RLS policies (`auth.uid() = user_id`) are enforced at the database level.
 *
 * Use for all user-facing data operations (trips, profile, booking-docs).
 *
 * Requires SUPABASE_JWT_SECRET env var (from Supabase Dashboard > Settings > API > JWT Secret).
 * Falls back to service client if JWT secret is not configured (backward compatible).
 */
export async function createUserClient(userId: string) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Fallback: if JWT secret not configured, use service client with manual user_id filtering
  if (!jwtSecret) {
    return createServiceClient();
  }

  // Sign a short-lived JWT with the user's ID — Supabase reads `sub` as auth.uid()
  const secret = new TextEncoder().encode(jwtSecret);
  const token = await new SignJWT({
    sub: userId,
    role: 'authenticated',
    iss: 'supabase',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);

  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
