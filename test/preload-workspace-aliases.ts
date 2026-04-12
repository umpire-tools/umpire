import { mock } from 'bun:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

if (process.env.BUN_DISABLE_WORKSPACE_MOCKS !== 'true') {
  mock.module('@umpire/core', () => require('../packages/core/src/index.js'))
  mock.module('@umpire/store', () => require('../packages/store/src/index.js'))
  mock.module('@umpire/reads', () => require('../packages/reads/src/index.js'))
  mock.module('@umpire/react', () => require('../packages/react/src/index.js'))
  mock.module('@umpire/solid', () => require('../packages/solid/src/index.js'))
  mock.module('@umpire/signals', () => require('../packages/signals/src/index.js'))
  mock.module('@umpire/signals/solid', () =>
    require('../packages/signals/src/adapters/solid.js'),
  )
  mock.module('@umpire/testing', () => require('../packages/testing/src/index.js'))
  mock.module('@umpire/zod', () => require('../packages/zod/src/index.js'))
  mock.module('@umpire/json', () => require('../packages/json/src/index.js'))
  mock.module('@umpire/devtools', () => require('../packages/devtools/src/index.js'))
  mock.module('@umpire/devtools/slim', () => require('../packages/devtools/src/slim.js'))
  mock.module('@umpire/devtools/react', () =>
    require('../packages/devtools/entrypoints/react.js'),
  )
  mock.module('@umpire/redux', () => require('../packages/redux/src/index.js'))
  mock.module('@umpire/pinia', () => require('../packages/pinia/src/index.js'))
  mock.module('@umpire/tanstack-store', () =>
    require('../packages/tanstack-store/src/index.js'),
  )
  mock.module('@umpire/vuex', () => require('../packages/vuex/src/index.js'))
  mock.module('@umpire/zustand', () => require('../packages/zustand/src/index.js'))
}
