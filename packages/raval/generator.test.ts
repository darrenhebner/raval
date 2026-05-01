import { describe, expect, it } from "vitest";
import { createContext, Handler, html, renderToStream } from "./index.js";

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  reader.releaseLock();
  return result;
}

describe("generator context providers", () => {
  it("provides context via sync generator provider", async () => {
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
      // biome-ignore lint/correctness/useYield: testing generator provider that returns without yielding contexts
    }).setContext(TokenCtx, function* () {
      return "gen-token";
    });

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>gen-token</span>");
  });

  it("provides context via async generator provider", async () => {
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
      // biome-ignore lint/correctness/useYield: testing async generator provider that returns without yielding contexts
    }).setContext(TokenCtx, async function* () {
      await Promise.resolve();
      return "async-gen-token";
    });

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>async-gen-token</span>");
  });

  it("tracks transitive context dependency from sync generator provider at the type level", () => {
    const UserCtx = createContext<string>();
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
    }).setContext(TokenCtx, function* () {
      const user = yield* UserCtx;
      return `token-for-${user}`;
    });

    // UserCtx is now required on handler (transitive dep from TokenCtx provider)
    // @ts-expect-error — UserCtx is still unsatisfied
    renderToStream(handler);
  });

  it("tracks transitive context dependency from async generator provider at the type level", () => {
    const UserCtx = createContext<string>();
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
    }).setContext(TokenCtx, async function* () {
      await Promise.resolve();
      const user = yield* UserCtx;
      return `token-for-${user}`;
    });

    // UserCtx is now required on handler (transitive dep from TokenCtx async provider)
    // @ts-expect-error — UserCtx is still unsatisfied
    renderToStream(handler);
  });

  it("resolves transitive context dependency at runtime (sync provider)", async () => {
    const UserCtx = createContext<string>();
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
    })
      .setContext(TokenCtx, function* () {
        const user = yield* UserCtx;
        return `token-for-${user}`;
      })
      .setContext(UserCtx, "alice");

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>token-for-alice</span>");
  });

  it("resolves transitive context dependency at runtime (async provider)", async () => {
    const UserCtx = createContext<string>();
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
    })
      .setContext(TokenCtx, async function* () {
        await Promise.resolve();
        const user = yield* UserCtx;
        return `token-for-${user}`;
      })
      .setContext(UserCtx, "bob");

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>token-for-bob</span>");
  });

  it("resolves deeply nested transitive dependencies at runtime", async () => {
    const ACtx = createContext<string>();
    const BCtx = createContext<string>();
    const CCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const c = yield* CCtx;
      yield* html`<span>${c}</span>`;
    })
      .setContext(CCtx, function* () {
        const b = yield* BCtx;
        return `c-from-${b}`;
      })
      .setContext(BCtx, async function* () {
        await Promise.resolve();
        const a = yield* ACtx;
        return `b-from-${a}`;
      })
      .setContext(ACtx, "a-val");

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>c-from-b-from-a-val</span>");
  });
});
