/**
 * electron-builder configuration.
 * Portable target: produces a single .exe. electron-builder sets the
 * PORTABLE_EXECUTABLE_DIR environment variable at runtime — the app uses it
 * as the base path for config.json so settings survive exe replacement.
 */
module.exports = {
  appId: 'dev.ttweaks.app',
  productName: 'ttweaks',
  icon: 'build/icon.ico',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: [
    'dist/main/**/*',
    'dist/web/**/*',
    'package.json',
    '!node_modules/**/{test,tests,__tests__,*.md,*.markdown,*.map}',
  ],
  asar: true,

  asarUnpack: [
    'node_modules/keytar/**/*',
  ],
  win: {
    target: [
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    artifactName: 'ttweaks.exe',
    sign: false,
    certificateSubjectName: undefined,
  },
  portable: {
    artifactName: 'ttweaks.exe',
  },
  publish: {
    provider: 'github',
    owner: 'olesgrits-hue',
    repo: 'ttv_points',
  },
};
