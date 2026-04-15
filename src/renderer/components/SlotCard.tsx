import React from 'react';
import type { Slot } from '../../main/store/types';

/** Browser-safe basename — no Node.js path module in renderer. */
function basename(p: string): string {
  return p.replace(/^.*[\\/]/, '') || p;
}

interface SlotCardProps {
  slot: Slot;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const TYPE_LABELS: Record<Slot['type'], string> = {
  mask: 'Маска',
  media: 'Медиафайл',
  meme: 'Мем',
};

function summary(slot: Slot): string {
  if (slot.type === 'mask') return `${slot.lensName} · ${slot.hotkey}`;
  if (slot.type === 'media') return basename(slot.filePath);
  return basename(slot.folderPath);
}

export function SlotCard({ slot, onDelete, onToggle }: SlotCardProps): React.ReactElement {
  const handleToggle = (): void => {
    const next = !slot.enabled;
    window.electronAPI.slotsToggle({ id: slot.id, enabled: next });
    onToggle(slot.id, next);
  };

  const handleDelete = (): void => {
    window.electronAPI.slotsDelete(slot.id);
    onDelete(slot.id);
  };

  return (
    <div
      data-testid="slot-card"
      data-disabled={slot.enabled ? undefined : 'true'}
      style={{
        border: '1px solid #ccc',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '8px',
        opacity: slot.enabled ? 1 : 0.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span
            style={{
              background: '#e0e0e0',
              borderRadius: '3px',
              padding: '2px 6px',
              fontSize: '0.75em',
              marginRight: '8px',
            }}
          >
            {TYPE_LABELS[slot.type]}
          </span>
          <strong>{slot.rewardTitle}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={slot.enabled}
              onChange={handleToggle}
            />
          </label>
          <button onClick={handleDelete} aria-label="Удалить слот">
            Удалить
          </button>
        </div>
      </div>
      <div style={{ fontSize: '0.85em', color: '#555', marginTop: '4px' }}>
        {summary(slot)}
      </div>
    </div>
  );
}
