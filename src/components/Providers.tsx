'use client';

import { SessionProvider } from 'next-auth/react';
import { TripProvider } from '@/context/TripContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TripProvider>
        {children}
      </TripProvider>
    </SessionProvider>
  );
}
