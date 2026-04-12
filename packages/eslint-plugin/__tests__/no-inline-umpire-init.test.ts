import { RuleTester } from 'eslint'
import rule from '../src/rules/no-inline-umpire-init.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-inline-umpire-init', rule, {
  valid: [
    // Module-level — always fine.
    {
      code: `
        const ump = umpire({ fields: { a: {} }, rules: [] })
        function MyComponent({ values }) {
          const { check } = useUmpire(ump, values)
        }
      `,
    },
    // Wrapped in useMemo — fine.
    {
      code: `
        function MyComponent({ values }) {
          const ump = useMemo(() => umpire({ fields: { a: {} }, rules: [] }), [])
          const { check } = useUmpire(ump, values)
        }
      `,
    },
    // Wrapped in React.useMemo — fine.
    {
      code: `
        function MyComponent({ values }) {
          const ump = React.useMemo(() => umpire({ fields: { a: {} }, rules: [] }), [])
        }
      `,
    },
    // Inside a hook, wrapped in useMemo — fine.
    {
      code: `
        function useMyHook(values) {
          const ump = useMemo(() => umpire({ fields: { a: {} }, rules: [] }), [])
          return useUmpire(ump, values)
        }
      `,
    },
    // Regular lowercase function — not a component or hook, skip.
    {
      code: `
        function buildConfig() {
          return umpire({ fields: { a: {} }, rules: [] })
        }
      `,
    },
    // Arrow function assigned to lowercase name — skip.
    {
      code: `
        const createUmp = () => umpire({ fields: { a: {} }, rules: [] })
      `,
    },
  ],

  invalid: [
    // Direct call in function component body.
    {
      code: `
        function MyForm({ values }) {
          const ump = umpire({ fields: { a: {} }, rules: [] })
          const { check } = useUmpire(ump, values)
        }
      `,
      errors: [{ messageId: 'inlineInit' }],
    },
    // Arrow component.
    {
      code: `
        const MyForm = ({ values }) => {
          const ump = umpire({ fields: { a: {} }, rules: [] })
        }
      `,
      errors: [{ messageId: 'inlineInit' }],
    },
    // Inside a custom hook body.
    {
      code: `
        function useFormUmp(values) {
          const ump = umpire({ fields: { a: {} }, rules: [] })
          return useUmpire(ump, values)
        }
      `,
      errors: [{ messageId: 'inlineInit' }],
    },
    // Arrow hook.
    {
      code: `
        const useFormUmp = (values) => {
          const ump = umpire({ fields: { a: {} }, rules: [] })
          return useUmpire(ump, values)
        }
      `,
      errors: [{ messageId: 'inlineInit' }],
    },
    // Nested inner function inside component — still fires.
    {
      code: `
        function MyComponent({ values }) {
          const getUmp = () => umpire({ fields: { a: {} }, rules: [] })
        }
      `,
      errors: [{ messageId: 'inlineInit' }],
    },
  ],
})
