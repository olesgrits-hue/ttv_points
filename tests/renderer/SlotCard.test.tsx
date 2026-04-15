import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotCard } from '../../src/renderer/components/SlotCard';
import type { MemeSlot, MaskSlot, MediaSlot } from '../../src/main/store/types';
import './setup';

const makeMeme = (overrides: Partial<MemeSlot> = {}): MemeSlot => ({
  id: 'slot-1',
  type: 'meme',
  enabled: true,
  rewardId: 'r1',
  rewardTitle: 'Случайный мем',
  folderPath: '/home/user/memes',
  ...overrides,
});

const makeMask = (overrides: Partial<MaskSlot> = {}): MaskSlot => ({
  id: 'slot-2',
  type: 'mask',
  enabled: true,
  rewardId: 'r2',
  rewardTitle: 'Reward Mask',
  lensId: 'lens-123',
  lensName: 'Funny Dog',
  hotkey: 'ctrl+shift+1',
  ...overrides,
});

const makeMedia = (overrides: Partial<MediaSlot> = {}): MediaSlot => ({
  id: 'slot-3',
  type: 'media',
  enabled: true,
  rewardId: 'r3',
  rewardTitle: 'Reward Media',
  filePath: '/home/user/video.mp4',
  ...overrides,
});

describe('SlotCard', () => {
  test('renders_slot_with_correct_type_and_reward_title', () => {
    const onDelete = jest.fn();
    const onToggle = jest.fn();
    render(<SlotCard slot={makeMeme()} onDelete={onDelete} onToggle={onToggle} />);
    expect(screen.getByText(/Мем/)).toBeDefined();
    expect(screen.getByText(/Случайный мем/)).toBeDefined();
  });

  test('toggle_calls_ipc_slots_toggle_with_correct_payload', () => {
    const onDelete = jest.fn();
    const onToggle = jest.fn();
    const slot = makeMeme({ enabled: true });
    render(<SlotCard slot={slot} onDelete={onDelete} onToggle={onToggle} />);
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith('slot-1', false);
    expect((window.electronAPI as any).slotsToggle).toHaveBeenCalledWith({ id: 'slot-1', enabled: false });
  });

  test('delete_button_calls_ipc_slots_delete', () => {
    const onDelete = jest.fn();
    const onToggle = jest.fn();
    render(<SlotCard slot={makeMeme()} onDelete={onDelete} onToggle={onToggle} />);
    const del = screen.getByRole('button', { name: /удалить/i });
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith('slot-1');
    expect((window.electronAPI as any).slotsDelete).toHaveBeenCalledWith('slot-1');
  });

  test('disabled_slot_shows_disabled_state', () => {
    const slot = makeMeme({ enabled: false });
    render(<SlotCard slot={slot} onDelete={jest.fn()} onToggle={jest.fn()} />);
    const card = screen.getByTestId('slot-card');
    expect(card.getAttribute('data-disabled')).toBe('true');
    // Toggle still accessible
    const toggle = screen.getByRole('checkbox');
    expect(toggle).toBeDefined();
  });

  test('renders_mask_slot_with_lens_and_hotkey', () => {
    render(<SlotCard slot={makeMask()} onDelete={jest.fn()} onToggle={jest.fn()} />);
    expect(screen.getAllByText(/Маска/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Funny Dog/)).toBeDefined();
    expect(screen.getByText(/ctrl\+shift\+1/)).toBeDefined();
  });

  test('renders_media_slot_with_filename', () => {
    render(<SlotCard slot={makeMedia()} onDelete={jest.fn()} onToggle={jest.fn()} />);
    expect(screen.getAllByText(/Медиафайл/).length).toBeGreaterThan(0);
    expect(screen.getByText(/video\.mp4/)).toBeDefined();
  });
});
