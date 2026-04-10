'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    // Redirect to homepage with error param after short delay
    const timer = setTimeout(() => {
      router.replace(`/?authError=${error || 'unknown'}`);
    }, 100);
    return () => clearTimeout(timer);
  }, [error, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-text-muted font-body text-sm">Redirecting...</p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-text-muted">Loading...</p></div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
