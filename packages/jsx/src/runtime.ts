// JSX automatic runtime — @jsxImportSource @umpire/jsx
// This file is what TypeScript/bundlers resolve when they see JSX in a .ump.tsx file.

export function jsx<R>(
  type: (props: Record<string, unknown>) => R,
  props: Record<string, unknown>,
  _key?: string,
): R {
  return type(props)
}

export const jsxs = jsx

export function Fragment({ children }: { children?: unknown }): unknown {
  return children
}
