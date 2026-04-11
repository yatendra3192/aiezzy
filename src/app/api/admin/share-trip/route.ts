import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['yatendra3192@gmail.com'];

/** POST /api/admin/share-trip — Generate share token for any trip (admin only, bypasses RLS) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tripId } = await req.json();
  if (!tripId) return NextResponse.json({ error: 'tripId required' }, { status: 400 });

  const supabase = createServiceClient();

  // Check if trip already has a share token
  const { data: trip } = await supabase
    .from('trips')
    .select('id, share_token')
    .eq('id', tripId)
    .single();

  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

  if (trip.share_token) {
    return NextResponse.json({ shareToken: trip.share_token });
  }

  // Generate new token
  const shareToken = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await supabase
    .from('trips')
    .update({ share_token: shareToken })
    .eq('id', tripId);

  return NextResponse.json({ shareToken });
}
