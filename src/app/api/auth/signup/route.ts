import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/validatePassword';

/** POST /api/auth/signup - Create account with email/password via Supabase Auth */
export async function POST(req: NextRequest) {
  // Rate limit: 5 signups per IP per hour
  const ip = getClientIp(req);
  const rl = rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 });
  }

  const { email, password, name } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Use admin.createUser for reliable, fast account creation
  // email_confirm: true auto-confirms so user can sign in immediately
  // TODO: When SMTP is configured, switch to supabase.auth.signUp() for email verification flow
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name || email.split('@')[0] },
  });

  if (error) {
    if (error.message.includes('already')) {
      return NextResponse.json({ error: 'Account already exists with this email' }, { status: 409 });
    }
    console.error('[signup] createUser error:', error.message);
    return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    id: data.user.id,
    email: data.user.email,
    needsVerification: false,
  }, { status: 201 });
}
