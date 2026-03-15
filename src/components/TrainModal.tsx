'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrainOption } from '@/data/mockData';
import { timeStr12 } from '@/lib/timeUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fromCity: string;
  toCity: string;
  date?: string;
  selectedTrain: TrainOption | null;
  onSelectTrain: (train: TrainOption) => void;
}

interface LiveTrain {
  id: string;
  operator: string;
  trainName: string;
  trainNumber: string;
  departure: string;
  arrival: string;
  departureText: string;
  arrivalText: string;
  duration: string;
  stops: string;
  fromStation: string;
  toStation: string;
  price: number;
  distance: string;
  transitSteps: Array<{
    line: string;
    operator: string;
    departure: string;
    arrival: string;
    stops: number;
    duration: string;
    color: string;
    vehicle: string;
  }>;
  source: string;
}

export default function TrainModal({ isOpen, onClose, fromCity, toCity, date, selectedTrain, onSelectTrain }: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'shortest'>('shortest');
  const [trains, setTrains] = useState<LiveTrain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && fromCity && toCity) {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ from: fromCity, to: toCity });
      if (date) params.set('date', date);

      fetch(`/api/trains?${params}`)
        .then(res => res.json())
        .then(data => {
          setTrains(data.trains || []);
          if (!data.trains?.length) setError(data.message || 'No train routes found');
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to search train routes');
          setLoading(false);
        });
    }
  }, [isOpen, fromCity, toCity, date]);

  const sorted = [...trains].sort((a, b) =>
    sortBy === 'price' ? a.price - b.price : a.duration.localeCompare(b.duration)
  );

  const handleSelect = (train: LiveTrain) => {
    const asTrainOption: TrainOption = {
      id: train.id,
      operator: train.operator,
      trainName: train.trainName,
      trainNumber: train.trainNumber,
      departure: train.departure,
      arrival: train.arrival,
      duration: train.duration,
      stops: train.stops,
      fromStation: train.fromStation,
      toStation: train.toStation,
      price: train.price,
      color: train.transitSteps?.[0]?.color || '#6b7280',
    };
    onSelectTrain(asTrainOption);
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
            className="w-full max-w-[430px] md:max-w-[560px] max-h-[85vh] bg-bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-border-subtle">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-display font-bold text-sm text-text-primary">
                    Trains &mdash; {fromCity} &rarr; {toCity}
                  </h2>
                  <p className="text-[10px] text-text-muted font-body mt-0.5">Real-time routes via Google Transit</p>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl transition-colors ml-4">&times;</button>
              </div>

              {trains.length > 0 && (
                <div className="flex mt-4 rounded-xl overflow-hidden border border-border-subtle">
                  <button
                    onClick={() => setSortBy('shortest')}
                    className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                      sortBy === 'shortest' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    &#9201; Fastest
                  </button>
                  <button
                    onClick={() => setSortBy('price')}
                    className={`flex-1 py-2.5 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5 ${
                      sortBy === 'price' ? 'bg-accent-cyan text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    &#8595; Lowest Price
                  </button>
                </div>
              )}
            </div>

            {/* Train list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                  <span className="text-text-muted text-sm ml-3 font-body">Searching train routes...</span>
                </div>
              ) : trains.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-text-muted text-sm font-body">{error || 'No train routes available'}</p>
                  <p className="text-text-muted text-xs font-body mt-1">between {fromCity} and {toCity}</p>
                </div>
              ) : (
                sorted.map(train => {
                  const isSelected = selectedTrain?.id === train.id;
                  return (
                    <motion.button
                      key={train.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleSelect(train)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-accent-cyan/10 border-accent-cyan shadow-[0_0_15px_rgba(232,101,74,0.1)]'
                          : 'bg-bg-card border-border-subtle hover:border-accent-cyan/30'
                      }`}
                    >
                      {/* Time and duration row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-text-primary">{train.departureText || timeStr12(train.departure)}</span>
                          <div className="text-center">
                            <p className="text-[10px] text-text-muted font-mono">{train.duration}</p>
                            <div className="w-14 h-px bg-border-subtle relative my-0.5">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[8px] text-accent-cyan bg-bg-card px-1">{train.stops}</span>
                              </div>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-text-primary">{train.arrivalText || timeStr12(train.arrival)}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-accent-cyan">&#8377;{train.price.toLocaleString()}</p>
                          <p className="text-[10px] text-text-muted">est.</p>
                        </div>
                      </div>

                      {/* Transit steps */}
                      <div className="flex items-center gap-1 flex-wrap mb-1.5">
                        {train.transitSteps.map((step, si) => (
                          <div key={si} className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white" style={{ backgroundColor: step.color }}>
                              {step.line || step.vehicle}
                            </span>
                            {si < train.transitSteps.length - 1 && <span className="text-text-muted text-[10px]">&rsaquo;</span>}
                          </div>
                        ))}
                      </div>

                      {/* Stations */}
                      <p className="text-[10px] text-text-muted font-body">{train.fromStation} &rarr; {train.toStation}</p>
                      <p className="text-[10px] text-text-muted font-body">{train.operator} &middot; {train.distance}</p>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
