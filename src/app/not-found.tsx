import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-primary px-4">
      <h1 className="font-display text-6xl font-bold text-accent-cyan mb-4">404</h1>
      <p className="font-body text-lg text-gray-600 mb-8">
        This page doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="px-6 py-3 bg-accent-cyan text-white font-body font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        Go Home
      </Link>
    </div>
  );
}
