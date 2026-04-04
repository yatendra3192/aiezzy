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

  // Add deep_plan_data and booking_docs columns to trips table
  try {
    await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS deep_plan_data JSONB DEFAULT NULL;`,
    }).maybeSingle();
    await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS booking_docs JSONB DEFAULT NULL;`,
    }).maybeSingle();
  } catch {
    // RPC may not exist — SQL will be provided for manual execution
  }

  // RLS policies for user-scoped access (defense-in-depth with createUserClient)
  const rlsPolicies = [
    // trips: users can only CRUD their own trips
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own trips' AND tablename = 'trips') THEN CREATE POLICY "Users can view own trips" ON public.trips FOR SELECT USING (auth.uid() = user_id); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own trips' AND tablename = 'trips') THEN CREATE POLICY "Users can insert own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own trips' AND tablename = 'trips') THEN CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (auth.uid() = user_id); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own trips' AND tablename = 'trips') THEN CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id); END IF; END $$;`,
    // trip_destinations: access via trip ownership (join check)
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own destinations' AND tablename = 'trip_destinations') THEN CREATE POLICY "Users can manage own destinations" ON public.trip_destinations FOR ALL USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_destinations.trip_id AND trips.user_id = auth.uid())); END IF; END $$;`,
    // trip_transport_legs: access via trip ownership
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own transport' AND tablename = 'trip_transport_legs') THEN CREATE POLICY "Users can manage own transport" ON public.trip_transport_legs FOR ALL USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_transport_legs.trip_id AND trips.user_id = auth.uid())); END IF; END $$;`,
    // profiles: users can only access their own profile
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own profile' AND tablename = 'profiles') THEN CREATE POLICY "Users can manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id); END IF; END $$;`,
  ];
  for (const sql of rlsPolicies) {
    try { await supabase.rpc('exec_sql', { sql }).maybeSingle(); } catch { /* may not have exec_sql */ }
  }

  return NextResponse.json({
    success: true,
    message: 'Migration complete.',
    note: 'If the RPC failed, run the SQL manually in Supabase dashboard.',
    sql: [
      'ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;',
      'CREATE POLICY "Anyone can view shared trips" ON public.trips FOR SELECT USING (share_token IS NOT NULL);',
      'ALTER TABLE public.trip_destinations ADD COLUMN IF NOT EXISTS places JSONB DEFAULT \'[]\'::jsonb;',
      'ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS deep_plan_data JSONB DEFAULT NULL;',
      'ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS booking_docs JSONB DEFAULT NULL;',
      '-- RLS policies (run these manually if exec_sql RPC not available):',
      'CREATE POLICY "Users can view own trips" ON public.trips FOR SELECT USING (auth.uid() = user_id);',
      'CREATE POLICY "Users can insert own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);',
      'CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (auth.uid() = user_id);',
      'CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);',
      'CREATE POLICY "Users can manage own destinations" ON public.trip_destinations FOR ALL USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_destinations.trip_id AND trips.user_id = auth.uid()));',
      'CREATE POLICY "Users can manage own transport" ON public.trip_transport_legs FOR ALL USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_transport_legs.trip_id AND trips.user_id = auth.uid()));',
      'CREATE POLICY "Users can manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id);',
    ],
  });
}
