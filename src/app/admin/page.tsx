'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';

interface Stats {
  totalUsers: number;
  totalTrips: number;
  tripsWithFlights: number;
  tripsWithHotels: number;
  totalTripValue: number;
  recentSignups: number;
  topDestinations: Array<{ city: string; count: number }>;
  providerBreakdown: Record<string, number>;
  usersWithTrips: number;
  usersWithoutTrips: number;
  avgNights: number;
  avgCities: number;
  tripsToday: number;
  tripsThisWeek: number;
}

interface User {
  id: string; email: string; name: string; provider: string; createdAt: string; lastSignIn: string;
}

interface Trip {
  id: string; title: string; userName: string; userEmail: string; fromAddress: string;
  departureDate: string; destinations: string[]; destinationCount: number; totalNights: number;
  adults: number; tripType: string; status: string; flightCost: number; trainCost: number;
  hotelCost: number; totalCost: number; createdAt: string; updatedAt: string;
}

interface ApiProviderUsage {
  count: number;
  costPerCall: number;
  estimatedCostUSD: number;
  lastCalledAt: string | null;
  label: string;
  category: string;
}

interface ApiUsageData {
  providers: Record<string, ApiProviderUsage>;
  totalCostUSD: number;
  projectedMonthlyCostUSD: number;
  resetAt: string;
  uptimeHours: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageData | null>(null);
  const [tab, setTab] = useState<'overview' | 'users' | 'trips' | 'costs'>('overview');
  const [error, setError] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [adminRes, usageRes] = await Promise.all([
        fetch('/api/admin'),
        fetch('/api/admin/api-usage'),
      ]);
      if (adminRes.status === 401) { setError('Access denied. Admin privileges required.'); setLoading(false); return; }
      if (!adminRes.ok) { setError('Failed to load data'); setLoading(false); return; }
      const data = await adminRes.json();
      setStats(data.stats);
      setUsers(data.users);
      setTrips(data.trips);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        setApiUsage(usage);
      }
    } catch { setError('Failed to load data'); }
    setLoading(false);
  };

  const resetUsage = async () => {
    const res = await fetch('/api/admin/api-usage', { method: 'DELETE' });
    if (res.ok) setApiUsage(await res.json());
  };

  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-8 h-8 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated' || error === 'Access denied. Admin privileges required.') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg-primary">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-8 w-full max-w-[400px] text-center">
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Admin Dashboard</h1>
          <p className="text-red-500 text-sm font-body">{error || 'Please sign in with an admin account.'}</p>
        </motion.div>
      </div>
    );
  }

  // Group API usage by category
  const usageByCategory: Record<string, { providers: Array<{ key: string } & ApiProviderUsage>; totalCost: number; totalCalls: number }> = {};
  if (apiUsage) {
    for (const [key, p] of Object.entries(apiUsage.providers)) {
      if (!usageByCategory[p.category]) usageByCategory[p.category] = { providers: [], totalCost: 0, totalCalls: 0 };
      usageByCategory[p.category].providers.push({ key, ...p });
      usageByCategory[p.category].totalCost += p.estimatedCostUSD;
      usageByCategory[p.category].totalCalls += p.count;
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4 md:p-8">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              <span className="text-accent-cyan">AI</span>Ezzy Admin
            </h1>
            <p className="text-text-muted text-sm font-body">Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="text-text-muted text-sm hover:text-accent-cyan transition-colors font-body">Refresh</button>
            <button onClick={() => window.location.href = '/my-trips'} className="text-text-muted text-sm hover:text-accent-cyan transition-colors font-body">Back to App</button>
          </div>
        </div>

        {/* Stats row 1 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Total Users</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.totalUsers}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">{stats.recentSignups} in last 30 days</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Total Trips</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.totalTrips}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">{stats.tripsWithFlights} with flights</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Hotels Booked</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.tripsWithHotels}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">trips with hotels</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Total Trip Value</p>
              <p className="text-2xl font-display font-bold text-accent-cyan mt-1">&#8377;{stats.totalTripValue.toLocaleString()}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">across all trips</p>
            </div>
          </div>
        )}

        {/* Stats row 2 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Active Users</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.usersWithTrips}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">{stats.usersWithoutTrips} haven&apos;t planned yet</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Trips This Week</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.tripsThisWeek}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">{stats.tripsToday} today</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Avg Trip Size</p>
              <p className="text-3xl font-display font-bold text-text-primary mt-1">{stats.avgNights}N</p>
              <p className="text-text-muted text-[10px] font-body mt-1">{stats.avgCities} cities avg</p>
            </div>
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
              <p className="text-text-muted text-xs font-body uppercase tracking-wider">Est. API Cost</p>
              <p className="text-2xl font-display font-bold text-accent-cyan mt-1">${apiUsage?.totalCostUSD?.toFixed(2) || '0.00'}</p>
              <p className="text-text-muted text-[10px] font-body mt-1">~${apiUsage?.projectedMonthlyCostUSD?.toFixed(0) || '0'}/mo projected</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'users', 'trips', 'costs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-display font-bold transition-all ${
                tab === t ? 'bg-accent-cyan text-white' : 'bg-bg-card border border-border-subtle text-text-secondary hover:border-accent-cyan/30'
              }`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent signups */}
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 card-warm">
              <h3 className="font-display font-bold text-sm text-text-primary mb-4">Recent Signups</h3>
              <div className="space-y-3">
                {users.slice(0, 8).map(u => (
                  <div key={u.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-body text-text-primary">{u.name}</p>
                      <p className="text-[10px] text-text-muted font-mono">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-text-muted font-mono">{new Date(u.createdAt).toLocaleDateString()}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-gold/10 text-accent-gold font-mono">{u.provider}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top destinations + Provider breakdown */}
            <div className="space-y-6">
              {/* Top destinations */}
              {stats && stats.topDestinations.length > 0 && (
                <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 card-warm">
                  <h3 className="font-display font-bold text-sm text-text-primary mb-4">Top Destinations</h3>
                  <div className="space-y-2">
                    {stats.topDestinations.map((d, i) => (
                      <div key={d.city} className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-text-muted w-4">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-body text-text-primary">{d.city}</span>
                            <span className="text-[10px] font-mono text-text-muted">{d.count} trips</span>
                          </div>
                          <div className="h-1.5 bg-bg-card rounded-full overflow-hidden">
                            <div className="h-full bg-accent-cyan/60 rounded-full" style={{ width: `${(d.count / stats.topDestinations[0].count) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Provider breakdown */}
              {stats && (
                <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 card-warm">
                  <h3 className="font-display font-bold text-sm text-text-primary mb-4">Signup Providers</h3>
                  <div className="flex gap-4">
                    {Object.entries(stats.providerBreakdown).map(([provider, count]) => (
                      <div key={provider} className="flex-1 text-center">
                        <p className="text-2xl font-display font-bold text-text-primary">{count}</p>
                        <p className="text-[10px] font-mono text-text-muted uppercase">{provider}</p>
                        <p className="text-[10px] font-body text-text-muted">{Math.round(count / stats.totalUsers * 100)}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent trips */}
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 card-warm md:col-span-2">
              <h3 className="font-display font-bold text-sm text-text-primary mb-4">Recent Trips</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {trips.slice(0, 8).map(t => (
                  <div key={t.id}>
                    <button onClick={() => setSelectedTrip(selectedTrip?.id === t.id ? null : t)} className="w-full text-left flex items-center justify-between hover:bg-bg-card/50 rounded-lg p-1.5 -mx-1.5 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-body text-text-primary truncate">{t.destinations.join(' → ') || 'No destinations'}</p>
                        <p className="text-[10px] text-text-muted font-body">{t.userName} &middot; {t.departureDate}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {t.totalCost > 0 && <p className="text-xs font-mono text-accent-cyan font-bold">&#8377;{t.totalCost.toLocaleString()}</p>}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${t.status === 'planned' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>{t.status}</span>
                      </div>
                    </button>
                    {selectedTrip?.id === t.id && (
                      <div className="mt-2 mb-3 p-3 bg-bg-card rounded-xl border border-border-subtle text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="font-display font-bold text-text-primary mb-1.5">Itinerary</p>
                            {t.destinations.map((d, di) => (
                              <div key={di} className="flex items-center gap-1.5 mb-1">
                                <span className="w-4 h-4 rounded-full bg-accent-cyan text-white text-[8px] font-mono flex items-center justify-center">{di+1}</span>
                                <span className="text-text-primary font-body">{d}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="font-display font-bold text-text-primary mb-1.5">Costs</p>
                            {t.flightCost > 0 && <p className="text-text-secondary">Flights: <span className="font-mono text-text-primary">&#8377;{t.flightCost.toLocaleString()}</span></p>}
                            {t.trainCost > 0 && <p className="text-text-secondary">Trains: <span className="font-mono text-text-primary">&#8377;{t.trainCost.toLocaleString()}</span></p>}
                            {t.hotelCost > 0 && <p className="text-text-secondary">Hotels: <span className="font-mono text-text-primary">&#8377;{t.hotelCost.toLocaleString()}</span></p>}
                            <p className="text-text-primary font-semibold mt-1 pt-1 border-t border-border-subtle">Total: <span className="font-mono text-accent-cyan">&#8377;{t.totalCost.toLocaleString()}</span></p>
                            <p className="text-text-muted mt-1">{t.totalNights}N &middot; {t.adults} pax &middot; {t.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <div className="bg-bg-surface border border-border-subtle rounded-xl card-warm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-card">
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Name</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Email</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Provider</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Signed Up</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-border-subtle hover:bg-bg-card/50 transition-colors">
                    <td className="px-4 py-3 font-body text-text-primary">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-text-secondary text-xs">{u.email}</td>
                    <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded bg-accent-gold/10 text-accent-gold font-mono">{u.provider}</span></td>
                    <td className="px-4 py-3 font-mono text-text-muted text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono text-text-muted text-xs">{u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Trips tab */}
        {tab === 'trips' && (
          <div className="bg-bg-surface border border-border-subtle rounded-xl card-warm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-card">
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">User</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Route</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Date</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Cities</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Nights</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Pax</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Flights</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Hotels</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Total</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs">Status</th>
                  <th className="text-left px-4 py-3 font-display font-bold text-text-secondary text-xs"></th>
                </tr>
              </thead>
              <tbody>
                {trips.map(t => (
                  <React.Fragment key={t.id}>
                  <tr className="border-b border-border-subtle hover:bg-bg-card/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-body text-text-primary text-xs">{t.userName}</p>
                      <p className="font-mono text-text-muted text-[10px]">{t.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-body text-text-primary text-xs max-w-[200px] truncate">{t.destinations.join(' → ')}</td>
                    <td className="px-4 py-3 font-mono text-text-muted text-xs">{t.departureDate}</td>
                    <td className="px-4 py-3 font-mono text-text-primary text-center">{t.destinationCount}</td>
                    <td className="px-4 py-3 font-mono text-text-primary text-center">{t.totalNights}</td>
                    <td className="px-4 py-3 font-mono text-text-primary text-center">{t.adults}</td>
                    <td className="px-4 py-3 font-mono text-accent-cyan text-xs">{t.flightCost > 0 ? `₹${t.flightCost.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-accent-cyan text-xs">{t.hotelCost > 0 ? `₹${t.hotelCost.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-accent-cyan text-xs">{t.totalCost > 0 ? `₹${t.totalCost.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded font-mono ${t.status === 'planned' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>{t.status}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedTrip(selectedTrip?.id === t.id ? null : t)}
                        className="text-accent-cyan text-xs font-body hover:underline">{selectedTrip?.id === t.id ? 'Hide' : 'View'}</button>
                    </td>
                  </tr>
                  {selectedTrip?.id === t.id && (
                    <tr><td colSpan={11} className="px-4 py-4 bg-bg-card/50">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-display font-bold text-sm text-text-primary mb-2">Itinerary</h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-accent-cyan text-white text-[9px] font-mono flex items-center justify-center">1</span>
                              <span className="text-xs font-body text-text-primary">{t.fromAddress}</span>
                            </div>
                            {t.destinations.map((d: string, di: number) => (
                              <div key={di} className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-accent-cyan text-white text-[9px] font-mono flex items-center justify-center">{di + 2}</span>
                                <span className="text-xs font-body text-text-primary">{d}</span>
                              </div>
                            ))}
                            {t.tripType === 'roundTrip' && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-accent-cyan text-white text-[9px] font-mono flex items-center justify-center">{t.destinations.length + 2}</span>
                                <span className="text-xs font-body text-text-muted italic">Return to {t.fromAddress?.split(',')[0]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-display font-bold text-sm text-text-primary mb-2">Cost Breakdown</h4>
                          <div className="space-y-1.5 text-xs font-body">
                            <div className="flex justify-between"><span className="text-text-secondary">Flights</span><span className="font-mono text-text-primary">{t.flightCost > 0 ? `₹${t.flightCost.toLocaleString()}` : '—'}</span></div>
                            <div className="flex justify-between"><span className="text-text-secondary">Trains</span><span className="font-mono text-text-primary">{t.trainCost > 0 ? `₹${t.trainCost.toLocaleString()}` : '—'}</span></div>
                            <div className="flex justify-between"><span className="text-text-secondary">Hotels</span><span className="font-mono text-text-primary">{t.hotelCost > 0 ? `₹${t.hotelCost.toLocaleString()}` : '—'}</span></div>
                            <div className="flex justify-between pt-1.5 border-t border-border-subtle"><span className="text-text-primary font-semibold">Total</span><span className="font-mono font-bold text-accent-cyan">₹{t.totalCost.toLocaleString()}</span></div>
                          </div>
                          <div className="mt-3 text-[10px] text-text-muted space-y-0.5">
                            <p>Type: {t.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}</p>
                            <p>Created: {new Date(t.createdAt).toLocaleString()}</p>
                            <p>Updated: {new Date(t.updatedAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </td></tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Costs tab */}
        {tab === 'costs' && apiUsage && (
          <div className="space-y-6">
            {/* Cost summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
                <p className="text-text-muted text-xs font-body uppercase tracking-wider">Total Cost</p>
                <p className="text-2xl font-display font-bold text-accent-cyan mt-1">${apiUsage.totalCostUSD.toFixed(2)}</p>
                <p className="text-text-muted text-[10px] font-body mt-1">since deploy</p>
              </div>
              <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
                <p className="text-text-muted text-xs font-body uppercase tracking-wider">Monthly Projected</p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">${apiUsage.projectedMonthlyCostUSD.toFixed(0)}</p>
                <p className="text-text-muted text-[10px] font-body mt-1">at current rate</p>
              </div>
              <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
                <p className="text-text-muted text-xs font-body uppercase tracking-wider">Total API Calls</p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">
                  {Object.values(apiUsage.providers).reduce((s, p) => s + p.count, 0).toLocaleString()}
                </p>
                <p className="text-text-muted text-[10px] font-body mt-1">across all providers</p>
              </div>
              <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 card-warm">
                <p className="text-text-muted text-xs font-body uppercase tracking-wider">Uptime</p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">{apiUsage.uptimeHours}h</p>
                <p className="text-text-muted text-[10px] font-body mt-1">
                  since {new Date(apiUsage.resetAt).toLocaleDateString()}
                  <button onClick={resetUsage} className="ml-2 text-accent-cyan hover:underline">Reset</button>
                </p>
              </div>
            </div>

            {/* Usage by category */}
            {Object.entries(usageByCategory)
              .sort((a, b) => b[1].totalCost - a[1].totalCost)
              .map(([category, data]) => (
              <div key={category} className="bg-bg-surface border border-border-subtle rounded-xl card-warm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-bg-card border-b border-border-subtle">
                  <h3 className="font-display font-bold text-sm text-text-primary">{category}</h3>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-text-muted">{data.totalCalls.toLocaleString()} calls</span>
                    <span className={`text-xs font-mono font-bold ${data.totalCost > 0 ? 'text-accent-cyan' : 'text-green-500'}`}>
                      {data.totalCost > 0 ? `$${data.totalCost.toFixed(3)}` : 'Free'}
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-5 py-2 font-body text-text-muted text-xs">Provider</th>
                      <th className="text-right px-5 py-2 font-body text-text-muted text-xs">Calls</th>
                      <th className="text-right px-5 py-2 font-body text-text-muted text-xs">$/call</th>
                      <th className="text-right px-5 py-2 font-body text-text-muted text-xs">Est. Cost</th>
                      <th className="text-right px-5 py-2 font-body text-text-muted text-xs">Last Called</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providers
                      .sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD || b.count - a.count)
                      .map(p => (
                      <tr key={p.key} className="border-b border-border-subtle last:border-0 hover:bg-bg-card/30 transition-colors">
                        <td className="px-5 py-2.5 font-body text-text-primary text-xs">{p.label}</td>
                        <td className="px-5 py-2.5 font-mono text-text-primary text-xs text-right">{p.count.toLocaleString()}</td>
                        <td className="px-5 py-2.5 font-mono text-text-muted text-xs text-right">
                          {p.costPerCall > 0 ? `$${p.costPerCall}` : <span className="text-green-500">free</span>}
                        </td>
                        <td className={`px-5 py-2.5 font-mono text-xs text-right font-bold ${
                          p.estimatedCostUSD > 1 ? 'text-red-500' : p.estimatedCostUSD > 0 ? 'text-accent-cyan' : 'text-green-500'
                        }`}>
                          {p.estimatedCostUSD > 0 ? `$${p.estimatedCostUSD.toFixed(3)}` : '—'}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-text-muted text-[10px] text-right">
                          {p.lastCalledAt ? new Date(p.lastCalledAt).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
