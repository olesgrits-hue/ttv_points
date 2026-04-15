/**
 * Parses a hotkey string (e.g. "ctrl+shift+1") into the format expected by robotjs:
 * { key: string; modifiers: string[] }
 */

const MODIFIER_MAP: Record<string, string> = {
  ctrl: 'control',
  control: 'control',
  alt: 'alt',
  shift: 'shift',
  win: 'command',
  meta: 'command',
  cmd: 'command',
  command: 'command',
};

/**
 * Set of valid non-modifier keys that robotjs accepts.
 * This is a representative subset; single characters are always accepted.
 */
const VALID_SPECIAL_KEYS = new Set([
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
  'enter','return','tab','backspace','delete','escape','space',
  'up','down','left','right','home','end','pageup','pagedown',
  'insert','printscreen','numlock','capslock','scrolllock',
  'num0','num1','num2','num3','num4','num5','num6','num7','num8','num9',
  'numdel','numdec','numadd','numsub','nummul','numdiv',
]);

export interface ParsedHotkey {
  key: string;
  modifiers: string[];
}

/**
 * Parse a hotkey string into key + modifiers for robotjs.keyTap().
 *
 * @throws Error if the string is empty or contains an unknown token.
 */
export function parseHotkey(hotkey: string): ParsedHotkey {
  if (!hotkey || hotkey.trim().length === 0) {
    throw new Error('Hotkey cannot be empty');
  }

  const parts = hotkey.toLowerCase().split('+').map((p) => p.trim());
  const modifiers: string[] = [];
  let key: string | null = null;

  for (const part of parts) {
    if (MODIFIER_MAP[part] !== undefined) {
      const mapped = MODIFIER_MAP[part];
      if (!modifiers.includes(mapped)) {
        modifiers.push(mapped);
      }
    } else if (part.length === 1) {
      // Single character — always a valid key.
      key = part;
    } else if (VALID_SPECIAL_KEYS.has(part)) {
      key = part;
    } else {
      throw new Error(`Unknown key: ${part}`);
    }
  }

  if (!key) {
    throw new Error(`Hotkey "${hotkey}" has no non-modifier key`);
  }

  return { key, modifiers };
}
