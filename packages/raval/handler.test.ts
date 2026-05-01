import { describe, expect, it } from "vitest";
import { css, Handler, html, renderToStream } from "./index.js";

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

describe("Handler", () => {
  it("Handler.prepare returns a Handler instance", () => {
    const handler = Handler.prepare(function* () {
      yield* html`<p>hello</p>`;
    });
    expect(handler).toBeInstanceOf(Handler);
  });

  it("renderToStream is a standalone function", () => {
    expect(typeof renderToStream).toBe("function");
  });

  it("renderToStream returns a ReadableStream", () => {
    const handler = Handler.prepare(function* () {
      yield* html`<div></div>`;
    });
    expect(renderToStream(handler)).toBeInstanceOf(ReadableStream);
  });

  it("streams static HTML as UTF-8 encoded chunks", async () => {
    const handler = Handler.prepare(function* () {
      yield* html`<h1>Hello world</h1>`;
    });
    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<h1>Hello world</h1>");
  });

  it("streams multiple html segments in order", async () => {
    const handler = Handler.prepare(function* () {
      yield* html`<header></header>`;
      yield* html`<main></main>`;
    });
    const output = await streamToString(renderToStream(handler));
    expect(output).toBe("<header></header><main></main>");
  });

  it("emits Css instance as a <style> block", async () => {
    const style = css`.red { color: red; }`;
    const handler = Handler.prepare(function* () {
      yield style;
      yield* html`<div class="red">hi</div>`;
    });
    const output = await streamToString(renderToStream(handler));
    expect(output).toBe(
      `<style>.red { color: red; }</style><div class="red">hi</div>`
    );
  });

  it("deduplicates Css: same instance emitted only once", async () => {
    const style = css`.btn { font-size: 1rem; }`;
    const handler = Handler.prepare(function* () {
      yield style;
      yield* html`<button>A</button>`;
      yield style;
      yield* html`<button>B</button>`;
    });
    const output = await streamToString(renderToStream(handler));
    expect(output).toBe(
      "<style>.btn { font-size: 1rem; }</style><button>A</button><button>B</button>"
    );
  });

  it("deduplicates Css across composed generators", async () => {
    const style = css`.card { border: 1px solid; }`;
    function* Card(label: string) {
      yield style;
      yield* html`<div class="card">${label}</div>`;
    }
    const handler = Handler.prepare(function* () {
      yield* Card("First");
      yield* Card("Second");
    });
    const output = await streamToString(renderToStream(handler));
    expect(output).toBe(
      `<style>.card { border: 1px solid; }</style><div class="card">First</div><div class="card">Second</div>`
    );
  });
});
