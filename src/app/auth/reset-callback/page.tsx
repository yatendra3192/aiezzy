'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function ResetCallbackPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokens, setTokens] = useState<{ access_token: string; refresh_token: string } | null>(null);
  const [tokenError, setTokenError] = useState(false);

  // Extract tokens from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1); // remove the '#'
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (access_token && refresh_token) {
      setTokens({ access_token, refresh_token });
    } else {
      setTokenError(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!tokens) {
      setError('Invalid or expired reset link');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/'), 2000);
    } catch {
      setError('Something went wrong. Please try again.');
    }

    setLoading(false);
  };

  // Show error if tokens are missing/invalid
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent-cyan/5 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px] md:max-w-[440px]"
        >
          <div className="bg-bg-surface border border-border-subtle rounded-[2.5rem] card-warm-lg p-8 pt-12 pb-10 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-bg-primary rounded-b-2xl" />

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-center mb-10"
            >
              <h1 className="font-display text-3xl font-bold tracking-tight">
                <span className="text-accent-cyan text-shadow-glow">AI</span>
                <span className="text-text-primary">Ezzy</span>
              </h1>
            </motion.div>

            <div className="text-center space-y-4">
              <p className="text-text-primary text-sm font-body">
                This reset link is invalid or has expired.
              </p>
              <p className="text-text-muted text-xs font-body">
                Please request a new password reset link.
              </p>
            </div>

            <div className="text-center mt-8">
              <button
                onClick={() => router.push('/auth/forgot-password')}
                className="text-sm font-body text-text-secondary hover:text-accent-cyan transition-colors"
              >
                Request a <span className="text-accent-cyan font-semibold">new reset link</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px] md:max-w-[440px]"
      >
        <div className="bg-bg-surface border border-border-subtle rounded-[2.5rem] card-warm-lg p-8 pt-12 pb-10 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-bg-primary rounded-b-2xl" />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-center mb-10"
          >
            <h1 className="font-display text-3xl font-bold tracking-tight">
              <span className="text-accent-cyan text-shadow-glow">AI</span>
              <span className="text-text-primary">Ezzy</span>
            </h1>
            <p className="text-text-muted text-sm mt-1 font-body">Set your new password</p>
          </motion.div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-14 h-14 mx-auto bg-accent-gold/10 rounded-full flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-gold">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-text-primary text-sm font-body font-semibold">
                Password reset successfully!
              </p>
              <p className="text-text-muted text-xs font-body">
                Redirecting to sign in...
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan"
                />
                <p className="text-text-muted text-xs mt-1.5 ml-1 font-body">Min 8 characters</p>
              </div>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan"
              />

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs font-body">
                  {error}
                </motion.p>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-accent-cyan text-white font-display font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:bg-accent-cyan/90 hover:shadow-[0_0_20px_rgba(232,101,74,0.3)] disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </motion.button>
            </form>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => router.push('/')}
              className="text-sm font-body text-text-secondary hover:text-accent-cyan transition-colors"
            >
              Back to <span className="text-accent-cyan font-semibold">Sign In</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
