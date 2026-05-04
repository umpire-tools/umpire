import { defineConfig } from 'tsdown'

export default defineConfig([
  // Framework-neutral entry
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    deps: {
      neverBundle: ['@umpire/core', '@umpire/core/snapshot'],
      alwaysBundle: ['@umpire/reads'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: true,
  },
  // React entry
  {
    entry: {
      react: 'src/react.tsx',
    },
    format: ['esm'],
    platform: 'browser',
    deps: {
      neverBundle: ['react', '@umpire/core', '@umpire/react'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: true,
  },
  // Solid entry
  {
    entry: {
      solid: 'src/solid.tsx',
    },
    format: ['esm'],
    platform: 'browser',
    deps: {
      neverBundle: ['solid-js', '@umpire/core', '@umpire/solid'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: true,
  },
  // Vue entry
  {
    entry: {
      vue: 'src/vue.ts',
    },
    format: ['esm'],
    platform: 'browser',
    deps: {
      neverBundle: ['vue', '@umpire/core', '@umpire/signals'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: true,
  },
])
