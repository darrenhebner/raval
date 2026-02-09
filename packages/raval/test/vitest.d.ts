import "vitest";

interface CustomMatchers<R = unknown> {
  toRender(expected: string): Promise<R>;
  toThrowCustomError(expected: new (...args: unknown[]) => Error): Promise<R>;
}

declare module "vitest" {
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
