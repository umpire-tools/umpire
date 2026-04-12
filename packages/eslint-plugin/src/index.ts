import type { Linter } from 'eslint'
import noInlineUmpireInit from './rules/no-inline-umpire-init.js'
import noSelfDisable from './rules/no-self-disable.js'
import noUnknownFields from './rules/no-unknown-fields.js'

const plugin = {
  meta: {
    name: '@umpire/eslint-plugin',
  },
  rules: {
    'no-unknown-fields': noUnknownFields,
    'no-inline-umpire-init': noInlineUmpireInit,
    'no-self-disable': noSelfDisable,
  },
  configs: {} as Record<string, Linter.Config>,
}

// Self-referential recommended config — standard ESLint flat config pattern.
plugin.configs.recommended = {
  plugins: { '@umpire': plugin },
  rules: {
    '@umpire/no-unknown-fields': 'warn',
    '@umpire/no-inline-umpire-init': 'warn',
    '@umpire/no-self-disable': 'error',
  },
}

export default plugin
