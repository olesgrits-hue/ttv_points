import React, { useState, useEffect } from 'react';
import type { Slot } from '../../main/store/types';
import { T } from '../theme';

interface RewardInfo { rewardId: string; rewardTitle: string; }

type SlotType = 'media' | 'meme' | 'music';
type RewardMode = 'existing' | 'new';

interface SlotFormProps {
  onClose: () => void;
  onCreated: (slot: Slot) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.75em',
  color: T.textSoft,
  display: 'block',
  marginBottom: '4px',
  letterSpacing: '0.05em',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '14px',
};

export function SlotForm({ onClose, onCreated }: SlotFormProps): React.ReactElement {
  const [slotType, setSlotType] = useState<SlotType | null>(null);
  const [rewardMode, setRewardMode] = useState<RewardMode>('existing');
  const [rewards, setRewards] = useState<RewardInfo[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState('');
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardCost, setNewRewardCost] = useState('');
  const [newRewardCooldown, setNewRewardCooldown] = useState('');
  const [filePath, setFilePath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.rewardsList().then(setRewards).catch(console.error);
  }, []);

  const browseFile = async (): Promise<void> => {
    const p = await window.electronAPI.dialogOpenFile();
    if (p !== null) setFilePath(p);
  };

  const browseFolder = async (): Promise<void> => {
    const p = await window.electronAPI.dialogOpenFolder();
    if (p !== null) setFolderPath(p);
  };

  const handleSave = async (): Promise<void> => {
    setError(null);
    let rewardId = selectedRewardId;
    let rewardTitle = rewards.find((r) => r.rewardId === selectedRewardId)?.rewardTitle ?? '';

    if (rewardMode === 'new') {
      try {
        const created = await window.electronAPI.rewardsCreate({
          name: newRewardName,
          cost: parseInt(newRewardCost, 10) || 0,
          cooldownMinutes: parseInt(newRewardCooldown, 10) || 0,
        });
        rewardId = created.rewardId;
        rewardTitle = created.rewardTitle;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка создания награды');
        return;
      }
    }

    let payload: Omit<Slot, 'id'>;
    if (slotType === 'media') {
      payload = { type: 'media', enabled: true, rewardId, rewardTitle, filePath };
    } else if (slotType === 'meme') {
      payload = { type: 'meme', enabled: true, rewardId, rewardTitle, folderPath };
    } else {
      payload = { type: 'music', enabled: true, rewardId, rewardTitle };
    }

    try {
      const slot = await window.electronAPI.slotsCreate(payload);
      onCreated(slot);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('limit') || msg.toLowerCase().includes('max')) {
        setError('Достигнут лимит 5 слотов');
      } else {
        setError(msg);
      }
    }
  };

  const radioStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: '0.8em',
    borderColor: active ? T.accent : T.border,
    color: active ? T.accent : T.textSoft,
    background: active ? `${T.accent}11` : T.surface,
    cursor: 'pointer',
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        padding: '20px',
        minWidth: '360px',
        maxWidth: '460px',
        width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ color: T.accent, fontSize: '0.8em', letterSpacing: '0.1em' }}>/ ДОБАВИТЬ СЛОТ</span>
          <button onClick={onClose} style={{ padding: '2px 6px', fontSize: '0.75em' }}>✕</button>
        </div>

        {/* Type picker */}
        <div style={sectionStyle}>
          <span style={labelStyle}>ТИП СЛОТА</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['media', 'meme', 'music'] as SlotType[]).map((t) => (
              <button key={t} onClick={() => setSlotType(t)} style={radioStyle(slotType === t)}>
                {t === 'media' ? 'МЕДИА' : t === 'meme' ? 'МЕМ' : 'МУЗЫКА'}
              </button>
            ))}
          </div>
        </div>

        {/* Reward selector */}
        <div style={sectionStyle}>
          <span style={labelStyle}>НАГРАДА TWITCH</span>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <button onClick={() => setRewardMode('existing')} style={radioStyle(rewardMode === 'existing')}>
              Существующая
            </button>
            <button onClick={() => setRewardMode('new')} style={radioStyle(rewardMode === 'new')}>
              Создать новую
            </button>
          </div>

          {rewardMode === 'existing' && (
            rewards.length === 0 ? (
              <div style={{ color: T.textMuted, fontSize: '0.85em' }}>Нет доступных наград. Создайте новую.</div>
            ) : (
              <select
                value={selectedRewardId}
                onChange={(e) => setSelectedRewardId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">— выберите награду —</option>
                {rewards.map((r) => (
                  <option key={r.rewardId} value={r.rewardId}>{r.rewardTitle}</option>
                ))}
              </select>
            )
          )}

          {rewardMode === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input type="text" placeholder="название" value={newRewardName} onChange={(e) => setNewRewardName(e.target.value)} style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" placeholder="стоимость" value={newRewardCost} onChange={(e) => setNewRewardCost(e.target.value)} style={{ flex: 1 }} />
                <input type="number" placeholder="кулдаун (мин)" value={newRewardCooldown} onChange={(e) => setNewRewardCooldown(e.target.value)} style={{ flex: 1 }} />
              </div>
            </div>
          )}
        </div>

        {/* Type-specific fields */}
        {slotType === 'media' && (
          <div style={sectionStyle}>
            <span style={labelStyle}>ФАЙЛ</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="путь к файлу" style={{ flex: 1 }} />
              <button onClick={browseFile}>Обзор</button>
            </div>
          </div>
        )}

        {slotType === 'meme' && (
          <div style={sectionStyle}>
            <span style={labelStyle}>ПАПКА</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input type="text" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} placeholder="путь к папке" style={{ flex: 1 }} />
              <button onClick={browseFolder}>Обзор</button>
            </div>
          </div>
        )}

        {slotType === 'music' && (
          <div style={{ ...sectionStyle, padding: '8px', background: T.bg, borderLeft: `2px solid ${T.accentDim}`, fontSize: '0.82em', color: T.textSoft }}>
            Зритель вводит название трека или ссылку music.yandex.ru в сообщении к реварду.
          </div>
        )}

        {error && (
          <div style={{ color: T.error, fontSize: '0.85em', marginBottom: '12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button onClick={onClose}>Отмена</button>
          <button
            onClick={handleSave}
            disabled={slotType === null}
            style={{ borderColor: T.accent, color: T.accent }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
