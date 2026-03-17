import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

/** DELETE /api/auth/delete-account - Delete user account */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).supabaseUserId;
  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Delete the Supabase Auth user — cascade deletes handle trips/profiles
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
