import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SlotForm } from '../../src/renderer/components/SlotForm';
import './setup';

beforeEach(() => {
  jest.useFakeTimers();
  (window.electronAPI as any).rewardsList = jest.fn().mockResolvedValue([
    { rewardId: 'r1', rewardTitle: 'Existing Reward' },
  ]);
  (window.electronAPI as any).rewardsCreate = jest.fn().mockResolvedValue({ rewardId: 'r-new', rewardTitle: 'New Reward' });
  (window.electronAPI as any).slotsCreate = jest.fn().mockResolvedValue({ id: 'new-slot', type: 'meme', enabled: true, rewardId: 'r1', rewardTitle: 'Existing Reward', folderPath: '/tmp/memes' });
  (window.electronAPI as any).dialogOpenFile = jest.fn().mockResolvedValue('/home/user/video.mp4');
  (window.electronAPI as any).dialogOpenFolder = jest.fn().mockResolvedValue('/home/user/memes');
  (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SlotForm', () => {
  test('type_picker_renders_three_options', async () => {
    render(<SlotForm onClose={jest.fn()} onCreated={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText(/Маска/i)).toBeDefined();
    expect(screen.getByLabelText(/Медиафайл/i)).toBeDefined();
    expect(screen.getByLabelText(/Рандомный мем/i)).toBeDefined();
  });

  test('mask_type_shows_lens_search_hotkey_and_tooltip', async () => {
    render(<SlotForm onClose={jest.fn()} onCreated={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText(/Маска/i));
    expect(screen.getByPlaceholderText(/ctrl\+shift\+1/i)).toBeDefined();
    expect(screen.getByText(/Hotkeys/i)).toBeDefined();
  });

  test('media_type_shows_file_picker_button', async () => {
    render(<SlotForm onClose={jest.fn()} onCreated={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText(/Медиафайл/i));
    expect(screen.getByRole('button', { name: /Обзор/i })).toBeDefined();
  });

  test('meme_type_shows_folder_picker_button', async () => {
    render(<SlotForm onClose={jest.fn()} onCreated={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText(/Рандомный мем/i));
    expect(screen.getByRole('button', { name: /Обзор/i })).toBeDefined();
  });

  test('create_new_reward_shows_name_cost_cooldown_inputs', async () => {
    render(<SlotForm onClose={jest.fn()} onCreated={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText(/Создать новую/i));
    expect(screen.getByPlaceholderText(/название/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/стоимость/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/кулдаун/i)).toBeDefined();
  });

  test('save_calls_ipc_slots_create_with_full_payload', async () => {
    const onCreated = jest.fn();
    render(<SlotForm onClose={jest.fn()} onCreated={onCreated} />);
    await act(async () => { await Promise.resolve(); });

    // Select Meme type
    fireEvent.click(screen.getByLabelText(/Рандомный мем/i));
    // Use existing reward
    fireEvent.click(screen.getByLabelText(/Выбрать существующую/i));
    await act(async () => { await Promise.resolve(); });

    // Select reward from dropdown
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'r1' } });

    // Set folder path via browse button
    fireEvent.click(screen.getByRole('button', { name: /Обзор/i }));
    await act(async () => { await Promise.resolve(); });

    // Click save
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/i }));
    await act(async () => { await Promise.resolve(); });

    expect((window.electronAPI as any).slotsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'meme', rewardId: 'r1', folderPath: '/home/user/memes' })
    );
    expect(onCreated).toHaveBeenCalled();
  });
});
