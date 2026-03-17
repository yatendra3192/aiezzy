'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Locale, t as translate } from '@/lib/i18n';

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}>({ locale: 'en', setLocale: () => {}, t: (k) => k });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale;
    if (saved === 'en' || saved === 'hi') setLocale(saved);
  }, []);

  const handleSet = (l: Locale) => {
    setLocale(l);
    localStorage.setItem('locale', l);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale: handleSet, t: (key) => translate(key, locale) }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
