import tseslint from 'typescript-eslint'
import umpirePlugin from '@umpire/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  // TypeScript + complexity for packages
  {
    files: ['packages/**/*.{ts,tsx}'],
    extends: tseslint.configs.recommended,
    rules: {
      complexity: ['warn', 15],
      // {} is used intentionally as a generic type throughout umpire's type system
      '@typescript-eslint/no-empty-object-type': 'off',
      // Real issues but numerous; tracked as warnings to drive gradual cleanup
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // complexity doesn't map well to component render functions
  {
    files: ['packages/**/*.tsx'],
    rules: {
      complexity: 'off',
    },
  },
  // type-tests declare values solely to assert types — unused vars are expected
  {
    files: ['packages/*/type-tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // TypeScript parser for docs source — enables umpire plugin without full TS-ESLint rules
  {
    files: ['docs/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  // Umpire plugin for packages + docs TS/JS source
  {
    files: ['packages/**/*.{ts,tsx,js}', 'docs/src/**/*.{ts,js}'],
    ...umpirePlugin.configs.recommended,
  },
  // Prettier compat for packages only — docs excluded intentionally
  {
    files: ['packages/**/*.{ts,tsx,js}'],
    ...prettierConfig,
  },
)
