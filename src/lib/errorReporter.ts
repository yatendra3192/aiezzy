// Lightweight error reporting
// Replace with Sentry when NEXT_PUBLIC_SENTRY_DSN is configured

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
  extra?: Record<string, any>;
}

const errorQueue: ErrorReport[] = [];
const MAX_QUEUE = 50;

export function reportError(error: Error | string, extra?: Record<string, any>) {
  const report: ErrorReport = {
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    url: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    extra,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[ErrorReporter]', report);
  }

  // Queue for batch reporting
  errorQueue.push(report);
  if (errorQueue.length > MAX_QUEUE) errorQueue.shift();

  // Send to Sentry DSN if configured
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    // Future: send to Sentry envelope endpoint
    // For now, log to /api/admin/errors if available
  }
}

export function getErrorQueue(): ErrorReport[] {
  return [...errorQueue];
}
