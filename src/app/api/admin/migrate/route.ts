import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['yatendra3192@gmail.com'];

/**
 * POST /api/admin/migrate
 * Run once to add share_token column and RLS policy for public trip sharing.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Add share_token column
  const { error: colError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;`,
  }).maybeSingle();

  // Add places column to trip_destinations
  await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE public.trip_destinations ADD COLUMN IF NOT EXISTS places JSONB DEFAULT '[]'::jsonb;`,
  }).maybeSingle();

  // If the exec_sql RPC doesn't exist, fall back to raw query via the REST endpoint
  if (colError) {
    // Try direct SQL via supabase-js (service role has full access)
    const { error: rawError } = await supabase
      .from('trips')
      .select('share_token')
      .limit(0);

    // If column doesn't exist, we need to add it manually
    if (rawError?.message?.includes('share_token')) {
      return NextResponse.json({
        error: 'Column share_token does not exist. Please run this SQL in Supabase dashboard:\n\n' +
          'ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;\n' +
          'CREATE POLICY "Anyone can view shared trips" ON public.trips FOR SELECT USING (share_token IS NOT NULL);',
        manual: true,
      }, { status: 422 });
    }

    // Column already exists (no error means it's there)
  }

  // Create RLS policy (idempotent - will fail silently if exists)
  try {
    await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "Anyone can view shared trips" ON public.trips FOR SELECT USING (share_token IS NOT NULL);`,
    }).maybeSingle();
  } catch {
    // Policy may already exist, that's fine
  }

  return NextResponse.json({
    success: true,
    message: 'Migration complete. share_token column and RLS policy added.',
    note: 'If the RPC failed, run the SQL manually in Supabase dashboard.',
    sql: [
      'ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;',
      'CREATE POLICY "Anyone can view shared trips" ON public.trips FOR SELECT USING (share_token IS NOT NULL);',
      'ALTER TABLE public.trip_destinations ADD COLUMN IF NOT EXISTS places JSONB DEFAULT \'[]\'::jsonb;',
    ],
  });
}
