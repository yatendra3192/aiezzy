import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

/** GET /api/profile - Fetch user profile */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).supabaseUserId;
  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', userId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    displayName: profile.display_name || '',
    email: profile.email || session.user.email || '',
  });
}

/** PUT /api/profile - Update display name */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).supabaseUserId;
  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 });
  }

  const body = await req.json();
  const displayName = body.displayName?.trim();

  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
