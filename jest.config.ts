import type { Config } from 'jest';

const sharedTsJest = {
  tsconfig: {
    jsx: 'react-jsx',
    module: 'CommonJS',
    esModuleInterop: true,
    target: 'ES2022',
  },
};

const moduleNameMapper = {
  '^@main/(.*)$': '<rootDir>/src/main/$1',
  '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
  '^@overlay/(.*)$': '<rootDir>/src/overlay/$1',
};

const config: Config = {
  passWithNoTests: true,
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
        '<rootDir>/tests/actions/**/*.test.ts',
        '<rootDir>/tests/setup.test.ts',
      ],
      transform: { '^.+\\.tsx?$': ['ts-jest', sharedTsJest] },
      moduleNameMapper,
      clearMocks: true,
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jest-environment-jsdom',
      testMatch: [
        '<rootDir>/tests/renderer/**/*.test.tsx',
        '<rootDir>/tests/renderer/**/*.test.ts',
      ],
      transform: { '^.+\\.tsx?$': ['ts-jest', sharedTsJest] },
      moduleNameMapper,
      clearMocks: true,
    },
  ],
};

export default config;
