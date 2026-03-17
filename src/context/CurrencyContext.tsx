'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CurrencyCode, CURRENCIES } from '@/lib/currency';

const CurrencyContext = createContext<{
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
}>({ currency: 'INR', setCurrency: () => {} });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>('INR');

  useEffect(() => {
    const saved = localStorage.getItem('currency') as CurrencyCode;
    if (saved && saved in CURRENCIES) setCurrency(saved);
  }, []);

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
