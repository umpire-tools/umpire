import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'

type WorkspacePackage = {
  dir: string
  dirName: string
  name: string
}

const { createCoverageMap } = libCoverage
const { createContext } = libReport

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const packagesDir = path.join(rootDir, 'packages')
const preloadPath = path.join(rootDir, 'test', 'istanbul-coverage-preload.ts')
const outputDir = path.join(rootDir, 'coverage-istanbul')
const filters = process.argv.slice(2)

function matchesFilter(pkg: WorkspacePackage) {
  if (filters.length === 0) {
    return true
  }

  return filters.some((filter) =>
    filter === pkg.name ||
    filter === pkg.dirName ||
    filter === `packages/${pkg.dirName}`,
  )
}

async function listPackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packages: WorkspacePackage[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const dir = path.join(packagesDir, entry.name)
    const packageJsonPath = path.join(dir, 'package.json')

    if (!existsSync(packageJsonPath)) {
      continue
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

    if (!packageJson.scripts?.test) {
      continue
    }

    packages.push({
      dir,
      dirName: entry.name,
      name: packageJson.name,
    })
  }

  return packages.filter(matchesFilter).sort((a, b) => a.name.localeCompare(b.name))
}

async function cleanCoverageDirectories(packages: WorkspacePackage[]) {
  await rm(outputDir, { recursive: true, force: true })

  await Promise.all(
    packages.map((pkg) =>
      rm(path.join(pkg.dir, 'coverage-istanbul'), { recursive: true, force: true }),
    ),
  )
}

function runPackageTests(pkg: WorkspacePackage) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      'bun',
      ['--cwd', pkg.dir, 'test', '--preload', preloadPath],
      {
        env: {
          ...process.env,
          UMPIRE_ISTANBUL_COVERAGE_DIR: path.join(pkg.dir, 'coverage-istanbul', 'raw'),
        },
        stdio: 'inherit',
      },
    )

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Coverage experiment failed for ${pkg.name} with exit code ${code ?? 'unknown'}.`))
    })
  })
}

async function readCoverageMaps(packages: WorkspacePackage[]) {
  const coverageMap = createCoverageMap({})
  let rawFileCount = 0

  for (const pkg of packages) {
    const rawDir = path.join(pkg.dir, 'coverage-istanbul', 'raw')

    if (!existsSync(rawDir)) {
      continue
    }

    const entries = await readdir(rawDir)

    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue
      }

      const rawPath = path.join(rawDir, entry)
      const fileStat = await stat(rawPath)

      if (!fileStat.isFile()) {
        continue
      }

      const rawCoverage = JSON.parse(await readFile(rawPath, 'utf8'))
      coverageMap.merge(rawCoverage)
      rawFileCount += 1
    }
  }

  if (rawFileCount === 0) {
    throw new Error('No raw Istanbul coverage files were produced.')
  }

  return { coverageMap, rawFileCount }
}

async function writeReports(coverageMap: ReturnType<typeof createCoverageMap>) {
  await mkdir(outputDir, { recursive: true })

  const context = createContext({
    coverageMap,
    dir: outputDir,
  })

  reports.create('json', { file: 'coverage-final.json' }).execute(context)
  reports.create('lcovonly', { file: 'lcov.info' }).execute(context)

  return coverageMap.getCoverageSummary()
}

const packages = await listPackages()

if (packages.length === 0) {
  throw new Error('No packages matched the requested filters.')
}

await cleanCoverageDirectories(packages)

for (const pkg of packages) {
  console.log(`\n[istanbul] Running ${pkg.name}`)
  await runPackageTests(pkg)
}

const { coverageMap, rawFileCount } = await readCoverageMaps(packages)
const summary = await writeReports(coverageMap)

console.log(`\n[istanbul] Merged ${rawFileCount} raw coverage file(s) into ${path.relative(rootDir, outputDir)}/lcov.info`)
console.log(
  `[istanbul] Statements ${summary.statements.pct}% | Branches ${summary.branches.pct}% | Functions ${summary.functions.pct}% | Lines ${summary.lines.pct}%`,
)
