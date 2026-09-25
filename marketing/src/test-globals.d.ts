declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void
}

declare module "node:assert/strict" {
  interface Assert {
    ok(value: unknown): asserts value
    equal(actual: unknown, expected: unknown): void
    match(value: string, expression: RegExp): void
    doesNotMatch(value: string, expression: RegExp): void
  }
  const assert: Assert
  export default assert
}
