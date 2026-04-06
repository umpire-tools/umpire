import { layoutGraph, NODE_FONT_SIZE } from '../graph.js'
import { pillStyle, scrollPaneStyle, theme } from '../theme.js'
import type { AnyScorecard } from '../../types.js'

type Props = {
  onSelectField: (field: string) => void
  scorecard: AnyScorecard
  selectedField: string | null
}

export function GraphTab({ onSelectField, scorecard, selectedField }: Props) {
  const layout = layoutGraph(scorecard)
  const edgeTypes = [...new Set(layout.edges.map((edge) => edge.type))]

  return (
    <div style={{ ...scrollPaneStyle(), display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: 12,
        }}
      >
        {edgeTypes.map((type) => (
          <span key={type} style={pillStyle(layout.edges.find((edge) => edge.type === type)?.color ?? theme.accent, true)}>
            {type}
          </span>
        ))}
      </div>

      <div style={{ overflow: 'auto' }}>
        <svg
          viewBox={`0 0 ${layout.width * 1.5} ${layout.height * 1.5}`}
          width={layout.width}
          height={layout.height}
          style={{ display: 'block' }}
        >
          <defs>
            {edgeTypes.map((type) => {
              const edge = layout.edges.find((entry) => entry.type === type)

              if (!edge) {
                return null
              }

              return (
                <marker
                  key={type}
                  id={`umpire-arrow-${type}`}
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto-start-reverse"
                  refX="7"
                  refY="3.5"
                >
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill={edge.color} />
                </marker>
              )
            })}
          </defs>

          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              markerEnd={`url(#umpire-arrow-${edge.type})`}
              stroke={edge.color}
              strokeOpacity="0.9"
              strokeWidth="2"
            />
          ))}

          {layout.nodes.map((node) => {
            const isSelected = selectedField === node.field

            return (
              <g
                key={node.field}
                onClick={() => onSelectField(node.field)}
                style={{ cursor: 'pointer' }}
              >
                {isSelected && (
                  <rect
                    fill="none"
                    height={node.height + 8}
                    rx="12"
                    stroke={theme.accent}
                    strokeWidth="2"
                    width={node.width + 8}
                    x={node.x - 4}
                    y={node.y - 4}
                  />
                )}
                <rect
                  fill={theme.surfaceRaised}
                  height={node.height}
                  rx="10"
                  stroke={node.color}
                  strokeWidth="2"
                  width={node.width}
                  x={node.x}
                  y={node.y}
                />
                <text
                  dominantBaseline="central"
                  fill={theme.fg}
                  fontFamily="JetBrains Mono, monospace"
                  fontSize={NODE_FONT_SIZE}
                  textAnchor="start"
                  x={node.x + 6}
                  y={node.y + (node.height / 2) + (NODE_FONT_SIZE / 2)}
                >
                  {node.field}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
