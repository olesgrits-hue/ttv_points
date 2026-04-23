import React, { useState } from 'react';
import { T } from '../theme';

const OVERLAY_URL = 'http://127.0.0.1:7891/overlay';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps): React.ReactElement {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Добро пожаловать в TTWeaks',
      content: (
        <>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            TTWeaks — оверлей для OBS, который превращает Channel Points Twitch в медиа-события.
          </p>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            Зрители тратят баллы — в эфире появляется видео, мем или играет музыка из Яндекс Музыки.
          </p>
        </>
      ),
    },
    {
      title: 'Авторизация Twitch',
      content: (
        <>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            Нажми кнопку ниже, чтобы войти через Twitch. TTWeaks получит доступ к Channel Points твоего канала.
          </p>
          <button
            onClick={() => void window.electronAPI.login()}
            style={{ padding: '8px 20px', borderColor: T.purple, color: T.purple, marginTop: '8px' }}
          >
            Войти через Twitch
          </button>
        </>
      ),
    },
    {
      title: 'OBS Browser Source',
      content: (
        <>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            Добавь Browser Source в OBS:
          </p>
          <div style={{ background: T.bg, padding: '10px', marginBottom: '8px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: '0.85em', color: T.textMuted, marginBottom: '4px' }}>URL:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{ color: T.accent, fontSize: '0.88em', flex: 1 }}>{OVERLAY_URL}</code>
              <button
                onClick={() => navigator.clipboard.writeText(OVERLAY_URL).catch(console.error)}
                style={{ fontSize: '0.75em' }}
              >
                копировать
              </button>
            </div>
          </div>
          <ul style={{ color: T.textSoft, fontSize: '0.85em', lineHeight: 1.9, paddingLeft: '16px', margin: 0 }}>
            <li>Размер: 1920×1080</li>
            <li><strong style={{ color: T.warning }}>«Shutdown source when not visible»</strong> → ВЫКЛ</li>
            <li><strong style={{ color: T.warning }}>«Refresh browser when scene becomes active»</strong> → ВЫКЛ</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Создай первый слот',
      content: (
        <>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            Слот — это пара «Channel Point Reward → медиа/музыка».
          </p>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            После завершения онбординга перейди во вкладку <strong style={{ color: T.accent }}>СЛОТЫ</strong> и нажми «+ добавить слот».
          </p>
          <ul style={{ color: T.textSoft, fontSize: '0.85em', lineHeight: 1.9, paddingLeft: '16px', margin: 0 }}>
            <li><strong>МЕДИА</strong> — воспроизвести видео/гифку/аудио</li>
            <li><strong>МЕМ</strong> — случайный файл из папки</li>
            <li><strong>МУЗЫКА</strong> — трек из Яндекс Музыки по запросу зрителя</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Готово!',
      content: (
        <>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            TTWeaks настроен и готов к работе.
          </p>
          <p style={{ color: T.textSoft, lineHeight: 1.7 }}>
            Для Яндекс Музыки — добавь токен в <strong style={{ color: T.accent }}>НАСТРОЙКИ</strong> → Яндекс Музыка.
          </p>
        </>
      ),
    },
  ];

  const isLast = step === steps.length - 1;

  const handleNext = async (): Promise<void> => {
    if (isLast) {
      await window.electronAPI.onboardingComplete();
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const current = steps[step];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        padding: '28px',
        maxWidth: '480px',
        width: '100%',
      }}>
        <div style={{ color: T.textMuted, fontSize: '0.75em', letterSpacing: '0.1em', marginBottom: '4px' }}>
          {step + 1} / {steps.length}
        </div>
        <div style={{ color: T.accent, fontSize: '1.1em', letterSpacing: '0.1em', marginBottom: '16px' }}>
          {current.title}
        </div>

        <div style={{ minHeight: '120px', marginBottom: '24px' }}>
          {current.content}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: i === step ? T.accent : T.border,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)}>Назад</button>
            )}
            <button
              onClick={() => void handleNext()}
              style={{ borderColor: T.accent, color: T.accent }}
            >
              {isLast ? 'Начать' : 'Далее'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
