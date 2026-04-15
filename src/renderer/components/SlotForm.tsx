import React, { useState, useEffect } from 'react';
import { LensSearch } from './LensSearch';
import type { Slot } from '../../main/store/types';

interface RewardInfo { rewardId: string; rewardTitle: string; }

type SlotType = 'mask' | 'media' | 'meme';
type RewardMode = 'existing' | 'new';

interface SlotFormProps {
  onClose: () => void;
  onCreated: (slot: Slot) => void;
}

export function SlotForm({ onClose, onCreated }: SlotFormProps): React.ReactElement {
  const [slotType, setSlotType] = useState<SlotType | null>(null);
  const [rewardMode, setRewardMode] = useState<RewardMode>('existing');
  const [rewards, setRewards] = useState<RewardInfo[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState('');
  // New reward fields
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardCost, setNewRewardCost] = useState('');
  const [newRewardCooldown, setNewRewardCooldown] = useState('');
  // Type-specific fields
  const [lensId, setLensId] = useState('');
  const [lensName, setLensName] = useState('');
  const [hotkey, setHotkey] = useState('');
  const [filePath, setFilePath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  // Error
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
    if (slotType === 'mask') {
      payload = { type: 'mask', enabled: true, rewardId, rewardTitle, lensId, lensName, hotkey };
    } else if (slotType === 'media') {
      payload = { type: 'media', enabled: true, rewardId, rewardTitle, filePath };
    } else {
      payload = { type: 'meme', enabled: true, rewardId, rewardTitle, folderPath };
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '6px',
          padding: '24px',
          minWidth: '360px',
          maxWidth: '480px',
          width: '100%',
        }}
      >
        <h3 style={{ margin: '0 0 16px' }}>Добавить слот</h3>

        {/* Type picker */}
        <fieldset style={{ border: 'none', padding: 0, marginBottom: '16px' }}>
          <legend style={{ fontWeight: 'bold', marginBottom: '8px' }}>Тип слота</legend>
          <label style={{ marginRight: '12px' }}>
            <input
              type="radio"
              name="slotType"
              value="mask"
              checked={slotType === 'mask'}
              onChange={() => setSlotType('mask')}
            />{' '}
            Маска
          </label>
          <label style={{ marginRight: '12px' }}>
            <input
              type="radio"
              name="slotType"
              value="media"
              checked={slotType === 'media'}
              onChange={() => setSlotType('media')}
            />{' '}
            Медиафайл
          </label>
          <label>
            <input
              type="radio"
              name="slotType"
              value="meme"
              checked={slotType === 'meme'}
              onChange={() => setSlotType('meme')}
            />{' '}
            Рандомный мем
          </label>
        </fieldset>

        {/* Reward selector */}
        <fieldset style={{ border: 'none', padding: 0, marginBottom: '16px' }}>
          <legend style={{ fontWeight: 'bold', marginBottom: '8px' }}>Награда Twitch</legend>
          <label style={{ marginRight: '12px' }}>
            <input
              type="radio"
              name="rewardMode"
              value="existing"
              checked={rewardMode === 'existing'}
              onChange={() => setRewardMode('existing')}
            />{' '}
            Выбрать существующую
          </label>
          <label>
            <input
              type="radio"
              name="rewardMode"
              value="new"
              checked={rewardMode === 'new'}
              onChange={() => setRewardMode('new')}
            />{' '}
            Создать новую
          </label>

          {rewardMode === 'existing' && (
            <div style={{ marginTop: '8px' }}>
              {rewards.length === 0 ? (
                <div style={{ color: '#666', fontSize: '0.9em' }}>
                  Нет доступных наград. Создайте новую.
                </div>
              ) : (
                <select
                  value={selectedRewardId}
                  onChange={(e) => setSelectedRewardId(e.target.value)}
                  style={{ width: '100%', padding: '4px' }}
                >
                  <option value="">— выберите награду —</option>
                  {rewards.map((r) => (
                    <option key={r.rewardId} value={r.rewardId}>
                      {r.rewardTitle}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {rewardMode === 'new' && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                placeholder="название"
                value={newRewardName}
                onChange={(e) => setNewRewardName(e.target.value)}
                style={{ padding: '4px' }}
              />
              <input
                type="number"
                placeholder="стоимость"
                value={newRewardCost}
                onChange={(e) => setNewRewardCost(e.target.value)}
                style={{ padding: '4px' }}
              />
              <input
                type="number"
                placeholder="кулдаун"
                value={newRewardCooldown}
                onChange={(e) => setNewRewardCooldown(e.target.value)}
                style={{ padding: '4px' }}
              />
            </div>
          )}
        </fieldset>

        {/* Type-specific fields */}
        {slotType === 'mask' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Линза</label>
              <LensSearch
                onSelect={(lens) => {
                  setLensId(lens.lensId);
                  setLensName(lens.lensName);
                }}
              />
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Hotkey</label>
              <input
                type="text"
                placeholder="ctrl+shift+1"
                value={hotkey}
                onChange={(e) => setHotkey(e.target.value)}
                style={{ width: '100%', padding: '4px' }}
              />
            </div>
            <div
              style={{
                background: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '0.82em',
                color: '#555',
              }}
            >
              Как назначить hotkey в Snap Camera: Settings → Hotkeys → выберите линзу
            </div>
          </div>
        )}

        {slotType === 'media' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Файл</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="Путь к файлу"
                style={{ flex: 1, padding: '4px' }}
              />
              <button onClick={browseFile}>Обзор...</button>
            </div>
          </div>
        )}

        {slotType === 'meme' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Папка</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="Путь к папке"
                style={{ flex: 1, padding: '4px' }}
              />
              <button onClick={browseFolder}>Обзор...</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: '#c00', fontSize: '0.9em', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose}>Отмена</button>
          <button onClick={handleSave} disabled={slotType === null}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
