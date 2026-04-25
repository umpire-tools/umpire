import type { ChallengeTrace, ChallengeTraceAttachment } from '@umpire/core'
import { formatValue, getReasonMeta, getTraceMeta } from './format.js'
import type { ReasonLike } from './format.js'
import {
  getRuleTone,
  pillStyle,
  scrollPaneStyle,
  sectionHeadingStyle,
  theme,
} from './theme.js'

type Props = {
  field: string
  onBack: () => void
  trace: ChallengeTrace
}

type ReasonProps = {
  depth?: number
  reason: ReasonLike
}

type BranchReasonGroup = {
  passed: boolean
  inner: ReasonLike[]
}

function MetaRows({ entries }: { entries: Array<[string, unknown]> }) {
  if (entries.length === 0) {
    return null
  }

  return (
    <dl
      style={{
        columnGap: 12,
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        margin: 0,
        rowGap: 6,
      }}
    >
      {entries.map(([key, value]) => (
        <>
          <dt
            key={`${key}:label`}
            style={{ color: theme.fgMuted, fontSize: 11 }}
          >
            {key}
          </dt>
          <dd
            key={`${key}:value`}
            style={{ color: theme.fg, fontSize: 11, margin: 0 }}
          >
            {formatValue(value, 80)}
          </dd>
        </>
      ))}
    </dl>
  )
}

function BranchGroupsView({
  branches,
  depth,
}: {
  branches: Record<string, BranchReasonGroup>
  depth: number
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Object.entries(branches).map(([branchName, branch]) => (
        <div
          key={branchName}
          style={{
            background: theme.surfaceMuted,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            display: 'grid',
            gap: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 8,
              justifyContent: 'space-between',
            }}
          >
            <strong style={{ color: theme.fg, fontSize: 12 }}>
              {branchName}
            </strong>
            <span
              style={pillStyle(
                branch.passed ? theme.enabled : theme.disabled,
                true,
              )}
            >
              {branch.passed ? 'match' : 'no match'}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 0 }}>
            {branch.inner.map((entry, index) => (
              <ReasonView
                key={`${branchName}:${entry.rule}:${index}`}
                depth={depth + 1}
                reason={entry}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TraceAttachmentView({ trace }: { trace: ChallengeTraceAttachment }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${theme.ruleOneOf}`,
        display: 'grid',
        gap: 8,
        marginTop: 10,
        paddingLeft: 12,
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
        <span style={pillStyle(theme.ruleOneOf, true)}>{trace.kind}</span>
        <strong style={{ color: theme.fg, fontSize: 11 }}>{trace.id}</strong>
      </div>

      <MetaRows entries={getTraceMeta(trace)} />

      {trace.dependencies && trace.dependencies.length > 0 && (
        <div style={{ color: theme.fgMuted, fontSize: 11 }}>
          depends on:{' '}
          {trace.dependencies
            .map((dependency) => `${dependency.kind}:${dependency.id}`)
            .join(', ')}
        </div>
      )}
    </div>
  )
}

function ReasonView({ depth = 0, reason }: ReasonProps) {
  const tone = getRuleTone(reason.rule)
  const inner = Array.isArray(reason.inner)
    ? (reason.inner as ReasonLike[])
    : []
  const branches =
    reason.branches &&
    typeof reason.branches === 'object' &&
    !Array.isArray(reason.branches)
      ? (reason.branches as Record<string, BranchReasonGroup>)
      : null
  const passed = reason.passed ?? false

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        borderLeft: `3px solid ${tone}`,
        display: 'grid',
        gap: 8,
        marginLeft: depth * 10,
        padding: '12px 12px 12px 14px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <span style={pillStyle(tone, true)}>{reason.rule}</span>
          <span
            style={pillStyle(passed ? theme.enabled : theme.disabled, true)}
          >
            {passed ? 'pass' : 'fail'}
          </span>
        </div>
        {typeof reason.ruleId === 'string' && (
          <span style={{ color: theme.fgMuted, fontSize: 10 }}>
            {reason.ruleId}
          </span>
        )}
      </div>

      {reason.reason && (
        <div style={{ color: theme.fg, fontSize: 12, lineHeight: 1.5 }}>
          {reason.reason}
        </div>
      )}

      <MetaRows entries={getReasonMeta(reason)} />

      {Array.isArray(reason.trace) && reason.trace.length > 0 && (
        <div>
          {reason.trace.map((trace) => (
            <TraceAttachmentView
              key={`${trace.kind}:${trace.id}`}
              trace={trace}
            />
          ))}
        </div>
      )}

      {branches && Object.keys(branches).length > 0 && (
        <BranchGroupsView branches={branches} depth={depth} />
      )}

      {inner.length > 0 && (
        <div style={{ display: 'grid', gap: 0 }}>
          {inner.map((entry, index) => (
            <ReasonView
              key={`${entry.rule}:${index}`}
              depth={depth + 1}
              reason={entry}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ChallengeDrawer({ field, onBack, trace }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          gap: 10,
          justifyContent: 'space-between',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <button
            onClick={onBack}
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              color: theme.accent,
              cursor: 'pointer',
              fontSize: 11,
              justifySelf: 'start',
              padding: 0,
              textTransform: 'uppercase',
            }}
            type="button"
          >
            {'<- back'}
          </button>
          <strong style={{ color: theme.fg, fontSize: 13 }}>
            challenge({field})
          </strong>
        </div>

        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <span
            style={pillStyle(
              trace.enabled ? theme.enabled : theme.disabled,
              true,
            )}
          >
            {trace.enabled ? 'enabled' : 'disabled'}
          </span>
          <span
            style={pillStyle(trace.fair ? theme.enabled : theme.fair, true)}
          >
            {trace.fair ? 'fair' : 'fair fail'}
          </span>
        </div>
      </div>

      <div style={scrollPaneStyle()}>
        <section
          style={{ borderBottom: `1px solid ${theme.border}`, padding: 14 }}
        >
          <h3 style={sectionHeadingStyle()}>Direct Reasons</h3>
        </section>
        <div style={{ display: 'grid' }}>
          {trace.directReasons.map((reason, index) => (
            <ReasonView key={`${reason.rule}:${index}`} reason={reason} />
          ))}
        </div>

        <section
          style={{ borderBottom: `1px solid ${theme.border}`, padding: 14 }}
        >
          <h3 style={sectionHeadingStyle()}>Transitive Dependencies</h3>
        </section>
        {trace.transitiveDeps.length === 0 ? (
          <div style={{ color: theme.fgMuted, padding: 14 }}>
            No transitive blockers for this field.
          </div>
        ) : (
          trace.transitiveDeps.map((dependency) => (
            <div
              key={dependency.field}
              style={{
                borderBottom: `1px solid ${theme.border}`,
                display: 'grid',
                gap: 8,
                padding: 14,
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                }}
              >
                <strong style={{ color: theme.fg, fontSize: 12 }}>
                  {dependency.field}
                </strong>
                <span
                  style={pillStyle(
                    dependency.enabled ? theme.enabled : theme.disabled,
                    true,
                  )}
                >
                  {dependency.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>

              <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                {dependency.reason ?? 'No reason provided'}
              </div>

              <div style={{ display: 'grid', gap: 0 }}>
                {dependency.causedBy.map((reason, index) => (
                  <ReasonView
                    key={`${dependency.field}:${index}`}
                    depth={1}
                    reason={reason as ReasonLike}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {trace.oneOfResolution && (
          <>
            <section
              style={{ borderBottom: `1px solid ${theme.border}`, padding: 14 }}
            >
              <h3 style={sectionHeadingStyle()}>oneOf Resolution</h3>
            </section>
            <div
              style={{
                borderBottom: `1px solid ${theme.border}`,
                display: 'grid',
                gap: 8,
                padding: 14,
              }}
            >
              <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                group:{' '}
                <span style={{ color: theme.fg }}>
                  {trace.oneOfResolution.group}
                </span>
              </div>
              <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                active branch:{' '}
                <span style={{ color: theme.fg }}>
                  {trace.oneOfResolution.activeBranch ?? 'none'}
                </span>
              </div>
              <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                method:{' '}
                <span style={{ color: theme.fg }}>
                  {trace.oneOfResolution.method}
                </span>
              </div>

              {Object.entries(trace.oneOfResolution.branches).map(
                ([branch, detail]) => (
                  <div
                    key={branch}
                    style={{
                      borderTop: `1px solid ${theme.border}`,
                      display: 'grid',
                      gap: 6,
                      paddingTop: 10,
                    }}
                  >
                    <strong style={{ color: theme.fg, fontSize: 12 }}>
                      {branch}
                    </strong>
                    <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                      fields: {detail.fields.join(', ')}
                    </div>
                    <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                      any satisfied: {detail.anySatisfied ? 'yes' : 'no'}
                    </div>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
