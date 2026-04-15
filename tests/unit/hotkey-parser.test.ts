import { parseHotkey } from '../../src/main/actions/hotkey-parser';

describe('parseHotkey', () => {
  test('parses_ctrl_shift_1', () => {
    expect(parseHotkey('ctrl+shift+1')).toEqual({
      key: '1',
      modifiers: ['control', 'shift'],
    });
  });

  test('parses_alt_f4', () => {
    expect(parseHotkey('alt+f4')).toEqual({
      key: 'f4',
      modifiers: ['alt'],
    });
  });

  test('parses_single_key', () => {
    expect(parseHotkey('a')).toEqual({ key: 'a', modifiers: [] });
  });

  test('maps_ctrl_to_control', () => {
    const { modifiers } = parseHotkey('ctrl+a');
    expect(modifiers).toContain('control');
    expect(modifiers).not.toContain('ctrl');
  });

  test('maps_win_to_command', () => {
    const { modifiers } = parseHotkey('win+d');
    expect(modifiers).toContain('command');
  });

  test('throws_on_empty_string', () => {
    expect(() => parseHotkey('')).toThrow(/Hotkey cannot be empty/i);
  });

  test('throws_on_whitespace_only', () => {
    expect(() => parseHotkey('   ')).toThrow(/Hotkey cannot be empty/i);
  });

  test('throws_on_unknown_key', () => {
    expect(() => parseHotkey('ctrl+xyz')).toThrow(/Unknown key: xyz/i);
  });

  test('deduplicates_modifiers', () => {
    const { modifiers } = parseHotkey('ctrl+control+a');
    const controlCount = modifiers.filter((m) => m === 'control').length;
    expect(controlCount).toBe(1);
  });
});
