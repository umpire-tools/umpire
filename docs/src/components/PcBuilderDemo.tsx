import { useMemo, useState, type ReactNode } from 'react'
import { enabledWhen, fairWhen, requires, umpire, type Snapshot } from '@umpire/core'
import { createHistoryFlags } from '../lib/createHistoryFlags.ts'
import { inspectUmpre } from '../lib/inspectUmpre.ts'
import '../styles/pc-builder-demo.css'

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

const pcFields = {
  cpu:         { required: true, isEmpty: (value: unknown) => !value },
  motherboard: { required: true, isEmpty: (value: unknown) => !value },
  ram:         { required: true, isEmpty: (value: unknown) => !value },
  gpu:         { isEmpty: (value: unknown) => !value },
  storage:     { isEmpty: (value: unknown) => !value },
  caseSize:    { required: true, isEmpty: (value: unknown) => !value },
}

type PcField = keyof typeof pcFields

type PcConditions = Record<string, never>

const pcUmp = umpire<typeof pcFields, PcConditions>({
  fields: pcFields,
  rules: [
    requires('motherboard', 'cpu', {
      reason: 'Pick a CPU first',
    }),
    fairWhen('motherboard', (value, values) => {
      const selectedCpu = cpuById[asString(values.cpu)]
      const selectedMotherboard = motherboardById[asString(value)]

      return Boolean(
        selectedCpu &&
        selectedMotherboard &&
        selectedMotherboard.socket === selectedCpu.socket,
      )
    }, {
      reason: 'Selected motherboard no longer matches the CPU socket',
    }),

    requires('ram', 'motherboard', {
      reason: 'Memory depends on an active motherboard selection',
    }),
    fairWhen('ram', (value, values) => {
      const selectedMotherboard = motherboardById[asString(values.motherboard)]
      const selectedRam = ramById[asString(value)]

      return Boolean(
        selectedMotherboard &&
        selectedRam &&
        selectedRam.type === selectedMotherboard.ramType,
      )
    }, {
      reason: 'Selected memory no longer matches the motherboard RAM type',
    }),

    requires('caseSize', 'motherboard', {
      reason: 'Pick a valid motherboard first to determine form factor',
    }),
    fairWhen('caseSize', (value, values) => {
      const selectedMotherboard = motherboardById[asString(values.motherboard)]
      const selectedCase = caseById[asString(value)]

      return Boolean(
        selectedMotherboard &&
        selectedCase &&
        fitsFormFactor(selectedCase.fits, selectedMotherboard.formFactor),
      )
    }, {
      reason: 'Selected case no longer fits the motherboard form factor',
    }),
  ],
})

type CoachConditions = {
  cpuBrand?: CpuBrand
  hasRamSelection: boolean
  sawTransitiveCascade: boolean
  sawAppliedResets: boolean
}

const coachFields = {
  promptSwitchCpu:   {},
  explainTransitive: {},
  celebrateComplete: {},
}

const coachUmp = umpire<typeof coachFields, CoachConditions>({
  fields: coachFields,
  rules: [
    enabledWhen('promptSwitchCpu', (_values, conditions) =>
      conditions.hasRamSelection && conditions.cpuBrand === 'intel', {
      reason: 'Complete steps 1-3 with Intel first',
    }),
    enabledWhen('explainTransitive', (_values, conditions) =>
      conditions.sawTransitiveCascade, {
      reason: 'Trigger the transitive cascade first',
    }),
    enabledWhen('celebrateComplete', (_values, conditions) =>
      conditions.sawTransitiveCascade && conditions.sawAppliedResets, {
      reason: 'Apply the suggested resets first',
    }),
  ],
})

type PcValues = ReturnType<typeof pcUmp.init>
type PcCheck = ReturnType<typeof pcUmp.check>
type CoachCheck = ReturnType<typeof coachUmp.check>
type PcSnapshot = Snapshot<typeof pcFields, PcConditions>

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

function indexById<T extends { id: string }>(items: readonly T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Partial<Record<string, T>>
}

const cpuById = indexById(cpus)
const motherboardById = indexById(motherboards)
const ramById = indexById(ramKits)
const gpuById = indexById(gpus)
const storageById = indexById(storageOptions)
const caseById = indexById(caseOptions)
const coachHistory = createHistoryFlags([
  'sawTransitiveCascade',
  'sawAppliedResets',
] as const)

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

function resolvePcCatalog(values: PcValues) {
  const cpuId = asString(values.cpu)
  const motherboardId = asString(values.motherboard)
  const ramId = asString(values.ram)
  const gpuId = asString(values.gpu)
  const storageId = asString(values.storage)
  const caseId = asString(values.caseSize)

  const selectedCpu = cpuById[cpuId]
  const selectedMotherboard = motherboardById[motherboardId]
  const selectedRam = ramById[ramId]
  const selectedGpu = gpuById[gpuId]
  const selectedStorage = storageById[storageId]
  const selectedCase = caseById[caseId]

  const motherboardCompatible = !motherboardId || Boolean(
    selectedCpu &&
    selectedMotherboard &&
    selectedMotherboard.socket === selectedCpu.socket,
  )

  const activeMotherboard = motherboardCompatible ? selectedMotherboard : undefined

  const ramCompatible = !ramId || Boolean(
    activeMotherboard &&
    selectedRam &&
    selectedRam.type === activeMotherboard.ramType,
  )

  const caseCompatible = !caseId || Boolean(
    activeMotherboard &&
    selectedCase &&
    fitsFormFactor(selectedCase.fits, activeMotherboard.formFactor),
  )

  const compatibleMotherboards = selectedCpu
    ? motherboards.filter((board) => board.socket === selectedCpu.socket)
    : []

  const compatibleRamKits = activeMotherboard
    ? ramKits.filter((kit) => kit.type === activeMotherboard.ramType)
    : []

  const compatibleCases = activeMotherboard
    ? caseOptions.filter((size) => fitsFormFactor(size.fits, activeMotherboard.formFactor))
    : []

  return {
    cpuId,
    motherboardId,
    ramId,
    gpuId,
    storageId,
    caseId,
    selectedCpu,
    selectedMotherboard,
    selectedRam,
    selectedGpu,
    selectedStorage,
    selectedCase,
    motherboardCompatible,
    activeMotherboard,
    ramCompatible,
    caseCompatible,
    compatibleMotherboards,
    compatibleRamKits,
    compatibleCases,
    psuRecommendation: getPsuRecommendation(selectedCpu?.tier, selectedGpu?.tier),
  }
}

function hasTransitiveCascade(fouls: Array<{ field: string }>) {
  const foulFields = new Set(fouls.map((foul) => foul.field))
  return foulFields.has('motherboard') && foulFields.has('ram')
}

type PcCatalogFacts = ReturnType<typeof resolvePcCatalog>

function describePcField(field: PcField, facts: PcCatalogFacts) {
  if (field === 'cpu' && facts.selectedCpu) {
    return {
      brand: facts.selectedCpu.brand,
      socket: facts.selectedCpu.socket,
      tier: facts.selectedCpu.tier,
    }
  }

  if (field === 'motherboard') {
    return {
      compatible: facts.motherboardCompatible,
      choiceCount: facts.compatibleMotherboards.length,
      selectedSocket: facts.selectedMotherboard?.socket,
      selectedFormFactor: facts.selectedMotherboard?.formFactor,
      selectedRamType: facts.selectedMotherboard?.ramType,
      expectedSocket: facts.selectedCpu?.socket,
    }
  }

  if (field === 'ram') {
    return {
      compatible: facts.ramCompatible,
      choiceCount: facts.compatibleRamKits.length,
      selectedType: facts.selectedRam?.type,
      expectedType: facts.activeMotherboard?.ramType,
    }
  }

  if (field === 'caseSize') {
    return {
      compatible: facts.caseCompatible,
      choiceCount: facts.compatibleCases.length,
      selectedFits: facts.selectedCase?.fits,
      expectedFormFactor: facts.activeMotherboard?.formFactor,
    }
  }

  if (field === 'gpu' && facts.selectedGpu) {
    return {
      tier: facts.selectedGpu.tier,
    }
  }

  if (field === 'storage' && facts.selectedStorage) {
    return {
      label: facts.selectedStorage.label,
    }
  }

  return undefined
}

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
        'pc-builder__field',
        !availability.enabled && 'pc-builder__field--disabled',
        (!availability.fair || foul) && 'pc-builder__field--fouled',
      )}
    >
      <div className="pc-builder__field-header">
        <div className="pc-builder__field-copy">
          <label className="pc-builder__field-label" htmlFor={id}>
            {label}
          </label>
          <p className="pc-builder__field-detail">{detail}</p>
        </div>
        {availability.required && (
          <span className="pc-builder__required">Required</span>
        )}
      </div>

      <div className="pc-builder__select-shell">
        <select
          id={id}
          className="pc-builder__select"
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
        <span className="pc-builder__select-caret" aria-hidden="true">
          ▾
        </span>
      </div>

      {meta}

      {foul ? (
        <div className="umpire-demo__field-foul">
          <span className="umpire-demo__field-foul-reason">{foul.reason}</span>
        </div>
      ) : (
        (!availability.enabled || !availability.fair) && availability.reason && (
          <div className="umpire-demo__field-reason">{availability.reason}</div>
        )
      )}
    </div>
  )
}

function CoachCallout({
  title,
  copy,
}: {
  title: string
  copy: string
}) {
  return (
    <div className="pc-builder__coach">
      <div className="pc-builder__coach-kicker">{title}</div>
      <p className="pc-builder__coach-copy">{copy}</p>
    </div>
  )
}

export default function PcBuilderDemo() {
  const [values, setValues] = useState<PcValues>(() => pcUmp.init())
  const [coachMemory, setCoachMemory] = useState(() => coachHistory.init())
  const [currentStep, setCurrentStep] = useState(0)
  const [lastTransition, setLastTransition] = useState<{ before: PcSnapshot } | null>(null)
  const catalogFacts = useMemo(() => resolvePcCatalog(values), [values])
  const {
    cpuId,
    motherboardId,
    ramId,
    gpuId,
    storageId,
    caseId,
    selectedCpu,
    selectedMotherboard,
    selectedRam,
    selectedGpu,
    selectedStorage,
    selectedCase,
    motherboardCompatible,
    activeMotherboard,
    ramCompatible,
    caseCompatible,
    compatibleMotherboards,
    compatibleRamKits,
    compatibleCases,
    psuRecommendation,
  } = catalogFacts
  const fieldFacts = useMemo(() => ({
    cpu: describePcField('cpu', catalogFacts),
    motherboard: describePcField('motherboard', catalogFacts),
    ram: describePcField('ram', catalogFacts),
    gpu: describePcField('gpu', catalogFacts),
    storage: describePcField('storage', catalogFacts),
    caseSize: describePcField('caseSize', catalogFacts),
  }), [catalogFacts])

  const motherboardChoices = buildChoices(
    compatibleMotherboards.map((board) => ({
      value: board.id,
      label: `${board.label} · ${board.formFactor} · ${formatRamType(board.ramType)}`,
    })),
    motherboardId,
    selectedMotherboard?.label,
    Boolean(motherboardId && !motherboardCompatible),
  )

  const ramChoices = buildChoices(
    compatibleRamKits.map((kit) => ({
      value: kit.id,
      label: `${kit.label} · ${formatRamType(kit.type)}`,
    })),
    ramId,
    selectedRam?.label,
    Boolean(ramId && !ramCompatible),
  )

  const caseChoices = buildChoices(
    compatibleCases.map((size) => ({
      value: size.id,
      label: `${size.label} · fits ${size.fits.join(', ')}`,
    })),
    caseId,
    selectedCase?.label,
    Boolean(caseId && !caseCompatible),
  )

  const inspection = useMemo(() => inspectUmpre(pcUmp, {
    values,
  }, {
    before: lastTransition?.before,
    facts: catalogFacts,
    fieldFacts,
    fields: pcFields,
  }), [
    values,
    lastTransition,
    catalogFacts,
    fieldFacts,
  ])
  const { check } = inspection
  const fouls = inspection.transition.fouls
  const foulsByField = inspection.transition.foulsByField
  const hasLiveTransitiveCascade = (
    inspection.transition.cascadingFields.includes('motherboard') &&
    inspection.transition.cascadingFields.includes('ram')
  )

  // COACH NOTE: The seam is a tiny bit of remembered history, updated only
  // when a transition happens. Rendering still just reads live facts + memory.
  const coachConditions = useMemo<CoachConditions>(() => ({
    cpuBrand: inspection.fields.cpu.facts?.brand as CpuBrand | undefined,
    hasRamSelection: inspection.fields.ram.satisfied,
    sawTransitiveCascade: coachMemory.sawTransitiveCascade || hasLiveTransitiveCascade,
    sawAppliedResets: coachMemory.sawAppliedResets,
  }), [
    inspection,
    hasLiveTransitiveCascade,
    coachMemory,
  ])

  const coachCheck = useMemo<CoachCheck>(
    () => coachUmp.check(coachUmp.init(), coachConditions),
    [coachConditions],
  )

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
    setCoachMemory((current) => coachHistory.remember(current, {
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
    setCoachMemory((current) => coachHistory.remember(current, {
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
        ? `${selectedMotherboard.label}${motherboardId && !motherboardCompatible ? ' (stale)' : ''}`
        : 'No motherboard selected yet'
    }

    if (step.index === 2) {
      return selectedRam
        ? `${selectedRam.label}${ramId && !ramCompatible ? ' (stale)' : ''}`
        : 'No memory selected yet'
    }

    if (step.index === 3) {
      const storageLabel = selectedStorage?.label ?? 'No storage'
      const gpuLabel = selectedGpu?.label ?? 'No GPU'
      return `${storageLabel} · ${gpuLabel}`
    }

    return selectedCase
      ? `${selectedCase.label}${caseId && !caseCompatible ? ' (stale)' : ''}`
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
            <div className="pc-builder__spec-list">
              <span className="pc-builder__spec">Socket {selectedCpu.socket}</span>
              <span className="pc-builder__spec">{formatTier(selectedCpu.tier)}</span>
            </div>
          ) : (
            <div className="pc-builder__field-note">
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
            <div className="pc-builder__spec-list">
              <span className="pc-builder__spec">Socket {selectedMotherboard.socket}</span>
              <span className="pc-builder__spec">{selectedMotherboard.formFactor}</span>
              <span className="pc-builder__spec">{formatRamType(selectedMotherboard.ramType)}</span>
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
            <div className="pc-builder__spec-list">
              <span className="pc-builder__spec">{formatRamType(selectedRam.type)}</span>
              <span className="pc-builder__spec">{selectedRam.size}GB</span>
            </div>
          )}
        />
      )
    }

    if (step.index === 3) {
      return (
        <>
          <div className="pc-builder__field-grid">
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
                <div className="pc-builder__field-note">
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
                <div className="pc-builder__spec-list">
                  <span className="pc-builder__spec">{formatTier(selectedGpu.tier)}</span>
                </div>
              )}
            />
          </div>

          <div className="pc-builder__insight">
            <div className="pc-builder__insight-kicker">UI-only derived value</div>
            <div className="pc-builder__insight-title">{psuRecommendation} PSU recommendation</div>
            <p className="pc-builder__insight-copy">
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
          <div className="pc-builder__spec-list">
            <span className="pc-builder__spec">Fits {selectedCase.fits.join(', ')}</span>
          </div>
        )}
      />
    )
  }

  // COACH NOTE: The coach rules only decide visibility. Step placement, ordering,
  // and copy still live in the component, which is workable but manual.
  function renderCoachCallout(step: StepDefinition, coachAvailability: CoachCheck) {
    if (step.index === 1 && coachAvailability.explainTransitive.enabled) {
      return (
        <CoachCallout
          title="Coach Call"
          copy="The CPU switch only directly broke the motherboard. RAM fell with it because requires() follows dependency availability, so the stale upstream board shut Memory down too."
        />
      )
    }

    if (step.index === 2 && coachAvailability.promptSwitchCpu.enabled) {
      return (
        <CoachCallout
          title="Coach Call"
          copy="You have an Intel board and matching RAM. Jump back to Platform and switch to AMD now. Watch Motherboard, Memory, and Case all get called for stale state."
        />
      )
    }

    if (step.index === 4 && coachAvailability.celebrateComplete.enabled) {
      return (
        <CoachCallout
          title="Coach Call"
          copy="That was the whole trick: filtering stayed in the UI, but play() still turned stale downstream state into guided reset recommendations."
        />
      )
    }

    return null
  }

  return (
    <div className="pc-builder-demo umpire-demo">
      {fouls.length > 0 && (
        <div className="umpire-demo__fouls">
          <div className="umpire-demo__fouls-copy">
            <div className="umpire-demo__fouls-kicker">Fouls</div>
            <div className="umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="umpire-demo__foul">
                  <span className="umpire-demo__foul-field">{fieldMeta[foul.field].label}</span>
                  <span className="umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="umpire-demo__reset-button"
            onClick={applyResets}
          >
            Apply resets
          </button>
        </div>
      )}

      <div className="pc-builder__layout">
        <div className="pc-builder__steps">
          {steps.map((step) => {
            const activeFouls = stepFouls(step)
            const status = getStepStatus(step)
            const expanded = currentStep === step.index || activeFouls.length > 0

            return (
              <section
                key={step.index}
                className={cls(
                  'pc-builder__step',
                  expanded && 'pc-builder__step--expanded',
                  activeFouls.length > 0 && 'pc-builder__step--fouled',
                )}
              >
                <button
                  type="button"
                  className="pc-builder__step-toggle"
                  aria-expanded={expanded}
                  onClick={() => setCurrentStep(step.index)}
                >
                  <div className="pc-builder__step-copy">
                    <span className="pc-builder__step-number">
                      {String(step.index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="pc-builder__step-title">{step.title}</div>
                      <p className="pc-builder__step-caption">{step.caption}</p>
                    </div>
                  </div>

                  <div className="pc-builder__step-meta">
                    {activeFouls.length > 0 && (
                      <span className="pc-builder__foul-badge">
                        {pluralize('foul', activeFouls.length)}
                      </span>
                    )}

                    <span
                      className={cls(
                        'umpire-demo__status',
                        status.tone === 'fouled' && 'umpire-demo__status--fouled',
                        status.tone === 'enabled' && 'umpire-demo__status--enabled',
                        status.tone === 'disabled' && 'umpire-demo__status--disabled',
                      )}
                    >
                      <span className="umpire-demo__status-dot" />
                      <span className="umpire-demo__status-text">{status.label}</span>
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="pc-builder__step-body">
                    {renderStepBody(step)}
                  </div>
                )}

                {renderCoachCallout(step, coachCheck)}
              </section>
            )
          })}
        </div>

        <aside className="pc-builder__sidebar">
          <section className="pc-builder__summary">
            <div className="pc-builder__panel-header">
              <div>
                <div className="pc-builder__eyebrow">Sidebar summary</div>
                <h2 className="pc-builder__panel-title">Build state</h2>
              </div>
              <span className="pc-builder__panel-accent">play() wizard</span>
            </div>

            <div className="pc-builder__summary-body">
              <div className="pc-builder__summary-list">
                {steps.map((step) => {
                  const activeFouls = stepFouls(step)

                  return (
                    <button
                      key={step.index}
                      type="button"
                      className={cls(
                        'pc-builder__summary-item',
                        currentStep === step.index && 'pc-builder__summary-item--active',
                        activeFouls.length > 0 && 'pc-builder__summary-item--fouled',
                      )}
                      onClick={() => setCurrentStep(step.index)}
                    >
                      <div className="pc-builder__summary-row">
                        <span className="pc-builder__summary-step">
                          {String(step.index + 1).padStart(2, '0')} · {step.title}
                        </span>
                        {activeFouls.length > 0 && (
                          <span className="pc-builder__summary-fouls">{activeFouls.length}</span>
                        )}
                      </div>
                      <div className="pc-builder__summary-copy">{getStepSummary(step)}</div>
                    </button>
                  )
                })}
              </div>

              <div className="pc-builder__metrics">
                <div className="pc-builder__metric">
                  <span className="pc-builder__metric-label">Boards</span>
                  <strong className="pc-builder__metric-value">
                    {compatibleMotherboards.length}
                  </strong>
                </div>

                <div className="pc-builder__metric">
                  <span className="pc-builder__metric-label">RAM kits</span>
                  <strong className="pc-builder__metric-value">
                    {compatibleRamKits.length}
                  </strong>
                </div>

                <div className="pc-builder__metric">
                  <span className="pc-builder__metric-label">Cases</span>
                  <strong className="pc-builder__metric-value">
                    {compatibleCases.length}
                  </strong>
                </div>

                <div className="pc-builder__metric">
                  <span className="pc-builder__metric-label">PSU</span>
                  <strong className="pc-builder__metric-value">
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
