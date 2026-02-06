import 'vitest';

interface CustomMatchers<R = unknown> {
  toRender(expected: string): Promise<R>;
  toThrowCustomError(expected: new (...args: any[]) => Error): Promise<R>;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
