/**
 * Shared setup for renderer (jsdom) tests.
 * Sets up a mock window.electronAPI before each test.
 */

// Extend the global Window type.
import type {} from '../../src/renderer/electron.d';

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      login: jest.fn().mockResolvedValue(undefined),
      checkAuth: jest.fn().mockResolvedValue(false),
      onAuthLogout: jest.fn(() => jest.fn()),
      onTwitchStatus: jest.fn(() => jest.fn()),
      onLogEntry: jest.fn(() => jest.fn()),
    },
    writable: true,
    configurable: true,
  });
});
