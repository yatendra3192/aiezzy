import type { Metadata } from 'next';
import { Syne, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google';
import { Providers } from '@/components/Providers';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import ErrorReporterInit from '@/components/ErrorReporterInit';
import WebVitals from '@/components/WebVitals';
import './globals.css';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
});

import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#E8654A',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://aiezzy.com'),
  title: 'AIEzzy — Smart Travel Planner',
  description: 'Plan multi-city trips with intelligent routing, flights, hotels, and detailed itineraries.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'AIEzzy — Smart Travel Planner',
    description: 'Plan multi-city trips with intelligent routing, flights, hotels, and detailed itineraries.',
    url: 'https://aiezzy.com',
    siteName: 'AIEzzy',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AIEzzy — Smart Travel Planner',
    description: 'Plan multi-city trips with intelligent routing, flights, hotels, and detailed itineraries.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable} ${spaceMono.variable}`}>
      <body className="font-body antialiased min-h-screen bg-bg-primary">
        <GoogleAnalytics />
        <ServiceWorkerRegister />
        <ErrorReporterInit />
        <WebVitals />
        <Providers>
          <div className="min-h-screen grid-pattern">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
