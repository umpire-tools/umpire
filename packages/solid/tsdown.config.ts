import { defineConfig } from 'tsdown'

export default defineConfig([
  // Externalized ESM — user provides Solid + core
  {
    entry: { 'index.browser': 'src/index.ts' },
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
  // Externalized IIFE — user provides Solid + core via script tags
  {
    entry: { 'index': 'src/index.ts' },
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
