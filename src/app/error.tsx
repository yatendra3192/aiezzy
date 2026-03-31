'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/errorReporter';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { type: 'error-boundary' });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 className="font-display text-lg font-bold text-text-primary">Something went wrong</h2>
        <p className="text-text-muted text-sm font-body">{error.message || 'An unexpected error occurred.'}</p>
        <div className="flex items-center gap-3 justify-center">
          <button onClick={() => window.history.back()} className="border border-border-subtle text-text-secondary font-display font-bold text-sm py-2.5 px-6 rounded-xl hover:bg-bg-card transition-colors">
            Go Back
          </button>
          <button onClick={reset} className="bg-accent-cyan text-white font-display font-bold text-sm py-2.5 px-6 rounded-xl hover:bg-accent-cyan/90 transition-colors">
            Try again
          </button>
        </div>
        <a href="/my-trips" className="text-accent-cyan text-xs font-body hover:underline">Go to My Trips</a>
      </div>
    </div>
  );
}
