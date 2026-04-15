import React, { useState, useEffect } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { MainScreen } from './screens/MainScreen';

type Screen = 'auth' | 'main';

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('auth');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // Check if already authenticated on mount.
    window.electronAPI
      .checkAuth()
      .then((isAuth) => {
        if (isAuth) setScreen('main');
      })
      .catch(console.error)
      .finally(() => setAuthChecked(true));

    // Subscribe to logout event from main process.
    const unsub = window.electronAPI.onAuthLogout(() => setScreen('auth'));
    return unsub;
  }, []);

  if (!authChecked) {
    // Brief loading state to prevent screen flicker.
    return <div />;
  }

  return screen === 'auth' ? <AuthScreen /> : <MainScreen />;
}
