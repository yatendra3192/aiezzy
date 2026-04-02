import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

/** POST /api/trips/[id]/share — Generate or return existing share link */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const supabase = createServiceClient();

  // Verify trip belongs to user
  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, share_token')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (error || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  // If already shared, return existing token
  if (trip.share_token) {
    const baseUrl = process.env.NEXTAUTH_URL || '';
    return NextResponse.json({
      shareToken: trip.share_token,
      shareUrl: `${baseUrl}/shared/${trip.share_token}`,
    });
  }

  // Generate new token
  const shareToken = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const { error: updateError } = await supabase
    .from('trips')
    .update({ share_token: shareToken })
    .eq('id', params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || '';
  return NextResponse.json({
    shareToken,
    shareUrl: `${baseUrl}/shared/${shareToken}`,
  });
}

/** DELETE /api/trips/[id]/share — Remove share link (unshare) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).supabaseUserId;
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('trips')
    .update({ share_token: null })
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ unshared: true });
}
