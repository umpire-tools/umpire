import { useState } from 'react'
import type { DateRange, Month } from '@neo-reckoning/core'
import { useCalendar } from '@neo-reckoning/react'
import { disables, enabledWhen, oneOf, requires, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/react'
import '../styles/calendar-demo.css'

const calendarFields = {
  // Date bounds
  fromDate:     {},
  toDate:       {},
  fixedBetween: { default: false },

  // Explicit dates (overrides patterns)
  dates:        {},

  // Day-level recurrence patterns
  everyWeekday: {},
  everyDate:    {},
  everyMonth:   {},

  // Exclusions from patterns
  exceptDates:   {},
  exceptBetween: {},

  // Sub-day strategy A: specific hours
  everyHour: {},

  // Sub-day strategy B: time interval
  startTime:   {},
  endTime:     {},
  repeatEvery: {},

  // Shared
  duration: {},
}

const calendarUmp = umpire({
  fields: calendarFields,
  rules: [
    // Explicit dates shut down everything pattern-based
    disables('dates', [
      'everyWeekday', 'everyDate', 'everyMonth',
      'everyHour', 'startTime', 'endTime', 'repeatEvery',
      'exceptDates', 'exceptBetween',
    ]),

    // Pick one: specific hours OR a time interval
    oneOf('subDayStrategy', {
      hourList: ['everyHour'],
      interval: ['startTime', 'endTime', 'repeatEvery'],
    }),

    // Interval fields chain off startTime
    requires('repeatEvery', 'startTime'),
    requires('endTime', 'startTime'),

    // Bounds toggle only meaningful when both dates exist
    enabledWhen('fixedBetween',
      ({ fromDate, toDate }) => !!fromDate && !!toDate),

    // Exclusions only meaningful when patterns exist
    enabledWhen('exceptDates',
      (v) => !!(v.everyWeekday || v.everyDate || v.everyMonth)),
    enabledWhen('exceptBetween',
      (v) => !!(v.everyWeekday || v.everyDate || v.everyMonth)),
  ],
})

type CalendarField = keyof typeof calendarFields
type CalendarValues = ReturnType<typeof calendarUmp.init>
type AvailabilityMap = ReturnType<typeof calendarUmp.check>

type NumberListField = 'everyWeekday' | 'everyDate' | 'everyMonth' | 'everyHour'
type StringListField = 'dates' | 'exceptDates'
type StringField = 'fromDate' | 'toDate' | 'startTime' | 'endTime'
type NumberField = 'repeatEvery' | 'duration'
type ExceptBetweenValue = { start?: string; end?: string }

const fieldOrder = [
  'fromDate',
  'toDate',
  'fixedBetween',
  'dates',
  'everyWeekday',
  'everyDate',
  'everyMonth',
  'exceptDates',
  'exceptBetween',
  'everyHour',
  'startTime',
  'endTime',
  'repeatEvery',
  'duration',
] as const satisfies readonly CalendarField[]

const fieldMeta: Record<CalendarField, { label: string; detail: string }> = {
  fromDate: {
    label: 'From Date',
    detail: 'Lower bound for the recurring window.',
  },
  toDate: {
    label: 'To Date',
    detail: 'Upper bound for the recurring window.',
  },
  fixedBetween: {
    label: 'Fixed Between',
    detail: 'Only meaningful when both date bounds exist.',
  },
  dates: {
    label: 'Explicit Dates',
    detail: 'Authoritative list that overrides every pattern field.',
  },
  everyWeekday: {
    label: 'Every Weekday',
    detail: 'Weekly recurrence by weekday.',
  },
  everyDate: {
    label: 'Every Date',
    detail: 'Day numbers within the month.',
  },
  everyMonth: {
    label: 'Every Month',
    detail: 'Month selection across the year.',
  },
  exceptDates: {
    label: 'Except Dates',
    detail: 'Blacklisted dates carved out from active patterns.',
  },
  exceptBetween: {
    label: 'Except Between',
    detail: 'Blackout range inside a valid pattern schedule.',
  },
  everyHour: {
    label: 'Every Hour',
    detail: 'Specific hour list strategy.',
  },
  startTime: {
    label: 'Start Time',
    detail: 'Activates the interval strategy.',
  },
  endTime: {
    label: 'End Time',
    detail: 'Requires a start time first.',
  },
  repeatEvery: {
    label: 'Repeat Every',
    detail: 'Interval cadence in minutes.',
  },
  duration: {
    label: 'Duration',
    detail: 'Shared event length in minutes.',
  },
}

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const

const months = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
] as const

const weekdayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const quickDates = [1, 15, 31] as const
const hourOptions = Array.from({ length: 24 }, (_, hour) => hour)
const defaultFocusDate = '2026-04-01'

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function toNumberList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toExceptBetween(value: unknown): ExceptBetweenValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const { start, end } = value as ExceptBetweenValue
  return { start, end }
}

function formatHour(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM'
  const normalized = hour % 12 || 12
  return `${normalized}:00 ${period}`
}

function formatHourChip(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

function collectActiveDates(month: Month | undefined) {
  const activeDates = new Set<string>()

  if (!month) {
    return activeDates
  }

  for (const week of month.weeks) {
    for (const day of week.days) {
      if (day.ranges.length > 0) {
        activeDates.add(day.date)
      }
    }
  }

  return activeDates
}

function isOutsideBounds(date: string, fromDate?: string, toDate?: string) {
  if (fromDate && date < fromDate) {
    return true
  }

  if (toDate && date > toDate) {
    return true
  }

  return false
}

function buildPreviewRange(
  values: CalendarValues,
  availability: AvailabilityMap,
  includeExceptions: boolean,
): DateRange | null {
  const explicitDates = availability.dates.enabled ? toStringList(values.dates) : []
  const everyWeekday = availability.everyWeekday.enabled ? toNumberList(values.everyWeekday) : []
  const everyDate = availability.everyDate.enabled ? toNumberList(values.everyDate) : []
  const everyMonth = availability.everyMonth.enabled ? toNumberList(values.everyMonth) : []

  const hasDayCriteria = (
    explicitDates.length > 0 ||
    everyWeekday.length > 0 ||
    everyDate.length > 0 ||
    everyMonth.length > 0
  )

  if (!hasDayCriteria) {
    return null
  }

  const range: DateRange = {
    id: includeExceptions ? 'calendar-demo-preview' : 'calendar-demo-preview-base',
    label: 'Calendar Demo Preview',
  }

  if (explicitDates.length > 0) {
    range.dates = explicitDates
  }

  if (everyWeekday.length > 0) {
    range.everyWeekday = everyWeekday
  }

  if (everyDate.length > 0) {
    range.everyDate = everyDate
  }

  if (everyMonth.length > 0) {
    range.everyMonth = everyMonth
  }

  if (availability.fromDate.enabled && values.fromDate) {
    range.fromDate = values.fromDate
  }

  if (availability.toDate.enabled && values.toDate) {
    range.toDate = values.toDate
  }

  if (availability.fixedBetween.enabled && values.fixedBetween) {
    range.fixedBetween = true
  }

  if (!includeExceptions) {
    return range
  }

  if (availability.exceptDates.enabled) {
    const exceptDates = toStringList(values.exceptDates)
    if (exceptDates.length > 0) {
      range.exceptDates = exceptDates
    }
  }

  if (availability.exceptBetween.enabled) {
    const exceptBetween = toExceptBetween(values.exceptBetween)
    if (exceptBetween.start && exceptBetween.end) {
      range.exceptBetween = [[exceptBetween.start, exceptBetween.end]]
    }
  }

  return range
}

export default function CalendarDemo() {
  const [values, setValues] = useState<CalendarValues>(() => calendarUmp.init())
  const [focusDate, setFocusDate] = useState(defaultFocusDate)
  const [dateDraft, setDateDraft] = useState(defaultFocusDate)
  const [exceptDateDraft, setExceptDateDraft] = useState('2026-04-12')
  const [everyDateDraft, setEveryDateDraft] = useState('')

  const { check, fouls } = useUmpire(calendarUmp, values)

  function updateField<K extends CalendarField>(field: K, nextValue: CalendarValues[K]) {
    setValues((current) => {
      if (Object.is(current[field], nextValue)) {
        return current
      }

      return {
        ...current,
        [field]: nextValue,
      }
    })
  }

  function updateFieldWith<K extends CalendarField>(
    field: K,
    getNextValue: (currentValue: CalendarValues[K]) => CalendarValues[K],
  ) {
    setValues((current) => {
      const nextValue = getNextValue(current[field])

      if (Object.is(current[field], nextValue)) {
        return current
      }

      return {
        ...current,
        [field]: nextValue,
      }
    })
  }

  function updateStringField(field: StringField, nextValue: string) {
    updateField(field, (nextValue || undefined) as CalendarValues[typeof field])

    if ((field === 'fromDate' || field === 'toDate') && nextValue) {
      setFocusDate(nextValue)
    }
  }

  function updateNumberField(field: NumberField, nextValue: string) {
    const trimmed = nextValue.trim()
    const parsed = trimmed ? Number(trimmed) : undefined
    updateField(field, parsed as CalendarValues[typeof field])
  }

  function toggleNumberList(field: NumberListField, item: number) {
    updateFieldWith(field, (currentValue) => {
      const current = toNumberList(currentValue)
      const exists = current.includes(item)
      const next = exists
        ? current.filter((value) => value !== item)
        : [...current, item].sort((left, right) => left - right)

      return (next.length > 0 ? next : undefined) as CalendarValues[typeof field]
    })
  }

  function addNumberListValue(field: NumberListField, rawValue: string, reset: () => void) {
    const parsed = Number(rawValue)

    if (!Number.isInteger(parsed)) {
      return
    }

    if (field === 'everyDate' && (parsed < 1 || parsed > 31)) {
      return
    }

    if (field === 'everyHour' && (parsed < 0 || parsed > 23)) {
      return
    }

    if (field === 'everyMonth' && (parsed < 1 || parsed > 12)) {
      return
    }

    updateFieldWith(field, (currentValue) => {
      const current = toNumberList(currentValue)

      if (current.includes(parsed)) {
        return currentValue
      }

      return [...current, parsed].sort((left, right) => left - right) as CalendarValues[typeof field]
    })

    reset()
  }

  function addStringListValue(field: StringListField, rawValue: string, reset: () => void) {
    const trimmed = rawValue.trim()

    if (!trimmed) {
      return
    }

    updateFieldWith(field, (currentValue) => {
      const current = toStringList(currentValue)

      if (current.includes(trimmed)) {
        return currentValue
      }

      return [...current, trimmed] as CalendarValues[typeof field]
    })

    if (field === 'dates') {
      setFocusDate(trimmed)
    }

    reset()
  }

  function removeNumberListValue(field: NumberListField, item: number) {
    updateFieldWith(field, (currentValue) => {
      const current = toNumberList(currentValue)
      const next = current.filter((value) => value !== item)
      return (next.length > 0 ? next : undefined) as CalendarValues[typeof field]
    })
  }

  function removeStringListValue(field: StringListField, item: string) {
    updateFieldWith(field, (currentValue) => {
      const current = toStringList(currentValue)
      const next = current.filter((value) => value !== item)
      return (next.length > 0 ? next : undefined) as CalendarValues[typeof field]
    })
  }

  function updateExceptBetween(part: keyof ExceptBetweenValue, nextValue: string) {
    updateFieldWith('exceptBetween', (currentValue) => {
      const current = toExceptBetween(currentValue)
      const next = {
        ...current,
        [part]: nextValue || undefined,
      }

      return (next.start || next.end ? next : undefined) as CalendarValues['exceptBetween']
    })

    if (nextValue) {
      setFocusDate(nextValue)
    }
  }

  function applyResets() {
    setValues((current) => {
      const next = { ...current }
      let changed = false

      for (const foul of fouls) {
        const suggestedValue = foul.suggestedValue as CalendarValues[typeof foul.field]
        if (!Object.is(next[foul.field], suggestedValue)) {
          next[foul.field] = suggestedValue
          changed = true
        }
      }

      return changed ? next : current
    })
  }

  const explicitDates = toStringList(values.dates)
  const everyWeekdayValues = toNumberList(values.everyWeekday)
  const everyDateValues = toNumberList(values.everyDate)
  const everyMonthValues = toNumberList(values.everyMonth)
  const exceptDateValues = toStringList(values.exceptDates)
  const everyHourValues = toNumberList(values.everyHour)
  const exceptBetween = toExceptBetween(values.exceptBetween)
  const hasPreviewCriteria = (
    explicitDates.length > 0 ||
    everyWeekdayValues.length > 0 ||
    everyDateValues.length > 0 ||
    everyMonthValues.length > 0
  )
  const hasExceptions = (
    exceptDateValues.length > 0 ||
    Boolean(exceptBetween.start && exceptBetween.end)
  )

  const previewBaseRange = buildPreviewRange(values, check, false)
  const previewRange = buildPreviewRange(values, check, true)

  const { months: previewMonths, next, prev } = useCalendar({
    focusDate,
    numberOfMonths: 1,
    ranges: previewRange ? [previewRange] : [],
    weekStartsOn: 1,
    fidelity: 'month',
    onFocusDateChange: setFocusDate,
  })

  const { months: previewBaseMonths } = useCalendar({
    focusDate,
    numberOfMonths: 1,
    ranges: previewBaseRange ? [previewBaseRange] : [],
    weekStartsOn: 1,
    fidelity: 'month',
    onFocusDateChange: setFocusDate,
  })

  const previewMonth = previewMonths[0]
  const previewBaseMonth = previewBaseMonths[0]
  const activeDates = collectActiveDates(previewMonth)
  const activeBaseDates = collectActiveDates(previewBaseMonth)

  return (
    <div className="calendar-demo umpire-demo umpire-demo--styled">
      {fouls.length > 0 && (
        <div className="umpire-demo__fouls">
          <div className="umpire-demo__fouls-copy">
            <div className="umpire-demo__fouls-kicker">Fouls</div>
            <div className="umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="umpire-demo__foul">
                  <span className="umpire-demo__foul-field">
                    {fieldMeta[foul.field].label}
                  </span>
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

      <section className="calendar-demo__strip">
        <div className="calendar-demo__strip-header">
          <div>
            <div className="calendar-demo__eyebrow">Live config</div>
            <h2 className="calendar-demo__title">Calendar recurrence</h2>
          </div>
          <span className="calendar-demo__accent">14 fields / useUmpire()</span>
        </div>

        <div className="calendar-demo__groups">
          <section className="calendar-demo__group calendar-demo__group--bounds">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Date bounds</div>
              <div className="calendar-demo__group-caption">Window + clamp</div>
            </div>

            <label
              className={cls(
                'calendar-demo__control',
                !check.fromDate.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.fromDate.detail}>
                {fieldMeta.fromDate.label}
              </span>
              <input
                className="calendar-demo__input"
                type="date"
                value={String(values.fromDate ?? '')}
                disabled={!check.fromDate.enabled}
                onChange={(event) => updateStringField('fromDate', event.currentTarget.value)}
              />
              {!check.fromDate.enabled && check.fromDate.reason && (
                <span className="calendar-demo__reason">{check.fromDate.reason}</span>
              )}
            </label>

            <label
              className={cls(
                'calendar-demo__control',
                !check.toDate.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.toDate.detail}>
                {fieldMeta.toDate.label}
              </span>
              <input
                className="calendar-demo__input"
                type="date"
                value={String(values.toDate ?? '')}
                disabled={!check.toDate.enabled}
                onChange={(event) => updateStringField('toDate', event.currentTarget.value)}
              />
              {!check.toDate.enabled && check.toDate.reason && (
                <span className="calendar-demo__reason">{check.toDate.reason}</span>
              )}
            </label>

            <div
              className={cls(
                'calendar-demo__control',
                'calendar-demo__control--inline',
                !check.fixedBetween.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <div className="calendar-demo__control-copy">
                <span className="calendar-demo__label" title={fieldMeta.fixedBetween.detail}>
                  {fieldMeta.fixedBetween.label}
                </span>
                {!check.fixedBetween.enabled && check.fixedBetween.reason && (
                  <span className="calendar-demo__reason">{check.fixedBetween.reason}</span>
                )}
              </div>

              <label className="calendar-demo__switch">
                <input
                  type="checkbox"
                  checked={Boolean(values.fixedBetween)}
                  disabled={!check.fixedBetween.enabled}
                  onChange={(event) => updateField('fixedBetween', event.currentTarget.checked)}
                />
                <span className="calendar-demo__switch-track" />
              </label>
            </div>
          </section>

          <section className="calendar-demo__group calendar-demo__group--dates">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Explicit dates</div>
              <div className="calendar-demo__group-caption">Authoritative picks</div>
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.dates.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.dates.detail}>
                {fieldMeta.dates.label}
              </span>
              <div className="calendar-demo__input-row">
                <input
                  className="calendar-demo__input"
                  type="date"
                  value={dateDraft}
                  disabled={!check.dates.enabled}
                  onChange={(event) => setDateDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="calendar-demo__action"
                  disabled={!check.dates.enabled || !dateDraft}
                  onClick={() => addStringListValue('dates', dateDraft, () => setDateDraft(''))}
                >
                  Add
                </button>
              </div>
              <div className="calendar-demo__chip-row">
                {explicitDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="calendar-demo__chip calendar-demo__chip--remove"
                    disabled={!check.dates.enabled}
                    onClick={() => removeStringListValue('dates', date)}
                  >
                    <span>{date}</span>
                    <span className="calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {explicitDates.length === 0 && (
                  <span className="calendar-demo__empty">No explicit dates.</span>
                )}
              </div>
            </div>
          </section>

          <section className="calendar-demo__group calendar-demo__group--patterns">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Patterns</div>
              <div className="calendar-demo__group-caption">Weekdays, months, month-days</div>
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.everyWeekday.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.everyWeekday.detail}>
                {fieldMeta.everyWeekday.label}
              </span>
              <div className="calendar-demo__toggle-grid calendar-demo__toggle-grid--weekdays">
                {weekdays.map((weekday) => (
                  <button
                    key={weekday.label}
                    type="button"
                    aria-pressed={everyWeekdayValues.includes(weekday.value)}
                    className={cls(
                      'calendar-demo__toggle',
                      everyWeekdayValues.includes(weekday.value) && 'calendar-demo__toggle--active',
                    )}
                    disabled={!check.everyWeekday.enabled}
                    onClick={() => toggleNumberList('everyWeekday', weekday.value)}
                  >
                    {weekday.label}
                  </button>
                ))}
              </div>
              {!check.everyWeekday.enabled && check.everyWeekday.reason && (
                <span className="calendar-demo__reason">{check.everyWeekday.reason}</span>
              )}
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.everyMonth.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.everyMonth.detail}>
                {fieldMeta.everyMonth.label}
              </span>
              <div className="calendar-demo__toggle-grid calendar-demo__toggle-grid--months">
                {months.map((month) => (
                  <button
                    key={month.label}
                    type="button"
                    aria-pressed={everyMonthValues.includes(month.value)}
                    className={cls(
                      'calendar-demo__toggle',
                      everyMonthValues.includes(month.value) && 'calendar-demo__toggle--active',
                    )}
                    disabled={!check.everyMonth.enabled}
                    onClick={() => toggleNumberList('everyMonth', month.value)}
                  >
                    {month.label}
                  </button>
                ))}
              </div>
              {!check.everyMonth.enabled && check.everyMonth.reason && (
                <span className="calendar-demo__reason">{check.everyMonth.reason}</span>
              )}
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.everyDate.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.everyDate.detail}>
                {fieldMeta.everyDate.label}
              </span>
              <div className="calendar-demo__toggle-grid calendar-demo__toggle-grid--days">
                {quickDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={everyDateValues.includes(date)}
                    className={cls(
                      'calendar-demo__toggle',
                      everyDateValues.includes(date) && 'calendar-demo__toggle--active',
                    )}
                    disabled={!check.everyDate.enabled}
                    onClick={() => toggleNumberList('everyDate', date)}
                  >
                    {date}
                  </button>
                ))}
              </div>
              <div className="calendar-demo__input-row">
                <input
                  className="calendar-demo__input"
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  placeholder="Custom"
                  value={everyDateDraft}
                  disabled={!check.everyDate.enabled}
                  onChange={(event) => setEveryDateDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="calendar-demo__action"
                  disabled={!check.everyDate.enabled || !everyDateDraft}
                  onClick={() =>
                    addNumberListValue('everyDate', everyDateDraft, () => setEveryDateDraft(''))
                  }
                >
                  Add
                </button>
              </div>
              <div className="calendar-demo__chip-row">
                {everyDateValues.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="calendar-demo__chip calendar-demo__chip--remove"
                    disabled={!check.everyDate.enabled}
                    onClick={() => removeNumberListValue('everyDate', date)}
                  >
                    <span>{date}</span>
                    <span className="calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {everyDateValues.length === 0 && (
                  <span className="calendar-demo__empty">No day picks.</span>
                )}
              </div>
              {!check.everyDate.enabled && check.everyDate.reason && (
                <span className="calendar-demo__reason">{check.everyDate.reason}</span>
              )}
            </div>
          </section>

          <section className="calendar-demo__group calendar-demo__group--exceptions">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Exclusions</div>
              <div className="calendar-demo__group-caption">Carve-outs from patterns</div>
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.exceptDates.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.exceptDates.detail}>
                {fieldMeta.exceptDates.label}
              </span>
              <div className="calendar-demo__input-row">
                <input
                  className="calendar-demo__input"
                  type="date"
                  value={exceptDateDraft}
                  disabled={!check.exceptDates.enabled}
                  onChange={(event) => setExceptDateDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="calendar-demo__action"
                  disabled={!check.exceptDates.enabled || !exceptDateDraft}
                  onClick={() =>
                    addStringListValue('exceptDates', exceptDateDraft, () => setExceptDateDraft(''))
                  }
                >
                  Add
                </button>
              </div>
              <div className="calendar-demo__chip-row">
                {exceptDateValues.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="calendar-demo__chip calendar-demo__chip--remove"
                    disabled={!check.exceptDates.enabled}
                    onClick={() => removeStringListValue('exceptDates', date)}
                  >
                    <span>{date}</span>
                    <span className="calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {exceptDateValues.length === 0 && (
                  <span className="calendar-demo__empty">No excluded dates.</span>
                )}
              </div>
              {!check.exceptDates.enabled && check.exceptDates.reason && (
                <span className="calendar-demo__reason">{check.exceptDates.reason}</span>
              )}
            </div>

            <div
              className={cls(
                'calendar-demo__control',
                !check.exceptBetween.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.exceptBetween.detail}>
                {fieldMeta.exceptBetween.label}
              </span>
              <div className="calendar-demo__split-inputs">
                <input
                  className="calendar-demo__input"
                  type="date"
                  value={exceptBetween.start ?? ''}
                  disabled={!check.exceptBetween.enabled}
                  onChange={(event) => updateExceptBetween('start', event.currentTarget.value)}
                />
                <input
                  className="calendar-demo__input"
                  type="date"
                  value={exceptBetween.end ?? ''}
                  disabled={!check.exceptBetween.enabled}
                  onChange={(event) => updateExceptBetween('end', event.currentTarget.value)}
                />
              </div>
              {!check.exceptBetween.enabled && check.exceptBetween.reason && (
                <span className="calendar-demo__reason">{check.exceptBetween.reason}</span>
              )}
            </div>
          </section>

          <section className="calendar-demo__group calendar-demo__group--subday">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Sub-day</div>
              <div className="calendar-demo__group-caption">Choose one strategy branch</div>
            </div>

            <div className="calendar-demo__branch-grid">
              <div
                className={cls(
                  'calendar-demo__control',
                  !check.everyHour.enabled && 'calendar-demo__control--disabled',
                )}
              >
                <span className="calendar-demo__label" title={fieldMeta.everyHour.detail}>
                  {fieldMeta.everyHour.label}
                </span>
                <div className="calendar-demo__toggle-grid calendar-demo__toggle-grid--hours">
                  {hourOptions.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      aria-pressed={everyHourValues.includes(hour)}
                      title={formatHour(hour)}
                      className={cls(
                        'calendar-demo__toggle',
                        everyHourValues.includes(hour) && 'calendar-demo__toggle--active',
                      )}
                      disabled={!check.everyHour.enabled}
                      onClick={() => toggleNumberList('everyHour', hour)}
                    >
                      {formatHourChip(hour)}
                    </button>
                  ))}
                </div>
                {!check.everyHour.enabled && check.everyHour.reason && (
                  <span className="calendar-demo__reason">{check.everyHour.reason}</span>
                )}
              </div>

              <div className="calendar-demo__control">
                <span className="calendar-demo__label">Interval</span>
                <div className="calendar-demo__interval-fields">
                  <label
                    className={cls(
                      'calendar-demo__control',
                      'calendar-demo__control--nested',
                      !check.startTime.enabled && 'calendar-demo__control--disabled',
                    )}
                  >
                    <span className="calendar-demo__label" title={fieldMeta.startTime.detail}>
                      {fieldMeta.startTime.label}
                    </span>
                    <input
                      className="calendar-demo__input"
                      type="time"
                      value={String(values.startTime ?? '')}
                      disabled={!check.startTime.enabled}
                      onChange={(event) => updateStringField('startTime', event.currentTarget.value)}
                    />
                    {!check.startTime.enabled && check.startTime.reason && (
                      <span className="calendar-demo__reason">{check.startTime.reason}</span>
                    )}
                  </label>

                  <label
                    className={cls(
                      'calendar-demo__control',
                      'calendar-demo__control--nested',
                      !check.endTime.enabled && 'calendar-demo__control--disabled',
                    )}
                  >
                    <span className="calendar-demo__label" title={fieldMeta.endTime.detail}>
                      {fieldMeta.endTime.label}
                    </span>
                    <input
                      className="calendar-demo__input"
                      type="time"
                      value={String(values.endTime ?? '')}
                      disabled={!check.endTime.enabled}
                      onChange={(event) => updateStringField('endTime', event.currentTarget.value)}
                    />
                    {!check.endTime.enabled && check.endTime.reason && (
                      <span className="calendar-demo__reason">{check.endTime.reason}</span>
                    )}
                  </label>

                  <label
                    className={cls(
                      'calendar-demo__control',
                      'calendar-demo__control--nested',
                      !check.repeatEvery.enabled && 'calendar-demo__control--disabled',
                    )}
                  >
                    <span className="calendar-demo__label" title={fieldMeta.repeatEvery.detail}>
                      {fieldMeta.repeatEvery.label}
                    </span>
                    <div className="calendar-demo__input-row">
                      <input
                        className="calendar-demo__input"
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={String(values.repeatEvery ?? '')}
                        disabled={!check.repeatEvery.enabled}
                        onChange={(event) => updateNumberField('repeatEvery', event.currentTarget.value)}
                      />
                      <span className="calendar-demo__suffix">min</span>
                    </div>
                    {!check.repeatEvery.enabled && check.repeatEvery.reason && (
                      <span className="calendar-demo__reason">{check.repeatEvery.reason}</span>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="calendar-demo__group calendar-demo__group--duration">
            <div className="calendar-demo__group-head">
              <div className="calendar-demo__group-kicker">Duration</div>
              <div className="calendar-demo__group-caption">Shared event length</div>
            </div>

            <label
              className={cls(
                'calendar-demo__control',
                !check.duration.enabled && 'calendar-demo__control--disabled',
              )}
            >
              <span className="calendar-demo__label" title={fieldMeta.duration.detail}>
                {fieldMeta.duration.label}
              </span>
              <div className="calendar-demo__input-row">
                <input
                  className="calendar-demo__input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={String(values.duration ?? '')}
                  disabled={!check.duration.enabled}
                  onChange={(event) => updateNumberField('duration', event.currentTarget.value)}
                />
                <span className="calendar-demo__suffix">min</span>
              </div>
              {!check.duration.enabled && check.duration.reason && (
                <span className="calendar-demo__reason">{check.duration.reason}</span>
              )}
            </label>
          </section>
        </div>
      </section>

      <div className="calendar-demo__lower">
        <section className="calendar-demo__panel">
          <div className="calendar-demo__panel-header">
            <div>
              <div className="calendar-demo__eyebrow">neo-reckoning preview</div>
              <h3 className="calendar-demo__panel-title">{previewMonth.label}</h3>
            </div>

            <div className="calendar-demo__nav">
              <button
                type="button"
                className="calendar-demo__nav-button"
                aria-label="Previous month"
                onClick={prev}
              >
                Prev
              </button>
              <button
                type="button"
                className="calendar-demo__nav-button"
                aria-label="Next month"
                onClick={next}
              >
                Next
              </button>
            </div>
          </div>

          <div className="calendar-demo__panel-body">
            {!hasPreviewCriteria && (
              <p className="calendar-demo__note">
                Pick explicit dates or a day-level pattern to light up the month grid.
              </p>
            )}

            <div className="calendar-demo__weekday-row">
              {weekdayHeaders.map((weekday) => (
                <div key={weekday} className="calendar-demo__weekday">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="calendar-demo__month-grid">
              {previewMonth.weeks.map((week) =>
                week.days.map((day) => {
                  const isActive = activeDates.has(day.date)
                  const isExcluded = hasExceptions && activeBaseDates.has(day.date) && !isActive
                  const isOutOfBounds = isOutsideBounds(day.date, values.fromDate, values.toDate)

                  return (
                    <div
                      key={day.date}
                      className={cls(
                        'calendar-demo__day',
                        isActive && 'calendar-demo__day--active',
                        isExcluded && 'calendar-demo__day--excluded',
                        isOutOfBounds && 'calendar-demo__day--outside-window',
                        !day.isCurrentMonth && 'calendar-demo__day--adjacent',
                        day.isToday && 'calendar-demo__day--today',
                      )}
                    >
                      <span className="calendar-demo__day-number">{day.dayOfMonth}</span>
                      <span className="calendar-demo__day-markers">
                        {isActive && <span className="calendar-demo__day-marker calendar-demo__day-marker--active" />}
                        {isExcluded && <span className="calendar-demo__day-marker calendar-demo__day-marker--excluded" />}
                        {isOutOfBounds && <span className="calendar-demo__day-marker calendar-demo__day-marker--bounds" />}
                      </span>
                    </div>
                  )
                }),
              )}
            </div>

            <div className="calendar-demo__legend">
              <div className="calendar-demo__legend-item">
                <span className="calendar-demo__legend-swatch calendar-demo__legend-swatch--active" />
                <span>active day</span>
              </div>
              <div className="calendar-demo__legend-item">
                <span className="calendar-demo__legend-swatch calendar-demo__legend-swatch--excluded" />
                <span>excluded</span>
              </div>
              <div className="calendar-demo__legend-item">
                <span className="calendar-demo__legend-swatch calendar-demo__legend-swatch--bounds" />
                <span>outside bounds</span>
              </div>
            </div>
          </div>
        </section>

        <section className="calendar-demo__panel">
          <div className="calendar-demo__panel-header">
            <div>
              <div className="calendar-demo__eyebrow">Availability</div>
              <h3 className="calendar-demo__panel-title">Live field status</h3>
            </div>
            <span className="calendar-demo__accent">check()</span>
          </div>

          <div className="calendar-demo__panel-body calendar-demo__panel-body--table">
            <div className="calendar-demo__table-shell">
              <table className="calendar-demo__table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldOrder.map((field) => {
                    const availability = check[field]

                    return (
                      <tr key={field}>
                        <td className="calendar-demo__table-field" title={fieldMeta[field].detail}>
                          {fieldMeta[field].label}
                        </td>
                        <td>
                          <span
                            className={cls(
                              'calendar-demo__status',
                              availability.enabled
                                ? 'calendar-demo__status--enabled'
                                : 'calendar-demo__status--disabled',
                            )}
                          >
                            <span className="calendar-demo__status-dot" />
                            <span className="calendar-demo__status-text">
                              {availability.enabled ? 'enabled' : 'disabled'}
                            </span>
                          </span>
                        </td>
                        <td className="calendar-demo__table-reason">
                          {availability.reason ?? 'available'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
