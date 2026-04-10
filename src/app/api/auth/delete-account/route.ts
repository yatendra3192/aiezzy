import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

/** DELETE /api/auth/delete-account - Delete user account and all storage files */
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

  // Clean up all booking documents in storage before deleting the user
  try {
    const { data: folders } = await supabase.storage
      .from('booking-docs')
      .list(userId);
    if (folders && folders.length > 0) {
      // Each folder is a tripId — list files inside and delete them
      for (const folder of folders) {
        const { data: files } = await supabase.storage
          .from('booking-docs')
          .list(`${userId}/${folder.name}`);
        if (files && files.length > 0) {
          const paths = files.map(f => `${userId}/${folder.name}/${f.name}`);
          await supabase.storage.from('booking-docs').remove(paths);
        }
      }
    }
  } catch {
    // Storage cleanup is best-effort — don't block account deletion
    console.error('[delete-account] storage cleanup failed for', userId);
  }

  // Delete the Supabase Auth user — cascade deletes handle trips/profiles
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    console.error('[delete-account] error:', error.message);
    return NextResponse.json({ error: 'Failed to delete account. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
