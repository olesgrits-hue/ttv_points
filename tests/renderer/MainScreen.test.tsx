import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MainScreen } from '../../src/renderer/screens/MainScreen';
import './setup';

type StatusCb = (payload: { connected: boolean }) => void;

describe('MainScreen', () => {
  let statusCallback: StatusCb | null = null;

  beforeEach(() => {
    statusCallback = null;
    // Capture the status callback for later use in tests.
    (window.electronAPI.onTwitchStatus as jest.Mock).mockImplementation((cb: StatusCb) => {
      statusCallback = cb;
      return jest.fn();
    });
  });

  test('shows_obs_url', () => {
    render(<MainScreen />);
    expect(screen.getByText(/127\.0\.0\.1:7891\/overlay/)).toBeDefined();
  });

  test('shows_disconnect_banner_when_status_false', () => {
    render(<MainScreen />);
    act(() => {
      statusCallback?.({ connected: false });
    });
    expect(screen.getByText(/Соединение потеряно/)).toBeDefined();
  });

  test('hides_disconnect_banner_when_status_true', () => {
    render(<MainScreen />);
    act(() => { statusCallback?.({ connected: false }); });
    expect(screen.getByText(/Соединение потеряно/)).toBeDefined();

    act(() => { statusCallback?.({ connected: true }); });
    expect(screen.queryByText(/Соединение потеряно/)).toBeNull();
  });

  test('renders_snap_camera_section', () => {
    render(<MainScreen />);
    expect(screen.getByRole('region', { name: /Snap Camera/i })).toBeDefined();
  });

  test('renders_media_section', () => {
    render(<MainScreen />);
    expect(screen.getByRole('region', { name: /Media/i })).toBeDefined();
  });
});
