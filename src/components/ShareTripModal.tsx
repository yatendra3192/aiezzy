'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
}

export default function ShareTripModal({ isOpen, onClose, tripId }: ShareTripModalProps) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generateShareLink = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate share link');
      const data = await res.json();
      setShareUrl(data.shareUrl);
    } catch {
      setError('Could not generate share link. Try again.');
    }
    setLoading(false);
  };

  const handleUnshare = async () => {
    setLoading(true);
    try {
      await fetch(`/api/trips/${tripId}/share`, { method: 'DELETE' });
      setShareUrl('');
    } catch {
      setError('Could not remove share link.');
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Auto-generate link on open
  const handleOpen = () => {
    if (!shareUrl && !loading) {
      generateShareLink();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
          onAnimationComplete={handleOpen}
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
            className="relative bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 w-full max-w-[380px] space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-text-primary">Share Trip</h3>
              <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none">&times;</button>
            </div>

            <p className="text-text-secondary text-xs font-body">
              Anyone with this link can view your trip itinerary (read-only).
            </p>

            {loading && !shareUrl && (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                <span className="text-text-muted text-xs font-body ml-2">Generating link...</span>
              </div>
            )}

            {error && (
              <p className="text-red-500 text-xs font-body">{error}</p>
            )}

            {shareUrl && (
              <div className="space-y-3">
                {/* URL display + copy */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary focus:outline-none"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopy}
                    className={`px-4 py-2 rounded-lg font-display font-bold text-xs text-white transition-colors ${
                      copied ? 'bg-green-500' : 'bg-accent-cyan hover:bg-accent-cyan/90'
                    }`}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </motion.button>
                </div>

                {/* Unshare button */}
                <button
                  onClick={handleUnshare}
                  disabled={loading}
                  className="text-text-muted text-[10px] font-body hover:text-red-400 transition-colors"
                >
                  Remove share link
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
