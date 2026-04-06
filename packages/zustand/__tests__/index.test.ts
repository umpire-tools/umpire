import { fromStore } from '../src/index.js'

describe('@umpire/zustand', () => {
  it('re-exports fromStore', () => {
    expect(typeof fromStore).toBe('function')
  })
})
