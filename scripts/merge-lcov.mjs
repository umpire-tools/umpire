#!/usr/bin/env node

import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const packagesDir = path.join(rootDir, 'packages')
const outputDir = path.join(rootDir, 'coverage')
const outputFile = path.join(outputDir, 'lcov.info')

function shouldIncludeFile(filePath) {
  if (filePath.startsWith('test/')) {
    return false
  }

  if (filePath.includes('/__tests__/') || filePath.includes('/smoke/')) {
    return false
  }

  return !/\.(test|spec)\.[^.]+$/u.test(filePath)
}

const packageEntries = await readdir(packagesDir, { withFileTypes: true })
const coverageByFile = new Map()
const packageCoverageDirs = []

for (const entry of packageEntries) {
  if (!entry.isDirectory()) {
    continue
  }

  const packageDir = path.join(packagesDir, entry.name)
  const coverageDir = path.join(packageDir, 'coverage')
  const lcovFile = path.join(coverageDir, 'lcov.info')

  if (!existsSync(lcovFile)) {
    continue
  }

  packageCoverageDirs.push(coverageDir)

  const text = await readFile(lcovFile, 'utf8')
  let currentFile = null

  for (const rawLine of text.split(/\r?\n/u)) {
    if (rawLine.startsWith('SF:')) {
      const sourcePath = rawLine.slice(3)
      const resolvedPath = path.resolve(packageDir, sourcePath)
      currentFile = path.relative(rootDir, resolvedPath).split(path.sep).join('/')

      if (!shouldIncludeFile(currentFile)) {
        currentFile = null
        continue
      }

      if (!coverageByFile.has(currentFile)) {
        coverageByFile.set(currentFile, new Map())
      }

      continue
    }

    if (!currentFile || !rawLine.startsWith('DA:')) {
      continue
    }

    const [lineNumberText, hitsText] = rawLine.slice(3).split(',', 2)
    const lineNumber = Number.parseInt(lineNumberText, 10)
    const hits = Number.parseInt(hitsText, 10)

    if (!Number.isInteger(lineNumber) || !Number.isInteger(hits)) {
      continue
    }

    const lineHits = coverageByFile.get(currentFile)
    lineHits.set(lineNumber, (lineHits.get(lineNumber) ?? 0) + hits)
  }
}

if (coverageByFile.size === 0) {
  throw new Error('No package coverage reports were found to merge.')
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const outputLines = []

for (const filePath of [...coverageByFile.keys()].sort()) {
  const lineHits = coverageByFile.get(filePath)
  const coveredLines = [...lineHits.entries()].sort((a, b) => a[0] - b[0])
  const hitCount = coveredLines.filter(([, hits]) => hits > 0).length

  outputLines.push('TN:')
  outputLines.push(`SF:${filePath}`)

  for (const [lineNumber, hits] of coveredLines) {
    outputLines.push(`DA:${lineNumber},${hits}`)
  }

  outputLines.push(`LF:${coveredLines.length}`)
  outputLines.push(`LH:${hitCount}`)
  outputLines.push('end_of_record')
}

await writeFile(outputFile, `${outputLines.join('\n')}\n`)

await Promise.all(
  packageCoverageDirs.map((coverageDir) =>
    rm(coverageDir, { recursive: true, force: true }),
  ),
)

console.log(`Merged coverage into ${path.relative(rootDir, outputFile)}`)
