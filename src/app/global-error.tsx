'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html><body style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Something went wrong</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>{error.message}</p>
        <button onClick={reset} style={{ background: '#E8654A', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Try again
        </button>
      </div>
    </body></html>
  );
}
