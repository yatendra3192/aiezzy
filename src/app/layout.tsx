import type { Metadata } from 'next';
import { Syne, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google';
import { Providers } from '@/components/Providers';
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

export const metadata: Metadata = {
  title: 'AIEzzy — Smart Travel Planner',
  description: 'Plan multi-city trips with intelligent routing, flights, hotels, and detailed itineraries.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable} ${spaceMono.variable}`}>
      <body className="font-body antialiased min-h-screen">
        <Providers>
          <div className="min-h-screen grid-pattern">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
