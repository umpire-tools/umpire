import { defineConfig } from 'tsdown'

const sharedNeverBundle = ['@umpire/core', '@umpire/reads', 'react', 'react/jsx-runtime']

export default defineConfig([
  // Standalone bundle — Preact inlined. For users without Preact.
  {
    clean: true,
    dts: true,
    entry: {
      index: 'src/index.ts',
    },
    deps: {
      neverBundle: sharedNeverBundle,
      alwaysBundle: [/^preact/],
    },
    format: ['esm'],
    platform: 'browser',
    sourcemap: true,
  },
  // Slim + React — Preact external. Built together so slim.js and react.js
  // share a chunk, keeping register() and mount() on the same registry singleton.
  {
    clean: false,
    dts: true,
    entry: {
      slim: 'src/slim.ts',
      react: 'entrypoints/react.ts',
    },
    deps: {
      neverBundle: [
        ...sharedNeverBundle,
        'preact',
        'preact/hooks',
        'preact/jsx-runtime',
      ],
    },
    format: ['esm'],
    platform: 'browser',
    sourcemap: true,
  },
])
