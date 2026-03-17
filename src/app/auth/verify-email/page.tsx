'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-accent-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px] md:max-w-[440px]"
      >
        <div className="bg-bg-surface border border-border-subtle rounded-[2.5rem] card-warm-lg p-8 pt-12 pb-10 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-bg-primary rounded-b-2xl" />

          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              <span className="text-accent-cyan text-shadow-glow">AI</span>
              <span className="text-text-primary">Ezzy</span>
            </h1>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-accent-cyan/10 rounded-full flex items-center justify-center mx-auto">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8654A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>

            <h2 className="font-display text-lg font-bold text-text-primary">Check your email</h2>

            <p className="text-text-muted text-sm font-body leading-relaxed">
              We&apos;ve sent a verification link to{' '}
              {email && <span className="text-text-primary font-semibold">{email}</span>}
              {!email && 'your email'}. Click the link to activate your account.
            </p>

            <div className="pt-4 space-y-3">
              {email && (
                <button
                  onClick={handleResend}
                  disabled={resending || resent}
                  className="text-accent-cyan text-sm font-body hover:underline disabled:opacity-50 transition-colors"
                >
                  {resending ? 'Sending...' : resent ? 'Email sent!' : 'Resend verification email'}
                </button>
              )}

              <div>
                <button
                  onClick={() => router.push('/')}
                  className="text-text-secondary text-sm font-body hover:text-accent-cyan transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
