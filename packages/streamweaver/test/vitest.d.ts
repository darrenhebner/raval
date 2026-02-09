import "vitest";

interface CustomMatchers<R = unknown> {
  toRender(expected: string): Promise<R>;
  toThrowCustomError(expected: new (...args: unknown[]) => Error): Promise<R>;
}

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: Needs to match vitest config
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
