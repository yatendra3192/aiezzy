import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** POST /api/auth/signup - Create account with email/password via Supabase Auth */
export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Use anon key so Supabase sends verification email automatically
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name || email.split('@')[0] },
      emailRedirectTo: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/verify-callback`,
    },
  });

  if (error) {
    if (error.message.includes('already')) {
      return NextResponse.json({ error: 'Account already exists with this email' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if email confirmation is required
  const needsVerification = data.user && !data.user.email_confirmed_at;

  return NextResponse.json({
    id: data.user?.id,
    email: data.user?.email,
    needsVerification,
  }, { status: 201 });
}
