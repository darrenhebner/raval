import { expect } from "vitest";

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return result;
}

expect.extend({
  async toRender(received: ReadableStream, expected: string) {
    const { isNot } = this;

    let actual: string;
    try {
      actual = await streamToString(received);
    } catch (error: any) {
      return {
        pass: false,
        message: () =>
          `Expected stream to render successfully, but it failed with: ${error.message}`,
      };
    }

    const pass = actual === expected;

    return {
      pass,
      message: () =>
        `expected stream output to${isNot ? " not" : ""} equal:\n` +
        `  ${this.utils.printExpected(expected)}\n` +
        "Received:\n" +
        `  ${this.utils.printReceived(actual)}`,
      actual,
      expected,
    };
  },
  async toThrowCustomError(
    received: ReadableStream,
    expected: new (...args: any[]) => Error
  ) {
    const { isNot } = this;
    let error: any;

    try {
      await streamToString(received);
    } catch (e) {
      error = e;
    }

    if (!error) {
      return {
        pass: false,
        message: () =>
          `Expected stream to throw ${expected.name}, but it rendered successfully.`,
      };
    }

    const pass = error instanceof expected;

    return {
      pass,
      message: () =>
        `expected stream error to${isNot ? " not" : ""} be instance of ${expected.name}. Received: ${error?.constructor?.name || error}`,
    };
  },
});
