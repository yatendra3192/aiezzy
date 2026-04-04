import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

/** POST /api/auth/forgot-password - Send password reset email via Supabase Auth */
export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Rate limit: 3 reset requests per email per hour, 10 per IP per hour
  const ip = getClientIp(req);
  const rlIp = rateLimit(`forgot:ip:${ip}`, 10, 60 * 60 * 1000);
  const rlEmail = rateLimit(`forgot:email:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
  if (!rlIp.allowed || !rlEmail.allowed) {
    // Still return success message to prevent email enumeration
    return NextResponse.json({
      message: 'If an account exists with that email, we\'ve sent a reset link.',
    });
  }

  try {
    const supabase = createServiceClient();

    const redirectTo = process.env.NEXTAUTH_URL + '/auth/reset-callback';

    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Silently ignore errors — don't reveal if email exists
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({
    message: 'If an account exists with that email, we\'ve sent a reset link.',
  });
}
