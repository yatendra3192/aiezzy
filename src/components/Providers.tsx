'use client';

import { SessionProvider } from 'next-auth/react';
import { TripProvider } from '@/context/TripContext';
import { CurrencyProvider } from '@/context/CurrencyContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CurrencyProvider>
        <TripProvider>
          {children}
        </TripProvider>
      </CurrencyProvider>
    </SessionProvider>
  );
}
