import React, { useState } from 'react';
import { T } from '../theme';

interface Props {
  onLogin: () => void;
}

export function AuthScreen({ onLogin }: Props): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (): void => {
    setLoading(true);
    setError(null);
    window.electronAPI
      .login()
      .then(onLogin)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
    }}>
      <div style={{ fontSize: '18px', color: T.accent, letterSpacing: '0.1em', marginBottom: '8px' }}>
        SNAP CAM
      </div>
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '10px 28px',
          fontSize: '13px',
          borderColor: T.purple,
          color: loading ? T.textMuted : T.purple,
        }}
      >
        {loading ? 'Ожидание...' : '> Войти через Twitch'}
      </button>
      {error && (
        <p style={{ color: T.error, maxWidth: 360, textAlign: 'center', fontSize: '0.85em', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
