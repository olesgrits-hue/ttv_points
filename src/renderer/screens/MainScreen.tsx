import React, { useState, useEffect } from 'react';
import { EventLog } from '../components/EventLog';
import { SlotCard } from '../components/SlotCard';
import { SlotForm } from '../components/SlotForm';
import type { LogEntry, Slot, SlotGroup } from '../../main/store/types';
import type { QueueItemState } from '../electron.d';
import { T } from '../theme';

const OVERLAY_BASE = 'http://127.0.0.1:7891/overlay';
const MAX_LOG_ENTRIES = 200;
const MAX_SLOTS = 5;
const GITHUB_ISSUES = 'https://github.com/olesgrits-hue/ttv_points/issues/new';

type Tab = 'slots' | 'queue' | 'logs' | 'settings' | 'about';

const sectionStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  padding: '12px',
  marginBottom: '10px',
};

export function MainScreen(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('slots');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [groups, setGroups] = useState<SlotGroup[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [yamSaved, setYamSaved] = useState(false);
  const [yamInput, setYamInput] = useState('');
  const [yamAuthState, setYamAuthState] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [yamUserCode, setYamUserCode] = useState('');
  const [yamError, setYamError] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'ready'>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const emptyQueueState: QueueItemState = { current: null, pending: [] };
  const [queueState, setQueueState] = useState<{ media: QueueItemState; music: QueueItemState }>({
    media: emptyQueueState,
    music: emptyQueueState,
  });

  useEffect(() => {
    window.electronAPI.slotsList().then(setSlots).catch(console.error);
    window.electronAPI.groupsList().then(setGroups).catch(console.error);
    window.electronAPI.settingsGetYamToken().then((t) => { if (t) setYamSaved(true); }).catch(console.error);

    window.electronAPI.queueGetState().then(setQueueState).catch(console.error);

    const unsubStatus = window.electronAPI.onTwitchStatus(({ connected: c }) => setConnected(c));
    const unsubLog = window.electronAPI.onLogEntry((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    });
    const unsubQueue = window.electronAPI.onQueueState(setQueueState);
    const unsubUpdateAvail = window.electronAPI.onUpdateAvailable(({ version }) => {
      setUpdateVersion(version);
      setUpdateStatus('available');
    });
    const unsubUpdateReady = window.electronAPI.onUpdateDownloaded(({ version }) => {
      setUpdateVersion(version);
      setUpdateStatus('ready');
    });
    return (): void => { unsubStatus(); unsubLog(); unsubQueue(); unsubUpdateAvail(); unsubUpdateReady(); };
  }, []);

  const handleSlotCreated = (slot: Slot): void => setSlots((prev) => [...prev, slot]);
  const handleSlotDelete = (id: string): void => setSlots((prev) => prev.filter((s) => s.id !== id));
  const handleSlotToggle = (id: string, enabled: boolean): void =>
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  const handleGroupChange = (id: string, groupId: string | undefined): void =>
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, groupId } : s)));

  const handleAddGroup = async (): Promise<void> => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const g = await window.electronAPI.groupsCreate(name);
      setGroups((prev) => [...prev, g]);
      setNewGroupName('');
    } catch (err) { console.error(err); }
  };

  const handleDeleteGroup = async (id: string): Promise<void> => {
    try {
      await window.electronAPI.groupsDelete(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setSlots((prev) => prev.map((s) => (s.groupId === id ? { ...s, groupId: undefined } : s)));
    } catch (err) { console.error(err); }
  };

  const copyUrl = (url: string): void => { navigator.clipboard.writeText(url).catch(console.error); };

  const sendBugReport = (): void => {
    const recentLogs = entries.slice(0, 50).map((e) =>
      `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.status.toUpperCase()} ${e.viewerName} → ${e.rewardTitle}${e.errorMessage ? ` (${e.errorMessage})` : ''}`
    ).join('\n');
    const body = `**Описание:**\n${bugDesc || '(не заполнено)'}\n\n**Последние события:**\n\`\`\`\n${recentLogs || '(нет логов)'}\n\`\`\``;
    void window.electronAPI.shellOpenExternal(`${GITHUB_ISSUES}?body=${encodeURIComponent(body)}`);
  };

  const canAddSlot = slots.length < MAX_SLOTS;
  const ungroupedSlots = slots.filter((s) => !s.groupId);

  const renderSlotCard = (slot: Slot): React.ReactElement => (
    <SlotCard
      key={slot.id}
      slot={slot}
      groups={groups}
      onDelete={handleSlotDelete}
      onToggle={handleSlotToggle}
      onGroupChange={handleGroupChange}
    />
  );

  const TABS: { id: Tab; label: string }[] = [
    { id: 'slots', label: 'СЛОТЫ' },
    { id: 'queue', label: 'ОЧЕРЕДЬ' },
    { id: 'logs', label: 'ЛОГИ' },
    { id: 'settings', label: 'НАСТРОЙКИ' },
    { id: 'about', label: 'О ПРОГРАММЕ' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0,
      }}>
        <span style={{ color: T.accent, fontSize: '0.85em', letterSpacing: '0.15em' }}>TTWeaks</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: connected ? T.accent : T.error,
            display: 'inline-block',
          }} />
          <span style={{ fontSize: '0.75em', color: connected ? T.textSoft : T.error }}>
            {connected ? 'CONNECTED' : 'RECONNECTING'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0,
      }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              border: 'none',
              borderBottom: tab === id ? `2px solid ${T.accent}` : '2px solid transparent',
              background: 'transparent',
              color: tab === id ? T.accent : T.textMuted,
              padding: '8px 16px',
              fontSize: '0.75em',
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* ── SLOTS TAB ── */}
        {tab === 'slots' && (
          <>
            {groups.map((group) => {
              const groupSlots = slots.filter((s) => s.groupId === group.id);
              const overlayUrl = `${OVERLAY_BASE}/${group.id}`;
              return (
                <section key={group.id} style={sectionStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: T.accent, fontSize: '0.8em', letterSpacing: '0.05em' }}># {group.name}</span>
                    <button
                      onClick={() => void handleDeleteGroup(group.id)}
                      style={{ fontSize: '0.75em', color: T.error, borderColor: T.error, padding: '2px 6px' }}
                    >
                      удалить
                    </button>
                  </div>
                  <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75em', color: T.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {overlayUrl}
                    </span>
                    <button onClick={() => copyUrl(overlayUrl)} style={{ fontSize: '0.75em', flexShrink: 0 }}>
                      копировать
                    </button>
                  </div>
                  {groupSlots.map(renderSlotCard)}
                  <button onClick={() => setShowForm(true)} disabled={!canAddSlot} style={{ marginTop: '6px', fontSize: '0.8em' }}>
                    + добавить слот
                  </button>
                </section>
              );
            })}

            {(ungroupedSlots.length > 0 || groups.length === 0) && (
              <section style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: T.textSoft, fontSize: '0.8em', letterSpacing: '0.05em' }}># default</span>
                </div>
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75em', color: T.textMuted, flex: 1 }}>{OVERLAY_BASE}</span>
                  <button onClick={() => copyUrl(OVERLAY_BASE)} style={{ fontSize: '0.75em' }}>копировать</button>
                </div>
                {ungroupedSlots.map(renderSlotCard)}
                <button onClick={() => setShowForm(true)} disabled={!canAddSlot} style={{ marginTop: '6px', fontSize: '0.8em' }}>
                  + добавить слот
                </button>
              </section>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="название новой группы"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddGroup(); }}
                style={{ flex: 1 }}
              />
              <button onClick={() => void handleAddGroup()}>+ группа</button>
            </div>
          </>
        )}

        {/* ── QUEUE TAB ── */}
        {tab === 'queue' && (
          <section style={sectionStyle}>
            <div style={{ color: T.accent, fontSize: '0.85em', letterSpacing: '0.1em', marginBottom: '12px' }}>
              / ОЧЕРЕДЬ
            </div>

            {/* Media queue */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: T.textSoft, fontSize: '0.78em', letterSpacing: '0.05em' }}>МЕДИА / МЕМ</span>
                <button onClick={() => void window.electronAPI.queueClearMedia()} style={{ fontSize: '0.72em', color: T.warning, borderColor: T.warning }}>
                  очистить
                </button>
              </div>
              {queueState.media.current ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: T.accent, fontSize: '0.78em' }}>▶</span>
                  <span style={{ fontSize: '0.82em' }}>{queueState.media.current.userDisplayName} — {queueState.media.current.rewardTitle}</span>
                  <button onClick={() => void window.electronAPI.queueSkip()} style={{ fontSize: '0.72em', marginLeft: 'auto' }}>skip</button>
                </div>
              ) : (
                <div style={{ color: T.textMuted, fontSize: '0.8em' }}>нет активного воспроизведения</div>
              )}
              {queueState.media.pending.map((item, i) => (
                <div key={i} style={{ fontSize: '0.78em', color: T.textSoft, paddingLeft: '14px', paddingTop: '2px' }}>
                  {i + 1}. {item.userDisplayName} — {item.rewardTitle}
                </div>
              ))}
            </div>

            {/* Music queue */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: T.textSoft, fontSize: '0.78em', letterSpacing: '0.05em' }}>МУЗЫКА</span>
                <button onClick={() => void window.electronAPI.queueClearMusic()} style={{ fontSize: '0.72em', color: T.warning, borderColor: T.warning }}>
                  очистить
                </button>
              </div>
              {queueState.music.current ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: T.purple, fontSize: '0.78em' }}>♪</span>
                  <span style={{ fontSize: '0.82em' }}>{queueState.music.current.userDisplayName} — {queueState.music.current.rewardTitle}</span>
                  <button onClick={() => void window.electronAPI.queueSkip()} style={{ fontSize: '0.72em', marginLeft: 'auto' }}>skip</button>
                </div>
              ) : (
                <div style={{ color: T.textMuted, fontSize: '0.8em' }}>нет активного воспроизведения</div>
              )}
              {queueState.music.pending.map((item, i) => (
                <div key={i} style={{ fontSize: '0.78em', color: T.textSoft, paddingLeft: '14px', paddingTop: '2px' }}>
                  {i + 1}. {item.userDisplayName} — {item.rewardTitle}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── LOGS TAB ── */}
        {tab === 'logs' && (
          <>
            <EventLog entries={entries} />
            <div style={{ ...sectionStyle, marginTop: '12px' }}>
              <div style={{ color: T.textSoft, fontSize: '0.8em', letterSpacing: '0.05em', marginBottom: '8px' }}>
                / ОТПРАВИТЬ БАГ-РЕПОРТ
              </div>
              <textarea
                placeholder="Опиши что произошло (необязательно)..."
                value={bugDesc}
                onChange={(e) => setBugDesc(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical', marginBottom: '8px' }}
              />
              <div style={{ fontSize: '0.75em', color: T.textMuted, marginBottom: '8px' }}>
                К репорту автоматически прикрепятся последние {Math.min(entries.length, 50)} событий из лога.
              </div>
              <button onClick={sendBugReport} style={{ borderColor: T.accent, color: T.accent }}>
                Открыть GitHub Issues
              </button>
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <section style={sectionStyle}>
            <div style={{ color: T.textSoft, fontSize: '0.8em', letterSpacing: '0.05em', marginBottom: '12px' }}>
              / ЯНДЕКС МУЗЫКА
            </div>

            {yamSaved ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: T.success, fontSize: '0.9em' }}>✓ авторизован</span>
                <button
                  onClick={() => {
                    setYamSaved(false);
                    setYamInput('');
                    setYamAuthState('idle');
                    void window.electronAPI.settingsSetYamToken('');
                  }}
                  style={{ fontSize: '0.8em', color: T.error, borderColor: T.error }}
                >
                  выйти
                </button>
              </div>
            ) : yamAuthState === 'waiting' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.85em', color: T.textSoft }}>
                  В браузере открылась страница <span style={{ color: T.accent }}>ya.ru/device</span>.<br />
                  Введи там код:
                </div>
                <div style={{ fontSize: '2.2em', letterSpacing: '6px', color: T.accent }}>
                  {yamUserCode}
                </div>
                <div style={{ fontSize: '0.8em', color: T.textMuted }}>ожидаю подтверждения...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => {
                    setYamAuthState('idle');
                    setYamError('');
                    const unsub = window.electronAPI.onYamDeviceProgress(({ user_code }) => {
                      setYamAuthState('waiting');
                      setYamUserCode(user_code);
                      unsub();
                    });
                    window.electronAPI.settingsYamDeviceAuth()
                      .then(() => { setYamSaved(true); setYamAuthState('idle'); })
                      .catch((e: unknown) => {
                        setYamAuthState('error');
                        setYamError(e instanceof Error ? e.message : String(e));
                        unsub();
                      });
                  }}
                  style={{ alignSelf: 'flex-start', borderColor: T.accent, color: T.accent }}
                >
                  {'> войти через яндекс'}
                </button>
                {yamAuthState === 'error' && (
                  <span style={{ color: T.error, fontSize: '0.85em' }}>{yamError}</span>
                )}
                <details style={{ fontSize: '0.8em', color: T.textMuted }}>
                  <summary style={{ cursor: 'pointer' }}>вставить токен вручную</summary>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input
                      type="password"
                      placeholder="OAuth токен"
                      value={yamInput}
                      onChange={(e) => setYamInput(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={() => void window.electronAPI.settingsSetYamToken(yamInput.trim()).then(() => setYamSaved(true))}
                      disabled={!yamInput.trim()}
                    >
                      сохранить
                    </button>
                  </div>
                </details>
              </div>
            )}
          </section>
        )}

        {/* ── ABOUT TAB ── */}
        {tab === 'about' && (
          <section style={sectionStyle}>
            <div style={{ color: T.accent, fontSize: '1em', letterSpacing: '0.15em', marginBottom: '16px' }}>
              TTWeaks v1.1.0
            </div>
            <div style={{ color: T.textSoft, fontSize: '0.85em', lineHeight: '1.8', marginBottom: '20px' }}>
              Портативный оверлей для OBS.<br />
              Twitch Channel Points → медиа, мемы, Яндекс Музыка.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.8em', color: T.textMuted, marginBottom: '4px' }}>ССЫЛКИ</div>
              <span
                style={{ color: T.purple, cursor: 'pointer', fontSize: '0.85em' }}
                onClick={() => void window.electronAPI.shellOpenExternal('https://twitch.tv/scler0ze')}
              >
                {'> twitch.tv/scler0ze'}
              </span>
              <span
                style={{ color: T.warning, cursor: 'pointer', fontSize: '0.85em' }}
                onClick={() => void window.electronAPI.shellOpenExternal('https://dalink.to/scler0se')}
              >
                {'> поддержать стримера'}
              </span>
              <span
                style={{ color: T.textSoft, cursor: 'pointer', fontSize: '0.85em' }}
                onClick={() => void window.electronAPI.shellOpenExternal('https://github.com/olesgrits-hue/ttv_points')}
              >
                {'> github: ttweaks'}
              </span>
            </div>

            {updateStatus !== 'idle' && (
              <div style={{ marginTop: '16px', padding: '10px', border: `1px solid ${T.accent}`, background: `${T.accent}10` }}>
                <div style={{ fontSize: '0.82em', color: T.accent, marginBottom: '6px' }}>
                  {updateStatus === 'available'
                    ? `Доступно обновление v${updateVersion} — загружается...`
                    : `Обновление v${updateVersion} готово к установке`}
                </div>
                {updateStatus === 'ready' && (
                  <button
                    onClick={() => void window.electronAPI.updateInstall()}
                    style={{ fontSize: '0.8em', borderColor: T.accent, color: T.accent }}
                  >
                    Перезапустить и обновить
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {showForm && (
        <SlotForm onClose={() => setShowForm(false)} onCreated={handleSlotCreated} />
      )}
    </div>
  );
}
