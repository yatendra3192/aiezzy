import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/validatePassword';
import { verifyTurnstile } from '@/lib/turnstile';

// Email verification mode: true when Supabase SMTP is configured
const EMAIL_VERIFY_ENABLED = process.env.EMAIL_VERIFY_ENABLED === 'true';

/** POST /api/auth/signup - Create account with email/password via Supabase Auth */
export async function POST(req: NextRequest) {
  // Rate limit: 5 signups per IP per hour
  const ip = getClientIp(req);
  const rl = rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 });
  }

  let email: string, password: string, name: string | undefined, turnstileToken: string | undefined;
  try {
    const body = await req.json();
    email = body.email;
    password = body.password;
    name = body.name;
    turnstileToken = body.turnstileToken;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  // Verify Turnstile CAPTCHA (skips if not configured)
  const captchaValid = await verifyTurnstile(turnstileToken || '', ip);
  if (!captchaValid) {
    return NextResponse.json({ error: 'CAPTCHA verification failed. Please try again.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (EMAIL_VERIFY_ENABLED) {
    // Email verification mode: use signUp() which sends a verification email
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || email.split('@')[0] },
        emailRedirectTo: `${process.env.NEXTAUTH_URL}/auth/verify-callback`,
      },
    });

    if (error) {
      if (error.message.includes('already')) {
        return NextResponse.json({ error: 'Account already exists with this email' }, { status: 409 });
      }
      console.error('[signup] signUp error:', error.message);
      return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      id: data.user?.id,
      email: data.user?.email,
      needsVerification: true,
    }, { status: 201 });
  }

  // Auto-confirm mode: use admin.createUser for instant access (no SMTP needed)
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
