import { createStore } from 'zustand/vanilla'
import { disables, enabledWhen, requires, strike, umpire } from '@umpire/core'
import { fromStore, type UmpireStore } from '@umpire/zustand'

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function $(selector: string, root: ParentNode): Element | null {
  return root.querySelector(selector)
}

function $$(selector: string, root: ParentNode): Element[] {
  return [...root.querySelectorAll(selector)]
}

function setText(el: Element | null, text: string) {
  if (el) el.textContent = text
}

function setAttr(el: Element | null, attr: string, value: string | boolean) {
  if (!el) return
  if (typeof value === 'boolean') {
    if (value) el.setAttribute(attr, '')
    else el.removeAttribute(attr)
    return
  }
  el.setAttribute(attr, value)
}

function toggleClass(el: Element | null, cls: string, on: boolean) {
  el?.classList.toggle(cls, on)
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

// ---------------------------------------------------------------------------
// Umpire setup
// ---------------------------------------------------------------------------

const printers = ['dotMatrix', 'colorLaser', 'inkjetPhoto'] as const
type PrinterType = (typeof printers)[number]

const fields = {
  printer:     { required: true, isEmpty: (v: unknown) => !v },
  copies:      { required: true, default: '1', isEmpty: (v: unknown) => !v },
  colorMode:   { isEmpty: (v: unknown) => !v },
  duplex:      {},
  paperSize:   { default: 'letter', isEmpty: (v: unknown) => !v },
  orientation: { default: 'portrait', isEmpty: (v: unknown) => !v },
  fitToPage:   {},
  quality:     { isEmpty: (v: unknown) => !v },
  bannerMode:  {},
  paperType:   { isEmpty: (v: unknown) => !v },
  collate:     {},
  staple:      {},
  holePunch:   {},
  pageRange:   { default: 'all', isEmpty: (v: unknown) => !v },
}

type PrintField = keyof typeof fields
type CheckboxField =
  | 'duplex'
  | 'fitToPage'
  | 'bannerMode'
  | 'collate'
  | 'staple'
  | 'holePunch'
type SelectField =
  | 'pageRange'
  | 'orientation'
  | 'paperSize'
  | 'colorMode'
  | 'quality'
  | 'paperType'
type DynamicSelectField = 'paperSize' | 'colorMode' | 'quality' | 'paperType'

export type PrintState = {
  printer: PrinterType
  copies: string
  colorMode: string
  duplex: boolean
  paperSize: string
  orientation: string
  fitToPage: boolean
  quality: string
  bannerMode: boolean
  paperType: string
  collate: boolean
  staple: boolean
  holePunch: boolean
  pageRange: string
}

type FieldGroupKey = 'general' | 'printerSpecific' | 'paper' | 'finishing'
type Option = { value: string; label: string }
type AvailabilityMap = ReturnType<typeof printerUmp.check>

const fieldOrder = [
  'printer',
  'copies',
  'pageRange',
  'orientation',
  'fitToPage',
  'colorMode',
  'duplex',
  'bannerMode',
  'paperType',
  'quality',
  'paperSize',
  'collate',
  'staple',
  'holePunch',
] as const satisfies readonly PrintField[]

const formFieldOrder = [
  'copies',
  'pageRange',
  'orientation',
  'fitToPage',
  'colorMode',
  'duplex',
  'bannerMode',
  'paperType',
  'quality',
  'paperSize',
  'collate',
  'staple',
  'holePunch',
] as const satisfies readonly Exclude<PrintField, 'printer'>[]

const checkboxFields = [
  'duplex',
  'fitToPage',
  'bannerMode',
  'collate',
  'staple',
  'holePunch',
] as const satisfies readonly CheckboxField[]

const selectFields = [
  'pageRange',
  'orientation',
  'paperSize',
  'colorMode',
  'quality',
  'paperType',
] as const satisfies readonly SelectField[]

const dynamicSelectFields = [
  'paperSize',
  'colorMode',
  'quality',
  'paperType',
] as const satisfies readonly DynamicSelectField[]

const groupOrder = [
  { key: 'general', label: 'General', fields: ['copies', 'pageRange', 'orientation', 'fitToPage'] },
  { key: 'printerSpecific', label: 'Printer-specific', fields: ['colorMode', 'duplex', 'bannerMode', 'paperType', 'quality'] },
  { key: 'paper', label: 'Paper', fields: ['paperSize'] },
  { key: 'finishing', label: 'Finishing', fields: ['collate', 'staple', 'holePunch'] },
] as const satisfies readonly {
  key: FieldGroupKey
  label: string
  fields: readonly Exclude<PrintField, 'printer'>[]
}[]

const fieldMeta: Record<
  PrintField,
  {
    label: string
    group?: FieldGroupKey
    kind: 'printer' | 'number' | 'select' | 'checkbox'
    checkboxLabel?: string
  }
> = {
  printer: { label: 'Printer', kind: 'printer' },
  copies: { label: 'Copies', group: 'general', kind: 'number' },
  pageRange: { label: 'Page Range', group: 'general', kind: 'select' },
  orientation: { label: 'Orientation', group: 'general', kind: 'select' },
  fitToPage: {
    label: 'Fit to Page',
    group: 'general',
    kind: 'checkbox',
    checkboxLabel: 'Scale content into the printable area',
  },
  colorMode: { label: 'Color Mode', group: 'printerSpecific', kind: 'select' },
  duplex: {
    label: 'Duplex',
    group: 'printerSpecific',
    kind: 'checkbox',
    checkboxLabel: 'Print on both sides',
  },
  bannerMode: {
    label: 'Banner Mode',
    group: 'printerSpecific',
    kind: 'checkbox',
    checkboxLabel: 'Use continuous tractor-feed paper',
  },
  paperType: { label: 'Paper Type', group: 'printerSpecific', kind: 'select' },
  quality: { label: 'Quality', group: 'printerSpecific', kind: 'select' },
  paperSize: { label: 'Paper Size', group: 'paper', kind: 'select' },
  collate: {
    label: 'Collate',
    group: 'finishing',
    kind: 'checkbox',
    checkboxLabel: 'Keep multi-copy sets in order',
  },
  staple: {
    label: 'Staple',
    group: 'finishing',
    kind: 'checkbox',
    checkboxLabel: 'Staple completed sets',
  },
  holePunch: {
    label: 'Hole Punch',
    group: 'finishing',
    kind: 'checkbox',
    checkboxLabel: 'Punch binder holes',
  },
}

const printerMeta: Record<
  PrinterType,
  {
    label: string
    icon: string
  }
> = {
  dotMatrix: {
    label: 'Dot-matrix',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="20" width="56" height="24" rx="3"/>
        <rect x="14" y="12" width="36" height="8" rx="1"/>
        <line x1="14" y1="12" x2="14" y2="6"/>
        <line x1="50" y1="12" x2="50" y2="6"/>
        <rect x="10" y="4" width="44" height="4" rx="1" stroke-dasharray="3 2"/>
        <circle cx="13" cy="6" r="1.2" fill="currentColor"/>
        <circle cx="13" cy="10" r="1.2" fill="currentColor"/>
        <circle cx="51" cy="6" r="1.2" fill="currentColor"/>
        <circle cx="51" cy="10" r="1.2" fill="currentColor"/>
        <rect x="16" y="44" width="32" height="3" rx="1"/>
        <rect x="18" y="47" width="28" height="10" rx="1" stroke-dasharray="4 2"/>
        <rect x="12" y="26" width="40" height="6" rx="1" opacity="0.5"/>
        <rect x="24" y="27" width="10" height="4" rx="1" fill="currentColor" opacity="0.6"/>
        <circle cx="50" cy="36" r="2" fill="currentColor" opacity="0.5"/>
      </svg>
    `,
  },
  colorLaser: {
    label: 'Color laser',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="10" width="48" height="38" rx="3"/>
        <rect x="12" y="48" width="40" height="8" rx="2"/>
        <rect x="24" y="50" width="16" height="2" rx="1" fill="currentColor" opacity="0.4"/>
        <path d="M14 10 L14 6 L50 6 L50 10" stroke-width="1.5"/>
        <rect x="18" y="4" width="28" height="4" rx="1" opacity="0.4" fill="currentColor"/>
        <rect x="14" y="16" width="20" height="8" rx="2" fill="currentColor" opacity="0.15"/>
        <line x1="17" y1="19" x2="28" y2="19" stroke-width="1" opacity="0.5"/>
        <line x1="17" y1="22" x2="24" y2="22" stroke-width="1" opacity="0.3"/>
        <circle cx="42" cy="18" r="2" fill="currentColor" opacity="0.5"/>
        <circle cx="42" cy="24" r="2" fill="currentColor" opacity="0.3"/>
        <circle cx="48" cy="18" r="2" fill="currentColor" opacity="0.3"/>
        <circle cx="48" cy="24" r="2" fill="currentColor" opacity="0.5"/>
        <circle cx="18" cy="36" r="2.5" fill="#00bcd4" opacity="0.7"/>
        <circle cx="26" cy="36" r="2.5" fill="#e91e63" opacity="0.7"/>
        <circle cx="34" cy="36" r="2.5" fill="#fdd835" opacity="0.7"/>
        <circle cx="42" cy="36" r="2.5" fill="#333" opacity="0.7" stroke="none"/>
      </svg>
    `,
  },
  inkjetPhoto: {
    label: 'Inkjet photo',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="22" width="52" height="22" rx="4"/>
        <path d="M10 22 Q10 14 20 14 L44 14 Q54 14 54 22" stroke-width="2"/>
        <path d="M16 14 L12 6 L52 6 L48 14" stroke-width="1.5"/>
        <rect x="16" y="4" width="32" height="4" rx="1" opacity="0.3" fill="currentColor"/>
        <rect x="14" y="44" width="36" height="2" rx="1"/>
        <rect x="16" y="46" width="32" height="14" rx="2" stroke-width="1.5"/>
        <path d="M20 54 L26 50 L30 53 L36 48 L44 54" stroke-width="1.5" opacity="0.5"/>
        <circle cx="40" cy="50" r="2" fill="currentColor" opacity="0.3"/>
        <line x1="16" y1="57" x2="48" y2="57" stroke-width="0.5" opacity="0.3"/>
        <circle cx="50" cy="30" r="2.5"/>
        <path d="M50 28 L50 30" stroke-width="1.5"/>
      </svg>
    `,
  },
}

const pageRangeOptions: Option[] = [
  { value: 'all', label: 'All pages' },
  { value: 'odd', label: 'Odd pages' },
  { value: 'even', label: 'Even pages' },
]

const orientationOptions: Option[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
]

const colorModeOptions: Option[] = [
  { value: 'bw', label: 'Black & white' },
  { value: 'color', label: 'Full color' },
]

const paperTypeOptions: Option[] = [
  { value: 'glossy', label: 'Glossy photo' },
  { value: 'luster', label: 'Luster' },
  { value: 'matte', label: 'Matte photo' },
  { value: 'fineArt', label: 'Fine art rag' },
]

const paperSizesByPrinter: Record<PrinterType, readonly string[]> = {
  dotMatrix: ['letter'],
  colorLaser: ['letter', 'legal', 'tabloid'],
  inkjetPhoto: ['letter', '4x6', '5x7', '8x10'],
}

const qualityByPrinter: Record<PrinterType, readonly string[]> = {
  dotMatrix: [],
  colorLaser: ['draft', 'normal', 'high'],
  inkjetPhoto: ['draft', 'normal', 'high', 'photo'],
}

const preferredSelectValues: Record<DynamicSelectField, string> = {
  paperSize: 'letter',
  colorMode: 'color',
  quality: 'normal',
  paperType: 'glossy',
}

const paperSizeLabels: Record<string, string> = {
  letter: 'Letter',
  legal: 'Legal',
  tabloid: 'Tabloid',
  '4x6': '4 x 6',
  '5x7': '5 x 7',
  '8x10': '8 x 10',
}

const qualityLabels: Record<string, string> = {
  draft: 'Draft',
  normal: 'Normal',
  high: 'High',
  photo: 'Photo',
}

const initialState: PrintState = {
  printer: 'dotMatrix',
  copies: '1',
  colorMode: 'color',
  duplex: false,
  paperSize: 'letter',
  orientation: 'portrait',
  fitToPage: false,
  quality: 'normal',
  bannerMode: false,
  paperType: 'glossy',
  collate: false,
  staple: false,
  holePunch: false,
  pageRange: 'all',
}

const printerUmp = umpire({
  fields,
  rules: [
    enabledWhen('colorMode', (v) => v.printer === 'colorLaser', {
      reason: 'This printer has a fixed color mode',
    }),
    enabledWhen('duplex', (v) => v.printer === 'colorLaser', {
      reason: 'Only the color laser supports duplex',
    }),
    enabledWhen('bannerMode', (v) => v.printer === 'dotMatrix', {
      reason: 'Banner mode is only available on the dot-matrix',
    }),
    enabledWhen('paperType', (v) => v.printer === 'inkjetPhoto', {
      reason: 'Paper type selection is only available on the photo printer',
    }),
    enabledWhen('staple', (v) => v.printer === 'colorLaser', {
      reason: 'Only the color laser has a stapler',
    }),
    enabledWhen('holePunch', (v) => v.printer === 'colorLaser', {
      reason: 'Only the color laser has a hole punch',
    }),
    enabledWhen('quality', (v) => v.printer !== 'dotMatrix', {
      reason: 'The dot-matrix has fixed print quality',
    }),
    disables('bannerMode', ['paperSize', 'orientation'], {
      reason: 'Banner mode uses continuous feed - no page boundaries',
    }),
    requires('collate', (v) => Number(v.copies) > 1, {
      reason: 'Collation requires multiple copies',
    }),
  ],
})

const printerAvailability = {} as Record<PrinterType, AvailabilityMap>
for (const printer of printers) {
  printerAvailability[printer] = printerUmp.check(
    toInputValues({
      ...initialState,
      printer,
      copies: '1',
      bannerMode: false,
      collate: false,
    }),
  )
}

const printerScopedFields = new Set<PrintField>()
for (const field of fieldOrder) {
  const baseline = printerAvailability[printers[0]][field].enabled
  if (printers.some((printer) => printerAvailability[printer][field].enabled !== baseline)) {
    printerScopedFields.add(field)
  }
}

const selectOptionsByPrinter = {} as Record<PrinterType, Record<DynamicSelectField, Option[]>>
for (const printer of printers) {
  selectOptionsByPrinter[printer] = {
    paperSize: paperSizesByPrinter[printer].map((value) => ({
      value,
      label: paperSizeLabels[value] ?? value,
    })),
    colorMode: printerAvailability[printer].colorMode.enabled ? colorModeOptions : [],
    quality: printerAvailability[printer].quality.enabled
      ? qualityByPrinter[printer].map((value) => ({
          value,
          label: qualityLabels[value] ?? value,
        }))
      : [],
    paperType: printerAvailability[printer].paperType.enabled ? paperTypeOptions : [],
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mount(root: HTMLElement) {
  const store = createStore<PrintState>(() => ({ ...initialState }))
  const umpStore: UmpireStore<typeof fields> = fromStore(printerUmp, store, {
    select: toInputValues,
  })

  root.innerHTML = renderShell()

  const foulsEl = $('.c-umpire-demo__fouls', root)
  const foulsListEl = $('.c-umpire-demo__fouls-list', root)
  const resetButton = $('.c-umpire-demo__reset-button', root) as HTMLButtonElement | null

  for (const button of $$('.c-printer-demo__printer-btn', root)) {
    button.addEventListener('click', () => {
      const nextPrinter = button.getAttribute('data-printer') as PrinterType | null
      if (!nextPrinter) return
      const current = store.getState()
      if (current.printer === nextPrinter) return
      store.setState(buildPrinterTransitionPatch(current, nextPrinter))
    })
  }

  const copiesInput = $('[data-field-control="copies"]', root) as HTMLInputElement | null
  copiesInput?.addEventListener('input', () => {
    store.setState({ copies: copiesInput.value })
  })

  for (const field of selectFields) {
    const select = $(`[data-field-control="${field}"]`, root) as HTMLSelectElement | null
    select?.addEventListener('change', () => {
      store.setState({ [field]: select.value } as Pick<PrintState, typeof field>)
    })
  }

  for (const field of checkboxFields) {
    const input = $(`[data-field-control="${field}"]`, root) as HTMLInputElement | null
    input?.addEventListener('change', () => {
      store.setState({ [field]: input.checked } as Pick<PrintState, typeof field>)
    })
  }

  resetButton?.addEventListener('click', () => {
    const current = store.getState()
    const next = strike(toInputValues(current), umpStore.fouls.map((foul) => ({
      ...foul,
      suggestedValue: coerceSuggestedValue(foul.field, foul.suggestedValue),
    })))

    store.setState({
      printer: (next.printer as PrinterType | undefined) ?? current.printer,
      copies: typeof next.copies === 'string' ? next.copies : current.copies,
      colorMode: typeof next.colorMode === 'string' ? next.colorMode : current.colorMode,
      duplex: next.duplex === true,
      paperSize: typeof next.paperSize === 'string' ? next.paperSize : current.paperSize,
      orientation: typeof next.orientation === 'string' ? next.orientation : current.orientation,
      fitToPage: next.fitToPage === true,
      quality: typeof next.quality === 'string' ? next.quality : current.quality,
      bannerMode: next.bannerMode === true,
      paperType: typeof next.paperType === 'string' ? next.paperType : current.paperType,
      collate: next.collate === true,
      staple: next.staple === true,
      holePunch: next.holePunch === true,
      pageRange: typeof next.pageRange === 'string' ? next.pageRange : current.pageRange,
    })
  })

  const unsubscribeStore = store.subscribe((state) => {
    renderForm(root, state, umpStore.getAvailability())
    renderFouls(foulsEl, foulsListEl, resetButton, umpStore.fouls)
  })

  const initialAvailability = umpStore.getAvailability()
  renderForm(root, store.getState(), initialAvailability)
  renderFouls(foulsEl, foulsListEl, resetButton, umpStore.fouls)

  return () => {
    unsubscribeStore()
    umpStore.destroy()
    root.replaceChildren()
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderForm(root: HTMLElement, state: PrintState, availability: AvailabilityMap) {
  syncPrinterButtons(root, state.printer)
  setText($('[data-state-json]', root), prettyJson(state))

  for (const field of selectFields) {
    const select = $(`[data-field-control="${field}"]`, root) as HTMLSelectElement | null
    if (!select) continue
    syncSelectOptions(select, getSelectOptions(field, state.printer))
  }

  for (const field of formFieldOrder) {
    const shell = $(`[data-field-shell="${field}"]`, root)
    const reasonEl = $(`[data-field-reason="${field}"]`, root)
    const requiredEl = $(`[data-field-required="${field}"]`, root)
    const statusEl = $(`[data-field-status="${field}"]`, root)
    const statusTextEl = $(`[data-field-status-text="${field}"]`, root)
    const control = $(`[data-field-control="${field}"]`, root) as HTMLInputElement | HTMLSelectElement | null
    if (!shell || !control) continue

    const visible = isFieldVisibleForPrinter(field, state.printer)
    const fieldAvailability = availability[field]
    const disabled = visible && !fieldAvailability.enabled

    toggleClass(shell, 'c-umpire-demo__field is-disabled', !visible || disabled)
    toggleClass(statusEl, 'c-umpire-demo__status is-enabled', fieldAvailability.enabled)
    toggleClass(statusEl, 'c-umpire-demo__status is-disabled', !fieldAvailability.enabled)

    control.disabled = !visible || disabled
    syncControlValue(control, field, state)
    setAttr(requiredEl, 'hidden', !fieldAvailability.required)
    setText(statusTextEl, fieldAvailability.enabled ? 'enabled' : 'disabled')
    setText(reasonEl, disabled ? fieldAvailability.reason ?? 'Unavailable' : '')
  }

  for (const group of groupOrder) {
    const groupEl = $(`[data-field-group="${group.key}"]`, root)
    if (!groupEl) continue
    const anyVisible = group.fields.some((field) => isFieldVisibleForPrinter(field, state.printer))
    toggleClass(groupEl, 'c-umpire-demo__field is-disabled', !anyVisible)
  }
}

function renderFouls(
  foulsEl: Element | null,
  foulsListEl: Element | null,
  resetButton: HTMLButtonElement | null,
  fouls: UmpireStore<typeof fields>['fouls'],
) {
  toggleClass(foulsEl, 'c-umpire-demo__fouls is-visible', fouls.length > 0)
  setAttr(resetButton, 'disabled', fouls.length === 0)

  if (!foulsListEl) return
  foulsListEl.replaceChildren()

  for (const foul of fouls) {
    const row = document.createElement('div')
    row.className = 'c-umpire-demo__foul'

    const fieldSpan = document.createElement('span')
    fieldSpan.className = 'c-umpire-demo__foul-field'
    fieldSpan.textContent = fieldMeta[foul.field].label

    const reasonSpan = document.createElement('span')
    reasonSpan.className = 'c-umpire-demo__foul-reason'
    reasonSpan.textContent = foul.reason

    row.append(fieldSpan, reasonSpan)
    foulsListEl.append(row)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInputValues(state: PrintState) {
  return {
    printer: state.printer,
    copies: state.copies,
    colorMode: state.colorMode,
    duplex: state.duplex ? true : undefined,
    paperSize: state.paperSize,
    orientation: state.orientation,
    fitToPage: state.fitToPage ? true : undefined,
    quality: state.quality,
    bannerMode: state.bannerMode ? true : undefined,
    paperType: state.paperType,
    collate: state.collate ? true : undefined,
    staple: state.staple ? true : undefined,
    holePunch: state.holePunch ? true : undefined,
    pageRange: state.pageRange,
  }
}

function isFieldVisibleForPrinter(field: PrintField, printer: PrinterType) {
  return printerScopedFields.has(field) ? printerAvailability[printer][field].enabled : true
}

function getSelectOptions(field: SelectField, printer: PrinterType): Option[] {
  switch (field) {
    case 'pageRange':
      return pageRangeOptions
    case 'orientation':
      return orientationOptions
    case 'paperSize':
    case 'colorMode':
    case 'quality':
    case 'paperType':
      return selectOptionsByPrinter[printer][field]
  }
}

function syncSelectOptions(select: HTMLSelectElement, options: Option[]) {
  const signature = options.map((option) => option.value).join('|')
  if (select.dataset.optionSignature === signature) {
    return
  }

  const nodes = options.map((option) => {
    const el = document.createElement('option')
    el.value = option.value
    el.textContent = option.label
    return el
  })

  select.replaceChildren(...nodes)
  select.dataset.optionSignature = signature
}

function syncPrinterButtons(root: HTMLElement, printer: PrinterType) {
  for (const button of $$('.c-printer-demo__printer-btn', root)) {
    const isActive = button.getAttribute('data-printer') === printer
    toggleClass(button, 'c-umpire-demo__plan-option is-active', isActive)
    setAttr(button, 'aria-pressed', isActive)
  }
}

function syncControlValue(
  control: HTMLInputElement | HTMLSelectElement,
  field: Exclude<PrintField, 'printer'>,
  state: PrintState,
) {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = state[field] === true
    return
  }

  const nextValue = state[field]
  control.value = typeof nextValue === 'string' ? nextValue : ''
}

function buildPrinterTransitionPatch(
  state: PrintState,
  nextPrinter: PrinterType,
): Partial<PrintState> {
  const patch: Partial<PrintState> = { printer: nextPrinter }

  for (const field of dynamicSelectFields) {
    if (!isFieldVisibleForPrinter(field, nextPrinter)) {
      continue
    }

    const nextValue = normalizeVisibleSelectValue(field, nextPrinter, state[field])
    if (nextValue !== state[field]) {
      ;(patch as Record<string, unknown>)[field] = nextValue
    }
  }

  return patch
}

function normalizeVisibleSelectValue(
  field: DynamicSelectField,
  printer: PrinterType,
  currentValue: string,
) {
  const options = selectOptionsByPrinter[printer][field]
  if (options.some((option) => option.value === currentValue)) {
    return currentValue
  }

  const preferred = preferredSelectValues[field]
  if (options.some((option) => option.value === preferred)) {
    return preferred
  }

  return options[0]?.value ?? ''
}

function coerceSuggestedValue(field: PrintField, suggestedValue: unknown) {
  switch (field) {
    case 'printer':
      return (suggestedValue as PrinterType | undefined) ?? initialState.printer
    case 'duplex':
    case 'fitToPage':
    case 'bannerMode':
    case 'collate':
    case 'staple':
    case 'holePunch':
      return suggestedValue === true
    default:
      return typeof suggestedValue === 'string' ? suggestedValue : ''
  }
}

function renderShell(): string {
  return `
    <div class="c-printer-demo__frame">
      <section class="c-umpire-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">Vanilla Zustand + Umpire</div>
            <h2 class="c-umpire-demo__title">Print Settings</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">store.setState() + fromStore()</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          <div class="c-zustand-demo__callout">
            <span class="c-zustand-demo__badge">pure dom</span>
            <p class="c-zustand-demo__callout-text">
              Printer buttons and native inputs mutate a vanilla Zustand store.
              Umpire reshapes the dialog, disables incompatible settings, and flags stale state.
            </p>
          </div>

          <section class="c-printer-demo__field-group">
            <div class="c-printer-demo__group-label c-umpire-demo__eyebrow">Printer</div>
            <div class="c-printer-demo__selector" role="group" aria-label="Printer">
              ${printers.map((printer) => `
                <button
                  type="button"
                  class="c-umpire-demo__plan-option c-printer-demo__printer-btn${printer === initialState.printer ? ' c-umpire-demo__plan-option is-active' : ''}"
                  data-printer="${printer}"
                  aria-pressed="${printer === initialState.printer ? 'true' : 'false'}"
                >
                  <span class="c-printer-demo__printer-icon" aria-hidden="true">
                    ${printerMeta[printer].icon}
                  </span>
                  <span class="c-printer-demo__printer-label">${printerMeta[printer].label}</span>
                </button>
              `).join('')}
            </div>
          </section>

          <div class="c-umpire-demo__fouls">
            <div class="c-umpire-demo__fouls-copy">
              <div class="c-umpire-demo__fouls-kicker">Reset recommendations</div>
              <div class="c-umpire-demo__fouls-list"></div>
            </div>
            <button type="button" class="c-umpire-demo__reset-button" disabled>Apply resets</button>
          </div>

          <div class="c-umpire-demo__fields c-printer-demo__groups">
            ${groupOrder.map((group) => `
              <section class="c-printer-demo__field-group" data-field-group="${group.key}">
                <div class="c-printer-demo__group-label c-umpire-demo__eyebrow">${group.label}</div>
                <div class="c-printer-demo__group-fields">
                  ${group.fields.map((field) => renderFieldShell(field)).join('')}
                </div>
              </section>
            `).join('')}
          </div>

          <section class="c-umpire-demo__json-shell">
            <div class="c-umpire-demo__json-header">
              <span class="c-umpire-demo__json-title">store.getState()</span>
              <span class="c-umpire-demo__json-meta">zustand/vanilla</span>
            </div>
            <pre class="c-umpire-demo__code-block"><code data-state-json></code></pre>
          </section>
        </div>
      </section>
    </div>
  `
}

function renderFieldShell(field: Exclude<PrintField, 'printer'>): string {
  const meta = fieldMeta[field]
  const id = `printer-demo-${field}`

  if (meta.kind === 'checkbox') {
    return `
      <div class="c-umpire-demo__field" data-field-shell="${field}">
        <div class="c-umpire-demo__field-header">
          <div class="c-umpire-demo__field-label">
            <label class="c-printer-demo__field-title" for="${id}">${meta.label}</label>
            <span class="c-umpire-demo__required-pill" data-field-required="${field}" hidden>required</span>
          </div>
          <div class="c-umpire-demo__status c-umpire-demo__status is-enabled" data-field-status="${field}">
            <span class="c-umpire-demo__status-dot"></span>
            <span class="c-umpire-demo__status-text" data-field-status-text="${field}">enabled</span>
          </div>
        </div>
        <label class="c-printer-demo__checkbox-row" for="${id}">
          <input id="${id}" type="checkbox" data-field-control="${field}" />
          <span>${meta.checkboxLabel}</span>
        </label>
        <div class="c-umpire-demo__field-reason" data-field-reason="${field}"></div>
      </div>
    `
  }

  if (meta.kind === 'number') {
    return `
      <div class="c-umpire-demo__field" data-field-shell="${field}">
        <div class="c-umpire-demo__field-header">
          <div class="c-umpire-demo__field-label">
            <label class="c-printer-demo__field-title" for="${id}">${meta.label}</label>
            <span class="c-umpire-demo__required-pill" data-field-required="${field}" hidden>required</span>
          </div>
          <div class="c-umpire-demo__status c-umpire-demo__status is-enabled" data-field-status="${field}">
            <span class="c-umpire-demo__status-dot"></span>
            <span class="c-umpire-demo__status-text" data-field-status-text="${field}">enabled</span>
          </div>
        </div>
        <input
          id="${id}"
          class="c-umpire-demo__input"
          type="number"
          min="1"
          max="99"
          inputmode="numeric"
          data-field-control="${field}"
        />
        <div class="c-umpire-demo__field-reason" data-field-reason="${field}"></div>
      </div>
    `
  }

  return `
    <div class="c-umpire-demo__field" data-field-shell="${field}">
      <div class="c-umpire-demo__field-header">
        <div class="c-umpire-demo__field-label">
          <label class="c-printer-demo__field-title" for="${id}">${meta.label}</label>
          <span class="c-umpire-demo__required-pill" data-field-required="${field}" hidden>required</span>
        </div>
        <div class="c-umpire-demo__status c-umpire-demo__status is-enabled" data-field-status="${field}">
          <span class="c-umpire-demo__status-dot"></span>
          <span class="c-umpire-demo__status-text" data-field-status-text="${field}">enabled</span>
        </div>
      </div>
      <select id="${id}" class="c-umpire-demo__input" data-field-control="${field}"></select>
      <div class="c-umpire-demo__field-reason" data-field-reason="${field}"></div>
    </div>
  `
}
