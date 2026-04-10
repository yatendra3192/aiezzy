'use client';

import { SessionProvider } from 'next-auth/react';
import { TripProvider } from '@/context/TripContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { LocaleProvider } from '@/context/LocaleContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LocaleProvider>
        <CurrencyProvider>
          <TripProvider>
            {children}
          </TripProvider>
        </CurrencyProvider>
      </LocaleProvider>
    </SessionProvider>
  );
}
