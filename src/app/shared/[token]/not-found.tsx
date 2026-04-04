import Link from 'next/link';

export default function SharedTripNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="text-4xl">&#128683;</div>
        <p className="text-text-primary font-display font-bold text-lg">Trip not found</p>
        <p className="text-text-muted text-sm font-body">This shared trip link is invalid or has been removed.</p>
        <Link
          href="/signup"
          className="inline-block mt-4 bg-accent-cyan text-white font-display font-bold text-sm px-6 py-3 rounded-xl hover:bg-accent-cyan/90 transition-colors">
          Plan Your Own Trip
        </Link>
      </div>
    </div>
  );
}
