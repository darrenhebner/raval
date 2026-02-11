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

export class Vnode {
  readonly #type: string | (() => HtmlTag);
  readonly #props: Record<string, unknown>;
  readonly #children: unknown[];
  readonly #kind?: "start" | "end";

  constructor(
    type: string | (() => HtmlTag),
    props: Record<string, unknown>,
    children: unknown[],
    kind?: "start" | "end"
  ) {
    this.#type = type;
    this.#props = props;
    this.#children = children;
    this.#kind = kind;
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

  get kind() {
    return this.#kind;
  }
}

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

    yield new Vnode(type, props, children, "start");

    for (const child of children) {
      yield* this.#processChild(child);
    }

    yield new Vnode(type, props, children, "end");
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
    const encoder = new TextEncoder();
    const app = this.#app;
    const contextMap = this.#context;
    const styles = new Set<Css>();

    return new ReadableStream({
      async start(controller) {
        try {
          async function processChunk(
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

            if (value instanceof Css) {
              if (!styles.has(value)) {
                styles.add(value);
                controller.enqueue(
                  encoder.encode(`<style>${value.content}</style>`)
                );
              }
            } else if (value instanceof Context) {
              const context = contextMap.get(value);

              if (context === undefined) {
                throw new MissingContextError();
              }

              if (isGeneratorFunction(context)) {
                // It's a generator function, so we call it to get the iterator
                const possibleGen = context();
                // Recursively process this new generator
                const nextInput = await processChunk(possibleGen);
                return processChunk(gen, nextInput);
              }

              return processChunk(gen, context);
            } else if (value instanceof Vnode) {
              if (value.kind === "start" && typeof value.type === "string") {
                let attrs = "";
                if (value.props) {
                  for (const [k, v] of Object.entries(value.props)) {
                    if (k === "children") {
                      continue;
                    }
                    attrs += ` ${k}="${v}"`;
                  }
                }
                controller.enqueue(encoder.encode(`<${value.type}${attrs}>`));
              } else if (
                value.kind === "end" &&
                typeof value.type === "string"
              ) {
                controller.enqueue(encoder.encode(`</${value.type}>`));
              }
            } else if (typeof value === "string") {
              controller.enqueue(encoder.encode(value));
            }

            return processChunk(gen);
          }

          await processChunk(app());

          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}
