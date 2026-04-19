import { useState } from 'react'
import type { DateRange, Month } from '@daywatch/cal'
import { useCalendar } from '@daywatch/cal-react'
import { disables, enabledWhen, oneOf, requires, strike, umpire } from '@umpire/core'
// Swap back to `@umpire/react` and remove the leading devtools id from the
// hook call below if you want the plain React adapter again.
import { useUmpireWithDevtools as useUmpire } from '@umpire/devtools/react'
import '../styles/components/_components.calendar-demo.css'

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

    // Weekday selection and date selection are mutually exclusive strategies
    oneOf('dayPattern', {
      byWeekday: ['everyWeekday'],
      byDate: ['everyDate'],
    }),

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
function getSecondWednesday(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

const secondWednesdayOfMonth = getSecondWednesday()

function getDefaultMonths(): number[] {
  const now = new Date()
  const current = now.getMonth() + 1
  const previous = current === 1 ? 12 : current - 1
  return [previous, current].sort((a, b) => a - b)
}

const defaultMonths = getDefaultMonths()

const defaultFocusDate = (() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
})()

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function toNumberList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function isExceptBetweenValue(value: unknown): value is ExceptBetweenValue {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toExceptBetween(value: unknown): ExceptBetweenValue {
  if (!isExceptBetweenValue(value)) {
    return {}
  }

  const { start, end } = value
  return { start, end }
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
  const [values, setValues] = useState<CalendarValues>(() => ({
    ...calendarUmp.init(),
    everyWeekday: [1, 3, 5],
    everyMonth: defaultMonths,
    exceptDates: [secondWednesdayOfMonth],
  }))
  const [focusDate, setFocusDate] = useState(defaultFocusDate)
  const [dateDraft, setDateDraft] = useState(defaultFocusDate)
  const [exceptDateDraft, setExceptDateDraft] = useState('')
  const [everyDateDraft, setEveryDateDraft] = useState('')

  const { check, fouls } = useUmpire('calendar', calendarUmp, values)

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
    const nextValueOrUndefined = nextValue || undefined
    updateField(field, nextValueOrUndefined)

    if ((field === 'fromDate' || field === 'toDate') && nextValue) {
      setFocusDate(nextValue)
    }
  }

  function updateNumberField(field: NumberField, nextValue: string) {
    const trimmed = nextValue.trim()
    const parsed = trimmed ? Number(trimmed) : undefined
    updateField(field, parsed)
  }

  function toggleNumberList(field: NumberListField, item: number) {
    updateFieldWith(field, (currentValue) => {
      const current = toNumberList(currentValue)
      const exists = current.includes(item)
      const next = exists
        ? current.filter((value) => value !== item)
        : [...current, item].sort((left, right) => left - right)

      return next.length > 0 ? next : undefined
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

      return [...current, parsed].sort((left, right) => left - right)
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

      return [...current, trimmed]
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
      return next.length > 0 ? next : undefined
    })
  }

  function removeStringListValue(field: StringListField, item: string) {
    updateFieldWith(field, (currentValue) => {
      const current = toStringList(currentValue)
      const next = current.filter((value) => value !== item)
      return next.length > 0 ? next : undefined
    })
  }

  function updateExceptBetween(part: keyof ExceptBetweenValue, nextValue: string) {
    updateFieldWith('exceptBetween', (currentValue) => {
      const current = toExceptBetween(currentValue)
      const next = {
        ...current,
        [part]: nextValue || undefined,
      }

      return next.start || next.end ? next : undefined
    })

    if (nextValue) {
      setFocusDate(nextValue)
    }
  }

  function applyResets() {
    setValues((current) => strike(current, fouls))
  }

  const explicitDates = toStringList(values.dates)
  const everyWeekdayValues = toNumberList(values.everyWeekday)
  const everyDateValues = toNumberList(values.everyDate)
  const everyMonthValues = toNumberList(values.everyMonth)
  const exceptDateValues = toStringList(values.exceptDates)
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
    <div className="c-calendar-demo c-umpire-demo">
      <section className="c-calendar-demo__panel c-calendar-demo__panel--preview">
        <div className="c-calendar-demo__panel-header">
          <div>
            <div className="c-calendar-demo__eyebrow c-umpire-demo__eyebrow">daywatch preview</div>
            <h3 className="c-calendar-demo__panel-title">{previewMonth.label}</h3>
          </div>
          <div className="c-calendar-demo__nav">
            <button type="button" className="c-calendar-demo__nav-button" aria-label="Previous month" onClick={prev}>Prev</button>
            <button type="button" className="c-calendar-demo__nav-button" aria-label="Next month" onClick={next}>Next</button>
          </div>
        </div>
        <div className="c-calendar-demo__panel-body">
          <div className="c-calendar-demo__weekday-row">
            {weekdayHeaders.map((weekday) => (
              <div key={weekday} className="c-calendar-demo__weekday c-umpire-demo__eyebrow">{weekday}</div>
            ))}
          </div>
          <div className="c-calendar-demo__month-grid">
            {previewMonth.weeks.map((week) =>
              week.days.map((day) => {
                const isActive = activeDates.has(day.date)
                const isExcluded = hasExceptions && activeBaseDates.has(day.date) && !isActive
                const { fromDate, toDate } = values
                const isOutOfBounds = isOutsideBounds(day.date, fromDate, toDate)
                return (
                  <div
                    key={day.date}
                    className={cls(
                      'c-calendar-demo__day',
                      isActive && 'c-calendar-demo__day is-active',
                      isExcluded && 'c-calendar-demo__day--excluded',
                      isOutOfBounds && 'c-calendar-demo__day--outside-window',
                      !day.isCurrentMonth && 'c-calendar-demo__day--adjacent',
                      day.isToday && 'c-calendar-demo__day--today',
                    )}
                  >
                    <span className="c-calendar-demo__day-number">{day.dayOfMonth}</span>
                    <span className="c-calendar-demo__day-markers">
                      {isActive && <span className="c-calendar-demo__day-marker c-calendar-demo__day-marker is-active" />}
                      {isExcluded && <span className="c-calendar-demo__day-marker c-calendar-demo__day-marker--excluded" />}
                      {isOutOfBounds && <span className="c-calendar-demo__day-marker c-calendar-demo__day-marker--bounds" />}
                    </span>
                  </div>
                )
              }),
            )}
          </div>
          <div className="c-calendar-demo__legend">
            <div className="c-calendar-demo__legend-item">
              <span className="c-calendar-demo__legend-swatch c-calendar-demo__legend-swatch is-active" />
              <span>active day</span>
            </div>
            <div className="c-calendar-demo__legend-item">
              <span className="c-calendar-demo__legend-swatch c-calendar-demo__legend-swatch--excluded" />
              <span>excluded</span>
            </div>
            <div className="c-calendar-demo__legend-item">
              <span className="c-calendar-demo__legend-swatch c-calendar-demo__legend-swatch--bounds" />
              <span>outside bounds</span>
            </div>
          </div>
        </div>
      </section>

      {fouls.length > 0 && (
        <div className="c-umpire-demo__fouls">
          <div className="c-umpire-demo__fouls-copy">
            <div className="c-umpire-demo__fouls-kicker">Fouls</div>
            <div className="c-umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="c-umpire-demo__foul">
                  <span className="c-umpire-demo__foul-field">
                    {fieldMeta[foul.field].label}
                  </span>
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

      <section className="c-calendar-demo__strip">
        <div className="c-calendar-demo__strip-header">
          <div>
            <div className="c-calendar-demo__eyebrow c-umpire-demo__eyebrow">Live config</div>
            <h2 className="c-calendar-demo__title">Calendar recurrence</h2>
          </div>
          <span className="c-calendar-demo__accent">14 fields / useUmpire()</span>
        </div>

        <div className="c-calendar-demo__groups">
          <section className="c-calendar-demo__group c-calendar-demo__group--bounds">
            <div className="c-calendar-demo__group-head">
              <div className="c-calendar-demo__group-kicker">Date bounds</div>
              <div className="c-calendar-demo__group-caption">Window + clamp</div>
            </div>

            <label
              className={cls(
                'c-calendar-demo__control',
                !check.fromDate.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.fromDate.detail}>
                {fieldMeta.fromDate.label}
              </span>
              <input
                className="c-calendar-demo__input"
                type="date"
                value={String(values.fromDate ?? '')}
                disabled={!check.fromDate.enabled}
                onChange={(event) => updateStringField('fromDate', event.currentTarget.value)}
              />
              {!check.fromDate.enabled && check.fromDate.reason && (
                <span className="c-calendar-demo__reason">{check.fromDate.reason}</span>
              )}
            </label>

            <label
              className={cls(
                'c-calendar-demo__control',
                !check.toDate.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.toDate.detail}>
                {fieldMeta.toDate.label}
              </span>
              <input
                className="c-calendar-demo__input"
                type="date"
                value={String(values.toDate ?? '')}
                disabled={!check.toDate.enabled}
                onChange={(event) => updateStringField('toDate', event.currentTarget.value)}
              />
              {!check.toDate.enabled && check.toDate.reason && (
                <span className="c-calendar-demo__reason">{check.toDate.reason}</span>
              )}
            </label>

            <div
              className={cls(
                'c-calendar-demo__control',
                'c-calendar-demo__control--inline',
                !check.fixedBetween.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <div className="c-calendar-demo__control-copy">
                <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.fixedBetween.detail}>
                  {fieldMeta.fixedBetween.label}
                </span>
                {!check.fixedBetween.enabled && check.fixedBetween.reason && (
                  <span className="c-calendar-demo__reason">{check.fixedBetween.reason}</span>
                )}
              </div>

              <label className="c-calendar-demo__switch">
                <input
                  type="checkbox"
                  checked={Boolean(values.fixedBetween)}
                  disabled={!check.fixedBetween.enabled}
                  onChange={(event) => updateField('fixedBetween', event.currentTarget.checked)}
                />
                <span className="c-calendar-demo__switch-track" />
              </label>
            </div>
          </section>

          <section className="c-calendar-demo__group c-calendar-demo__group--dates">
            <div className="c-calendar-demo__group-head">
              <div className="c-calendar-demo__group-kicker">Explicit dates</div>
              <div className="c-calendar-demo__group-caption">Authoritative picks</div>
            </div>

            {hasPreviewCriteria && explicitDates.length === 0 && (
              <p className="c-calendar-demo__hint">
                Adding a date here activates the <code>disables()</code> rule — all pattern fields go dark and <code>play()</code> will recommend clearing any active values.
              </p>
            )}

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.dates.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.dates.detail}>
                {fieldMeta.dates.label}
              </span>
              <div className="c-calendar-demo__input-row">
                <input
                  className="c-calendar-demo__input"
                  type="date"
                  value={dateDraft}
                  disabled={!check.dates.enabled}
                  onChange={(event) => setDateDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="c-calendar-demo__action"
                  disabled={!check.dates.enabled || !dateDraft}
                  onClick={() => addStringListValue('dates', dateDraft, () => setDateDraft(''))}
                >
                  Add
                </button>
              </div>
              <div className="c-calendar-demo__chip-row">
                {explicitDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="c-calendar-demo__chip c-calendar-demo__chip--remove"
                    disabled={!check.dates.enabled}
                    onClick={() => removeStringListValue('dates', date)}
                  >
                    <span>{date}</span>
                    <span className="c-calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {explicitDates.length === 0 && (
                  <span className="c-calendar-demo__empty">No explicit dates.</span>
                )}
              </div>
            </div>
          </section>

          <section className="c-calendar-demo__group c-calendar-demo__group--patterns">
            <div className="c-calendar-demo__group-head">
              <div className="c-calendar-demo__group-kicker">Patterns</div>
              <div className="c-calendar-demo__group-caption">Weekdays, months, month-days</div>
            </div>

            {!check.everyWeekday.enabled && check.everyWeekday.reason && (
              <p className="c-calendar-demo__hint">
                <code>oneOf</code> active — day-of-month strategy is locked in. Weekday is unavailable until day selections are cleared.
              </p>
            )}

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.everyWeekday.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.everyWeekday.detail}>
                {fieldMeta.everyWeekday.label}
              </span>
              <div className="c-calendar-demo__toggle-grid c-calendar-demo__toggle-grid--weekdays">
                {weekdays.map((weekday) => (
                  <button
                    key={weekday.label}
                    type="button"
                    aria-pressed={everyWeekdayValues.includes(weekday.value)}
                    className={cls(
                      'c-calendar-demo__toggle',
                      everyWeekdayValues.includes(weekday.value) && 'c-calendar-demo__toggle is-active',
                    )}
                    disabled={!check.everyWeekday.enabled}
                    onClick={() => toggleNumberList('everyWeekday', weekday.value)}
                  >
                    {weekday.label}
                  </button>
                ))}
              </div>
              {!check.everyWeekday.enabled && check.everyWeekday.reason && (
                <span className="c-calendar-demo__reason">{check.everyWeekday.reason}</span>
              )}
            </div>

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.everyMonth.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.everyMonth.detail}>
                {fieldMeta.everyMonth.label}
              </span>
              <div className="c-calendar-demo__toggle-grid c-calendar-demo__toggle-grid--months">
                {months.map((month) => (
                  <button
                    key={month.label}
                    type="button"
                    aria-pressed={everyMonthValues.includes(month.value)}
                    className={cls(
                      'c-calendar-demo__toggle',
                      everyMonthValues.includes(month.value) && 'c-calendar-demo__toggle is-active',
                    )}
                    disabled={!check.everyMonth.enabled}
                    onClick={() => toggleNumberList('everyMonth', month.value)}
                  >
                    {month.label}
                  </button>
                ))}
              </div>
              {!check.everyMonth.enabled && check.everyMonth.reason && (
                <span className="c-calendar-demo__reason">{check.everyMonth.reason}</span>
              )}
            </div>

            {!check.everyDate.enabled && check.everyDate.reason && (
              <p className="c-calendar-demo__hint">
                <code>oneOf</code> active — weekday strategy is locked in. Day-of-month is unavailable until weekdays are cleared.
              </p>
            )}

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.everyDate.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.everyDate.detail}>
                {fieldMeta.everyDate.label}
              </span>
              <div className="c-calendar-demo__toggle-grid c-calendar-demo__toggle-grid--days">
                {quickDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={everyDateValues.includes(date)}
                    className={cls(
                      'c-calendar-demo__toggle',
                      everyDateValues.includes(date) && 'c-calendar-demo__toggle is-active',
                    )}
                    disabled={!check.everyDate.enabled}
                    onClick={() => toggleNumberList('everyDate', date)}
                  >
                    {date}
                  </button>
                ))}
              </div>
              <div className="c-calendar-demo__input-row">
                <input
                  className="c-calendar-demo__input"
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
                  className="c-calendar-demo__action"
                  disabled={!check.everyDate.enabled || !everyDateDraft}
                  onClick={() =>
                    addNumberListValue('everyDate', everyDateDraft, () => setEveryDateDraft(''))
                  }
                >
                  Add
                </button>
              </div>
              <div className="c-calendar-demo__chip-row">
                {everyDateValues.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="c-calendar-demo__chip c-calendar-demo__chip--remove"
                    disabled={!check.everyDate.enabled}
                    onClick={() => removeNumberListValue('everyDate', date)}
                  >
                    <span>{date}</span>
                    <span className="c-calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {everyDateValues.length === 0 && (
                  <span className="c-calendar-demo__empty">No day picks.</span>
                )}
              </div>
              {!check.everyDate.enabled && check.everyDate.reason && (
                <span className="c-calendar-demo__reason">{check.everyDate.reason}</span>
              )}
            </div>
          </section>

          <section className="c-calendar-demo__group c-calendar-demo__group--exceptions">
            <div className="c-calendar-demo__group-head">
              <div className="c-calendar-demo__group-kicker">Exclusions</div>
              <div className="c-calendar-demo__group-caption">Carve-outs from patterns</div>
            </div>

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.exceptDates.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.exceptDates.detail}>
                {fieldMeta.exceptDates.label}
              </span>
              <div className="c-calendar-demo__input-row">
                <input
                  className="c-calendar-demo__input"
                  type="date"
                  value={exceptDateDraft}
                  disabled={!check.exceptDates.enabled}
                  onChange={(event) => setExceptDateDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="c-calendar-demo__action"
                  disabled={!check.exceptDates.enabled || !exceptDateDraft}
                  onClick={() =>
                    addStringListValue('exceptDates', exceptDateDraft, () => setExceptDateDraft(''))
                  }
                >
                  Add
                </button>
              </div>
              <div className="c-calendar-demo__chip-row">
                {exceptDateValues.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="c-calendar-demo__chip c-calendar-demo__chip--remove"
                    disabled={!check.exceptDates.enabled}
                    onClick={() => removeStringListValue('exceptDates', date)}
                  >
                    <span>{date}</span>
                    <span className="c-calendar-demo__chip-x">x</span>
                  </button>
                ))}
                {exceptDateValues.length === 0 && (
                  <span className="c-calendar-demo__empty">No excluded dates.</span>
                )}
              </div>
              {!check.exceptDates.enabled && check.exceptDates.reason && (
                <span className="c-calendar-demo__reason">{check.exceptDates.reason}</span>
              )}
            </div>

            <div
              className={cls(
                'c-calendar-demo__control',
                !check.exceptBetween.enabled && 'c-calendar-demo__control is-disabled',
              )}
            >
              <span className="c-calendar-demo__label c-umpire-demo__eyebrow" title={fieldMeta.exceptBetween.detail}>
                {fieldMeta.exceptBetween.label}
              </span>
              <div className="c-calendar-demo__split-inputs">
                <input
                  className="c-calendar-demo__input"
                  type="date"
                  value={exceptBetween.start ?? ''}
                  disabled={!check.exceptBetween.enabled}
                  onChange={(event) => updateExceptBetween('start', event.currentTarget.value)}
                />
                <input
                  className="c-calendar-demo__input"
                  type="date"
                  value={exceptBetween.end ?? ''}
                  disabled={!check.exceptBetween.enabled}
                  onChange={(event) => updateExceptBetween('end', event.currentTarget.value)}
                />
              </div>
              {!check.exceptBetween.enabled && check.exceptBetween.reason && (
                <span className="c-calendar-demo__reason">{check.exceptBetween.reason}</span>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
