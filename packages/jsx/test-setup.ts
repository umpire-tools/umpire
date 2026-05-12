import { mock } from 'bun:test'

// Top-level ESM imports resolve through the mock registry properly —
// the global preload's @umpire/dsl and @umpire/core mocks are in place
// by the time these imports are linked. This avoids the "module not
// instantiated yet" error that occurs when CJS require() is used to
// load an ESM file containing static imports of mocked modules.
import * as jsxSrc from './src/index.ts'
import * as jsxRuntime from './src/runtime.ts'
import * as jsxDevRuntime from './src/jsx-dev-runtime.ts'

// Override the global preload's CJS-based @umpire/jsx mocks.
mock.module('@umpire/jsx', () => jsxSrc)
mock.module('@umpire/jsx/jsx-runtime', () => jsxRuntime)
mock.module('@umpire/jsx/jsx-dev-runtime', () => jsxDevRuntime)
