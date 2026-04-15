import React from 'react';
import { render, screen } from '@testing-library/react';
import { EventLog } from '../../src/renderer/components/EventLog';
import type { LogEntry } from '../../src/main/store/types';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'e1',
    timestamp: new Date('2024-01-01T12:34:56Z'),
    viewerName: 'User1',
    rewardTitle: 'MyReward',
    status: 'success',
    ...overrides,
  };
}

describe('EventLog', () => {
  test('renders_success_entry', () => {
    render(<EventLog entries={[makeEntry({ status: 'success' })]} />);
    expect(screen.getByText(/🟢/)).toBeDefined();
    expect(screen.queryByText(/🔴/)).toBeNull();
  });

  test('renders_error_entry_with_tooltip', () => {
    const entry = makeEntry({ status: 'error', errorMessage: 'robot exploded' });
    render(<EventLog entries={[entry]} />);
    const redIcon = screen.getByText(/🔴/);
    expect(redIcon).toBeDefined();
    // Tooltip is rendered via title attribute on the span.
    expect(redIcon.getAttribute('title')).toBe('robot exploded');
  });

  test('newest_entry_first', () => {
    const older = makeEntry({ id: 'old', timestamp: new Date('2024-01-01T10:00:00Z'), viewerName: 'OlderUser' });
    const newer = makeEntry({ id: 'new', timestamp: new Date('2024-01-01T12:00:00Z'), viewerName: 'NewerUser' });
    // EventLog receives entries already sorted (newest first from MainScreen).
    render(<EventLog entries={[newer, older]} />);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('NewerUser')).toBeLessThan(text.indexOf('OlderUser'));
  });

  test('renders_empty_list', () => {
    render(<EventLog entries={[]} />);
    // Neither success nor error icons should be present.
    expect(document.body.textContent).not.toContain('🟢');
    expect(document.body.textContent).not.toContain('🔴');
  });
});
