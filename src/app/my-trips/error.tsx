'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/errorReporter';

export default function MyTripsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { type: 'error-boundary', page: 'my-trips' });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 className="font-display text-lg font-bold text-text-primary">Could not load your trips</h2>
        <p className="text-text-muted text-sm font-body">There was a problem fetching your trips. Please try again.</p>
        <button onClick={reset} className="bg-accent-cyan text-white font-display font-bold text-sm py-2.5 px-6 rounded-xl hover:bg-accent-cyan/90 transition-colors">
          Try again
        </button>
      </div>
    </div>
  );
}
