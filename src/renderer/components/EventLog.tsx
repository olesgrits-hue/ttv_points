import React from 'react';
import type { LogEntry } from '../../main/store/types';

interface Props {
  entries: LogEntry[];
}

function formatTime(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour12: false });
}

export function EventLog({ entries }: Props): React.ReactElement {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}>
      {entries.map((entry) => {
        const icon =
          entry.status === 'success' ? (
            <span>🟢</span>
          ) : (
            <span title={entry.errorMessage} style={{ cursor: 'help' }}>
              🔴
            </span>
          );

        return (
          <div key={entry.id}>
            [{formatTime(entry.timestamp)}] [{entry.viewerName}] [{entry.rewardTitle}] {icon}
          </div>
        );
      })}
    </div>
  );
}
