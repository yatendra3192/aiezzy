'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useTrip } from '@/context/TripContext';
import ShareTripModal from '@/components/ShareTripModal';
import AISuggestModal from '@/components/AISuggestModal';
import TripTemplatesSection from '@/components/TripTemplatesSection';
import { TRIP_TEMPLATES, TripTemplate } from '@/data/tripTemplates';

interface TripSummary {
  id: string;
  title: string;
  fromAddress: string;
  departureDate: string;
  adults: number;
  children: number;
  destinationCount: number;
  destinations: string[];
  totalNights: number;
  tripType: string;
  flightCost: number;
  trainCost: number;
  hotelCost: number;
  totalCost: number;
  status: string;
  updatedAt: string;
}

export default function MyTripsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const trip = useTrip();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [showAISuggest, setShowAISuggest] = useState(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }
    if (authStatus === 'authenticated') {
      fetchTrips();
    }
  }, [authStatus]);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trips');
      if (res.ok) {
        const data = await res.json();
        setTrips(data.trips || []);
      }
    } catch (err) {
      console.error('Failed to fetch trips:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTrip = async (tripId: string) => {
    try {
      await trip.loadTrip(tripId);
      router.push('/route');
    } catch (err) {
      console.error('Failed to load trip:', err);
      alert('Failed to load trip. Please try again.');
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!confirm('Delete this trip?')) return;
    setDeleting(tripId);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
      if (res.ok) {
        setTrips(prev => prev.filter(t => t.id !== tripId));
      } else {
        console.error('Delete failed:', res.status);
        alert('Failed to delete trip. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete trip:', err);
      alert('Failed to delete trip. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleNewTrip = () => {
    trip.resetTrip();
    router.push('/plan');
  };

  const handleUseTemplate = (template: TripTemplate) => {
    trip.resetTrip();
    trip.setFrom(template.from);
    trip.setFromAddress(template.from.fullName);
    for (const dest of template.destinations) {
      trip.addDestination(dest.city, dest.nights);
    }
    router.push('/plan');
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[800px]">
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-lg font-bold text-text-primary">My Trips</h1>
              <p className="text-text-muted text-xs font-body mt-0.5">
                {session?.user?.name ? `Welcome, ${session.user.name}` : 'Your saved trips'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/settings" className="text-text-muted hover:text-accent-cyan transition-colors" title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="text-text-muted text-xs font-body hover:text-accent-cyan transition-colors">Sign Out</button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setShowAISuggest(true)}
                className="bg-bg-card border border-accent-cyan/40 text-accent-cyan font-display font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                </svg>
                AI Plan
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleNewTrip}
                className="bg-accent-cyan text-white font-display font-bold text-xs px-4 py-2 rounded-xl">
              + New Trip
            </motion.button>
            </div>
          </div>

          {/* Trip list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
              <span className="text-text-muted text-sm ml-3 font-body">Loading trips...</span>
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">&#9992;</div>
              <p className="text-text-secondary font-body text-sm">No trips yet</p>
              <p className="text-text-muted font-body text-xs mt-1">Start planning your first adventure!</p>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleNewTrip}
                className="mt-6 bg-accent-cyan text-white font-display font-bold text-sm px-6 py-3 rounded-xl">
                Plan a Trip
              </motion.button>
            </div>
          ) : (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {trips.map(t => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-bg-card border border-border-subtle rounded-xl p-4 hover:border-accent-cyan/30 transition-all">
                  <div className="flex items-start justify-between">
                    <button onClick={() => handleLoadTrip(t.id)} className="text-left flex-1">
                      <h3 className="font-display font-bold text-sm text-text-primary">{t.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-accent-cyan text-[10px] font-mono">{t.departureDate}</span>
                        <span className="text-text-muted text-[10px]">&middot;</span>
                        <span className="text-text-muted text-[10px] font-body">{t.destinationCount} cities</span>
                        <span className="text-text-muted text-[10px]">&middot;</span>
                        <span className="text-text-muted text-[10px] font-body">{t.totalNights}N</span>
                        <span className="text-text-muted text-[10px]">&middot;</span>
                        <span className="text-text-muted text-[10px] font-body">{t.adults} pax</span>
                        <span className="text-text-muted text-[10px]">&middot;</span>
                        <span className="text-text-muted text-[10px] font-body">{t.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}</span>
                      </div>
                      {t.destinations.length > 0 && (
                        <p className="text-text-secondary text-xs font-body mt-1.5">
                          {t.destinations.join(' → ')}
                        </p>
                      )}
                      {/* Cost breakdown */}
                      {t.totalCost > 0 && (
                        <div className="mt-2 pt-2 border-t border-border-subtle space-y-1">
                          <div className="flex items-center gap-3 text-[10px]">
                            {t.flightCost > 0 && <span className="text-text-secondary font-body">Flights: <span className="font-mono text-text-primary">&#8377;{t.flightCost.toLocaleString()}</span></span>}
                            {t.trainCost > 0 && <span className="text-text-secondary font-body">Trains: <span className="font-mono text-text-primary">&#8377;{t.trainCost.toLocaleString()}</span></span>}
                            {t.hotelCost > 0 && <span className="text-text-secondary font-body">Hotels: <span className="font-mono text-text-primary">&#8377;{t.hotelCost.toLocaleString()}</span></span>}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-body text-text-secondary">Total</span>
                            <span className="text-sm font-mono font-bold text-accent-cyan">&#8377;{t.totalCost.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteTrip(t.id)}
                      disabled={deleting === t.id}
                      className="text-text-muted hover:text-red-400 transition-colors ml-3 text-sm p-1"
                    >
                      {deleting === t.id ? '...' : '×'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        t.status === 'planned' ? 'bg-green-500/20 text-green-600' : 'bg-amber-500/20 text-amber-600'
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                      <button onClick={async () => { await trip.loadTrip(t.id); router.push('/plan'); }}
                        className="text-[10px] text-text-muted hover:text-accent-cyan font-body transition-colors">Edit</button>
                      <button onClick={() => setSharingTripId(t.id)}
                        className="text-[10px] text-text-muted hover:text-accent-cyan font-body transition-colors flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        Share
                      </button>
                    </div>
                    <span className="text-text-muted text-[10px] font-body">
                      Updated {new Date(t.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Trip Templates */}
          <TripTemplatesSection templates={TRIP_TEMPLATES} onUseTemplate={handleUseTemplate} />
        </div>
      </motion.div>

      {/* Share Trip Modal */}
      {sharingTripId && (
        <ShareTripModal
          isOpen={!!sharingTripId}
          onClose={() => setSharingTripId(null)}
          tripId={sharingTripId}
        />
      )}

      {/* AI Suggest Modal */}
      <AISuggestModal
        isOpen={showAISuggest}
        onClose={() => setShowAISuggest(false)}
      />
    </div>
  );
}
