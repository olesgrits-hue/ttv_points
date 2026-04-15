import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthScreen } from '../../src/renderer/screens/AuthScreen';
import './setup';

describe('AuthScreen', () => {
  test('renders_login_button', () => {
    render(<AuthScreen />);
    const btn = screen.getByRole('button', { name: /Войти через Twitch/i });
    expect(btn).toBeDefined();
  });

  test('login_button_calls_ipc', async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);
    const btn = screen.getByRole('button', { name: /Войти через Twitch/i });
    expect(window.electronAPI.login).not.toHaveBeenCalled();
    await user.click(btn);
    expect(window.electronAPI.login).toHaveBeenCalledTimes(1);
  });
});
