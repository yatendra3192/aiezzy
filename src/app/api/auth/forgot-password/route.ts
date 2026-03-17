import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** POST /api/auth/forgot-password - Send password reset email via Supabase Auth */
export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    const redirectTo =
      (process.env.NEXTAUTH_URL || 'http://localhost:3000') +
      '/auth/reset-callback';

    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Silently ignore errors — don't reveal if email exists
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({
    message: 'If an account exists with that email, we\'ve sent a reset link.',
  });
}
