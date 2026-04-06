/** @type {import('jest').Config} */
export default {
  watchman: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text-summary'],
  projects: [
    {
      displayName: 'core',
      rootDir: 'packages/core',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    },
    {
      displayName: 'signals',
      rootDir: 'packages/signals',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    },
    {
      displayName: 'react',
      rootDir: 'packages/react',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
      collectCoverageFrom: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.d.ts'],
    },
    {
      displayName: 'zustand',
      rootDir: 'packages/zustand',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    },
    {
      displayName: 'zod',
      rootDir: 'packages/zod',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    },
    {
      displayName: 'reads',
      rootDir: 'packages/reads',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    },
    {
      displayName: 'devtools',
      rootDir: 'packages/devtools',
      watchman: false,
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json',
          },
        ],
      },
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/panel/**',
        '!src/**/*.d.ts',
      ],
    },
  ],
};
