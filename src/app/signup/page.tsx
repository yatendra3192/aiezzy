'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address'); return; }
    if (password.length < 10) { setError('Password must be at least 10 characters'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must contain an uppercase letter'); return; }
    if (!/[a-z]/.test(password)) { setError('Password must contain a lowercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain a number'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);

    // Create account via our API
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Sign up failed');
      setLoading(false);
      return;
    }

    // If email verification is required, redirect to verify page
    if (data.needsVerification) {
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }

    // Auto sign in after account creation (when verification is disabled)
    const signInResult = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);

    if (signInResult?.error) {
      setError('Account created but sign in failed. Please sign in manually.');
    } else {
      router.push('/my-trips');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[90vw] max-w-[500px] h-[400px] bg-accent-cyan/5 rounded-full blur-[120px] pointer-events-none" />

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
            <p className="text-text-muted text-sm mt-1 font-body">Create your account</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan" />
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan" />
            <div>
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan" />
              <p className="text-text-muted text-xs mt-1.5 ml-1 font-body">Min 10 characters, uppercase + lowercase + number</p>
            </div>
            <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3.5 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all duration-200 input-glow focus:border-accent-cyan" />

            {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs font-body">{error}</motion.p>}

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading}
              className="w-full bg-accent-cyan text-white font-display font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:bg-accent-cyan/90 hover:shadow-[0_0_20px_rgba(232,101,74,0.3)] disabled:opacity-50">
              {loading ? 'Creating account...' : 'Sign Up'}
            </motion.button>
          </form>

          <div className="text-center mt-8">
            <button onClick={() => router.push('/')} className="text-sm font-body text-text-secondary hover:text-accent-cyan transition-colors">
              Already have an account? <span className="text-accent-cyan font-semibold">Sign In</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
