import { defineConfig } from 'tsup'

const sharedExternal = [
  '@umpire/core',
  '@umpire/reads',
  'react',
  'react/jsx-runtime',
]

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: {
      index: 'src/index.ts',
      react: 'entrypoints/react.ts',
    },
    external: sharedExternal,
    format: ['esm'],
    noExternal: [/^preact/],
    sourcemap: true,
  },
  {
    dts: true,
    entry: {
      slim: 'src/slim.ts',
    },
    external: [
      ...sharedExternal,
      'preact',
      'preact/hooks',
      'preact/jsx-runtime',
    ],
    format: ['esm'],
    sourcemap: true,
  },
])
