import { mock } from 'bun:test'
import * as jsxSrc from './src/index.ts'
import * as jsxRuntime from './src/runtime.ts'
import * as jsxDevRuntime from './src/jsx-dev-runtime.ts'

// Mock @umpire/jsx and its subpath exports so tests resolve them from source
// without needing a built dist/. @umpire/core and @umpire/dsl resolve via
// tsconfig paths in packages/jsx/tsconfig.json.
mock.module('@umpire/jsx', () => jsxSrc)
mock.module('@umpire/jsx/jsx-runtime', () => jsxRuntime)
mock.module('@umpire/jsx/jsx-dev-runtime', () => jsxDevRuntime)
