'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRANSIT_ROUTES, TransitStep } from '@/data/mockData';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'flight' | 'train' | 'bus' | 'drive') => void;
  flightPrice?: number;
  trainAvailable?: boolean;
  currentType: string;
  /** If true, show local transit options (walk/transit/taxi) instead of inter-city */
  isLocalTransport?: boolean;
}

const INTER_CITY_TYPES = [
  { id: 'flight' as const, label: 'Flight', icon: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z' },
  { id: 'train' as const, label: 'Train', icon: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-16 0h16M8 22h8m-8-4h.01M16 18h.01M6 6h12v6H6z' },
  { id: 'bus' as const, label: 'Bus', icon: 'M4 16V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10m-16 0v2m16-2v2M7 16h.01M17 16h.01M5 6h14v5H5zM8 22h8' },
  { id: 'drive' as const, label: 'Drive', icon: 'M5 17h14v-5H5zm14 0a2 2 0 0 0 2-2v-2l-2-5H5L3 8v5a2 2 0 0 0 2 2m0 0v2m14-2v2M7 14h.01M17 14h.01M6 3h12l1 5H5z' },
];

function StepIcon({ step }: { step: TransitStep }) {
  if (step.type === 'walk') {
    return (
      <span className="text-text-muted text-[10px] flex items-center gap-0.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
          <circle cx="12" cy="5" r="2"/><path d="M10 22V18L7 15l3-3 2 2 4-4"/>
        </svg>
        {step.duration}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white" style={{ backgroundColor: step.color || '#6b7280' }}>
      {step.label}
    </span>
  );
}

export default function TransportModal({
  isOpen, onClose, onSelectType, flightPrice, trainAvailable = true, currentType, isLocalTransport,
}: Props) {
  const [selected, setSelected] = useState(currentType || 'flight');
  const [showTransitRoutes, setShowTransitRoutes] = useState(false);

  const handleSelect = (type: string) => {
    setSelected(type);
    // For flight and train, parent will open specific modal
    // For drive and bus, just update type
    onSelectType(type as 'flight' | 'train' | 'bus' | 'drive');
    if (type !== 'train' && type !== 'flight') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[430px] max-h-[85vh] bg-bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-border-subtle">
              <h2 className="font-display font-bold text-base text-text-primary text-center">Change Transport</h2>

              {/* Transport type tabs */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                {INTER_CITY_TYPES.map(t => {
                  const isDisabled = t.id === 'train' && !trainAvailable;
                  return (
                    <button
                      key={t.id}
                      onClick={() => !isDisabled && handleSelect(t.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all ${
                        isDisabled
                          ? 'bg-bg-card border-border-subtle text-text-muted opacity-50 cursor-not-allowed'
                          : selected === t.id
                          ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan'
                          : 'bg-bg-card border-border-subtle text-text-secondary hover:border-accent-cyan/30'
                      }`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={t.icon} />
                      </svg>
                      <span className="text-[10px] font-display font-bold">{t.label}</span>
                      {t.id === 'flight' && flightPrice ? (
                        <span className="text-[9px] text-text-muted">\u20b9{flightPrice.toLocaleString()}</span>
                      ) : t.id === 'train' && !trainAvailable ? (
                        <span className="text-[9px] text-text-muted">N/A</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Show local transit routes if this is for within-city transport */}
            {isLocalTransport && !showTransitRoutes && (
              <div className="p-4">
                <button
                  onClick={() => setShowTransitRoutes(true)}
                  className="w-full py-3 rounded-xl bg-bg-card border border-border-subtle text-accent-cyan font-display font-bold text-sm hover:border-accent-cyan/30 transition-all"
                >
                  View Public Transit Routes
                </button>
              </div>
            )}

            {(isLocalTransport && showTransitRoutes) && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {TRANSIT_ROUTES.map(route => (
                  <motion.button
                    key={route.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onClose()}
                    className="w-full text-left p-4 rounded-xl bg-bg-card border border-border-subtle hover:border-accent-cyan/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-sm text-text-primary">{route.departure}&mdash;{route.arrival}</span>
                      <span className="text-xs text-text-muted font-mono">{route.duration}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {route.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <StepIcon step={step} />
                          {i < route.steps.length - 1 && <span className="text-text-muted text-[10px]">&rsaquo;</span>}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-text-muted">{route.departure} from {route.fromStation}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
                      <span className="font-mono font-bold text-accent-cyan text-sm">&#8377;{route.price}</span>
                      <span className="text-accent-cyan text-xs font-body">Details &#8599;</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Cancel */}
            <div className="p-4 border-t border-border-subtle">
              <button onClick={onClose} className="w-full py-3 rounded-xl bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-sm hover:border-accent-cyan/30 transition-all">
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
