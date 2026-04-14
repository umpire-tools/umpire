import { field, umpire } from '@umpire/core'
import {
  ReadInputType,
  createReads,
  enabledWhenRead,
  fairWhenRead,
  fromRead,
} from '../src/index.js'

type FixtureInput = {
  cpu?: string
  motherboard?: string
  ram?: string
}

type FixtureReads = {
  ids: {
    cpu: string
    motherboard: string
    ram: string
  }
  selections: {
    cpu?: string
    motherboard?: string
  }
  cpuPresent: boolean
  cpuAndRamPresent: boolean
  selectionPresent: boolean
  motherboardFair: boolean
  boardSummary: string
  activeMotherboard?: string
}

function createFixtureReads(options: { onIdsResolve?: () => void } = {}) {
  return createReads<FixtureInput, FixtureReads>({
    ids: ({ input }) => {
      options.onIdsResolve?.()

      return {
        cpu: input.cpu ?? '',
        motherboard: input.motherboard ?? '',
        ram: input.ram ?? '',
      }
    },
    selections: ({ read }) => {
      const ids = read('ids')

      return {
        cpu: ids.cpu || undefined,
        motherboard: ids.motherboard || undefined,
      }
    },
    cpuPresent: ({ input }) => Boolean(input.cpu),
    cpuAndRamPresent: ({ input }) => Boolean(input.cpu && input.ram),
    selectionPresent: ({ read }) => Boolean(read('selections').motherboard),
    motherboardFair: ({ input, read }) => {
      const { motherboard } = read('selections')

      if (!motherboard) {
        return true
      }

      return Boolean(input.cpu && motherboard === input.cpu)
    },
    boardSummary: ({ input, read }) => `${input.cpu ?? ''}:${read('selections').motherboard ?? ''}`,
    activeMotherboard: ({ read }) => (
      read('motherboardFair')
        ? read('selections').motherboard
        : undefined
    ),
  })
}

describe('@umpire/reads', () => {
  describe('resolution basics', () => {
    test('resolve returns the correct value for reads with direct input access and read dependencies', () => {
      const reads = createFixtureReads()

      expect(reads.resolve({ cpu: 'am5', motherboard: 'am5' })).toMatchObject({
        cpuPresent: true,
        selections: {
          cpu: 'am5',
          motherboard: 'am5',
        },
        selectionPresent: true,
        motherboardFair: true,
      })
    })

    test('per-key shorthand returns the same value as resolve and fromRead', () => {
      const reads = createFixtureReads()
      const input = { cpu: 'am5', motherboard: 'lga1700' }
      const predicate = fromRead(reads, 'motherboardFair')

      expect(reads.motherboardFair(input)).toBe(reads.resolve(input).motherboardFair)
      expect(predicate(undefined, input)).toBe(reads.resolve(input).motherboardFair)
    })

    test('fromRead supports selecting the input from arbitrary arguments', () => {
      const reads = createFixtureReads()
      const predicate = fromRead(
        reads,
        'motherboardFair',
        (motherboard: string | undefined, cpu: string | undefined) => ({
          cpu,
          motherboard,
        }),
      )

      expect(predicate('am5', 'am5')).toBe(true)
      expect(predicate('lga1700', 'am5')).toBe(false)
    })

    test('table.from supports both default and selected input predicates', () => {
      const reads = createFixtureReads()
      const predicate = reads.from('motherboardFair')
      const selectedPredicate = reads.from(
        'motherboardFair',
        (motherboard: string | undefined, cpu: string | undefined) => ({
          cpu,
          motherboard,
        }),
      )

      expect(predicate(undefined, { cpu: 'am5', motherboard: 'am5' })).toBe(true)
      expect(selectedPredicate('lga1700', 'am5')).toBe(false)
    })
  })

  describe('caching within a session', () => {
    test('only calls a shared resolver once even when multiple reads depend on it', () => {
      let idsCalls = 0
      const reads = createFixtureReads({
        onIdsResolve: () => {
          idsCalls += 1
        },
      })

      expect(reads.resolve({ cpu: 'am5', motherboard: 'am5', ram: '32gb' })).toMatchObject({
        ids: {
          cpu: 'am5',
          motherboard: 'am5',
          ram: '32gb',
        },
        selections: {
          cpu: 'am5',
          motherboard: 'am5',
        },
        selectionPresent: true,
        motherboardFair: true,
        activeMotherboard: 'am5',
      })
      expect(idsCalls).toBe(1)
    })
  })

  describe('dependency tracking via inspect()', () => {
    test('records direct field and read dependencies without expanding transitive reads', () => {
      const reads = createFixtureReads()
      const inspected = reads.inspect({
        cpu: 'am5',
        motherboard: 'am5',
        ram: '32gb',
      })

      expect(inspected.nodes.cpuPresent.dependsOnFields).toEqual(['cpu'])
      expect(inspected.nodes.cpuPresent.dependsOnReads).toEqual([])

      expect(inspected.nodes.cpuAndRamPresent.dependsOnFields).toEqual(['cpu', 'ram'])
      expect(inspected.nodes.cpuAndRamPresent.dependsOnReads).toEqual([])

      expect(inspected.nodes.selectionPresent.dependsOnFields).toEqual([])
      expect(inspected.nodes.selectionPresent.dependsOnReads).toEqual(['selections'])

      expect(inspected.nodes.motherboardFair.dependsOnFields).toEqual(['cpu'])
      expect(inspected.nodes.motherboardFair.dependsOnReads).toEqual(['selections'])

      expect(inspected.nodes.activeMotherboard.dependsOnFields).toEqual([])
      expect(inspected.nodes.activeMotherboard.dependsOnReads).toEqual([
        'motherboardFair',
        'selections',
      ])
      expect(inspected.nodes.activeMotherboard.dependsOnReads).not.toContain('ids')
    })
  })

  describe('trace helpers', () => {
    test('trace.inspect supports custom input selection and reports direct dependencies', () => {
      const reads = createFixtureReads()
      const trace = reads.trace(
        'motherboardFair',
        (
          values: { motherboard?: string },
          conditions: { cpu?: string },
          prev?: { motherboard?: string },
        ) => ({
          cpu: conditions.cpu,
          motherboard: values.motherboard ?? prev?.motherboard,
        }),
      )

      expect(
        trace.inspect(
          { motherboard: undefined },
          { cpu: 'am5' },
          { motherboard: 'am5' },
        ),
      ).toEqual({
        value: true,
        dependencies: [
          { kind: 'field', id: 'cpu' },
          { kind: 'read', id: 'selections' },
        ],
      })
    })
  })

  describe('graph edges', () => {
    test('inspect graph includes field edges for input access and read edges for read() calls', () => {
      const reads = createFixtureReads()
      const edges = reads.inspect({
        cpu: 'am5',
        motherboard: 'am5',
        ram: '32gb',
      }).graph.edges

      expect(edges).toEqual(expect.arrayContaining([
        {
          from: 'cpu',
          to: 'ids',
          type: 'field',
        },
        {
          from: 'motherboard',
          to: 'ids',
          type: 'field',
        },
        {
          from: 'ram',
          to: 'ids',
          type: 'field',
        },
        {
          from: 'cpu',
          to: 'cpuPresent',
          type: 'field',
        },
        {
          from: 'cpu',
          to: 'cpuAndRamPresent',
          type: 'field',
        },
        {
          from: 'ram',
          to: 'cpuAndRamPresent',
          type: 'field',
        },
        {
          from: 'cpu',
          to: 'motherboardFair',
          type: 'field',
        },
        {
          from: 'cpu',
          to: 'boardSummary',
          type: 'field',
        },
        {
          from: 'ids',
          to: 'selections',
          type: 'read',
        },
        {
          from: 'selections',
          to: 'selectionPresent',
          type: 'read',
        },
        {
          from: 'selections',
          to: 'motherboardFair',
          type: 'read',
        },
        {
          from: 'selections',
          to: 'boardSummary',
          type: 'read',
        },
        {
          from: 'motherboardFair',
          to: 'activeMotherboard',
          type: 'read',
        },
        {
          from: 'selections',
          to: 'activeMotherboard',
          type: 'read',
        },
      ]))
    })

    test('inspect graph includes bridge edges after read-backed rules register', () => {
      const reads = createFixtureReads()

      fairWhenRead('motherboard', 'motherboardFair', reads)

      expect(reads.inspect({ cpu: 'am5', motherboard: 'am5' }).graph.edges).toEqual(
        expect.arrayContaining([
          {
            from: 'motherboardFair',
            to: 'motherboard',
            type: 'bridge',
          },
        ]),
      )
    })
  })

  describe('circular dependency detection', () => {
    test('throws with a message naming the cycle', () => {
      const reads = createReads<{}, { alpha: boolean; beta: boolean }>({
        alpha: ({ read }) => read('beta'),
        beta: ({ read }) => read('alpha'),
      })

      expect(() => reads.resolve({})).toThrow('createReads circular dependency: alpha -> beta -> alpha')
    })
  })

  describe('bridge registration', () => {
    test('registers fairWhen bridges and deduplicates identical registrations', () => {
      const reads = createFixtureReads()

      fairWhenRead('motherboard', 'motherboardFair', reads)
      fairWhenRead('motherboard', 'motherboardFair', reads)

      expect(reads.inspect({ cpu: 'am5', motherboard: 'am5' }).bridges).toEqual([
        {
          type: 'fairWhen',
          read: 'motherboardFair',
          field: 'motherboard',
        },
      ])
    })

    test('registers enabledWhen bridges with the correct type', () => {
      const reads = createFixtureReads()

      enabledWhenRead('cpu', 'cpuPresent', reads)

      expect(reads.inspect({ cpu: 'am5' }).bridges).toEqual([
        {
          type: 'enabledWhen',
          read: 'cpuPresent',
          field: 'cpu',
        },
      ])
    })

    test('accepts named field builders for read-backed rules', () => {
      const reads = createFixtureReads()

      fairWhenRead(field<string>('motherboard'), 'motherboardFair', reads)

      expect(reads.inspect({ cpu: 'am5', motherboard: 'am5' }).bridges).toEqual([
        {
          type: 'fairWhen',
          read: 'motherboardFair',
          field: 'motherboard',
        },
      ])
    })

    test('throws when an unnamed field builder is used with a read-backed rule', () => {
      const reads = createFixtureReads()

      expect(() =>
        fairWhenRead(field<string>(), 'motherboardFair', reads),
      ).toThrow('Named field required when using a read-backed rule')
    })
  })

  describe('fairWhenRead / enabledWhenRead rule behavior', () => {
    test('fairWhenRead passes when the read returns true', () => {
      const reads = createFixtureReads()
      const ump = umpire({
        fields: {
          cpu: {},
          motherboard: {
            isEmpty: (value: unknown) => value == null || value === '',
          },
        },
        rules: [
          fairWhenRead('motherboard', 'motherboardFair', reads, {
            reason: 'Selected motherboard no longer matches the CPU socket',
          }),
        ],
      })

      expect(ump.check({ cpu: 'am5', motherboard: 'am5' }).motherboard).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
    })

    test('fairWhenRead fails with the configured reason when the read returns false', () => {
      const reads = createFixtureReads()
      const ump = umpire({
        fields: {
          cpu: {},
          motherboard: {
            isEmpty: (value: unknown) => value == null || value === '',
          },
        },
        rules: [
          fairWhenRead('motherboard', 'motherboardFair', reads, {
            reason: 'Selected motherboard no longer matches the CPU socket',
          }),
        ],
      })

      expect(ump.check({ cpu: 'am5', motherboard: 'lga1700' }).motherboard).toEqual({
        enabled: true,
        fair: false,
        required: false,
        reason: 'Selected motherboard no longer matches the CPU socket',
        reasons: ['Selected motherboard no longer matches the CPU socket'],
      })
    })

    test('enabledWhenRead passes when the read returns true and fails with the configured reason when false', () => {
      const reads = createReads<
        { cpu?: string },
        { canSelectMotherboard: boolean }
      >({
        canSelectMotherboard: ({ input }) => Boolean(input.cpu),
      })
      const ump = umpire({
        fields: {
          cpu: {},
          motherboard: {},
        },
        rules: [
          enabledWhenRead('motherboard', 'canSelectMotherboard', reads, {
            reason: 'Pick a CPU first',
          }),
        ],
      })

      expect(ump.check({ cpu: 'am5', motherboard: 'am5' }).motherboard).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
      expect(ump.check({ motherboard: 'am5' }).motherboard).toEqual({
        enabled: false,
        fair: true,
        required: false,
        reason: 'Pick a CPU first',
        reasons: ['Pick a CPU first'],
      })
    })

    test('inputType CONDITIONS evaluates reads against conditions instead of values', () => {
      const reads = createReads<
        { allowMotherboard: boolean },
        { canSelectMotherboard: boolean }
      >({
        canSelectMotherboard: ({ input }) => input.allowMotherboard,
      })
      const ump = umpire<
        {
          motherboard: {}
        },
        { allowMotherboard: boolean }
      >({
        fields: {
          motherboard: {},
        },
        rules: [
          enabledWhenRead('motherboard', 'canSelectMotherboard', reads, {
            inputType: ReadInputType.CONDITIONS,
            reason: 'Pick a supported platform first',
          }),
        ],
      })

      expect(ump.check({}, { allowMotherboard: true }).motherboard).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
      expect(ump.check({}, { allowMotherboard: false }).motherboard).toEqual({
        enabled: false,
        fair: true,
        required: false,
        reason: 'Pick a supported platform first',
        reasons: ['Pick a supported platform first'],
      })
    })

    test('fairWhenRead supports inputType CONDITIONS with a named field builder', () => {
      const reads = createReads<
        { cpu?: string; motherboard?: string },
        { motherboardFair: boolean }
      >({
        motherboardFair: ({ input }) => (
          !input.motherboard || input.cpu === input.motherboard
        ),
      })
      const ump = umpire<
        {
          motherboard: {}
        },
        { cpu?: string; motherboard?: string }
      >({
        fields: {
          motherboard: {},
        },
        rules: [
          fairWhenRead(field<string>('motherboard'), 'motherboardFair', reads, {
            inputType: ReadInputType.CONDITIONS,
            reason: 'Selected motherboard no longer matches the CPU socket',
          }),
        ],
      })

      expect(
        ump.check(
          { motherboard: 'am5' },
          { cpu: 'am5', motherboard: 'am5' },
        ).motherboard,
      ).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
      expect(
        ump.check(
          { motherboard: 'lga1700' },
          { cpu: 'am5', motherboard: 'lga1700' },
        ).motherboard,
      ).toEqual({
        enabled: true,
        fair: false,
        required: false,
        reason: 'Selected motherboard no longer matches the CPU socket',
        reasons: ['Selected motherboard no longer matches the CPU socket'],
      })
    })

    test('fairWhenRead supports custom input selection', () => {
      const reads = createFixtureReads()
      const ump = umpire<
        {
          motherboard: {
            isEmpty: (value: unknown) => boolean
          }
        },
        { cpu?: string }
      >({
        fields: {
          motherboard: {
            isEmpty: (value: unknown) => value == null || value === '',
          },
        },
        rules: [
          fairWhenRead('motherboard', 'motherboardFair', reads, {
            selectInput: (values, conditions) => ({
              cpu: conditions.cpu,
              motherboard: values.motherboard as string | undefined,
            }),
            reason: 'Selected motherboard no longer matches the CPU socket',
          }),
        ],
      })

      expect(ump.check({ motherboard: 'am5' }, { cpu: 'am5' }).motherboard).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
      expect(ump.check({ motherboard: 'lga1700' }, { cpu: 'am5' }).motherboard).toEqual({
        enabled: true,
        fair: false,
        required: false,
        reason: 'Selected motherboard no longer matches the CPU socket',
        reasons: ['Selected motherboard no longer matches the CPU socket'],
      })
    })

    test('enabledWhenRead supports custom input selection', () => {
      const reads = createReads<
        { cpu?: string },
        { canSelectMotherboard: boolean }
      >({
        canSelectMotherboard: ({ input }) => Boolean(input.cpu),
      })
      const ump = umpire<
        {
          motherboard: {}
        },
        { selectedCpu?: string }
      >({
        fields: {
          motherboard: {},
        },
        rules: [
          enabledWhenRead('motherboard', 'canSelectMotherboard', reads, {
            selectInput: (_values, conditions) => ({
              cpu: conditions.selectedCpu,
            }),
            reason: 'Pick a CPU first',
          }),
        ],
      })

      expect(ump.check({}, { selectedCpu: 'am5' }).motherboard).toEqual({
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      })
      expect(ump.check({}, {}).motherboard).toEqual({
        enabled: false,
        fair: true,
        required: false,
        reason: 'Pick a CPU first',
        reasons: ['Pick a CPU first'],
      })
    })
  })

  describe('guard-value behavior', () => {
    test('returns true for motherboardFair when no motherboard is selected', () => {
      const reads = createFixtureReads()

      expect(reads.motherboardFair({ cpu: 'am5' })).toBe(true)
    })
  })
})
