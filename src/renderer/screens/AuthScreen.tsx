import React from 'react';

export function AuthScreen(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        onClick={() => {
          window.electronAPI.login().catch(console.error);
        }}
        style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer' }}
      >
        Войти через Twitch
      </button>
    </div>
  );
}
