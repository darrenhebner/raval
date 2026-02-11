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
  *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
    return (yield this) as T;
  }
}

export function createContext<T>() {
  return new Context<T>();
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

type Child = string | number | Component | Component[] | string | number[];

class Component {
  readonly #type;
  readonly #props: Record<string, any>;
  readonly #children: Child[];

  constructor(type: any, props: Record<string, any>, children: any[]) {
    this.#type = type;
    this.#props = props;
    this.#children = children;
  }

  *#processChild(child: Child): Generator<any, void, unknown> {
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

  *[Symbol.iterator]() {
    const type = this.#type;
    const props = this.#props;
    const children = this.#children;
    const finalProps = { ...props, children };

    if (typeof type === "function") {
      if (type.constructor.name !== "GeneratorFunction") {
        throw new InvalidComponentError();
      }

      yield* type(finalProps);
      return;
    }

    yield new StartTagVnode(type, props, children);

    for (const child of children) {
      yield* this.#processChild(child);
    }

    yield new EndTagVnode(type, props, children);
  }
}

export const html = htm.bind(
  (type, props, ...children) => new Component(type, props, children)
) as HtmlTag;

function isGeneratorFunction(
  input: unknown
): input is GeneratorFunction | AsyncGeneratorFunction {
  return (
    typeof input === "function" &&
    (input.constructor.name === "GeneratorFunction" ||
      input.constructor.name === "AsyncGeneratorFunction")
  );
}

class StreamRenderer {
  readonly #encoder = new TextEncoder();
  readonly #styles = new Set<Css>();
  readonly #controller: ReadableStreamDefaultController;
  readonly #contextMap: Map<unknown, unknown>;

  constructor(
    controller: ReadableStreamDefaultController,
    contextMap: Map<unknown, unknown>
  ) {
    this.#controller = controller;
    this.#contextMap = contextMap;
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

    if (isGeneratorFunction(context)) {
      // It's a generator function, so we call it to get the iterator
      const possibleGen = context();
      // Recursively process this new generator
      return await this.process(possibleGen);
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

export class Route<Yields = never, Satisfied = never> {
  readonly #context = new Map<unknown, unknown>();
  readonly #app: () => Generator<Yields, void, unknown>;

  constructor(app: () => Generator<Yields, void, unknown>) {
    this.#app = app;
  }

  setContext<C extends Yields, NewYields = never>(
    context: C,
    value: C extends Context<infer V>
      ?
          | V
          | (() => Generator<NewYields, V, unknown>)
          | (() => AsyncGenerator<NewYields, V, unknown>)
      : never
  ) {
    this.#context.set(context, value);
    return this as unknown as Route<
      Exclude<Yields, C> | Exclude<NewYields, Satisfied | C>,
      Satisfied | C
    >;
  }

  renderToStream(this: Route<Vnode | Css | undefined>) {
    const app = this.#app;
    const contextMap = this.#context;

    return new ReadableStream({
      async start(controller) {
        try {
          const renderer = new StreamRenderer(controller, contextMap);
          await renderer.process(app());
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}
