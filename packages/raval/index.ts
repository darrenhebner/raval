export class MissingContextError extends Error {
  constructor() {
    super("Context not provided");
    this.name = "MissingContextError";
  }
}

export class InvalidComponentError extends Error {
  constructor() {
    super("Components must be generator functions");
    this.name = "InvalidComponentError";
  }
}

export class Context<T> {
  __type = "Context" as const;
  *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
    return (yield this) as T;
  }
}

export function createContext<T>() {
  return new Context<T>();
}

export class Violation<Name extends string> {
  name: Name;
  __type = "Violation" as const;

  constructor(name: Name) {
    this.name = name;
  }

  *[Symbol.iterator](): Generator<Violation<Name>, void, unknown> {
    yield this;
  }
}

export class Css {
  readonly #content: string;

  constructor(content: string) {
    this.#content = content;
  }

  get content() {
    return this.#content;
  }
}

export function css(strings: TemplateStringsArray, ...values: string[]): Css {
  let content = "";

  for (let i = 0; i < strings.length; i++) {
    content += strings[i];
    const value = values[i];

    if (value) {
      content += value;
    }
  }

  return new Css(content);
}

type HtmlValue = string | number | Css | HtmlValue[];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function* yieldValue(value: HtmlValue): Generator<string | Css> {
  if (value instanceof Css) {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      yield* yieldValue(item);
    }
  } else {
    yield escapeHtml(String(value));
  }
}

export function* html(
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): Generator<string | Css> {
  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    if (str) {
      yield str;
    }
    if (i < values.length) {
      const val = values[i];
      if (val !== undefined) {
        yield* yieldValue(val);
      }
    }
  }
}

export class Handler {
  readonly #fn: () => Generator<string | Css>;

  static prepare(fn: () => Generator<string | Css>): Handler {
    return new Handler(fn);
  }

  private constructor(fn: () => Generator<string | Css>) {
    this.#fn = fn;
  }

  get fn() {
    return this.#fn;
  }
}

export function renderToStream(handler: Handler): ReadableStream {
  const encoder = new TextEncoder();
  const styles = new Set<Css>();

  return new ReadableStream({
    start(controller) {
      try {
        for (const chunk of handler.fn()) {
          if (chunk instanceof Css) {
            if (!styles.has(chunk)) {
              styles.add(chunk);
              controller.enqueue(
                encoder.encode(`<style>${chunk.content}</style>`)
              );
            }
          } else {
            controller.enqueue(encoder.encode(chunk));
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
