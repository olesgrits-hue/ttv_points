import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { App } from '../../src/renderer/App';
import './setup';

type LogoutCb = () => void;

describe('App', () => {
  let logoutCallback: LogoutCb | null = null;

  beforeEach(() => {
    logoutCallback = null;
    (window.electronAPI.onAuthLogout as jest.Mock).mockImplementation((cb: LogoutCb) => {
      logoutCallback = cb;
      return jest.fn();
    });
  });

  test('shows_auth_screen_initially', async () => {
    (window.electronAPI.checkAuth as jest.Mock).mockResolvedValue(false);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Войти через Twitch/i })).toBeDefined();
    });
  });

  test('shows_main_screen_when_authenticated', async () => {
    (window.electronAPI.checkAuth as jest.Mock).mockResolvedValue(true);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/127\.0\.0\.1:7891\/overlay/)).toBeDefined();
    });
  });

  test('navigates_to_auth_on_logout_event', async () => {
    (window.electronAPI.checkAuth as jest.Mock).mockResolvedValue(true);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/127\.0\.0\.1:7891\/overlay/)).toBeDefined();
    });

    act(() => { logoutCallback?.(); });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Войти через Twitch/i })).toBeDefined();
    });
  });
});
