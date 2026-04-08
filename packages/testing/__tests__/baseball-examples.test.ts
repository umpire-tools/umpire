import { disables, enabledWhen, requires, umpire } from '@umpire/core'
import { monkeyTest } from '../src/index.js'

describe('baseball-flavored monkeyTest examples', () => {
  test('rotation handoff model stays internally consistent across every value combination', () => {
    const ump = umpire({
      fields: {
        startingPitcher: {},
        catcherPlan: { default: '' },
        bullpenPhone: { default: '' },
      },
      rules: [
        requires('catcherPlan', 'startingPitcher', {
          reason: 'Name the starter first',
        }),
        requires('bullpenPhone', 'catcherPlan', {
          reason: 'Set the catcher plan first',
        }),
      ],
    })

    // monkeyTest() is not checking whether our baseball logic is "correct"
    // for one specific scenario. Instead, it stress-tests the model itself.
    //
    // Under the hood it builds snapshots from a fixed probe set:
    //   [null, undefined, '', 'a', 0, 1, true, false]
    // and feeds every combination of those values through the umpire.
    //
    // Because this umpire only has 3 fields, the helper does an exhaustive
    // sweep rather than random sampling:
    //   8 probe values per field ^ 3 fields = 512 total samples.
    //
    // For each sample it verifies structural invariants such as:
    // - check() is deterministic for the same input
    // - play(snapshot, snapshot) does not invent bogus fouls
    // - repeated foul application converges back to a stable state
    // - challenge(field) agrees with check() for enabled/fair status
    // - mutating a disabled field does not leak into unrelated fields
    // - init() starts from a clean, self-consistent snapshot
    //
    // This makes the test a compact "is the umpire model well-behaved?"
    // assertion, which is different from normal example-by-example tests.
    expect(monkeyTest(ump)).toEqual({
      passed: true,
      violations: [],
      samplesChecked: 512,
    })
  })

  test('rain delay model remains stable across multiple game conditions', () => {
    const ump = umpire<
      {
        tarpOnField: {}
        battingPractice: { default?: string }
        infieldWork: { default?: string }
      },
      { weather: 'clear' | 'rain' }
    >({
      fields: {
        tarpOnField: {},
        battingPractice: { default: '' },
        infieldWork: { default: '' },
      },
      rules: [
        enabledWhen('tarpOnField', (_values, conditions) => conditions.weather === 'rain', {
          reason: 'The tarp only matters during a rain delay',
        }),
        disables('tarpOnField', ['battingPractice', 'infieldWork'], {
          reason: 'Pregame field work stops while the tarp is out',
        }),
      ],
    })

    // Passing `conditions` tells monkeyTest() to rerun the same invariant
    // sweep for each listed game state. Here we exercise both the "clear"
    // and "rain delay" branches of the model.
    //
    // Concretely, monkeyTest() generates the same probe snapshots for the
    // fields twice: once with { weather: 'clear' } and once with
    // { weather: 'rain' }. That lets it verify that the model stays stable
    // when conditional rules turn on and off.
    //
    // The sample count therefore becomes:
    //   8 probe values ^ 3 fields * 2 condition sets = 1024 checks.
    //
    // This is a nice fit for docs/examples or README-style models because it
    // gives us broad internal confidence without forcing a huge matrix of
    // hand-authored assertions. This version is intentionally small and keeps
    // `tarpOnField` as a direct override only, so the sample stays focused on
    // the condition sweep rather than on deeper dependency chains.
    expect(monkeyTest(ump, {
      conditions: [
        { weather: 'clear' },
        { weather: 'rain' },
      ],
    })).toEqual({
      passed: true,
      violations: [],
      samplesChecked: 1024,
    })
  })
})
