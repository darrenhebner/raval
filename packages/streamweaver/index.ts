import htm from "htm";

export interface Context<T> {
  [Symbol.iterator](): Generator<Context<T>, T, unknown>;
}

const VnodeSymbol = Symbol("Vnode");
const ContextSymbol = Symbol("Context");

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

export function createContext<T>(): Context<T> {
  const context = {
    [ContextSymbol]: true,
    *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
      return (yield context) as T;
    },
  };
  return context;
}

function isContext(input: unknown): input is Context<unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<symbol, unknown>)[ContextSymbol] === true
  );
}

export const CssSymbol = Symbol("CSS");

export interface Css {
  content: string;
  [CssSymbol]: true;
}

export function isCss(input: unknown): input is Css {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<symbol, unknown>)[CssSymbol] === true
  );
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

  return {
    content,
    [CssSymbol]: true,
  };
}

export interface Vnode {
  type: string | (() => HtmlTag);
  props: Record<string, unknown>;
  children: Vnode[];
  kind?: "start" | "end";
}

function isVnode(input: unknown): input is Vnode {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<symbol, unknown>)[VnodeSymbol] === true
  );
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

    yield {
      type,
      props,
      children,
      kind: "start",
      [VnodeSymbol]: true,
    } as Vnode;

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

    yield {
      type,
      props,
      children,
      kind: "end",
      [VnodeSymbol]: true,
    } as Vnode;
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
            if (isCss(result.value) && !styles.has(result.value)) {
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

            if (isContext(value)) {
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
            } else if (isVnode(value)) {
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
