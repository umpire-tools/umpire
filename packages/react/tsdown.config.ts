import { defineConfig } from 'tsdown'

export default defineConfig([
  // Externalized ESM — user provides React + core
  {
    entry: { 'index.browser': 'src/index.ts' },
    format: ['esm'],
    platform: 'browser',
    deps: {
      neverBundle: ['react', '@umpire/core'],
      alwaysBundle: ['@umpire/core/snapshot'],
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    minify: true,
    sourcemap: true,
  },
  // Externalized IIFE — user provides React + core via script tags
  {
    entry: { 'index': 'src/index.ts' },
    format: ['iife'],
    globalName: 'UmpireReact',
    platform: 'browser',
    deps: {
      neverBundle: ['react', '@umpire/core'],
      alwaysBundle: ['@umpire/core/snapshot'],
    },
    outputOptions: {
      globals: { react: 'React', '@umpire/core': 'Umpire' },
    },
    outDir: 'dist',
    clean: false,
    dts: false,
    minify: true,
    sourcemap: true,
  },
])
