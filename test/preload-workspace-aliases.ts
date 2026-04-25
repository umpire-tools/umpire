import { mock } from 'bun:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

if (process.env.BUN_DISABLE_WORKSPACE_MOCKS !== 'true') {
  // Keep exported subpaths in sync with this file. Package tests and coverage runs
  // preload these source aliases before sibling workspaces are built.
  mock.module('@umpire/core', () => require('../packages/core/src/index.js'))
  mock.module('@umpire/core/snapshot', () => ({
    ...require('../packages/core/src/snapshot.js'),
  }))
  mock.module('@umpire/core/guards', () => ({
    ...require('../packages/core/src/guards.js'),
  }))
  mock.module('@umpire/store', () => require('../packages/store/src/index.js'))
  mock.module('@umpire/reads', () => require('../packages/reads/src/index.js'))
  mock.module('@umpire/write', () => require('../packages/write/src/index.js'))
  mock.module('@umpire/react', () => require('../packages/react/src/index.js'))
  mock.module('@umpire/solid', () => require('../packages/solid/src/index.js'))
  mock.module('@umpire/signals', () =>
    require('../packages/signals/src/index.js'),
  )
  mock.module('@umpire/signals/solid', () =>
    require('../packages/signals/src/adapters/solid.js'),
  )
  mock.module('@umpire/testing', () =>
    require('../packages/testing/src/index.js'),
  )
  mock.module('@umpire/zod', () => require('../packages/zod/src/index.js'))
  mock.module('@umpire/dsl', () => require('../packages/dsl/src/index.js'))
  mock.module('@umpire/dsl/clone', () => ({
    ...require('../packages/dsl/src/clone.js'),
  }))
  mock.module('@umpire/json', () => require('../packages/json/src/index.js'))
  mock.module('@umpire/devtools', () =>
    require('../packages/devtools/src/index.js'),
  )
  mock.module('@umpire/devtools/slim', () =>
    require('../packages/devtools/src/slim.js'),
  )
  mock.module('@umpire/devtools/react', () =>
    require('../packages/devtools/entrypoints/react.js'),
  )
  mock.module('@umpire/redux', () => require('../packages/redux/src/index.js'))
  mock.module('@umpire/pinia', () => require('../packages/pinia/src/index.js'))
  mock.module('@umpire/tanstack-store', () =>
    require('../packages/tanstack-store/src/index.js'),
  )
  mock.module('@umpire/vuex', () => require('../packages/vuex/src/index.js'))
  mock.module('@umpire/zustand', () =>
    require('../packages/zustand/src/index.js'),
  )
  mock.module('@umpire/effect', () =>
    require('../packages/effect/src/index.js'),
  )
}
