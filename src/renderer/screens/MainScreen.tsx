import React, { useState, useEffect } from 'react';
import { EventLog } from '../components/EventLog';
import { SlotCard } from '../components/SlotCard';
import { SlotForm } from '../components/SlotForm';
import type { LogEntry, Slot } from '../../main/store/types';

const OBS_URL = 'http://127.0.0.1:7891/overlay';
const MAX_LOG_ENTRIES = 200;
const MAX_SLOTS = 5;

export function MainScreen(): React.ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Load slots on mount + subscribe to IPC events
  useEffect(() => {
    window.electronAPI.slotsList().then(setSlots).catch(console.error);

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

  const handleSlotCreated = (slot: Slot): void => {
    setSlots((prev) => [...prev, slot]);
  };

  const handleSlotDelete = (id: string): void => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSlotToggle = (id: string, enabled: boolean): void => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const maskSlots = slots.filter((s) => s.type === 'mask');
  const mediaSlots = slots.filter((s) => s.type === 'media' || s.type === 'meme');
  const canAddSlot = slots.length < MAX_SLOTS;

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
          {maskSlots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onDelete={handleSlotDelete}
              onToggle={handleSlotToggle}
            />
          ))}
          <button
            onClick={() => setShowForm(true)}
            disabled={!canAddSlot}
            style={{ marginTop: '8px' }}
          >
            Добавить слот
          </button>
        </section>

        <section
          aria-label="Media"
          style={{ flex: 1, border: '1px solid #ccc', padding: '12px', borderRadius: '4px' }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Media</h3>
          {mediaSlots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onDelete={handleSlotDelete}
              onToggle={handleSlotToggle}
            />
          ))}
          <button
            onClick={() => setShowForm(true)}
            disabled={!canAddSlot}
            style={{ marginTop: '8px' }}
          >
            Добавить слот
          </button>
        </section>
      </div>

      {/* Slot form modal */}
      {showForm && (
        <SlotForm
          onClose={() => setShowForm(false)}
          onCreated={handleSlotCreated}
        />
      )}

      {/* Event log */}
      <EventLog entries={entries} />
    </div>
  );
}
