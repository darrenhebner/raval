import htm from "htm";

export class Context<T> {
  *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
    return (yield this) as T;
  }
}

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
  readonly #children: Vnode[];
  readonly #kind?: "start" | "end";

  constructor(
    type: string | (() => HtmlTag),
    props: Record<string, unknown>,
    children: Vnode[],
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
  | (Values[number] extends unknown ? ExtractYields<Values[number]> : never)
  | Vnode
>;

export const html = htm.bind((type, props, ...children) => ({
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: We will refactor later
  *[Symbol.iterator]() {
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
      if (Array.isArray(child)) {
        for (const c of child) {
          if (typeof c === "string" || typeof c === "number") {
            yield String(c);
          } else if (c && typeof c[Symbol.iterator] === "function") {
            yield* c;
          }
        }
      } else if (typeof child === "string" || typeof child === "number") {
        yield String(child);
      } else if (child && typeof child[Symbol.iterator] === "function") {
        yield* child;
      }
    }

    yield new Vnode(type, props, children, "end");
  },
})) as HtmlTag;

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
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: We will refactor later
      async start(controller) {
        try {
          const stack = [{ gen: app(), nextInput: undefined as unknown }];

          while (stack.length > 0) {
            const frame = stack.at(-1);
            if (!frame) {
              throw new Error("Missing frame");
            }

            const { gen } = frame;

            let result = gen.next(frame.nextInput);
            if (result instanceof Promise) {
              result = await result;
            }

            // Only include each style once, when it is first encountered.
            if (result.value instanceof Css && !styles.has(result.value)) {
              styles.add(result.value);

              controller.enqueue(
                encoder.encode(`<style>${result.value.content}</style>`)
              );
            }

            if (result.done) {
              const value = result.value;
              stack.pop();

              if (stack.length > 0) {
                const lastStack = stack.at(-1);

                if (!lastStack) {
                  throw new Error("Missing last stack");
                }

                lastStack.nextInput = value;
              } else if (typeof value === "string") {
                controller.enqueue(encoder.encode(value));
              }
              continue;
            }

            const value = result.value;
            frame.nextInput = undefined;

            if (value instanceof Context) {
              const context = contextMap.get(value);
              if (context === undefined) {
                throw new MissingContextError();
              }

              if (typeof context === "function") {
                if (
                  context.constructor.name === "GeneratorFunction" ||
                  context.constructor.name === "AsyncGeneratorFunction"
                ) {
                  const possibleGen = context();
                  if (possibleGen && typeof possibleGen.next === "function") {
                    stack.push({
                      gen: possibleGen,
                      nextInput: undefined,
                    });
                    continue;
                  }
                }
                // Fallback for plain functions: treated as value
                frame.nextInput = context;
              } else {
                frame.nextInput = context;
              }
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
              frame.nextInput = undefined;
            } else if (typeof value === "string") {
              controller.enqueue(encoder.encode(value));
              frame.nextInput = undefined;
            } else {
              frame.nextInput = undefined;
            }
          }

          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}
