'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useTripActions } from '@/context/TripContext';
import { useCurrency } from '@/context/CurrencyContext';
import { formatPrice } from '@/lib/currency';
import ShareTripModal from '@/components/ShareTripModal';
import AISuggestModal from '@/components/AISuggestModal';
import TripTemplatesSection from '@/components/TripTemplatesSection';
import { TRIP_TEMPLATES, TripTemplate } from '@/data/tripTemplates';
import PlacePhoto from '@/components/PlacePhoto';

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

function formatTripDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function daysUntil(dateStr: string): number {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch { return 0; }
}

export default function MyTripsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { loadTrip, resetTrip, clearTripId, setFrom, setFromAddress, addDestination } = useTripActions();
  const { currency } = useCurrency();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [showAISuggest, setShowAISuggest] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }
    if (authStatus === 'authenticated') {
      fetchTrips();
    }
  }, [authStatus]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

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
      await loadTrip(tripId);
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
        alert('Failed to delete trip. Please try again.');
      }
    } catch {
      alert('Failed to delete trip. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleNewTrip = () => {
    resetTrip();
    router.push('/plan');
  };

  const handleDuplicateTrip = async (tripId: string) => {
    try {
      await loadTrip(tripId);
      await new Promise(r => setTimeout(r, 50));
      clearTripId();
      router.push('/plan');
    } catch {
      alert('Failed to duplicate trip. Please try again.');
    }
  };

  const handleUseTemplate = (template: TripTemplate) => {
    resetTrip();
    setFrom(template.from);
    setFromAddress(template.from.fullName);
    for (const dest of template.destinations) {
      addDestination(dest.city, dest.nights);
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

  const upcomingTrips = trips.filter(t => daysUntil(t.departureDate) >= 0).sort((a, b) => daysUntil(a.departureDate) - daysUntil(b.departureDate));
  const pastTrips = trips.filter(t => daysUntil(t.departureDate) < 0);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-[900px] mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-text-muted text-xs font-body tracking-wider uppercase mb-1">
                {session?.user?.name ? `Welcome back, ${session.user.name.split(' ')[0]}` : 'Your trips'}
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary tracking-tight">
                My Trips
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/settings" className="w-9 h-9 rounded-xl bg-bg-surface border border-border-subtle flex items-center justify-center text-text-muted hover:text-accent-cyan hover:border-accent-cyan/30 transition-all" title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="w-9 h-9 rounded-xl bg-bg-surface border border-border-subtle flex items-center justify-center text-text-muted hover:text-red-400 hover:border-red-200 transition-all" title="Sign Out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowAISuggest(true)}
                className="h-9 bg-bg-surface border border-accent-gold/40 text-accent-gold font-display font-bold text-xs px-4 rounded-xl flex items-center gap-1.5 hover:bg-accent-gold/5 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" /></svg>
                AI Plan
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleNewTrip}
                className="h-9 bg-accent-cyan text-white font-display font-bold text-xs px-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                + New Trip
              </motion.button>
            </div>
          </div>
          {/* Stats strip */}
          {trips.length > 0 && (
            <div className="flex items-center gap-6 mt-4 text-xs font-body text-text-muted">
              <span><span className="font-mono text-text-primary font-bold">{trips.length}</span> trips</span>
              <span><span className="font-mono text-text-primary font-bold">{trips.reduce((s, t) => s + t.destinationCount, 0)}</span> destinations</span>
              <span><span className="font-mono text-text-primary font-bold">{trips.reduce((s, t) => s + t.totalNights, 0)}</span> nights planned</span>
            </div>
          )}
        </motion.div>

        {/* Trip list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
            <span className="text-text-muted text-sm mt-4 font-body">Loading your trips...</span>
          </div>
        ) : trips.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-bg-surface border border-border-subtle rounded-2xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-accent-cyan/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8654A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-bold text-text-primary mb-2">No trips yet</h2>
            <p className="text-text-muted font-body text-sm max-w-[280px] mx-auto">Start planning your first adventure — add destinations, flights, and hotels.</p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowAISuggest(true)}
                className="bg-bg-card border border-accent-gold/40 text-accent-gold font-display font-bold text-sm px-5 py-2.5 rounded-xl flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" /></svg>
                AI Plan
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleNewTrip}
                className="bg-accent-cyan text-white font-display font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm">
                Plan a Trip
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Next Trip Hero */}
            {upcomingTrips.length > 0 && (() => {
              const next = upcomingTrips[0];
              const days = daysUntil(next.departureDate);
              const primaryDest = next.destinations[0] || 'Trip';
              const pendingFlights = next.destinationCount - (next.flightCost > 0 ? Math.min(next.destinationCount, Math.ceil(next.flightCost / 1000)) : 0);
              const hasHotel = next.hotelCost > 0;
              const pendingItems = (!hasHotel ? 1 : 0) + (next.flightCost === 0 ? 1 : 0);
              return (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                  <button onClick={() => handleLoadTrip(next.id)}
                    className="w-full relative rounded-2xl overflow-hidden group text-left">
                    <div className="h-44 md:h-52 relative">
                      <PlacePhoto name={primaryDest} city={primaryDest} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                      <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-between">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-white/70 text-xs font-body uppercase tracking-wider">Next Trip</span>
                            {days <= 7 && days >= 0 && (
                              <span className="ml-2 bg-white/20 backdrop-blur-sm text-white text-[10px] font-display font-bold px-2 py-0.5 rounded-full">
                                {days === 0 ? 'Departing Today!' : days === 1 ? 'Tomorrow!' : `In ${days} days`}
                              </span>
                            )}
                          </div>
                          <span className="text-white/60 text-xs font-mono">{formatTripDate(next.departureDate)}</span>
                        </div>
                        <div>
                          <h2 className="font-display font-bold text-white text-xl md:text-2xl leading-tight drop-shadow-lg">
                            {next.destinations.length > 0 ? next.destinations.join(' → ') : primaryDest}
                          </h2>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-white/80 text-xs font-body">{next.totalNights} nights &bull; {next.destinationCount} {next.destinationCount === 1 ? 'city' : 'cities'} &bull; {next.adults + (next.children || 0)} pax</span>
                            {next.totalCost > 0 && (
                              <span className="font-mono font-bold text-white text-sm">{formatPrice(next.totalCost, currency)}</span>
                            )}
                          </div>
                          {pendingItems > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="bg-amber-400/90 text-amber-900 text-[10px] font-display font-bold px-2 py-0.5 rounded-full">
                                {pendingItems} {pendingItems === 1 ? 'item' : 'items'} pending
                              </span>
                              <span className="text-white/60 text-[10px] font-body">
                                {next.flightCost === 0 && 'Select flights'}{next.flightCost === 0 && !hasHotel && ' & '}{!hasHotel && 'Book hotels'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 right-0 p-4">
                      <span className="bg-white/90 backdrop-blur-sm text-accent-cyan font-display font-bold text-xs px-4 py-2 rounded-xl shadow-sm group-hover:bg-white group-hover:shadow-md transition-all">
                        Continue Planning &rarr;
                      </span>
                    </div>
                  </button>
                </motion.div>
              );
            })()}

            {/* Upcoming trips (skip the first one — it's the hero) */}
            {upcomingTrips.length > 1 && (
              <div>
                <h2 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider mb-4">
                  Upcoming
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {upcomingTrips.slice(1).map((t, i) => {
                    const days = daysUntil(t.departureDate);
                    const primaryDest = t.destinations[0] || 'Trip';
                    return (
                      <motion.div key={t.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="group bg-bg-surface border border-border-subtle rounded-2xl hover:shadow-lg hover:border-accent-cyan/20 transition-all duration-300"
                      >
                        {/* Photo header */}
                        <button onClick={() => handleLoadTrip(t.id)} className="w-full relative h-32 overflow-hidden rounded-t-2xl">
                          <PlacePhoto name={primaryDest} city={primaryDest} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                          {/* Countdown badge */}
                          <div className="absolute top-3 left-3">
                            {days === 0 ? (
                              <span className="bg-green-500 text-white text-[10px] font-display font-bold px-2.5 py-1 rounded-full shadow-sm">
                                TODAY
                              </span>
                            ) : days <= 7 ? (
                              <span className="bg-accent-cyan text-white text-[10px] font-display font-bold px-2.5 py-1 rounded-full shadow-sm">
                                {days}d away
                              </span>
                            ) : (
                              <span className="bg-white/90 text-text-primary text-[10px] font-display font-bold px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                                {formatTripDate(t.departureDate)}
                              </span>
                            )}
                          </div>
                          {/* Trip type badge */}
                          <div className="absolute top-3 right-3">
                            <span className="bg-white/90 text-text-muted text-[9px] font-mono px-2 py-0.5 rounded-full backdrop-blur-sm">
                              {t.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
                            </span>
                          </div>
                          {/* Destination name overlay */}
                          <div className="absolute bottom-3 left-3 right-3">
                            <h3 className="font-display font-bold text-white text-base leading-tight drop-shadow-md truncate">
                              {t.destinations.length > 0 ? t.destinations.join(' → ') : primaryDest}
                            </h3>
                          </div>
                        </button>

                        {/* Card body */}
                        <div className="p-4">
                          {/* Trip meta */}
                          <div className="flex items-center gap-1.5 text-[11px] text-text-muted font-body">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            <span>{t.totalNights} nights</span>
                            <span className="text-border-subtle">&bull;</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            <span>{t.destinationCount} {t.destinationCount === 1 ? 'city' : 'cities'}</span>
                            <span className="text-border-subtle">&bull;</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            <span>{t.adults + (t.children || 0)} pax</span>
                          </div>

                          {/* Cost summary */}
                          {t.totalCost > 0 ? (
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
                              <div className="flex items-center gap-3 text-[10px] text-text-muted font-body">
                                {t.flightCost > 0 && <span>Flights <span className="font-mono text-text-secondary">{formatPrice(t.flightCost, currency)}</span></span>}
                                {t.hotelCost > 0 && <span>Hotels <span className="font-mono text-text-secondary">{formatPrice(t.hotelCost, currency)}</span></span>}
                              </div>
                              <span className="font-mono font-bold text-accent-cyan text-sm">{formatPrice(t.totalCost, currency)}</span>
                            </div>
                          ) : (
                            <div className="mt-3 pt-3 border-t border-border-subtle">
                              <span className="text-[10px] text-text-muted font-body italic">No bookings yet</span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleLoadTrip(t.id)}
                                className="text-[11px] font-display font-bold text-accent-cyan hover:text-accent-cyan/80 transition-colors px-2 py-1 rounded-lg hover:bg-accent-cyan/5">
                                Open
                              </button>
                              <button onClick={async () => { await loadTrip(t.id); router.push(`/deep-plan?id=${t.id}`); }}
                                className="text-[11px] font-body text-text-muted hover:text-accent-gold transition-colors px-2 py-1 rounded-lg hover:bg-accent-gold/5">
                                Itinerary
                              </button>
                            </div>
                            <div className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === t.id ? null : t.id); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-card transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                              </button>
                              {menuOpen === t.id && (
                                <div className="absolute right-0 top-8 bg-bg-surface border border-border-subtle rounded-xl shadow-lg py-1 w-36 z-50">
                                  <button onClick={() => { setSharingTripId(t.id); setMenuOpen(null); }}
                                    className="w-full text-left px-3 py-2 text-xs font-body text-text-secondary hover:bg-bg-card transition-colors flex items-center gap-2">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                                    Share
                                  </button>
                                  <button onClick={() => { handleDuplicateTrip(t.id); setMenuOpen(null); }}
                                    className="w-full text-left px-3 py-2 text-xs font-body text-text-secondary hover:bg-bg-card transition-colors flex items-center gap-2">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    Duplicate
                                  </button>
                                  <div className="border-t border-border-subtle my-1" />
                                  <button onClick={() => { handleDeleteTrip(t.id); setMenuOpen(null); }}
                                    disabled={deleting === t.id}
                                    className="w-full text-left px-3 py-2 text-xs font-body text-red-400 hover:bg-red-50 transition-colors flex items-center gap-2">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                    {deleting === t.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past trips */}
            {pastTrips.length > 0 && (
              <div>
                <h2 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider mb-4">
                  Past Trips
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {pastTrips.map((t, i) => {
                    const primaryDest = t.destinations[0] || 'Trip';
                    return (
                      <motion.div key={t.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="group bg-bg-surface border border-border-subtle rounded-xl overflow-hidden hover:border-accent-cyan/20 transition-all flex"
                      >
                        {/* Small photo */}
                        <button onClick={() => handleLoadTrip(t.id)} className="w-24 flex-shrink-0 relative overflow-hidden">
                          <PlacePhoto name={primaryDest} city={primaryDest} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/10" />
                        </button>

                        {/* Content */}
                        <div className="flex-1 p-3 min-w-0">
                          <button onClick={() => handleLoadTrip(t.id)} className="text-left w-full">
                            <h3 className="font-display font-bold text-sm text-text-primary truncate">
                              {t.destinations.length > 0 ? t.destinations.join(' → ') : primaryDest}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-muted font-body">
                              <span>{formatTripDate(t.departureDate)}</span>
                              <span>&bull;</span>
                              <span>{t.totalNights}N</span>
                              <span>&bull;</span>
                              <span>{t.destinationCount} {t.destinationCount === 1 ? 'city' : 'cities'}</span>
                            </div>
                          </button>
                          <div className="flex items-center justify-between mt-2">
                            {t.totalCost > 0 ? (
                              <span className="font-mono font-bold text-accent-cyan text-xs">{formatPrice(t.totalCost, currency)}</span>
                            ) : (
                              <span className="text-[10px] text-text-muted italic">—</span>
                            )}
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDuplicateTrip(t.id)}
                                className="text-[10px] text-text-muted hover:text-accent-cyan font-body transition-colors px-1.5 py-0.5 rounded">
                                Duplicate
                              </button>
                              <button onClick={() => handleDeleteTrip(t.id)} disabled={deleting === t.id}
                                className="text-[10px] text-text-muted hover:text-red-400 font-body transition-colors px-1.5 py-0.5 rounded">
                                {deleting === t.id ? '...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trip Templates */}
        <TripTemplatesSection templates={TRIP_TEMPLATES} onUseTemplate={handleUseTemplate} />
      </div>

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
