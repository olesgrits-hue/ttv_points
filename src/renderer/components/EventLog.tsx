import React from 'react';
import type { LogEntry } from '../../main/store/types';
import { T } from '../theme';

interface Props {
  entries: LogEntry[];
}

function formatTime(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour12: false });
}

export function EventLog({ entries }: Props): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: '0.8em', color: T.textMuted, padding: '8px 0' }}>
        события появятся здесь...
      </div>
    );
  }

  return (
    <div style={{ fontSize: '0.8em', lineHeight: '1.7' }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}
          title={entry.errorMessage}
        >
          <span style={{ color: T.textMuted, flexShrink: 0 }}>{formatTime(entry.timestamp)}</span>
          <span style={{ color: entry.status === 'success' ? T.success : T.error, flexShrink: 0 }}>
            {entry.status === 'success' ? '✓' : '✗'}
          </span>
          <span style={{ color: T.textSoft }}>{entry.viewerName}</span>
          <span style={{ color: T.textMuted }}>→</span>
          <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.rewardTitle}
          </span>
          {entry.errorMessage && (
            <span style={{ color: T.error, fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ({entry.errorMessage})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
