'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTrip } from '@/context/TripContext';

interface AISuggestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SuggestionDestination {
  city: string;
  country: string;
  nights: number;
  reason: string;
}

interface Suggestion {
  title: string;
  destinations: SuggestionDestination[];
  estimatedBudget: string;
  bestTimeToVisit: string;
  tips: string[];
}

const EXAMPLE_PROMPTS = [
  '7 days from Mumbai, budget 1.5 lakh, beaches and culture',
  'Honeymoon in Europe, 10 days, romantic cities',
  'Budget backpacking in Southeast Asia, 2 weeks',
  'Family trip to Japan with kids, 8 days',
];

export default function AISuggestModal({ isOpen, onClose }: AISuggestModalProps) {
  const router = useRouter();
  const trip = useTrip();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setSuggestion(null);
    setSource(null);

    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else if (data.suggestion) {
        setSuggestion(data.suggestion);
        setSource(data.source || 'ai');
      } else {
        setError('Could not generate suggestions. Try a different description.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }

    setLoading(false);
  };

  const handleUsePlan = () => {
    if (!suggestion) return;

    // Preserve user's existing origin before reset
    const savedFrom = trip.from?.name ? { ...trip.from } : null;
    const savedFromAddress = trip.fromAddress || null;

    trip.resetTrip();

    // Restore user's origin, or fall back to Mumbai if none was set
    if (savedFrom) {
      trip.setFrom(savedFrom);
      if (savedFromAddress) trip.setFromAddress(savedFromAddress);
    } else {
      trip.setFrom({ name: 'Mumbai', country: 'India', fullName: 'Mumbai, Maharashtra, India' });
      trip.setFromAddress('Mumbai, Maharashtra, India');
    }

    // Small delay to ensure resetTrip state update has propagated
    setTimeout(() => {
      for (const dest of suggestion.destinations) {
        trip.addDestination(
          { name: dest.city, country: dest.country, fullName: `${dest.city}, ${dest.country}` },
          dest.nights
        );
      }
      onClose();
      router.push('/plan');
    }, 50);
  };

  const handleClose = () => {
    setSuggestion(null);
    setSource(null);
    setError('');
    setPrompt('');
    setLoading(false);
    onClose();
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="AI trip planner"
            className="relative bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 w-full max-w-[480px] max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan">
                    <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-base text-text-primary">AI Trip Planner</h3>
              </div>
              <button onClick={handleClose} className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none">&times;</button>
            </div>

            {!suggestion ? (
              <>
                {/* Prompt input */}
                <p className="text-text-secondary text-xs font-body mb-3">
                  Describe your dream trip and let AI plan it for you.
                </p>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                  placeholder="e.g. 7 days from Mumbai, budget 1.5 lakh, want beaches and culture..."
                  rows={3}
                  className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted font-body outline-none transition-all input-glow focus:border-accent-cyan resize-none"
                  disabled={loading}
                />

                {/* Example prompts */}
                {!loading && !prompt && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {EXAMPLE_PROMPTS.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => handleExampleClick(ex)}
                        className="text-[10px] font-body text-text-muted bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 hover:border-accent-cyan/30 hover:text-text-secondary transition-all"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <p className="text-red-500 text-xs font-body mt-3">{error}</p>
                )}

                {/* Submit button */}
                <motion.button
                  whileHover={!loading && prompt.trim() ? { scale: 1.02 } : {}}
                  whileTap={!loading && prompt.trim() ? { scale: 0.98 } : {}}
                  onClick={handleSubmit}
                  disabled={loading || !prompt.trim()}
                  className={`w-full font-display font-bold py-3 rounded-xl text-sm transition-all mt-4 flex items-center justify-center gap-2 ${
                    loading || !prompt.trim()
                      ? 'bg-bg-card text-text-muted cursor-not-allowed'
                      : 'bg-accent-cyan text-white hover:shadow-[0_0_30px_rgba(232,101,74,0.3)]'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Planning your trip<LoadingDots /></span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                      </svg>
                      Get Suggestions
                    </>
                  )}
                </motion.button>
              </>
            ) : (
              <>
                {/* Results */}
                <div className="space-y-4">
                  {/* Title + source badge */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-bold text-lg text-text-primary">{suggestion.title}</h4>
                      {source === 'template' && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">TEMPLATE</span>
                      )}
                      {source === 'ai' && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan">AI</span>
                      )}
                    </div>
                  </div>

                  {/* Destinations */}
                  <div className="space-y-2">
                    {suggestion.destinations.map((dest, idx) => (
                      <div key={idx} className="bg-bg-card border border-border-subtle rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 h-5 rounded-full bg-accent-cyan text-white text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="font-display font-bold text-sm text-text-primary">{dest.city}</span>
                          <span className="text-text-muted text-xs font-body">{dest.country}</span>
                          <span className="ml-auto text-accent-cyan text-xs font-mono font-bold">{dest.nights}N</span>
                        </div>
                        <p className="text-text-secondary text-xs font-body pl-7">{dest.reason}</p>
                      </div>
                    ))}
                  </div>

                  {/* Budget + Best time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
                      <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-1">Est. Budget</p>
                      <p className="text-sm font-mono font-bold text-accent-cyan">{suggestion.estimatedBudget}</p>
                    </div>
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
                      <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-1">Best Time</p>
                      <p className="text-sm font-body font-semibold text-text-primary">{suggestion.bestTimeToVisit}</p>
                    </div>
                  </div>

                  {/* Tips */}
                  {suggestion.tips && suggestion.tips.length > 0 && (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
                      <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">Tips</p>
                      <ul className="space-y-1.5">
                        {suggestion.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs font-body text-text-secondary">
                            <span className="text-accent-cyan mt-0.5 flex-shrink-0">&#8226;</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setSuggestion(null); setSource(null); }}
                      className="flex-1 bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-sm py-3 rounded-xl hover:border-accent-cyan/30 transition-all"
                    >
                      Try Again
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleUsePlan}
                      className="flex-1 bg-accent-cyan text-white font-display font-bold text-sm py-3 rounded-xl hover:bg-accent-cyan/90 transition-all"
                    >
                      Use This Plan
                    </motion.button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Animated ellipsis dots for loading state */
function LoadingDots() {
  return (
    <span className="inline-flex w-6 ml-0.5">
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
      >.</motion.span>
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
      >.</motion.span>
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
      >.</motion.span>
    </span>
  );
}
