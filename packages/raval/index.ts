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

export class Handler<
  Required extends Context<unknown> = never,
  Result = void,
  Violations extends Violation<string> = never,
> {
  readonly #fn: () => Generator<unknown, Result, unknown>;
  readonly #contextMap: Map<unknown, unknown>;

  static prepare<Yields, Result = void>(
    fn: () => Generator<Yields, Result, unknown>
  ) {
    return new Handler<
      Extract<Yields, Context<unknown>>,
      Result,
      Extract<Yields, Violation<string>>
    >(fn, new Map());
  }

  private constructor(
    fn: () => Generator<unknown, Result, unknown>,
    contextMap: Map<unknown, unknown>
  ) {
    this.#fn = fn;
    this.#contextMap = contextMap;
  }

  setContext<C extends Required>(
    context: C,
    value: C extends Context<infer V> ? V | (() => Promise<V>) : never
  ): Handler<Exclude<Required, C>, Result, Violations>;
  setContext<C extends Required & Context<V>, V, NewYields>(
    context: C,
    provider:
      | (() => Generator<NewYields, V, unknown>)
      | (() => AsyncGenerator<NewYields, V, unknown>)
  ): Handler<
    Exclude<Required, C> | Extract<NewYields, Context<unknown>>,
    Result,
    Violations | Extract<NewYields, Violation<string>>
  >;
  setContext(
    context: Context<unknown>,
    value: unknown
  ): Handler<Context<unknown>, Result, Violations> {
    const newMap = new Map(this.#contextMap);
    newMap.set(context, value);
    return new Handler(this.#fn, newMap) as unknown as Handler<
      Context<unknown>,
      Result,
      Violations
    >;
  }

  get fn() {
    return this.#fn;
  }

  get contextMap() {
    return this.#contextMap;
  }
}

// Internal signal thrown by provider generators when they yield a Violation.
class ViolationSignal {
  violation: Violation<string>;
  constructor(violation: Violation<string>) {
    this.violation = violation;
  }
}

async function walkAsyncProvider(
  gen: AsyncGenerator<unknown, unknown, unknown>,
  contextMap: Map<unknown, unknown>
): Promise<unknown> {
  let step = await gen.next();
  while (!step.done) {
    if (step.value instanceof Context) {
      const resolved = await resolveContext(step.value, contextMap);
      step = await gen.next(resolved);
    } else if (step.value instanceof Violation) {
      throw new ViolationSignal(step.value);
    } else {
      step = await gen.next();
    }
  }
  return step.value;
}

async function walkSyncProvider(
  gen: Generator<unknown, unknown, unknown>,
  contextMap: Map<unknown, unknown>
): Promise<unknown> {
  let step = gen.next();
  while (!step.done) {
    if (step.value instanceof Context) {
      const resolved = await resolveContext(step.value, contextMap);
      step = gen.next(resolved);
    } else if (step.value instanceof Violation) {
      throw new ViolationSignal(step.value);
    } else {
      step = gen.next();
    }
  }
  return step.value;
}

async function resolveProvided(
  provided: unknown,
  contextMap: Map<unknown, unknown>
): Promise<unknown> {
  if (typeof provided !== "function") {
    return provided;
  }
  const result = (provided as () => unknown)();
  if (result !== null && typeof result === "object") {
    if (Symbol.asyncIterator in (result as object)) {
      return walkAsyncProvider(
        result as AsyncGenerator<unknown, unknown, unknown>,
        contextMap
      );
    }
    if (typeof (result as { next?: unknown }).next === "function") {
      return walkSyncProvider(
        result as Generator<unknown, unknown, unknown>,
        contextMap
      );
    }
  }
  return await (result as Promise<unknown>);
}

function resolveContext(
  ctx: Context<unknown>,
  contextMap: Map<unknown, unknown>
): Promise<unknown> {
  const provided = contextMap.get(ctx);
  if (provided === undefined) {
    throw new MissingContextError();
  }
  return resolveProvided(provided, contextMap);
}

type WalkResult<Result> =
  | { tag: "done"; value: Result }
  | { tag: "violation"; violation: Violation<string> };

async function walkGenerator<Result>(
  gen: Generator<unknown, Result, unknown>,
  contextMap: Map<unknown, unknown>,
  onYield: (value: unknown) => void
): Promise<WalkResult<Result>> {
  try {
    let next = gen.next();
    while (!next.done) {
      const value = next.value;
      if (value instanceof Context) {
        const resolved = await resolveContext(value, contextMap);
        next = gen.next(resolved);
      } else if (value instanceof Violation) {
        return { tag: "violation", violation: value };
      } else {
        onYield(value);
        next = gen.next();
      }
    }
    return { tag: "done", value: next.value };
  } catch (e) {
    if (e instanceof ViolationSignal) {
      return { tag: "violation", violation: e.violation };
    }
    throw e;
  }
}

export function renderToStream<V extends Violation<string>>(
  handler: Handler<never, void, V>,
  ...args: [V] extends [never] ? [] : [(v: V) => string | undefined]
): ReadableStream {
  const encoder = new TextEncoder();
  const styles = new Set<Css>();
  const [violationHandler] = args;

  return new ReadableStream({
    async start(controller) {
      try {
        const result = await walkGenerator(
          handler.fn(),
          handler.contextMap,
          (value) => {
            if (value instanceof Css) {
              if (!styles.has(value)) {
                styles.add(value);
                controller.enqueue(
                  encoder.encode(`<style>${value.content}</style>`)
                );
              }
            } else if (typeof value === "string") {
              controller.enqueue(encoder.encode(value));
            }
          }
        );
        if (result.tag === "violation" && violationHandler) {
          const snippet = violationHandler(result.violation as V);
          if (typeof snippet === "string") {
            controller.enqueue(encoder.encode(snippet));
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

export function run<Result, V extends Violation<string>>(
  handler: Handler<never, Result, V>,
  ...args: [V] extends [never] ? [] : [(v: V) => Result | undefined]
): [V] extends [never] ? Promise<Result> : Promise<Result | undefined> {
  const [violationHandler] = args;
  return walkGenerator(handler.fn(), handler.contextMap, () => {
    // no-op — run ignores all rendered output
  }).then((result) => {
    if (result.tag === "violation") {
      return violationHandler
        ? violationHandler(result.violation as V)
        : undefined;
    }
    return result.value;
  }) as [V] extends [never] ? Promise<Result> : Promise<Result | undefined>;
}
