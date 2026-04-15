import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LensSearch } from '../../src/renderer/components/LensSearch';
import './setup';

describe('LensSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does_not_search_below_3_chars', async () => {
    render(<LensSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ab' } });
    act(() => { jest.runAllTimers(); });
    expect((window.electronAPI as any).snapSearch).not.toHaveBeenCalled();
  });

  test('searches_after_300ms_debounce', async () => {
    (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue([]);
    render(<LensSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc' } });
    // Not called yet
    expect((window.electronAPI as any).snapSearch).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(300); });
    expect((window.electronAPI as any).snapSearch).toHaveBeenCalledWith({ query: 'abc' });
  });

  test('shows_results_in_dropdown', async () => {
    const lenses = [
      { lensId: 'l1', lensName: 'Dog Filter' },
      { lensId: 'l2', lensName: 'Cat Filter' },
    ];
    (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue(lenses);
    render(<LensSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'filter' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Dog Filter')).toBeDefined();
    expect(screen.getByText('Cat Filter')).toBeDefined();
  });

  test('shows_error_when_snap_camera_server_unreachable', async () => {
    (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue({ error: 'unreachable' });
    render(<LensSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'dog' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/snap-camera-server не найден/)).toBeDefined();
  });

  test('click_result_sets_lens_id_and_name', async () => {
    const lenses = [{ lensId: 'l1', lensName: 'Dog Filter' }];
    (window.electronAPI as any).snapSearch = jest.fn().mockResolvedValue(lenses);
    const onSelect = jest.fn();
    render(<LensSearch onSelect={onSelect} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'dog' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Dog Filter'));
    expect(onSelect).toHaveBeenCalledWith({ lensId: 'l1', lensName: 'Dog Filter' });
  });
});
