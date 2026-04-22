import React, { useState } from 'react';
import type { Slot, SlotGroup } from '../../main/store/types';
import { T } from '../theme';

function basename(p: string): string {
  return p.replace(/^.*[\\/]/, '') || p;
}

interface SlotCardProps {
  slot: Slot;
  groups: SlotGroup[];
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onGroupChange: (id: string, groupId: string | undefined) => void;
}

const TYPE_LABELS: Record<Slot['type'], string> = {
  media: 'MEDIA',
  meme: 'MEME',
  music: 'MUSIC',
};

const TYPE_COLORS: Record<Slot['type'], string> = {
  media: '#4a9eff',
  meme: '#ff9f4a',
  music: T.accent,
};

function summary(slot: Slot): string {
  if (slot.type === 'media') return basename(slot.filePath);
  if (slot.type === 'meme') return basename(slot.folderPath);
  return 'трек из сообщения';
}

export function SlotCard({ slot, groups, onDelete, onToggle, onGroupChange }: SlotCardProps): React.ReactElement {
  const initialScale = slot.type === 'music' ? (slot.scale ?? 1) : ((slot.type === 'media' || slot.type === 'meme') ? (slot.scale ?? 3) : 3);
  const [scale, setScale] = useState(initialScale);

  const handleScaleChange = (val: number): void => {
    setScale(val);
    window.electronAPI.slotsSetScale({ id: slot.id, scale: val }).catch(console.error);
  };

  const handleToggle = (): void => {
    const next = !slot.enabled;
    window.electronAPI.slotsToggle({ id: slot.id, enabled: next });
    onToggle(slot.id, next);
  };

  const handleDelete = (): void => {
    window.electronAPI.slotsDelete(slot.id);
    onDelete(slot.id);
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const groupId = e.target.value || undefined;
    window.electronAPI.slotsSetGroup({ id: slot.id, groupId }).catch(console.error);
    onGroupChange(slot.id, groupId);
  };

  const typeColor = TYPE_COLORS[slot.type];

  return (
    <div
      data-testid="slot-card"
      data-disabled={slot.enabled ? undefined : 'true'}
      style={{
        borderLeft: `3px solid ${slot.enabled ? typeColor : T.borderBright}`,
        background: T.surfaceHover,
        padding: '8px 12px',
        marginBottom: '6px',
        opacity: slot.enabled ? 1 : 0.5,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: typeColor,
            fontSize: '0.7em',
            letterSpacing: '0.05em',
            minWidth: '42px',
          }}>
            [{TYPE_LABELS[slot.type]}]
          </span>
          <span style={{ color: T.text, fontSize: '0.9em' }}>{slot.rewardTitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8em', color: T.textSoft }}>
            <input type="checkbox" checked={slot.enabled} onChange={handleToggle} style={{ accentColor: T.accent }} />
          </label>
          <button onClick={handleDelete} style={{ borderColor: T.error, color: T.error, fontSize: '0.75em', padding: '2px 6px' }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.78em', color: T.textMuted, marginTop: '3px', paddingLeft: '50px' }}>
        {summary(slot)}
      </div>

      {(slot.type === 'media' || slot.type === 'meme' || slot.type === 'music') && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '50px' }}>
          <span style={{ fontSize: '0.75em', color: T.textMuted, whiteSpace: 'nowrap' }}>scale</span>
          <input type="range" min={1} max={5} step={1} value={scale}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: T.accent, cursor: 'pointer' }} />
          <span style={{ fontSize: '0.8em', color: T.textSoft, minWidth: '20px' }}>x{scale}</span>
        </div>
      )}

      {groups.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '50px' }}>
          <span style={{ fontSize: '0.75em', color: T.textMuted, whiteSpace: 'nowrap' }}>group</span>
          <select
            value={slot.groupId ?? ''}
            onChange={handleGroupChange}
            style={{ fontSize: '0.8em', flex: 1 }}
          >
            <option value="">— без группы —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
