'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { motion } from 'framer-motion';

// Map NextAuth error codes to user-friendly messages
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Could not start sign in. Please try again.',
  OAuthCallback: 'Sign in failed. Please try again.',
  OAuthCreateAccount: 'Could not create account. Please try again.',
  Callback: 'Sign in failed. Please try again.',
  OAuthAccountNotLinked: 'This email is already linked to another sign-in method.',
  CredentialsSignin: 'Invalid email or password.',
  SessionRequired: 'Please sign in to continue.',
  Default: 'Something went wrong. Please try again.',
};

export default function SignInPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show error from NextAuth redirect (e.g., OAuth failure redirects to /?error=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('error');
      if (authError) {
        setError(AUTH_ERROR_MESSAGES[authError] || AUTH_ERROR_MESSAGES.Default);
      }
    } catch {}
  }, []);

  // Redirect authenticated users via useEffect (not during render)
  useEffect(() => {
    if (status === 'authenticated') router.push('/my-trips');
  }, [status, router]);

  if (status === 'authenticated' || status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" /></div>;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
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
    } catch (err) {
      setLoading(false);
      setError('Network error. Please check your connection and try again.');
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
              type="email"
              placeholder="Email address"
              aria-label="Email address"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan"
            />
            <div>
              <input
                type="password"
                placeholder="Password"
                aria-label="Password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan"
              />
              <div className="flex justify-end mt-1.5 mr-1">
                <button type="button" onClick={() => router.push('/auth/forgot-password')} className="text-text-muted text-xs font-body hover:text-accent-cyan transition-colors">
                  Forgot password?
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert" className="text-red-400 text-xs font-body">
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

          {/* Google sign in */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => handleSocialLogin('google')}
            className="w-full flex items-center justify-center gap-3 bg-bg-card border border-border-subtle rounded-xl py-3 text-sm font-body text-text-primary hover:border-accent-cyan/50 hover:shadow-[0_0_15px_rgba(232,101,74,0.1)] transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </motion.button>

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
