'use client';
import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Unregister any old service workers (e.g., from coming-soon page)
    // that may be intercepting requests and breaking the app
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
      });
    }
  }, []);
  return null;
}
