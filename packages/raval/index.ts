import _htm from "htm";

const htm = _htm as unknown as typeof _htm.default;

export type ComponentProps<T = unknown> = T & { children?: unknown };

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

class Vnode {
  readonly #type: string;
  readonly #props: Record<string, unknown>;
  readonly #children: unknown[];

  constructor(
    type: string,
    props: Record<string, unknown>,
    children: unknown[]
  ) {
    this.#type = type;
    this.#props = props;
    this.#children = children;
  }

  get type() {
    return this.#type;
  }

  get props() {
    return this.#props;
  }

  get children() {
    return this.#children;
  }
}

class StartTagVnode extends Vnode {}
class EndTagVnode extends Vnode {}

type ExtractYields<T> =
  T extends Generator<infer Y, unknown, unknown>
    ? Y
    : T extends (props: unknown) => Generator<infer Y, unknown, unknown>
      ? Y
      : T extends { [Symbol.iterator](): Generator<infer Y, unknown, unknown> }
        ? Y
        : T extends ReadonlyArray<infer U>
          ? ExtractYields<U>
          : never;

type HtmlTag = <Values extends unknown[]>(
  strings: TemplateStringsArray,
  ...values: Values
) => Iterable<
  Values[number] extends unknown ? ExtractYields<Values[number]> : never
>;

type Child = string | number | Component | Child[];

class Component {
  readonly #type: string | Generator<unknown>;
  readonly #props: Record<string, unknown>;
  readonly #children: Child[];

  constructor(
    type: string | Generator<unknown>,
    props: Record<string, unknown> | null,
    children: Child[]
  ) {
    this.#type = type;
    this.#props = props ?? {};
    this.#children = children;
  }

  *#processChild(child: Child): Generator<unknown, void, unknown> {
    if (Array.isArray(child)) {
      for (const c of child) {
        yield* this.#processChild(c);
      }
    } else if (typeof child === "string" || typeof child === "number") {
      yield String(child);
    } else if (child instanceof Component) {
      yield* child;
    }
  }

  *[Symbol.iterator](): Generator<unknown, void, unknown> {
    const type = this.#type;
    const props = this.#props;
    const children = this.#children;
    const finalProps = { ...props, children };

    if (isGeneratorFunction(type)) {
      yield* type(finalProps);
      return;
    }

    const tagName = type as string;

    yield new StartTagVnode(tagName, props, children);

    for (const child of children) {
      yield* this.#processChild(child);
    }

    yield new EndTagVnode(tagName, props, children);
  }
}

export const html = htm.bind(
  (type, props, ...children) => new Component(type, props, children)
) as HtmlTag;

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
      this.#renderCss(value);
    } else if (value instanceof StartTagVnode) {
      this.#renderStartTag(value);
    } else if (value instanceof EndTagVnode) {
      this.#renderEndTag(value);
    } else if (typeof value === "string") {
      this.#renderString(value);
    }
  }

  #renderCss(value: Css): void {
    if (this.#styles.has(value)) {
      return;
    }

    this.#styles.add(value);
    this.#enqueue(`<style>${value.content}</style>`);
  }

  #renderStartTag(value: StartTagVnode): void {
    let attrs = "";

    if (value.props) {
      for (const [k, v] of Object.entries(value.props)) {
        if (k === "children") {
          continue;
        }
        attrs += ` ${k}="${v}"`;
      }
    }

    this.#enqueue(`<${value.type}${attrs}>`);
  }

  #renderEndTag(value: EndTagVnode): void {
    this.#enqueue(`</${value.type}>`);
  }

  #renderString(value: string): void {
    this.#enqueue(value);
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
