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
      slotsList: jest.fn().mockResolvedValue([]),
      slotsCreate: jest.fn().mockResolvedValue({}),
      slotsDelete: jest.fn().mockResolvedValue(undefined),
      slotsToggle: jest.fn().mockResolvedValue({}),
      rewardsList: jest.fn().mockResolvedValue([]),
      rewardsCreate: jest.fn().mockResolvedValue({ rewardId: 'r-new', rewardTitle: 'New' }),
      dialogOpenFile: jest.fn().mockResolvedValue(null),
      dialogOpenFolder: jest.fn().mockResolvedValue(null),
      snapSearch: jest.fn().mockResolvedValue([]),
    },
    writable: true,
    configurable: true,
  });
});
