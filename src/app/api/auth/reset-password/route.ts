import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/validatePassword';

/** POST /api/auth/reset-password - Update password using reset tokens */
export async function POST(req: NextRequest) {
  // Rate limit: 5 reset attempts per IP per 15 minutes
  const ip = getClientIp(req);
  const rl = rateLimit(`resetpw:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  const { access_token, refresh_token, password } = await req.json();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }

  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  // Create a Supabase client and set the user's session from the reset tokens
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Set session with the tokens from the reset link
  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (sessionError) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link. Please request a new one.' },
      { status: 400 }
    );
  }

  // Update the user's password
  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to update password' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Password updated successfully' });
}
