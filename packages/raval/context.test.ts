import { describe, expect, it } from "vitest";
import {
  createContext,
  Handler,
  html,
  MissingContextError,
  renderToStream,
} from "./index.js";

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

describe("context injection", () => {
  it("provides and consumes a plain value context", async () => {
    const UserCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const user = yield* UserCtx;
      yield* html`<p>${user}</p>`;
    }).setContext(UserCtx, "alice");

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<p>alice</p>");
  });

  it("provides and consumes a plain async function context", async () => {
    const TokenCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const token = yield* TokenCtx;
      yield* html`<span>${token}</span>`;
    }).setContext(TokenCtx, async () => {
      await Promise.resolve();
      return "tok-123";
    });

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<span>tok-123</span>");
  });

  it("supports multiple contexts", async () => {
    const NameCtx = createContext<string>();
    const RoleCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const name = yield* NameCtx;
      const role = yield* RoleCtx;
      yield* html`<p>${name} is ${role}</p>`;
    })
      .setContext(NameCtx, "bob")
      .setContext(RoleCtx, "admin");

    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<p>bob is admin</p>");
  });

  it("throws MissingContextError at runtime when context not provided", async () => {
    const MissingCtx = createContext<string>();

    // @ts-expect-error — required context not satisfied
    const handler = Handler.prepare(function* () {
      yield* MissingCtx;
    });

    await expect(
      streamToString(renderToStream(handler))
    ).rejects.toBeInstanceOf(MissingContextError);
  });

  it("setContext returns a Handler with the satisfied context removed", () => {
    const Ctx = createContext<number>();
    const partial = Handler.prepare(function* () {
      yield* Ctx;
      yield* html`<div></div>`;
    });
    const satisfied = partial.setContext(Ctx, 42);
    // If types work, renderToStream(satisfied) compiles; renderToStream(partial) does not
    expect(satisfied).toBeInstanceOf(Handler);
  });

  it("TypeScript prevents renderToStream when context is unsatisfied", () => {
    const Ctx = createContext<string>();
    const handler = Handler.prepare(function* () {
      yield* Ctx;
    });
    // @ts-expect-error — required context not satisfied
    renderToStream(handler);
  });
});
