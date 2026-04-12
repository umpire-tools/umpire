import { defineConfig } from 'tsdown'

export default defineConfig([
  // Bundled ESM — browser and import conditions resolve here
  {
    entry: {
      index: 'src/index.ts',
      'index.browser': 'src/index.ts',
    },
    format: ['esm'],
    platform: 'browser',
    deps: {
      neverBundle: ['solid-js', '@umpire/core'],
      alwaysBundle: ['@umpire/signals', '@umpire/signals/solid'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    minify: true,
    sourcemap: true,
  },
  // Bundled IIFE — user provides Solid + core via script tags
  {
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'UmpireSolid',
    platform: 'browser',
    deps: {
      neverBundle: ['solid-js', '@umpire/core'],
      alwaysBundle: ['@umpire/signals', '@umpire/signals/solid'],
    },
    outputOptions: {
      globals: { 'solid-js': 'Solid', '@umpire/core': 'Umpire' },
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    minify: true,
    sourcemap: true,
  },
])
