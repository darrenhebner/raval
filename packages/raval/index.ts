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

export class Handler<Required extends Context<unknown> = never> {
  readonly #fn: () => Generator<unknown, void, unknown>;
  readonly #contextMap: Map<unknown, unknown>;

  static prepare<Yields>(fn: () => Generator<Yields, void, unknown>) {
    return new Handler<Extract<Yields, Context<unknown>>>(fn, new Map());
  }

  private constructor(
    fn: () => Generator<unknown, void, unknown>,
    contextMap: Map<unknown, unknown>
  ) {
    this.#fn = fn;
    this.#contextMap = contextMap;
  }

  setContext<C extends Required>(
    context: C,
    value: C extends Context<infer V> ? V | (() => Promise<V>) : never
  ): Handler<Exclude<Required, C>> {
    const newMap = new Map(this.#contextMap);
    newMap.set(context, value);
    return new Handler(this.#fn, newMap) as unknown as Handler<
      Exclude<Required, C>
    >;
  }

  get fn() {
    return this.#fn;
  }

  get contextMap() {
    return this.#contextMap;
  }
}

async function processGenerator(
  gen: Generator<unknown, void, unknown>,
  contextMap: Map<unknown, unknown>,
  styles: Set<Css>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<void> {
  let next = gen.next();

  while (!next.done) {
    const value = next.value;

    if (value instanceof Context) {
      const provided = contextMap.get(value);
      if (provided === undefined) {
        throw new MissingContextError();
      }
      const resolved =
        typeof provided === "function"
          ? await (provided as () => Promise<unknown>)()
          : provided;
      next = gen.next(resolved);
    } else if (value instanceof Css) {
      if (!styles.has(value)) {
        styles.add(value);
        controller.enqueue(encoder.encode(`<style>${value.content}</style>`));
      }
      next = gen.next();
    } else if (typeof value === "string") {
      controller.enqueue(encoder.encode(value));
      next = gen.next();
    } else {
      next = gen.next();
    }
  }
}

export function renderToStream(handler: Handler<never>): ReadableStream {
  const encoder = new TextEncoder();
  const styles = new Set<Css>();

  return new ReadableStream({
    async start(controller) {
      try {
        await processGenerator(
          handler.fn(),
          handler.contextMap,
          styles,
          controller,
          encoder
        );
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
