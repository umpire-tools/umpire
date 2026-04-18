import { oneOf, umpire } from '../src/index.js'

type Fields = {
  mode: {}
  alpha: {}
  beta: {}
}

const fields = {
  mode: {},
  alpha: {},
  beta: {},
} as const satisfies Fields

umpire<Fields>({
  fields,
  rules: [
    oneOf('strategy', {
      first: ['alpha'],
      second: ['beta'],
    }, {
      activeBranch: (values) => (values.mode === 'second' ? 'second' : 'first'),
    }),
  ],
})

oneOf('strategy', {
  first: ['alpha'],
  second: ['beta'],
}, { activeBranch: 'first' })

oneOf('strategy', {
  first: ['alpha'],
  second: ['beta'],
}, {
  // @ts-expect-error unknown static branch should fail
  activeBranch: 'third',
})

oneOf('strategy', {
  first: ['alpha'],
  second: ['beta'],
}, {
  // @ts-expect-error dynamic branch return must be one of declared branches
  activeBranch: () => 'third',
})
