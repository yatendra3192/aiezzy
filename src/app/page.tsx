'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { motion } from 'framer-motion';

export default function SignInPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already signed in, redirect to plan
  if (status === 'authenticated') {
    router.push('/my-trips');
    return null;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError('Invalid email or password');
    } else {
      router.push('/my-trips');
    }
  };

  const handleSocialLogin = (provider: string) => {
    signIn(provider, { callbackUrl: '/my-trips' });
  };

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
            <p className="text-text-muted text-sm mt-1 font-body">Smart travel, simplified</p>
          </motion.div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <input
              type="text"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
              {loading ? 'Signing in...' : 'Sign In'}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-text-muted text-xs font-body">or continue with</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Social buttons */}
          <div className="flex justify-center gap-4">
            <motion.button whileHover={{ scale: 1.08, y: -2 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleSocialLogin('google')}
              className="w-14 h-14 bg-bg-card border border-border-subtle rounded-2xl flex items-center justify-center transition-all hover:border-accent-cyan/50 hover:shadow-[0_0_15px_rgba(232,101,74,0.1)]">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </motion.button>

            <motion.button whileHover={{ scale: 1.08, y: -2 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleSocialLogin('facebook')}
              className="w-14 h-14 bg-bg-card border border-border-subtle rounded-2xl flex items-center justify-center transition-all hover:border-accent-cyan/50 hover:shadow-[0_0_15px_rgba(232,101,74,0.1)]">
              <svg width="28" height="20" viewBox="0 0 100 60" fill="#0081FB">
                <path d="M20 0C8.95 0 0 13.43 0 30s8.95 30 20 30c5.5 0 10.36-3.72 14-9.26L50 23.48l16 27.26C69.64 56.28 74.5 60 80 60c11.05 0 20-13.43 20-30S91.05 0 80 0c-5.5 0-10.36 3.72-14 9.26L50 36.52 34 9.26C30.36 3.72 25.5 0 20 0z"/>
              </svg>
            </motion.button>

            <motion.button whileHover={{ scale: 1.08, y: -2 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleSocialLogin('apple')}
              className="w-14 h-14 bg-bg-card border border-border-subtle rounded-2xl flex items-center justify-center transition-all hover:border-accent-cyan/50 hover:shadow-[0_0_15px_rgba(232,101,74,0.1)]">
              <svg width="22" height="24" viewBox="0 0 170 200" fill="#1E293B">
                <path d="M150.4 172.3c-7.6 11.1-15.9 22-28.2 22.2-12.3.2-16.3-7.3-30.4-7.3s-18.5 7.1-30 7.5c-12.1.4-21.3-11.9-29-23C17.8 148.2 6.3 108 21.8 80.2c7.7-13.8 21.3-22.5 36.2-22.8 11.9-.2 23.1 8 30.4 8s20.6-9.9 34.7-8.4c5.9.2 22.5 2.4 33.2 18-0.9.5-19.8 11.6-19.6 34.5.2 27.4 24 36.5 24.3 36.6-0.3.9-3.8 13-15.6 26.2zM113.4 0c2.2 17.7-5.2 35.2-16 47-10.9 11.8-27.1 20-42.6 18.8C52.7 47.6 61.7 30 73 18.2 84.4 6.5 101.5-.2 113.4 0z"/>
              </svg>
            </motion.button>
          </div>

          <div className="text-center mt-8">
            <button onClick={() => router.push('/signup')} className="text-sm font-body text-text-secondary hover:text-accent-cyan transition-colors">
              Don't have an account? <span className="text-accent-cyan font-semibold">Sign Up</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
