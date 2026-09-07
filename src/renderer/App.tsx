import React from 'react';

export function App(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#1a1a2e',
        color: '#e0e0e0',
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Upscaler Desktop</h1>
      <p style={{ color: '#888', fontSize: '1rem' }}>
        Real-ESRGAN image upscaler — Phase 0 scaffold
      </p>
    </div>
  );
}
