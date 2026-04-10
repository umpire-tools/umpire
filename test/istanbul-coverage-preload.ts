import { plugin } from 'bun'
import { afterAll } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createInstrumenter } = require('istanbul-lib-instrument')
const { defaults } = require('@istanbuljs/schema')

const rootDir = path.resolve(import.meta.dir, '..')
const coverageDir = process.env.UMPIRE_ISTANBUL_COVERAGE_DIR ??
  path.join(process.cwd(), 'coverage-istanbul', 'raw')

const instrumenter = createInstrumenter({
  compact: false,
  coverageVariable: '__coverage__',
  esModules: true,
  parserPlugins: [...defaults.instrumenter.parserPlugins, 'typescript', 'jsx'],
  preserveComments: true,
})

function toRootRelative(filePath: string) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function shouldInstrument(filePath: string) {
  if (filePath.includes('/node_modules/')) {
    return false
  }

  const relativePath = toRootRelative(filePath)

  if (!relativePath.startsWith('packages/')) {
    return false
  }

  if (
    relativePath.includes('/__tests__/') ||
    relativePath.includes('/smoke/') ||
    relativePath.includes('/dist/') ||
    relativePath.includes('/coverage-istanbul/')
  ) {
    return false
  }

  if (relativePath.startsWith('packages/devtools/src/panel/')) {
    return false
  }

  return !/\.(test|spec)\.[^.]+$/u.test(relativePath)
}

function loaderForPath(filePath: string) {
  if (filePath.endsWith('.tsx')) {
    return 'tsx'
  }

  if (filePath.endsWith('.ts') || filePath.endsWith('.mts') || filePath.endsWith('.cts')) {
    return 'ts'
  }

  if (filePath.endsWith('.jsx')) {
    return 'jsx'
  }

  return 'js'
}

plugin({
  name: 'umpire-istanbul-coverage',
  setup(build) {
    build.onLoad({ filter: /\/packages\/.*\.[cm]?[jt]sx?$/u, namespace: 'file' }, ({ path: filePath }) => {
      const source = readFileSync(filePath, 'utf8')

      return {
        contents: shouldInstrument(filePath)
          ? instrumenter.instrumentSync(source, filePath)
          : source,
        loader: loaderForPath(filePath),
      }
    })
  },
})

function writeCoverageFile() {
  const coverage = globalThis.__coverage__

  if (!coverage || Object.keys(coverage).length === 0) {
    return
  }

  mkdirSync(coverageDir, { recursive: true })
  writeFileSync(
    path.join(coverageDir, `${process.pid}.json`),
    JSON.stringify(coverage),
    'utf8',
  )
}

afterAll(() => {
  writeCoverageFile()
})

process.on('beforeExit', () => {
  writeCoverageFile()
})

process.on('exit', () => {
  writeCoverageFile()
})
