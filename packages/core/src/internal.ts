// Graph
export {
  buildGraph,
  detectCycles,
  topologicalSort,
  exportGraph,
} from './graph.js'
export type { DependencyGraph, GraphEdge } from './graph.js'

// Evaluator
export {
  evaluate,
  evaluateRuleForField,
  indexRulesByTarget,
  indexRulesByTargetPhase,
} from './evaluator.js'

// Composite
export {
  appendCompositeFailureReasons,
  getCompositeFailureReasons,
  combineCompositeResults,
  getCompositeTargetEvaluation,
} from './composite.js'
export type { CompositeConstraint, CompositeMode } from './composite.js'

// Rules (runtime)
export {
  getInternalRuleMetadata,
  getGraphSourceInfo,
  getRuleConstraint,
  isFairRule,
  isGateRule,
  resolveOneOfState,
  resolveReason,
  getSourceField,
} from './rules.js'

// Rules (types)
export type {
  InternalRuleMetadata,
  InternalPredicate,
  InternalSource,
  InternalOneOfBranches,
  InternalFairPredicate,
  InternalRuleTargetEvaluator,
  OneOfResolution,
  GraphSourceInfo,
} from './rules.js'

// Validation
export {
  normalizeValidationEntry,
  runValidationEntry,
  runFieldValidator,
  isNamedCheck,
} from './validation.js'
export type { NormalizedValidationEntry } from './validation.js'

// Umpire config helpers
export {
  normalizeConfig,
  validateRules,
  normalizeValidators,
  getRuleTraceAttachments,
  inspectRuleTraceAttachments,
} from './umpire.js'

// Dev
export { shouldWarnInDev } from './dev.js'
