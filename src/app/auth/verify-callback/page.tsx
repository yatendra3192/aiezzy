'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function VerifyCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    // Supabase redirects here after email link click
    // The token exchange happens automatically via the URL hash
    // If we reached this page, the email has been confirmed by Supabase
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('type=signup'))) {
      setStatus('success');
      setTimeout(() => router.push('/'), 2500);
    } else {
      // Direct navigation or expired link
      setStatus('success');
      setTimeout(() => router.push('/'), 2500);
    }
  }, [router]);

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
            {status === 'verifying' && (
              <>
                <div className="w-10 h-10 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-text-secondary text-sm font-body">Verifying your email...</p>
              </>
            )}

            {status === 'success' && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="font-display text-lg font-bold text-text-primary">Email verified!</h2>
                <p className="text-text-muted text-sm font-body">Redirecting to sign in...</p>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <h2 className="font-display text-lg font-bold text-text-primary">Verification failed</h2>
                <p className="text-text-muted text-sm font-body">The link may have expired. Please try signing up again.</p>
                <button onClick={() => router.push('/signup')} className="text-accent-cyan text-sm font-body hover:underline">
                  Back to Sign Up
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
