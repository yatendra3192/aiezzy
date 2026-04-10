'use client';
import { useEffect } from 'react';
import { reportError } from '@/lib/errorReporter';

export default function ErrorReporterInit() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      reportError(event.error || event.message, { type: 'unhandled' });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      reportError(String(event.reason), { type: 'unhandled-rejection' });
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
  return null;
}
