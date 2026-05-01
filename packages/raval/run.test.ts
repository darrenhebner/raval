import { describe, expect, it } from "vitest";
import { createContext, Handler, html, run } from "./index.js";

describe("run", () => {
  it("is a standalone exported function", () => {
    expect(typeof run).toBe("function");
  });

  it("returns a promise of the handler's return value", async () => {
    // biome-ignore lint/correctness/useYield: testing action handler that returns without yielding
    const handler = Handler.prepare(function* () {
      return 42;
    });
    const result = await run(handler);
    expect(result).toBe(42);
  });

  it("resolves a plain context and returns the final value", async () => {
    const UserCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const user = yield* UserCtx;
      return `hello-${user}`;
    }).setContext(UserCtx, "alice");

    const result = await run(handler);
    expect(result).toBe("hello-alice");
  });

  it("resolves a generator provider context and returns the final value", async () => {
    const UserCtx = createContext<string>();
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      return `action-${token}`;
    })
      .setContext(TokenCtx, function* () {
        const user = yield* UserCtx;
        return `tok-${user}`;
      })
      .setContext(UserCtx, "bob");

    const result = await run(handler);
    expect(result).toBe("action-tok-bob");
  });

  it("ignores non-context yields", async () => {
    const handler = Handler.prepare(function* () {
      yield "ignored string";
      yield* html`<p>ignored html</p>`;
      return "done";
    });
    const result = await run(handler);
    expect(result).toBe("done");
  });

  it("TypeScript prevents run when context is unsatisfied", () => {
    const Ctx = createContext<string>();
    const handler = Handler.prepare(function* () {
      yield* Ctx;
      return "value";
    });
    // @ts-expect-error — required context not satisfied
    run(handler).catch((_: unknown) => {
      // expected rejection — unsatisfied context throws MissingContextError
    });
  });
});
