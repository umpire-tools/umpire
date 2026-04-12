import { mock } from 'bun:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

mock.module('solid-js', () => require('solid-js/dist/solid.cjs'))
mock.module('solid-js/store', () => require('solid-js/store/dist/store.cjs'))
