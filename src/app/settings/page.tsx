'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useLocale } from '@/context/LocaleContext';
import { LOCALES } from '@/lib/i18n';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { locale, setLocale } = useLocale();

  // Profile state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }
    if (authStatus === 'authenticated') {
      fetchProfile();
    }
  }, [authStatus]);

  const fetchProfile = async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setDisplayName(data.displayName || '');
        setEmail(data.email || '');
      }
    } catch {
      // ignore
    }
    setLoadingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      setProfileMsg({ type: 'error', text: 'Display name cannot be empty' });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      if (res.ok) {
        setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
      } else {
        const data = await res.json();
        setProfileMsg({ type: 'error', text: data.error || 'Failed to update profile' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Network error' });
    }
    setSavingProfile(false);
  };

  const handleChangePassword = async () => {
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ type: 'error', text: 'Enter your current password' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordMsg({ type: 'success', text: 'Password changed successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setPasswordMsg({ type: 'error', text: data.error || 'Failed to change password' });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Network error' });
    }
    setChangingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE') return;

    setDeleting(true);
    setDeleteMsg(null);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (res.ok) {
        signOut({ callbackUrl: '/' });
      } else {
        const data = await res.json();
        setDeleteMsg({ type: 'error', text: data.error || 'Failed to delete account' });
        setDeleting(false);
      }
    } catch {
      setDeleteMsg({ type: 'error', text: 'Network error' });
      setDeleting(false);
    }
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[430px] md:max-w-[680px]">
        {/* Header */}
        <div className="bg-bg-surface border border-border-subtle rounded-[2rem] card-warm-lg p-6 md:p-8 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/my-trips')} className="font-display text-xl font-bold hover:opacity-80 transition-opacity">
                <span className="text-accent-cyan">AI</span>Ezzy
              </button>
              <span className="text-text-muted text-xs font-body">/</span>
              <span className="text-text-secondary text-sm font-display font-bold">Settings</span>
            </div>
            <button
              onClick={() => router.push('/my-trips')}
              className="text-text-muted text-xs font-body hover:text-accent-cyan transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
              </svg>
              Back to Trips
            </button>
          </div>
        </div>

        {loadingProfile ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
            <span className="text-text-muted text-sm ml-3 font-body">Loading profile...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile Section */}
            <div className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 md:p-8">
              <h2 className="font-display text-base font-bold text-text-primary mb-1">Profile</h2>
              <p className="text-text-muted text-xs font-body mb-5">Manage your account information</p>

              <div className="space-y-4">
                <div>
                  <label className="text-text-secondary text-xs font-display font-bold tracking-wide uppercase mb-1.5 block">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => { setDisplayName(e.target.value); setProfileMsg(null); }}
                    className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all input-glow focus:border-accent-cyan"
                    placeholder="Your display name"
                  />
                </div>
                <div>
                  <label className="text-text-secondary text-xs font-display font-bold tracking-wide uppercase mb-1.5 block">
                    Email
                  </label>
                  <p className="text-text-primary text-sm font-body bg-bg-card border border-border-subtle rounded-xl px-4 py-3 opacity-60">
                    {email}
                  </p>
                </div>

                {profileMsg && (
                  <p className={`text-xs font-body ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {profileMsg.text}
                  </p>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="bg-accent-cyan text-white font-display font-bold text-sm px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(232,101,74,0.2)] transition-all disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </motion.button>
              </div>
            </div>

            {/* Language Section */}
            <div className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 md:p-8">
              <h2 className="font-display text-base font-bold text-text-primary mb-1">Language</h2>
              <p className="text-text-muted text-xs font-body mb-5">Choose your preferred language</p>

              <div className="flex gap-3">
                {LOCALES.map((loc) => (
                  <button
                    key={loc.code}
                    onClick={() => setLocale(loc.code)}
                    className={`px-5 py-2.5 rounded-xl font-display font-bold text-sm transition-all ${
                      locale === loc.code
                        ? 'bg-accent-cyan text-white shadow-[0_0_20px_rgba(232,101,74,0.2)]'
                        : 'bg-bg-card border border-border-subtle text-text-secondary hover:border-accent-cyan/30'
                    }`}
                  >
                    {loc.nativeName}
                  </button>
                ))}
              </div>
            </div>

            {/* Security Section */}
            <div className="bg-bg-surface border border-border-subtle rounded-2xl card-warm-lg p-6 md:p-8">
              <h2 className="font-display text-base font-bold text-text-primary mb-1">Security</h2>
              <p className="text-text-muted text-xs font-body mb-5">Update your password</p>

              <div className="space-y-4">
                <div>
                  <label className="text-text-secondary text-xs font-display font-bold tracking-wide uppercase mb-1.5 block">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value); setPasswordMsg(null); }}
                    className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all input-glow focus:border-accent-cyan"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label className="text-text-secondary text-xs font-display font-bold tracking-wide uppercase mb-1.5 block">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                    className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all input-glow focus:border-accent-cyan"
                    placeholder="At least 8 characters"
                  />
                  {newPassword.length > 0 && newPassword.length < 8 && (
                    <p className="text-red-500 text-[10px] font-body mt-1">Must be at least 8 characters</p>
                  )}
                </div>
                <div>
                  <label className="text-text-secondary text-xs font-display font-bold tracking-wide uppercase mb-1.5 block">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setPasswordMsg(null); }}
                    className="w-full bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-body outline-none transition-all input-glow focus:border-accent-cyan"
                    placeholder="Re-enter new password"
                  />
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="text-red-500 text-[10px] font-body mt-1">Passwords do not match</p>
                  )}
                </div>

                {passwordMsg && (
                  <p className={`text-xs font-body ${passwordMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordMsg.text}
                  </p>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="bg-accent-cyan text-white font-display font-bold text-sm px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(232,101,74,0.2)] transition-all disabled:opacity-50"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </motion.button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-bg-surface border border-red-300 rounded-2xl card-warm-lg p-6 md:p-8">
              <h2 className="font-display text-base font-bold text-red-600 mb-1">Danger Zone</h2>
              <p className="text-text-muted text-xs font-body mb-5">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-50 border border-red-300 text-red-600 font-display font-bold text-sm px-6 py-3 rounded-xl hover:bg-red-100 transition-all"
                >
                  Delete Account
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-red-600 text-xs font-body font-semibold">
                    Type <span className="font-mono bg-red-50 px-1.5 py-0.5 rounded">DELETE</span> to confirm
                  </p>
                  <input
                    type="text"
                    value={deleteText}
                    onChange={e => { setDeleteText(e.target.value); setDeleteMsg(null); }}
                    className="w-full bg-bg-card border border-red-300 rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm font-mono outline-none transition-all focus:border-red-500"
                    placeholder="Type DELETE"
                    autoFocus
                  />

                  {deleteMsg && (
                    <p className="text-red-500 text-xs font-body">{deleteMsg.text}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); setDeleteMsg(null); }}
                      className="flex-1 bg-bg-card border border-border-subtle text-text-secondary font-display font-bold text-sm py-3 rounded-xl hover:border-accent-cyan/30 transition-all"
                    >
                      Cancel
                    </button>
                    <motion.button
                      whileHover={deleteText === 'DELETE' ? { scale: 1.02 } : {}}
                      whileTap={deleteText === 'DELETE' ? { scale: 0.98 } : {}}
                      onClick={handleDeleteAccount}
                      disabled={deleteText !== 'DELETE' || deleting}
                      className={`flex-1 font-display font-bold text-sm py-3 rounded-xl transition-all ${
                        deleteText === 'DELETE'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-red-200 text-red-400 cursor-not-allowed'
                      }`}
                    >
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
