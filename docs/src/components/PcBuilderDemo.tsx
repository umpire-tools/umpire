import { useMemo, useState, type ReactNode } from 'react'
import { requires, umpire, type Snapshot } from '@umpire/core'
import { register } from '@umpire/devtools/slim'
import { createReads, enabledWhenRead, fairWhenRead, ReadInputType } from '@umpire/reads'
import { createCoach } from '../lib/createCoach'
import '../styles/components/_components.pc-builder-demo.css'

type Socket = 'LGA1700' | 'AM5'
type CpuBrand = 'intel' | 'amd'
type CpuTier = 'mid' | 'high' | 'flagship'
type RamType = 'ddr4' | 'ddr5'
type FormFactor = 'ATX' | 'mATX'
type GpuTier = 'mid' | 'high'

const cpus = [
  { id: 'intel-i5', label: 'Intel Core i5-13600K', brand: 'intel', socket: 'LGA1700', tier: 'mid' },
  { id: 'intel-i7', label: 'Intel Core i7-14700K', brand: 'intel', socket: 'LGA1700', tier: 'high' },
  { id: 'intel-i9', label: 'Intel Core i9-14900K', brand: 'intel', socket: 'LGA1700', tier: 'flagship' },
  { id: 'amd-r5', label: 'AMD Ryzen 5 7600', brand: 'amd', socket: 'AM5', tier: 'mid' },
  { id: 'amd-r7', label: 'AMD Ryzen 7 7700X', brand: 'amd', socket: 'AM5', tier: 'high' },
  { id: 'amd-r9', label: 'AMD Ryzen 9 7950X', brand: 'amd', socket: 'AM5', tier: 'flagship' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  brand: CpuBrand
  socket: Socket
  tier: CpuTier
}>

const motherboards = [
  { id: 'asus-z790', label: 'ASUS ROG Z790-E', socket: 'LGA1700', formFactor: 'ATX', ramType: 'ddr5' },
  { id: 'msi-b660', label: 'MSI PRO B660M', socket: 'LGA1700', formFactor: 'mATX', ramType: 'ddr4' },
  { id: 'gigabyte-h610', label: 'Gigabyte H610M', socket: 'LGA1700', formFactor: 'mATX', ramType: 'ddr4' },
  { id: 'asus-x670e', label: 'ASUS ROG X670E', socket: 'AM5', formFactor: 'ATX', ramType: 'ddr5' },
  { id: 'msi-b650', label: 'MSI MAG B650', socket: 'AM5', formFactor: 'ATX', ramType: 'ddr5' },
  { id: 'asrock-a620', label: 'ASRock A620M', socket: 'AM5', formFactor: 'mATX', ramType: 'ddr5' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  socket: Socket
  formFactor: FormFactor
  ramType: RamType
}>

const ramKits = [
  { id: 'ddr4-16', label: '16GB DDR4-3200', type: 'ddr4', size: 16 },
  { id: 'ddr4-32', label: '32GB DDR4-3600', type: 'ddr4', size: 32 },
  { id: 'ddr4-64', label: '64GB DDR4-3600', type: 'ddr4', size: 64 },
  { id: 'ddr5-16', label: '16GB DDR5-6000', type: 'ddr5', size: 16 },
  { id: 'ddr5-32', label: '32GB DDR5-6000', type: 'ddr5', size: 32 },
  { id: 'ddr5-64', label: '64GB DDR5-6400', type: 'ddr5', size: 64 },
  { id: 'ddr5-128', label: '128GB DDR5-5600', type: 'ddr5', size: 128 },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  type: RamType
  size: number
}>

const gpus = [
  { id: 'rtx-4060', label: 'NVIDIA RTX 4060', tier: 'mid' },
  { id: 'rtx-4080', label: 'NVIDIA RTX 4080', tier: 'high' },
  { id: 'rx-7800', label: 'AMD RX 7800 XT', tier: 'mid' },
  { id: 'rx-7900', label: 'AMD RX 7900 XTX', tier: 'high' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  tier: GpuTier
}>

const storageOptions = [
  { id: '1tb-gen4', label: '1TB NVMe Gen4' },
  { id: '2tb-gen4', label: '2TB NVMe Gen4' },
  { id: '4tb-gen5', label: '4TB NVMe Gen5' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
}>

const caseOptions = [
  { id: 'full', label: 'Full Tower', fits: ['ATX', 'mATX'] },
  { id: 'mid', label: 'Mid Tower', fits: ['ATX', 'mATX'] },
  { id: 'mini', label: 'Mini-ITX', fits: ['mATX'] },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  fits: FormFactor[]
}>

type Cpu = (typeof cpus)[number]
type Motherboard = (typeof motherboards)[number]
type RamKit = (typeof ramKits)[number]
type Gpu = (typeof gpus)[number]
type StorageOption = (typeof storageOptions)[number]
type CaseOption = (typeof caseOptions)[number]

const pcFields = {
  cpu:         { required: true, isEmpty: (value: unknown) => !value },
  motherboard: { required: true, isEmpty: (value: unknown) => !value },
  ram:         { required: true, isEmpty: (value: unknown) => !value },
  gpu:         { isEmpty: (value: unknown) => !value },
  storage:     { isEmpty: (value: unknown) => !value },
  caseSize:    { required: true, isEmpty: (value: unknown) => !value },
}

type PcField = keyof typeof pcFields
type PcBuildInput = Partial<Record<PcField, unknown>>
type PcSelections = {
  cpu?: Cpu
  motherboard?: Motherboard
  ram?: RamKit
  gpu?: Gpu
  storage?: StorageOption
  caseSize?: CaseOption
}
type PcDerivedReads = {
  ids: Record<PcField, string>
  selections: PcSelections
  motherboardFair: boolean
  activeMotherboard?: Motherboard
  ramFair: boolean
  caseSizeFair: boolean
  compatibleMotherboards: readonly Motherboard[]
  compatibleRamKits: readonly RamKit[]
  compatibleCases: readonly CaseOption[]
  oppositeCpuSuggestion?: Cpu
  psuRecommendation: string
}

type PcConditions = Record<string, never>

type HintInput = {
  cpuBrand?: CpuBrand
  hasRamSelection: boolean
  sawTransitiveCascade: boolean
  sawAppliedResets: boolean
}

type HintReads = {
  canPromptSwitchCpu: boolean
  canExplainTransitive: boolean
  canCelebrateComplete: boolean
}

type HintId = keyof typeof hintFields & string
type HintMarkers = Pick<HintInput, 'sawAppliedResets' | 'sawTransitiveCascade'>

const hintFields = {
  promptSwitchCpu:   {},
  explainTransitive: {},
  celebrateComplete: {},
}

// --- hintReads + hintUmp ----------------------------------------------------
//
// The hint system is a second, independent umpire instance that drives
// progressive disclosure of explanatory callouts. It is entirely separate from
// pcUmp — it has its own fields, rules, and read table.
//
// HintInput is not the raw field values. It is a set of derived boolean markers
// that the component accumulates over time (sawTransitiveCascade, sawAppliedResets)
// or computes on-the-fly (hasRamSelection, cpuBrand). These markers are the
// "conditions" for the hint umpire, passed via ReadInputType.CONDITIONS below.
//
// The reads here are simple boolean predicates. They could be written inline as
// plain `enabledWhen()` predicates instead — but using reads makes the gate
// logic named and inspectable: hintReads.inspect(input) shows exactly which
// markers each hint depends on and what they evaluated to.

const hintReads = createReads<HintInput, HintReads>({
  // Fires once the user has a CPU *and* RAM selected. Brand-agnostic — the
  // previous version gated on cpuBrand === 'intel', which meant AMD-first
  // builders never saw this hint. !!cpuBrand is sufficient: any selection
  // means there is an opposite to suggest.
  canPromptSwitchCpu: ({ input }) => input.hasRamSelection && !!input.cpuBrand,

  // Fires after the user has triggered the transitive cascade at least once:
  // CPU changed → motherboard stale → RAM stale. Tracked as a sticky marker so
  // the hint persists even after the user resolves the cascade.
  canExplainTransitive: ({ input }) => input.sawTransitiveCascade,

  // Fires only after *both* the cascade was triggered and the reset banner was
  // acted on. This is the "completion" hint — it only makes sense to show it
  // after the user has experienced the full demo flow.
  canCelebrateComplete: ({ input }) => input.sawTransitiveCascade && input.sawAppliedResets,
})

// enabledWhenRead wires each read to a hint field and registers the bridge so
// hintReads.inspect() and challenge() can trace the full gate logic. The
// `inputType: ReadInputType.CONDITIONS` tells the rule factory to pass the
// hint umpire's *conditions* (i.e. HintInput) into the reads rather than the
// raw field values — because that is what hintReads was designed to consume.
const hintUmp = umpire<typeof hintFields, HintInput>({
  fields: hintFields,
  rules: [
    enabledWhenRead('promptSwitchCpu', 'canPromptSwitchCpu', hintReads, {
      inputType: ReadInputType.CONDITIONS,
      reason: 'Complete steps 1–3 and select RAM first',
    }),
    enabledWhenRead('explainTransitive', 'canExplainTransitive', hintReads, {
      inputType: ReadInputType.CONDITIONS,
      reason: 'Trigger the transitive cascade first',
    }),
    enabledWhenRead('celebrateComplete', 'canCelebrateComplete', hintReads, {
      inputType: ReadInputType.CONDITIONS,
      reason: 'Apply the suggested resets first',
    }),
  ],
})

type PcValues = ReturnType<typeof pcUmp.init>
type PcCheck = ReturnType<typeof pcUmp.check>
type HintCheck = ReturnType<typeof hintUmp.check>
type PcSnapshot = Snapshot<PcConditions>

type StepDefinition = {
  index: number
  title: string
  caption: string
  fields: PcField[]
}

type SelectChoice = {
  value: string
  label: string
}

const steps = [
  {
    index: 0,
    title: 'Platform',
    caption: 'Set the socket that the rest of the build depends on.',
    fields: ['cpu'],
  },
  {
    index: 1,
    title: 'Motherboard',
    caption: 'Filtered by the CPU socket. This is the first domino.',
    fields: ['motherboard'],
  },
  {
    index: 2,
    title: 'Memory',
    caption: 'Filtered by motherboard RAM type. This is the transitive foul.',
    fields: ['ram'],
  },
  {
    index: 3,
    title: 'Storage & GPU',
    caption: 'App-level extras. Umpire does not manage the PSU label.',
    fields: ['storage', 'gpu'],
  },
  {
    index: 4,
    title: 'Case',
    caption: 'Filtered by form factor. It cascades when the board falls out.',
    fields: ['caseSize'],
  },
] as const satisfies readonly StepDefinition[]

const fieldMeta: Record<PcField, { label: string }> = {
  cpu:         { label: 'CPU' },
  motherboard: { label: 'Motherboard' },
  ram:         { label: 'RAM' },
  gpu:         { label: 'GPU' },
  storage:     { label: 'Storage' },
  caseSize:    { label: 'Case' },
}

const hintPriority = [
  'promptSwitchCpu',
  'explainTransitive',
  'celebrateComplete',
] as const satisfies readonly HintId[]

function indexById<T extends { id: string }>(items: readonly T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Partial<Record<string, T>>
}

const cpuById = indexById(cpus)
const motherboardById = indexById(motherboards)
const ramById = indexById(ramKits)
const gpuById = indexById(gpus)
const storageById = indexById(storageOptions)
const caseById = indexById(caseOptions)
function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function formatRamType(ramType: RamType) {
  return ramType.toUpperCase()
}

function formatTier(tier: CpuTier | GpuTier) {
  return `${tier} tier`
}

function pluralize(word: string, count: number) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function fitsFormFactor(fits: readonly FormFactor[], formFactor: FormFactor) {
  return fits.includes(formFactor)
}

function buildChoices(
  choices: SelectChoice[],
  selectedValue: string,
  selectedLabel: string | undefined,
  stale: boolean,
) {
  if (!selectedValue || !selectedLabel || !stale || choices.some((choice) => choice.value === selectedValue)) {
    return choices
  }

  return [
    { value: selectedValue, label: `${selectedLabel} (stale)` },
    ...choices,
  ]
}

function getStepIndexForField(field: PcField) {
  return steps.find((step) => step.fields.some((stepField) => stepField === field))?.index ?? 0
}

function getPsuRecommendation(cpuTier?: CpuTier, gpuTier?: GpuTier) {
  if (cpuTier === 'flagship' && gpuTier === 'high') {
    return '1000W'
  }

  if (cpuTier === 'high' && gpuTier === 'high') {
    return '850W'
  }

  return '650W'
}

function hasTransitiveCascade(fouls: Array<{ field: string }>) {
  const foulFields = new Set(fouls.map((foul) => foul.field))
  return foulFields.has('motherboard') && foulFields.has('ram')
}

function rememberHintMarkers(
  current: HintMarkers,
  next: Partial<HintMarkers>,
) {
  let changed = false
  const markers = { ...current }

  for (const markerId of Object.keys(current) as Array<keyof HintMarkers>) {
    if (Boolean(next[markerId]) && markers[markerId] !== true) {
      markers[markerId] = true
      changed = true
    }
  }

  return changed ? markers : current
}

function resolveActiveHint(check: HintCheck): HintId | null {
  const eligibleHints = hintPriority.filter((hintId) => check[hintId].enabled)
  return eligibleHints.at(-1) ?? null
}

// --- pcBuildReads -----------------------------------------------------------
//
// All derived state for the PC builder lives here. Reads compose via `read()`,
// which is memoized per evaluation — each resolver runs at most once per call
// to pcBuildReads.resolve() or pcBuildReads.inspect(). Field accesses on
// `input` are tracked automatically through a Proxy, so dependency edges are
// captured without any manual annotation.
//
// The ordering of declarations does NOT matter. createReads() evaluates lazily
// and resolves dependencies on demand (with circular-cycle detection).
//
// Three of these reads — motherboardFair, ramFair, caseSizeFair — are wired
// into umpire rules below via fairWhenRead(). That registration is what creates
// the bridge edges visible in pcBuildReads.inspect() and the challenge() trace.
// Without fairWhenRead(), the reads and the rules would be disconnected: the
// read would still run, but umpire would have no visibility into *why* a field
// was called fair or foul.

const pcBuildReads = createReads<PcBuildInput, PcDerivedReads>({
  // ids: raw string coercion of every field value.
  //
  // Field values arrive as `unknown` from umpire's loosely-typed input. This
  // read is a single normalization point so every downstream resolver can work
  // with plain strings instead of sprinkling `asString()` calls everywhere.
  // `input` is a Proxy — each property access here registers a dependency edge
  // (e.g. input.cpu → 'ids') in the inspection graph.
  ids: ({ input }) => ({
    cpu: asString(input.cpu),
    motherboard: asString(input.motherboard),
    ram: asString(input.ram),
    gpu: asString(input.gpu),
    storage: asString(input.storage),
    caseSize: asString(input.caseSize),
  }),

  // selections: catalog objects resolved from the string IDs above.
  //
  // This is the canonical "what has the user actually selected?" read.
  // Downstream reads call `read('selections')` instead of doing their own
  // catalog lookups, so the lookup logic lives in exactly one place. `read()`
  // is memoized — 'ids' and 'selections' are each computed once regardless of
  // how many resolvers call them.
  selections: ({ read }) => {
    const ids = read('ids')

    return {
      cpu: cpuById[ids.cpu],
      motherboard: motherboardById[ids.motherboard],
      ram: ramById[ids.ram],
      gpu: gpuById[ids.gpu],
      storage: storageById[ids.storage],
      caseSize: caseById[ids.caseSize],
    }
  },

  // motherboardFair: is the selected motherboard socket-compatible with the CPU?
  //
  // Guard: returns true (fair) when no motherboard is selected yet, so umpire
  // does not call an empty field foul for a constraint that cannot be violated.
  // This read is wired to the 'motherboard' field via fairWhenRead() below,
  // which is what makes the bridge — and the challenge() trace — visible.
  motherboardFair: ({ read }) => {
    const { motherboard } = read('ids')

    if (!motherboard) {
      return true
    }

    const { cpu, motherboard: selectedMotherboard } = read('selections')

    return Boolean(
      cpu &&
      selectedMotherboard &&
      selectedMotherboard.socket === cpu.socket,
    )
  },

  // activeMotherboard: the currently selected motherboard, or undefined if it
  // is socket-mismatched (i.e. fair === false).
  //
  // Downstream reads (ramFair, caseSizeFair, compatibleRamKits, compatibleCases)
  // use this instead of selections.motherboard directly. The key invariant: if
  // the motherboard is stale, the downstream constraints collapse cleanly rather
  // than reasoning against a board that umpire has already called foul.
  activeMotherboard: ({ read }) => (
    read('motherboardFair')
      ? read('selections').motherboard
      : undefined
  ),

  // ramFair: is the selected RAM kit compatible with the active motherboard's
  // RAM type (DDR4 vs DDR5)?
  //
  // Same guard pattern as motherboardFair. Depends on activeMotherboard (not
  // raw selections.motherboard) so that a socket-mismatched board never causes
  // this read to return a false positive.
  ramFair: ({ read }) => {
    const { ram } = read('ids')

    if (!ram) {
      return true
    }

    const activeMotherboard = read('activeMotherboard')
    const { ram: selectedRam } = read('selections')

    return Boolean(
      activeMotherboard &&
      selectedRam &&
      selectedRam.type === activeMotherboard.ramType,
    )
  },

  // caseSizeFair: does the selected case fit the active motherboard's form factor?
  //
  // Same guard/activeMotherboard pattern as ramFair. This is the third leg of
  // the transitive cascade: CPU change → motherboard stale → ram stale + case stale.
  caseSizeFair: ({ read }) => {
    const { caseSize } = read('ids')

    if (!caseSize) {
      return true
    }

    const activeMotherboard = read('activeMotherboard')
    const { caseSize: selectedCase } = read('selections')

    return Boolean(
      activeMotherboard &&
      selectedCase &&
      fitsFormFactor(selectedCase.fits, activeMotherboard.formFactor),
    )
  },

  // compatibleMotherboards / compatibleRamKits / compatibleCases:
  // filtered catalog lists used to populate the select dropdowns in the UI.
  //
  // These are pure UI-support reads — they do not feed any umpire rules. Their
  // value is that the filtering logic lives here, named and shared, rather than
  // duplicated across render functions or scattered into useEffect/useMemo calls.
  // challenge() traces will show these reads when they appear in an inspect()
  // call, even though no fairWhenRead bridge connects them to a rule.
  compatibleMotherboards: ({ read }) => {
    const { cpu } = read('selections')

    return cpu
      ? motherboards.filter((board) => board.socket === cpu.socket)
      : []
  },
  compatibleRamKits: ({ read }) => {
    const activeMotherboard = read('activeMotherboard')

    return activeMotherboard
      ? ramKits.filter((kit) => kit.type === activeMotherboard.ramType)
      : []
  },
  compatibleCases: ({ read }) => {
    const activeMotherboard = read('activeMotherboard')

    return activeMotherboard
      ? caseOptions.filter((size) => fitsFormFactor(size.fits, activeMotherboard.formFactor))
      : []
  },

  // oppositeCpuSuggestion: the same-tier CPU from the other brand.
  //
  // Admittedly contrived — in real code this would be a one-liner in the render
  // function. It's here to demonstrate the "hoist from render" pattern: logic
  // that *could* live inline in JSX is instead named, centrally located, and
  // automatically dependency-tracked. The hint copy that references this read
  // never needs to repeat the brand-flip logic; it just calls
  // `buildReads.oppositeCpuSuggestion`. If the catalog shape changed, there is
  // exactly one place to update.
  oppositeCpuSuggestion: ({ read }) => {
    const cpu = read('selections').cpu
    if (!cpu) return undefined
    const oppositeBrand = cpu.brand === 'intel' ? 'amd' : 'intel'
    return cpus.find((c) => c.brand === oppositeBrand && c.tier === cpu.tier)
  },

  // psuRecommendation: a display string derived from CPU + GPU tier.
  //
  // Another pure UI-support read. The PSU wattage estimate is not a field umpire
  // manages — it is just a convenience label. Keeping it here means the
  // calculation is memoized alongside everything else, and the render function
  // stays declarative.
  psuRecommendation: ({ read }) => {
    const { cpu, gpu } = read('selections')
    return getPsuRecommendation(cpu?.tier, gpu?.tier)
  },
})

// --- pcUmp ------------------------------------------------------------------
//
// The umpire instance for the PC build form. Rules are declared here; the
// predicate logic lives entirely in pcBuildReads above.
//
// fairWhenRead() does two things that a plain fairWhen() would not:
//   1. It calls the named read to evaluate the fairness predicate, sharing the
//      result with any other rule or render consumer that reads the same key.
//   2. It registers a bridge edge on pcBuildReads so that inspect() and
//      challenge() can trace the full dependency path — field value → read →
//      umpire rule — rather than stopping at the rule boundary.
//
// The three fairWhenRead rules here cover the transitive cascade: a CPU change
// can stale motherboard (socket), which stales RAM (DDR type), which stales
// caseSize (form factor). Each fairness check reads from activeMotherboard,
// which gates on motherboardFair, so the cascade collapses deterministically.
const pcUmp = umpire<typeof pcFields, PcConditions>({
  fields: pcFields,
  rules: [
    requires('motherboard', 'cpu', {
      reason: 'Pick a CPU first',
    }),
    // Bridge: motherboardFair read → 'motherboard' field in pcBuildReads.inspect()
    fairWhenRead('motherboard', 'motherboardFair', pcBuildReads, {
      reason: 'Selected motherboard no longer matches the CPU socket',
    }),

    requires('ram', 'motherboard', {
      reason: 'Memory depends on an active motherboard selection',
    }),
    // Bridge: ramFair read → 'ram' field. ramFair depends on activeMotherboard,
    // so a socket mismatch cascades here without any explicit wiring.
    fairWhenRead('ram', 'ramFair', pcBuildReads, {
      reason: 'Selected memory no longer matches the motherboard RAM type',
    }),

    requires('caseSize', 'motherboard', {
      reason: 'Pick a valid motherboard first to determine form factor',
    }),
    // Bridge: caseSizeFair read → 'caseSize' field. Same cascade as ramFair.
    fairWhenRead('caseSize', 'caseSizeFair', pcBuildReads, {
      reason: 'Selected case no longer fits the motherboard form factor',
    }),
  ],
})

// --- pcCoach ----------------------------------------------------------------
//
// createCoach() composes pcUmp.scorecard() with pcBuildReads.inspect() into a
// single call. The render function calls pcCoach.inspect(snapshot) to get both
// the structural field analysis (which fields are present/satisfied/fair, which
// are cascading vs directly foul) and the full read table (compatibility lists,
// PSU recommendation, fairness booleans) in one pass.
const pcCoach = createCoach({
  ump: pcUmp,
  reads: pcBuildReads,
  getReadInput: (snapshot: PcSnapshot) => snapshot.values,
})

function SelectField({
  id,
  label,
  value,
  placeholder,
  detail,
  availability,
  choices,
  foul,
  meta,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  detail: string
  availability: PcCheck[PcField]
  choices: SelectChoice[]
  foul?: { reason: string }
  meta?: ReactNode
  onChange: (nextValue: string) => void
}) {
  return (
    <div
      className={cls(
        'c-pc-builder__field',
        !availability.enabled && 'c-pc-builder__field is-disabled',
        (!availability.fair || foul) && 'c-pc-builder__field is-fouled',
      )}
    >
      <div className="c-pc-builder__field-header">
        <div className="c-pc-builder__field-copy">
          <label className="c-pc-builder__field-label c-umpire-demo__eyebrow" htmlFor={id}>
            {label}
          </label>
          <p className="c-pc-builder__field-detail">{detail}</p>
        </div>
        {availability.required && (
          <span className="c-pc-builder__required">Required</span>
        )}
      </div>

      <div className="c-pc-builder__select-shell">
        <select
          id={id}
          className="c-pc-builder__select"
          value={value}
          disabled={!availability.enabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">{placeholder}</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="c-pc-builder__select-caret" aria-hidden="true">
          ▾
        </span>
      </div>

      {meta}

      {foul ? (
        <div className="c-umpire-demo__field-foul">
          <span className="c-umpire-demo__field-foul-reason">{foul.reason}</span>
        </div>
      ) : (
        (!availability.enabled || !availability.fair) && availability.reason && (
          <div className="c-umpire-demo__field-reason">{availability.reason}</div>
        )
      )}
    </div>
  )
}

function HintCallout({
  title,
  copy,
}: {
  title: string
  copy: string
}) {
  return (
    <div className="c-pc-builder__hint">
      <div className="c-pc-builder__hint-kicker">{title}</div>
      <p className="c-pc-builder__hint-copy">{copy}</p>
    </div>
  )
}

export default function PcBuilderDemo() {
  const [values, setValues] = useState<PcValues>(() => pcUmp.init())
  const [hintMarkers, setHintMarkers] = useState<HintMarkers>({
    sawAppliedResets: false,
    sawTransitiveCascade: false,
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [lastTransition, setLastTransition] = useState<{ before: PcSnapshot } | null>(null)
  const coaching = useMemo(() => pcCoach.inspect({
    values,
  }, {
    before: lastTransition?.before,
  }), [
    values,
    lastTransition,
  ])
  const buildReads = coaching.reads.values
  const {
    ids: {
      cpu: cpuId,
      motherboard: motherboardId,
      ram: ramId,
      gpu: gpuId,
      storage: storageId,
      caseSize: caseId,
    },
    selections: {
      cpu: selectedCpu,
      motherboard: selectedMotherboard,
      ram: selectedRam,
      gpu: selectedGpu,
      storage: selectedStorage,
      caseSize: selectedCase,
    },
    motherboardFair,
    activeMotherboard,
    ramFair,
    caseSizeFair,
    compatibleMotherboards,
    compatibleRamKits,
    compatibleCases,
    psuRecommendation,
  } = buildReads

  const motherboardChoices = buildChoices(
    compatibleMotherboards.map((board) => ({
      value: board.id,
      label: `${board.label} · ${board.formFactor} · ${formatRamType(board.ramType)}`,
    })),
    motherboardId,
    selectedMotherboard?.label,
    Boolean(motherboardId && !motherboardFair),
  )

  const ramChoices = buildChoices(
    compatibleRamKits.map((kit) => ({
      value: kit.id,
      label: `${kit.label} · ${formatRamType(kit.type)}`,
    })),
    ramId,
    selectedRam?.label,
    Boolean(ramId && !ramFair),
  )

  const caseChoices = buildChoices(
    compatibleCases.map((size) => ({
      value: size.id,
      label: `${size.label} · fits ${size.fits.join(', ')}`,
    })),
    caseId,
    selectedCase?.label,
    Boolean(caseId && !caseSizeFair),
  )

  const scorecard = coaching.scorecard
  const { check } = scorecard
  const fouls = scorecard.transition.fouls
  const foulsByField = scorecard.transition.foulsByField
  const hasLiveTransitiveCascade = (
    scorecard.transition.cascadingFields.includes('motherboard') &&
    scorecard.transition.cascadingFields.includes('ram')
  )

  const cpuBrand = selectedCpu?.brand
  const hasRamSelection = scorecard.fields.ram.satisfied
  const sawTransitiveCascade = hintMarkers.sawTransitiveCascade || hasLiveTransitiveCascade
  const sawAppliedResets = hintMarkers.sawAppliedResets
  const hintInput: HintInput = {
    cpuBrand,
    hasRamSelection,
    sawTransitiveCascade,
    sawAppliedResets,
  }

  const hintCheck = useMemo<HintCheck>(
    () => hintUmp.check(hintUmp.init(), hintInput),
    [cpuBrand, hasRamSelection, sawTransitiveCascade, sawAppliedResets],
  )
  const activeHint = resolveActiveHint(hintCheck)

  // Devtools-only: these registrations drive the optional docs inspector and
  // are not required for the coach, reads, or hint flow itself.
  register('pc-builder', pcUmp, values, undefined, {
    reads: pcBuildReads,
  })
  register('pc-builder/hints', hintUmp, hintUmp.init(), hintInput)

  function updateField<K extends PcField>(field: K, nextValue: PcValues[K]) {
    if (Object.is(values[field], nextValue)) {
      return
    }

    const nextValues = {
      ...values,
      [field]: nextValue,
    } as PcValues

    const nextFouls = pcUmp.play(
      { values },
      { values: nextValues },
    )

    setLastTransition({
      before: { values },
    })
    setValues(nextValues)
    setHintMarkers((current) => rememberHintMarkers(current, {
      sawTransitiveCascade: hasTransitiveCascade(nextFouls),
    }))
  }

  function updateSelectField(field: PcField, nextValue: string) {
    updateField(field, (nextValue || undefined) as PcValues[typeof field])
  }

  function applyResets() {
    const resetTargets = fouls.filter((foul) => !Object.is(values[foul.field], foul.suggestedValue))

    if (resetTargets.length === 0) {
      return
    }

    const nextValues = { ...values }

    for (const foul of resetTargets) {
      nextValues[foul.field] = foul.suggestedValue as PcValues[typeof foul.field]
    }

    setLastTransition({
      before: { values },
    })
    setValues(nextValues)
    setHintMarkers((current) => rememberHintMarkers(current, {
      sawTransitiveCascade: hasLiveTransitiveCascade,
      sawAppliedResets: true,
    }))
    setCurrentStep(getStepIndexForField(resetTargets[0].field as PcField))
  }

  function stepFouls(step: StepDefinition) {
    return fouls.filter((foul) => step.fields.includes(foul.field as PcField))
  }

  function getStepStatus(step: StepDefinition) {
    const activeFouls = stepFouls(step)
    const hasFoulField = step.fields.some((field) => !check[field].fair)
    const hasAnyValue = step.fields.some((field) => Boolean(asString(values[field])))
    const requiredFields = step.fields.filter((field) => check[field].required)
    const requiredComplete = requiredFields.every((field) => Boolean(asString(values[field])))
    const allLocked = step.fields.every((field) => !check[field].enabled)

    if (activeFouls.length > 0 || hasFoulField) {
      return {
        tone: 'fouled',
        label: 'Fouled',
      } as const
    }

    if (allLocked) {
      return {
        tone: 'disabled',
        label: 'Waiting',
      } as const
    }

    if (step.index === 3) {
      return {
        tone: 'enabled',
        label: hasAnyValue ? 'Tuned' : 'Optional',
      } as const
    }

    if (requiredComplete) {
      return {
        tone: 'enabled',
        label: 'Complete',
      } as const
    }

    return {
      tone: 'enabled',
      label: currentStep === step.index ? 'Open' : 'Ready',
    } as const
  }

  function getStepSummary(step: StepDefinition) {
    if (step.index === 0) {
      return selectedCpu
        ? `${selectedCpu.label} · ${selectedCpu.socket}`
        : 'No CPU selected yet'
    }

    if (step.index === 1) {
      return selectedMotherboard
        ? `${selectedMotherboard.label}${motherboardId && !motherboardFair ? ' (stale)' : ''}`
        : 'No motherboard selected yet'
    }

    if (step.index === 2) {
      return selectedRam
        ? `${selectedRam.label}${ramId && !ramFair ? ' (stale)' : ''}`
        : 'No memory selected yet'
    }

    if (step.index === 3) {
      const storageLabel = selectedStorage?.label ?? 'No storage'
      const gpuLabel = selectedGpu?.label ?? 'No GPU'
      return `${storageLabel} · ${gpuLabel}`
    }

    return selectedCase
      ? `${selectedCase.label}${caseId && !caseSizeFair ? ' (stale)' : ''}`
      : 'No case selected yet'
  }

  function renderStepBody(step: StepDefinition) {
    if (step.index === 0) {
      return (
        <SelectField
          id="pc-builder-cpu"
          label="Processor"
          value={cpuId}
          placeholder="Choose a processor"
          detail="Switch this later to fire the platform cascade."
          availability={check.cpu}
          choices={cpus.map((cpu) => ({
            value: cpu.id,
            label: `${cpu.label} · ${cpu.socket} · ${formatTier(cpu.tier)}`,
          }))}
          foul={foulsByField.cpu}
          onChange={(nextValue) => updateSelectField('cpu', nextValue)}
          meta={selectedCpu ? (
            <div className="c-pc-builder__spec-list">
              <span className="c-pc-builder__spec">Socket {selectedCpu.socket}</span>
              <span className="c-pc-builder__spec">{formatTier(selectedCpu.tier)}</span>
            </div>
          ) : (
            <div className="c-pc-builder__field-note">
              Pick Intel first, finish Memory, then switch to AMD.
            </div>
          )}
        />
      )
    }

    if (step.index === 1) {
      return (
        <SelectField
          id="pc-builder-motherboard"
          label="Motherboard"
          value={motherboardId}
          placeholder={selectedCpu ? 'Choose a motherboard' : 'Choose a CPU first'}
          detail={
            selectedCpu
              ? `${pluralize('board', compatibleMotherboards.length)} match ${selectedCpu.socket}.`
              : 'Filtered by the selected CPU socket.'
          }
          availability={check.motherboard}
          choices={motherboardChoices}
          foul={foulsByField.motherboard}
          onChange={(nextValue) => updateSelectField('motherboard', nextValue)}
          meta={selectedMotherboard && (
            <div className="c-pc-builder__spec-list">
              <span className="c-pc-builder__spec">Socket {selectedMotherboard.socket}</span>
              <span className="c-pc-builder__spec">{selectedMotherboard.formFactor}</span>
              <span className="c-pc-builder__spec">{formatRamType(selectedMotherboard.ramType)}</span>
            </div>
          )}
        />
      )
    }

    if (step.index === 2) {
      return (
        <SelectField
          id="pc-builder-ram"
          label="Memory"
          value={ramId}
          placeholder={activeMotherboard ? 'Choose a memory kit' : 'Choose a valid motherboard first'}
          detail={
            activeMotherboard
              ? `${pluralize('kit', compatibleRamKits.length)} match ${formatRamType(activeMotherboard.ramType)}.`
              : 'Filtered by the selected motherboard RAM type.'
          }
          availability={check.ram}
          choices={ramChoices}
          foul={foulsByField.ram}
          onChange={(nextValue) => updateSelectField('ram', nextValue)}
          meta={selectedRam && (
            <div className="c-pc-builder__spec-list">
              <span className="c-pc-builder__spec">{formatRamType(selectedRam.type)}</span>
              <span className="c-pc-builder__spec">{selectedRam.size}GB</span>
            </div>
          )}
        />
      )
    }

    if (step.index === 3) {
      return (
        <>
          <div className="c-pc-builder__field-grid">
            <SelectField
              id="pc-builder-storage"
              label="Storage"
              value={storageId}
              placeholder="Optional"
              detail="Pure app state. No Umpire rule here."
              availability={check.storage}
              choices={storageOptions.map((storage) => ({
                value: storage.id,
                label: storage.label,
              }))}
              foul={foulsByField.storage}
              onChange={(nextValue) => updateSelectField('storage', nextValue)}
              meta={selectedStorage && (
                <div className="c-pc-builder__field-note">
                  Storage stays outside the dependency graph in this demo.
                </div>
              )}
            />

            <SelectField
              id="pc-builder-gpu"
              label="Graphics"
              value={gpuId}
              placeholder="Optional"
              detail="Optional, but it changes the PSU recommendation."
              availability={check.gpu}
              choices={gpus.map((gpu) => ({
                value: gpu.id,
                label: `${gpu.label} · ${formatTier(gpu.tier)}`,
              }))}
              foul={foulsByField.gpu}
              onChange={(nextValue) => updateSelectField('gpu', nextValue)}
              meta={selectedGpu && (
                <div className="c-pc-builder__spec-list">
                  <span className="c-pc-builder__spec">{formatTier(selectedGpu.tier)}</span>
                </div>
              )}
            />
          </div>

          <div className="c-pc-builder__insight">
            <div className="c-pc-builder__insight-kicker">UI-only derived value</div>
            <div className="c-pc-builder__insight-title">{psuRecommendation} PSU recommendation</div>
            <p className="c-pc-builder__insight-copy">
              No field, no rule, no Umpire state. This is ordinary view logic driven by CPU tier plus GPU tier.
            </p>
          </div>
        </>
      )
    }

    return (
      <SelectField
        id="pc-builder-case"
        label="Case"
        value={caseId}
        placeholder={activeMotherboard ? 'Choose a case' : 'Choose a valid motherboard first'}
        detail={
          activeMotherboard
            ? `${pluralize('case', compatibleCases.length)} fit ${activeMotherboard.formFactor}.`
            : 'Filtered by the selected motherboard form factor.'
        }
        availability={check.caseSize}
        choices={caseChoices}
        foul={foulsByField.caseSize}
        onChange={(nextValue) => updateSelectField('caseSize', nextValue)}
        meta={selectedCase && (
          <div className="c-pc-builder__spec-list">
            <span className="c-pc-builder__spec">Fits {selectedCase.fits.join(', ')}</span>
          </div>
        )}
      />
    )
  }

  // HINT NOTE: The hint rules only decide visibility. Step placement, ordering,
  // and copy still live in the component, which is workable but manual.
  function renderHintCallout(step: StepDefinition) {
    if (step.index === 1 && activeHint === 'explainTransitive') {
      return (
        <HintCallout
          title="Hint"
          copy="The CPU switch only directly broke the motherboard. RAM fell with it because requires() follows dependency availability, so the stale upstream board shut Memory down too."
        />
      )
    }

    if (step.index === 2 && activeHint === 'promptSwitchCpu') {
      const opposite = buildReads.oppositeCpuSuggestion
      const switchTo = opposite ? opposite.label : 'the other platform'
      return (
        <HintCallout
          title="Hint"
          copy={`You have a ${selectedCpu?.brand === 'intel' ? 'Intel' : 'AMD'} build with matching RAM. Jump back to Platform and try ${switchTo}. Watch Motherboard, Memory, and Case all get called for stale state.`}
        />
      )
    }

    return null
  }

  return (
    <div className="c-pc-builder-demo c-umpire-demo">
      {fouls.length > 0 && (
        <div className="c-umpire-demo__fouls">
          <div className="c-umpire-demo__fouls-copy">
            <div className="c-umpire-demo__fouls-kicker">Fouls</div>
            <div className="c-umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="c-umpire-demo__foul">
                  <span className="c-umpire-demo__foul-field">{fieldMeta[foul.field].label}</span>
                  <span className="c-umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="c-umpire-demo__reset-button"
            onClick={applyResets}
          >
            Apply resets
          </button>
        </div>
      )}

      {activeHint === 'celebrateComplete' && (
        <HintCallout
          title="Hint"
          copy="That was the whole trick: filtering stayed in the UI, but play() still turned stale downstream state into guided reset recommendations."
        />
      )}

      <div className="c-pc-builder__layout">
        <div className="c-pc-builder__steps">
          {steps.map((step) => {
            const activeFouls = stepFouls(step)
            const status = getStepStatus(step)
            const hasActiveHint = renderHintCallout(step) !== null
            const expanded = currentStep === step.index || activeFouls.length > 0 || hasActiveHint

            return (
              <section
                key={step.index}
                className={cls(
                  'c-pc-builder__step',
                  expanded && 'c-pc-builder__step--expanded',
                  activeFouls.length > 0 && 'c-pc-builder__step is-fouled',
                )}
              >
                <button
                  type="button"
                  className="c-pc-builder__step-toggle"
                  aria-expanded={expanded}
                  onClick={() => setCurrentStep(step.index)}
                >
                  <div className="c-pc-builder__step-copy">
                    <span className="c-pc-builder__step-number">
                      {String(step.index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="c-pc-builder__step-title">{step.title}</div>
                      <p className="c-pc-builder__step-caption">{step.caption}</p>
                    </div>
                  </div>

                  <div className="c-pc-builder__step-meta">
                     <span
                      className={cls(
                        'c-umpire-demo__status',
                        status.tone === 'fouled' && 'c-umpire-demo__status is-fouled',
                        status.tone === 'enabled' && 'c-umpire-demo__status is-enabled',
                        status.tone === 'disabled' && 'c-umpire-demo__status is-disabled',
                      )}
                    >
                      <span className="c-umpire-demo__status-dot" />
                      <span className="c-umpire-demo__status-text">{status.label}</span>
                    </span>
                  </div>
                </button>

                {expanded && (
                  <>
                    <div className="c-pc-builder__step-body">
                      {renderStepBody(step)}
                    </div>
                    {renderHintCallout(step)}
                  </>
                )}
              </section>
            )
          })}
        </div>

        <aside className="c-pc-builder__sidebar">
          <section className="c-pc-builder__summary">
            <div className="c-pc-builder__panel-header">
              <div>
                <div className="c-pc-builder__eyebrow">Sidebar summary</div>
                <h2 className="c-pc-builder__panel-title">Build state</h2>
              </div>
              <span className="c-pc-builder__panel-accent">play() wizard</span>
            </div>

            <div className="c-pc-builder__summary-body">
              <div className="c-pc-builder__summary-list">
                {steps.map((step) => {
                  const activeFouls = stepFouls(step)

                  return (
                    <button
                      key={step.index}
                      type="button"
                      className={cls(
                        'c-pc-builder__summary-item',
                        currentStep === step.index && 'c-pc-builder__summary-item is-active',
                        activeFouls.length > 0 && 'c-pc-builder__summary-item is-fouled',
                      )}
                      onClick={() => setCurrentStep(step.index)}
                    >
                      <div className="c-pc-builder__summary-row">
                        <span className="c-pc-builder__summary-step c-umpire-demo__eyebrow">
                          {String(step.index + 1).padStart(2, '0')} · {step.title}
                        </span>
                        {activeFouls.length > 0 && (
                          <span className="c-pc-builder__summary-fouls">{activeFouls.length}</span>
                        )}
                      </div>
                      <div className="c-pc-builder__summary-copy">{getStepSummary(step)}</div>
                    </button>
                  )
                })}
              </div>

              <div className="c-pc-builder__metrics">
                <div className="c-pc-builder__metric">
                  <span className="c-pc-builder__metric-label c-umpire-demo__eyebrow">Boards</span>
                  <strong className="c-pc-builder__metric-value">
                    {compatibleMotherboards.length}
                  </strong>
                </div>

                <div className="c-pc-builder__metric">
                  <span className="c-pc-builder__metric-label c-umpire-demo__eyebrow">RAM kits</span>
                  <strong className="c-pc-builder__metric-value">
                    {compatibleRamKits.length}
                  </strong>
                </div>

                <div className="c-pc-builder__metric">
                  <span className="c-pc-builder__metric-label c-umpire-demo__eyebrow">Cases</span>
                  <strong className="c-pc-builder__metric-value">
                    {compatibleCases.length}
                  </strong>
                </div>

                <div className="c-pc-builder__metric">
                  <span className="c-pc-builder__metric-label c-umpire-demo__eyebrow">PSU</span>
                  <strong className="c-pc-builder__metric-value">
                    {psuRecommendation}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
