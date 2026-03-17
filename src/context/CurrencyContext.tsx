'use client';
import React, { createContext, useContext, useState } from 'react';
import { CurrencyCode } from '@/lib/currency';

const CurrencyContext = createContext<{
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
}>({ currency: 'INR', setCurrency: () => {} });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('currency') as CurrencyCode) || 'INR';
    }
    return 'INR';
  });

  const handleSet = (c: CurrencyCode) => {
    setCurrency(c);
    localStorage.setItem('currency', c);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: handleSet }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
