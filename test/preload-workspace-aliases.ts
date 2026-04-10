import { mock } from 'bun:test'

if (process.env.BUN_DISABLE_WORKSPACE_MOCKS !== 'true') {
  const core = await import('../packages/core/src/index.js')
  mock.module('@umpire/core', () => core)

  const store = await import('../packages/store/src/index.js')
  mock.module('@umpire/store', () => store)

  const reads = await import('../packages/reads/src/index.js')
  mock.module('@umpire/reads', () => reads)

  const react = await import('../packages/react/src/index.js')
  mock.module('@umpire/react', () => react)

  const signals = await import('../packages/signals/src/index.js')
  mock.module('@umpire/signals', () => signals)

  const testing = await import('../packages/testing/src/index.js')
  mock.module('@umpire/testing', () => testing)

  const zod = await import('../packages/zod/src/index.js')
  mock.module('@umpire/zod', () => zod)

  const json = await import('../packages/json/src/index.js')
  mock.module('@umpire/json', () => json)

  const devtools = await import('../packages/devtools/src/index.js')
  mock.module('@umpire/devtools', () => devtools)

  const devtoolsSlim = await import('../packages/devtools/src/slim.js')
  mock.module('@umpire/devtools/slim', () => devtoolsSlim)

  const devtoolsReact = await import('../packages/devtools/entrypoints/react.js')
  mock.module('@umpire/devtools/react', () => devtoolsReact)

  const redux = await import('../packages/redux/src/index.js')
  mock.module('@umpire/redux', () => redux)

  const pinia = await import('../packages/pinia/src/index.js')
  mock.module('@umpire/pinia', () => pinia)

  const tanstackStore = await import('../packages/tanstack-store/src/index.js')
  mock.module('@umpire/tanstack-store', () => tanstackStore)

  const vuex = await import('../packages/vuex/src/index.js')
  mock.module('@umpire/vuex', () => vuex)

  const zustand = await import('../packages/zustand/src/index.js')
  mock.module('@umpire/zustand', () => zustand)
}
