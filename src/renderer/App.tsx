import React, { useState, useEffect } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { MainScreen } from './screens/MainScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { T } from './theme';

type Screen = 'onboarding' | 'auth' | 'main';

const GLOBAL_STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; padding: 0; }
  body {
    background: ${T.bg};
    color: ${T.text};
    font-family: ${T.font};
    font-size: 18px;
    line-height: 1.5;
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; }
  ::-webkit-scrollbar-thumb:hover { background: ${T.borderBright}; }
  button {
    background: ${T.surface};
    color: ${T.text};
    border: 1px solid ${T.borderBright};
    padding: 4px 10px;
    cursor: pointer;
    font-family: ${T.font};
    font-size: 12px;
    transition: border-color 0.15s, color 0.15s;
  }
  button:hover:not(:disabled) {
    border-color: ${T.accent};
    color: ${T.accent};
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  input, select, textarea {
    background: ${T.bg};
    color: ${T.text};
    border: 1px solid ${T.border};
    padding: 4px 8px;
    font-family: ${T.font};
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: ${T.accent};
  }
  select option {
    background: ${T.surface};
    color: ${T.text};
  }
  h2, h3, h4 { margin: 0; font-weight: normal; letter-spacing: 0.05em; color: ${T.text}; }
`;

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('auth');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    Promise.all([
      window.electronAPI.onboardingCheck(),
      window.electronAPI.checkAuth(),
    ])
      .then(([onboardingDone, isAuth]) => {
        if (!onboardingDone) {
          setScreen('onboarding');
        } else if (isAuth) {
          setScreen('main');
        } else {
          setScreen('auth');
        }
      })
      .catch(console.error)
      .finally(() => setAuthChecked(true));

    const unsub = window.electronAPI.onAuthLogout(() => setScreen('auth'));
    return unsub;
  }, []);

  if (!authChecked) {
    return <div />;
  }

  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      {screen === 'onboarding' && <OnboardingScreen onComplete={() => setScreen('auth')} />}
      {screen === 'auth' && <AuthScreen onLogin={() => setScreen('main')} />}
      {screen === 'main' && <MainScreen />}
    </>
  );
}
