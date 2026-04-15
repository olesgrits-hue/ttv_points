/**
 * Smoke test: verifies Jest + ts-jest are wired up correctly. No production
 * modules imported here (native modules like robotjs/keytar need Electron ABI
 * and cannot run under plain Node Jest).
 */
describe('infrastructure smoke', () => {
  it('runs the Jest test harness', () => {
    expect(1 + 1).toBe(2);
  });

  it('has Node built-ins available', () => {
    const path = require('path');
    expect(typeof path.join).toBe('function');
  });
});
