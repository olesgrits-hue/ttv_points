import React, { useState, useEffect } from 'react';
import { EventLog } from '../components/EventLog';
import type { LogEntry } from '../../main/store/types';

const OBS_URL = 'http://127.0.0.1:7891/overlay';
const MAX_LOG_ENTRIES = 200;

export function MainScreen(): React.ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const unsubStatus = window.electronAPI.onTwitchStatus(({ connected: c }) => {
      setConnected(c);
    });
    const unsubLog = window.electronAPI.onLogEntry((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    });
    return (): void => {
      unsubStatus();
      unsubLog();
    };
  }, []);

  const copyObs = (): void => {
    navigator.clipboard.writeText(OBS_URL).catch(console.error);
  };

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      {/* OBS URL */}
      <div style={{ marginBottom: '12px' }}>
        <span>{OBS_URL}</span>
        <button onClick={copyObs} style={{ marginLeft: '8px' }}>
          Копировать
        </button>
      </div>

      {/* Disconnect banner */}
      {!connected && (
        <div
          role="alert"
          style={{
            background: '#ffcc00',
            padding: '8px',
            marginBottom: '12px',
            borderRadius: '4px',
          }}
        >
          Соединение потеряно, переподключаюсь...
        </div>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <section
          aria-label="Snap Camera"
          style={{ flex: 1, border: '1px solid #ccc', padding: '12px', borderRadius: '4px' }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Snap Camera</h3>
          {/* Slot cards added in Task 11 */}
        </section>

        <section
          aria-label="Media"
          style={{ flex: 1, border: '1px solid #ccc', padding: '12px', borderRadius: '4px' }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Media</h3>
          {/* Slot cards added in Task 11 */}
        </section>
      </div>

      {/* Event log */}
      <EventLog entries={entries} />
    </div>
  );
}
