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

function isGeneratorFunction(input: unknown): input is GeneratorFunction {
  return (
    typeof input === "function" &&
    input.constructor.name === "GeneratorFunction"
  );
}

function isAsyncGeneratorFunction(
  input: unknown
): input is AsyncGeneratorFunction {
  return (
    typeof input === "function" &&
    input.constructor.name === "AsyncGeneratorFunction"
  );
}

class StreamRenderer {
  readonly #encoder = new TextEncoder();
  readonly #styles = new Set<Css>();
  readonly #controller: ReadableStreamDefaultController;
  readonly #contextMap: Map<unknown, unknown>;
  readonly #violationHandler?: ViolationHandler<AnyViolation>;

  constructor(
    controller: ReadableStreamDefaultController,
    contextMap: Map<unknown, unknown>,
    violationHandler?: ViolationHandler<AnyViolation>
  ) {
    this.#controller = controller;
    this.#contextMap = contextMap;
    this.#violationHandler = violationHandler;
  }

  async process(
    gen:
      | Generator<unknown, unknown, unknown>
      | AsyncGenerator<unknown, unknown, unknown>,
    input?: unknown
  ): Promise<unknown> {
    const result = await gen.next(input);

    if (result.done) {
      return result.value;
    }

    const value = result.value;
    let nextInput: unknown;

    if (value instanceof Context) {
      nextInput = await this.#handleContext(value);
    } else if (value instanceof Violation) {
      const lastChunk = this.#violationHandler?.(value);
      if (lastChunk) {
        this.#enqueue(lastChunk);
      }
      this.#controller.close();
    } else {
      this.#renderValue(value);
    }

    return this.process(gen, nextInput);
  }

  async #handleContext(value: Context<unknown>): Promise<unknown> {
    const context = this.#contextMap.get(value);

    if (context === undefined) {
      throw new MissingContextError();
    }

    if (isGeneratorFunction(context) || isAsyncGeneratorFunction(context)) {
      // It's a generator function, so we call it to get the iterator
      const possibleGen = context();
      // Recursively process this new generator
      return await this.process(possibleGen);
    }

    if (typeof context === "function") {
      return await context();
    }

    return context;
  }

  #renderValue(value: unknown): void {
    if (value instanceof Css) {
      if (!this.#styles.has(value)) {
        this.#styles.add(value);
        this.#enqueue(`<style>${value.content}</style>`);
      }
    } else if (typeof value === "string") {
      this.#enqueue(value);
    }
  }

  #enqueue(chunk: string): void {
    this.#controller.enqueue(this.#encoder.encode(chunk));
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Any is necessary to open up this type
type AnyViolation = Violation<any>;

// biome-ignore lint/suspicious/noConfusingVoidType: It really does return void;
type ViolationHandler<V = AnyViolation> = (violation: V) => string | void;

export class View<
  Contexts extends Context<unknown> | never,
  Satisfied extends Context<unknown> = never,
  Violations = AnyViolation,
> {
  readonly #context = new Map<unknown, unknown>();
  readonly #app: () => Generator<unknown, void, unknown>;
  #violationHandler?: ViolationHandler<Violations>;

  static prepare<Yields>(app: () => Generator<Yields, void, unknown>) {
    return new View<
      Extract<Yields, Context<unknown>>,
      never,
      Extract<Yields, AnyViolation>
    >(app);
  }

  private constructor(app: () => Generator<unknown, void, unknown>) {
    this.#app = app;
  }

  setContext<
    C extends Contexts,
    NewYields extends Context<unknown> | AnyViolation = never,
  >(
    context: C,
    value: C extends Context<infer V>
      ?
          | V
          | (() => V | Promise<V>)
          | (() => Generator<NewYields, V, unknown>)
          | (() => AsyncGenerator<NewYields, V, unknown>)
      : never
  ) {
    this.#context.set(context, value);
    return this as unknown as View<
      Exclude<Extract<NewYields | Contexts, Context<unknown>>, Satisfied | C>,
      Satisfied | C,
      Extract<NewYields | Violations, AnyViolation>
    >;
  }

  handleViolation(handler: ViolationHandler<Violations>) {
    this.#violationHandler = handler;
    return this as unknown as View<Contexts, Satisfied, never>;
  }

  // TODO: We should only allow this to be called when all violations are handled
  renderToStream(this: View<never, Context<unknown>, AnyViolation>) {
    const app = this.#app;
    const contextMap = this.#context;
    const violationHandler = this.#violationHandler;

    return new ReadableStream({
      async start(controller) {
        try {
          const renderer = new StreamRenderer(
            controller,
            contextMap,
            violationHandler
          );
          await renderer.process(app());
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}

type ActionDefinition<Yields, Result, Args extends unknown[]> = (
  ...args: Args
) => Generator<Yields, Result, unknown>;

export class Action<
  Args extends unknown[],
  Result,
  Contexts extends Context<unknown>,
  Satisfied extends Context<unknown> = never,
  Violations = AnyViolation,
> {
  readonly #action: ActionDefinition<unknown, Result, Args>;
  readonly #context = new Map<unknown, unknown>();
  #violationHandler?: ViolationHandler<Violations>;

  static prepare<Yields, Result, Args extends unknown[]>(
    action: ActionDefinition<Yields, Result, Args>
  ) {
    return new Action<
      Args,
      Result,
      Extract<Yields, Context<unknown>>,
      never,
      Extract<Yields, AnyViolation>
    >(action);
  }

  private constructor(action: ActionDefinition<unknown, Result, Args>) {
    this.#action = action;
  }

  setContext<
    C extends Contexts,
    NewYields extends Context<unknown> | AnyViolation = never,
  >(
    context: C,
    value: C extends Context<infer V>
      ?
          | V
          | (() => V | Promise<V>)
          | (() => Generator<NewYields, V, unknown>)
          | (() => AsyncGenerator<NewYields, V, unknown>)
      : never
  ) {
    this.#context.set(context, value);
    return this as unknown as Action<
      Args,
      Result,
      Exclude<Extract<NewYields | Contexts, Context<unknown>>, Satisfied | C>,
      Satisfied | C,
      Extract<NewYields | Violations, AnyViolation>
    >;
  }

  handleViolation(handler: ViolationHandler<Violations>) {
    this.#violationHandler = handler;
    return this as unknown as View<Contexts, Satisfied, never>;
  }

  async #handleContext(value: Context<unknown>): Promise<unknown> {
    const context = this.#context.get(value);

    if (context === undefined) {
      throw new MissingContextError();
    }

    if (isGeneratorFunction(context) || isAsyncGeneratorFunction(context)) {
      // It's a generator function, so we call it to get the iterator
      const possibleGen = context();
      // Recursively process this new generator
      return await this.process(possibleGen);
    }

    if (typeof context === "function") {
      return await context();
    }

    return context;
  }

  async process(
    gen:
      | Generator<unknown, unknown, unknown>
      | AsyncGenerator<unknown, unknown, unknown>,
    input?: unknown
  ): Promise<unknown> {
    const result = await gen.next(input);

    if (result.done) {
      return result.value;
    }

    const value = result.value;

    let nextInput: unknown;

    if (value instanceof Context) {
      nextInput = await this.#handleContext(value);
    }

    if (value instanceof Violation) {
      return this.#violationHandler?.(value as Violations);
    }

    return this.process(gen, nextInput);
  }

  run(...args: Args) {
    return this.process(this.#action(...args)) as Promise<Result>;
  }
}
