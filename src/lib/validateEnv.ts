/**
 * Validates required environment variables at startup.
 * Import this in API routes or instrumentation to catch missing config early.
 */

interface EnvCheck {
  key: string;
  required: boolean;
  label: string;
}

const SERVER_ENV: EnvCheck[] = [
  { key: 'NEXTAUTH_SECRET', required: true, label: 'NextAuth JWT signing' },
  { key: 'NEXTAUTH_URL', required: true, label: 'NextAuth base URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true, label: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, label: 'Supabase anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true, label: 'Supabase service role' },
  { key: 'SUPABASE_JWT_SECRET', required: true, label: 'Supabase JWT secret (RLS enforcement)' },
  { key: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', required: true, label: 'Google Maps API' },
  { key: 'OPENAI_API_KEY', required: false, label: 'OpenAI (AI features)' },
  { key: 'ANTHROPIC_API_KEY', required: false, label: 'Anthropic (AI fallback)' },
  { key: 'AMADEUS_API_KEY', required: false, label: 'Amadeus (flights)' },
  { key: 'AMADEUS_API_SECRET', required: false, label: 'Amadeus secret' },
  { key: 'FLIGHTS_API_URL', required: false, label: 'Scraper API URL' },
  { key: 'FLIGHTS_API_KEY', required: false, label: 'Scraper API key' },
  { key: 'GOOGLE_CLIENT_ID', required: false, label: 'Google OAuth' },
  { key: 'GOOGLE_CLIENT_SECRET', required: false, label: 'Google OAuth secret' },
  { key: 'CATALOG_SUPABASE_URL', required: false, label: 'Catalog DB URL' },
  { key: 'CATALOG_SUPABASE_ANON_KEY', required: false, label: 'Catalog DB key' },
];

export function validateEnv() {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const env of SERVER_ENV) {
    const value = process.env[env.key];
    if (!value) {
      if (env.required) {
        missing.push(`  ${env.key} — ${env.label}`);
      } else {
        warnings.push(`  ${env.key} — ${env.label}`);
      }
    }
  }

  // Check for weak NEXTAUTH_SECRET
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (secret && (secret.length < 32 || secret.includes('change-in-production'))) {
    console.warn('[env] WARNING: NEXTAUTH_SECRET is weak. Generate a strong one: openssl rand -base64 48');
  }

  if (missing.length > 0) {
    console.error('[env] MISSING REQUIRED environment variables:\n' + missing.join('\n'));
  }

  if (warnings.length > 0) {
    console.warn('[env] Optional environment variables not set (some features disabled):\n' + warnings.join('\n'));
  }

  return { missing, warnings, ok: missing.length === 0 };
}
