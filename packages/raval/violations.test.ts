import { describe, expect, it } from "vitest";
import {
  createContext,
  Handler,
  html,
  renderToStream,
  run,
  Violation,
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

describe("violations", () => {
  it("violation from root generator short-circuits renderToStream and injects snippet", async () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
      yield* html`<p>never reached</p>`;
    });
    const output = await streamToString(
      renderToStream(
        handler,
        () => `<meta http-equiv="refresh" content="0;url=/login">`
      )
    );
    expect(output).toBe(`<meta http-equiv="refresh" content="0;url=/login">`);
  });

  it("violation from context provider surfaces in renderToStream", async () => {
    const AuthCtx = createContext<string>();

    const handler = Handler.prepare(function* () {
      const auth = yield* AuthCtx;
      yield* html`<p>${auth}</p>`;
    }).setContext(AuthCtx, function* () {
      yield* new Violation("unauthorized");
      return "unreachable";
    });

    const output = await streamToString(
      renderToStream(handler, (v) => `<!-- ${v.name} -->`)
    );
    expect(output).toBe("<!-- unauthorized -->");
  });

  it("when violation handler returns void renderToStream closes stream with no output", async () => {
    const handler = Handler.prepare(function* () {
      yield* html`<header></header>`;
      yield* new Violation("unauthorized");
      yield* html`<p>never reached</p>`;
    });
    const output = await streamToString(
      renderToStream(handler, () => undefined)
    );
    expect(output).toBe("<header></header>");
  });

  it("violation in run returns the violation handler's value", async () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
      return "never reached";
    });
    const result = await run(handler, (v) => `fallback-${v.name}`);
    expect(result).toBe("fallback-unauthorized");
  });

  it("violation in run with void handler returns undefined", async () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
      return "never reached";
    });
    const result = await run(handler, () => undefined);
    expect(result).toBeUndefined();
  });

  it("violation names form a discriminated union", () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
      yield* new Violation("forbidden");
    });
    renderToStream(handler, (v) => {
      if (v.name === "unauthorized") {
        return "<p>unauthorized</p>";
      }
      if (v.name === "forbidden") {
        return "<p>forbidden</p>";
      }
    });
  });

  it("TypeScript requires violation handler for renderToStream when violations exist", () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
    });
    // @ts-expect-error — violation handler required
    renderToStream(handler);
  });

  it("TypeScript requires violation handler for run when violations exist", () => {
    const handler = Handler.prepare(function* () {
      yield* new Violation("unauthorized");
      return "value";
    });
    // @ts-expect-error — violation handler required
    run(handler);
  });
});
