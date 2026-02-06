import { describe, it, expect } from "vitest";
import { html, css, createContext, Route, type Context } from "./index";

// Helper to consume stream for error testing
async function readStream(stream: ReadableStream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

describe("streamweaver", () => {
  describe("html", () => {
    it("renders basic elements", async () => {
      const app = function* () {
        yield* html`<div></div>`;
      };
      await expect(new Route(app).renderToStream()).toRender("<div></div>");
    });

    it("renders text content", async () => {
      const app = function* () {
        yield* html`<div>Hello</div>`;
      };
      await expect(new Route(app).renderToStream()).toRender(
        "<div>Hello</div>",
      );
    });

    it("renders attributes", async () => {
      const app = function* () {
        yield* html`<div id="foo" class="bar"></div>`;
      };
      await expect(new Route(app).renderToStream()).toRender(
        '<div id="foo" class="bar"></div>',
      );
    });

    it("renders nested arrays of children", async () => {
      const app = function* () {
        yield* html`<ul>
          ${[1, 2].map((i) => html`<li>${i}</li>`)}
        </ul>`;
      };
      await expect(new Route(app).renderToStream()).toRender(
        "<ul><li>1</li><li>2</li></ul>",
      );
    });

    it("renders number children", async () => {
      const app = function* () {
        yield* html`<span>${123}</span>`;
      };
      await expect(new Route(app).renderToStream()).toRender(
        "<span>123</span>",
      );
    });
  });

  describe("Route & Rendering", () => {
    it("renders a simple component to stream", async () => {
      function* MyComponent() {
        yield* html`<p>Simple</p>`;
      }
      await expect(new Route(MyComponent).renderToStream()).toRender(
        "<p>Simple</p>",
      );
    });

    it("renders nested components", async () => {
      function* Child({ name }: { name: string }) {
        yield* html`<span>Hello ${name}</span>`;
      }
      function* Parent() {
        yield* html`<div><${Child} name="World" /></div>`;
      }
      await expect(new Route(Parent).renderToStream()).toRender(
        "<div><span>Hello World</span></div>",
      );
    });

    it("throws if component is not a generator", async () => {
      function Child() {
        return html`<span>Bad</span>`;
      }
      function* Parent() {
        yield* html`<div><${Child} /></div>`;
      }
      // Expect stream to error
      await expect(
        readStream(new Route(Parent).renderToStream()),
      ).rejects.toThrow("Components must be generator functions");
    });
  });

  describe("Context", () => {
    it("provides and consumes context", async () => {
      const MyContext = createContext<string>();
      function* Consumer() {
        const value = yield* MyContext;
        yield* html`<p>${value}</p>`;
      }
      function* App() {
        yield* html`<div><${Consumer} /></div>`;
      }

      const route = new Route(App).setContext(MyContext, "ctx-value");
      await expect(route.renderToStream()).toRender(
        "<div><p>ctx-value</p></div>",
      );
    });

    it("throws error when consuming missing context", async () => {
      const MyContext = createContext<string>();
      function* Consumer() {
        yield* MyContext;
      }
      const route = new Route(Consumer);

      await expect(readStream(route.renderToStream())).rejects.toThrow(
        "Context not provided",
      );
    });

    it("handles context provided as a value", async () => {
      const MyContext = createContext<string>();
      function* Consumer() {
        const value = yield* MyContext;
        yield* html`<p>${value}</p>`;
      }

      const route = new Route(Consumer).setContext(MyContext, "simple-value");
      await expect(route.renderToStream()).toRender("<p>simple-value</p>");
    });

    it("handles context provided as a generator", async () => {
      const MyContext = createContext<string>();
      const NestedContext = createContext<string>();

      function* Consumer() {
        const value = yield* MyContext;
        yield* html`<p>${value}</p>`;
      }

      function* contextProvider() {
        const nested = yield* NestedContext;
        return `sync-value-${nested}`;
      }

      const route = new Route(Consumer)
        .setContext(MyContext, contextProvider)
        .setContext(NestedContext, "nested");

      await expect(route.renderToStream()).toRender("<p>sync-value-nested</p>");
    });

    it("handles context provided as an async generator", async () => {
      const MyContext = createContext<string>();
      const NestedContext = createContext<string>();

      function* Consumer() {
        const value = yield* MyContext;
        yield* html`<p>${value}</p>`;
      }

      async function* contextProvider() {
        await Promise.resolve();
        const nested = yield* NestedContext;
        return `async-value-${nested}`;
      }

      const route = new Route(Consumer)
        .setContext(MyContext, contextProvider)
        .setContext(NestedContext, "nested");

      await expect(route.renderToStream()).toRender(
        "<p>async-value-nested</p>",
      );
    });
  });

  describe("CSS", () => {
    it("injects styles from css tagged templates", async () => {
      const style = css`
        .red {
          color: red;
        }
      `;
      function* App() {
        yield style;
        yield* html`<div class="red">Red</div>`;
      }
      await expect(new Route(App).renderToStream()).toRender(
        `<style>${style.content}</style><div class="red">Red</div>`,
      );
    });

    it("deduplicates identical css blocks", async () => {
      const style = css`
        .red {
          color: red;
        }
      `;
      function* Comp() {
        yield style;
        yield* html`<div>Comp</div>`;
      }
      function* App() {
        yield style;
        yield* html`<${Comp} />`;
      }
      await expect(new Route(App).renderToStream()).toRender(
        `<style>${style.content}</style><div>Comp</div>`,
      );
    });
  });
});
