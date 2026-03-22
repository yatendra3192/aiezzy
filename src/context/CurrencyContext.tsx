'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CurrencyCode, CURRENCIES, fetchLiveRates, setLiveRates, hasLiveRates } from '@/lib/currency';

const CurrencyContext = createContext<{
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  isLiveRates: boolean;
}>({ currency: 'INR', setCurrency: () => {}, isLiveRates: false });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [isLiveRates, setIsLiveRates] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('currency') as CurrencyCode;
    if (saved && saved in CURRENCIES) setCurrency(saved);

    // Fetch live rates if not cached
    if (!hasLiveRates()) {
      fetchLiveRates().then(rates => {
        if (rates) {
          setLiveRates(rates);
          setIsLiveRates(true);
        }
      });
    } else {
      setIsLiveRates(true);
    }
  }, []);

  const handleSet = (c: CurrencyCode) => {
    setCurrency(c);
    localStorage.setItem('currency', c);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: handleSet, isLiveRates }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
