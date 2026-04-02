import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** POST /api/auth/resend-verification - Resend email verification link */
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${process.env.NEXTAUTH_URL}/auth/verify-callback`,
    },
  });

  // Always return success (don't reveal if email exists)
  return NextResponse.json({ message: 'If an account exists, a verification email has been sent.' });
}
