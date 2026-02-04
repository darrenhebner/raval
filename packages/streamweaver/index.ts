import htm from "htm";

export interface Context<T> {
  [Symbol.iterator](): Generator<Context<T>, T, unknown>;
}

const VnodeSymbol = Symbol("Vnode");
const ContextSymbol = Symbol("Context");

export function createContext<T>(): Context<T> {
  const context = {
    [ContextSymbol]: true,
    *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
      return (yield context) as T;
    },
  };
  return context;
}

function isContext(input: unknown): input is Context<any> {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as any)[ContextSymbol] === true
  );
}

type Html = string & { __brand: "html" };

export interface Vnode {
  type: any;
  props: Record<string, any>;
  children: any[];
  kind?: "start" | "end";
}

function isVnode(input: unknown): input is Vnode {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as any)[VnodeSymbol] === true
  );
}

type ExtractYields<T> = T extends Generator<infer Y, any, any>
  ? Y
  : T extends (props: any) => Generator<infer Y, any, any>
  ? Y
  : T extends { [Symbol.iterator](): Generator<infer Y, any, any> }
  ? Y
  : T extends ReadonlyArray<infer U>
  ? ExtractYields<U>
  : never;

interface HtmlTag {
  <Values extends any[]>(
    strings: TemplateStringsArray,
    ...values: Values
  ): Generator<
    (Values[number] extends any ? ExtractYields<Values[number]> : never) | Vnode,
    void,
    unknown
  >;
}

export const html: HtmlTag = htm.bind(function* (type, props, ...children) {
  const finalProps = { ...props, children };
  if (typeof type === "function") {
    const result = yield* type(finalProps);
    // If the component returns a generator/iterator (e.g. return html`...`), yield* it.
    if (result && typeof result[Symbol.iterator] === "function") {
      yield* result;
    }
    return;
  }

  yield { type, props, children, kind: "start", [VnodeSymbol]: true } as Vnode;

  for (const child of children) {
    if (Array.isArray(child)) {
      for (const c of child) {
        if (typeof c === "string" || typeof c === "number") yield String(c);
        else if (c && typeof c[Symbol.iterator] === "function") yield* c;
      }
    } else if (typeof child === "string" || typeof child === "number") {
      yield String(child);
    } else if (child && typeof child[Symbol.iterator] === "function") {
      yield* child;
    }
  }

  yield { type, props, children, kind: "end", [VnodeSymbol]: true } as Vnode;
}) as any;

export function html2(
  strings: TemplateStringsArray,
  ...values: (string | number | Html | (string | number | Html)[])[]
): Html {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const value = values[i];
      if (Array.isArray(value)) {
        result += value.join("");
      } else {
        result += value;
      }
    }
  }
  return result as Html;
}

export class Route<Yields = never, Satisfied = never> {
  #context = new Map<unknown, unknown>();
  #app: () => Generator<Yields, Html | void, unknown>;

  constructor(app: () => Generator<Yields, Html | void, unknown>) {
    this.#app = app;
  }

  setContext<C extends Yields, NewYields = never>(
    context: C,
    value: C extends Context<infer V>
      ?
          | V
          | (() => Generator<NewYields, V, unknown>)
          | (() => AsyncGenerator<NewYields, V, unknown>)
      : never,
  ) {
    this.#context.set(context, value);
    return this as unknown as Route<
      Exclude<Yields, C> | Exclude<NewYields, Satisfied | C>,
      Satisfied | C
    >;
  }

  renderToStream(this: Route<Vnode | void | undefined>) {
    const encoder = new TextEncoder();
    const app = this.#app;
    const contextMap = this.#context;

    return new ReadableStream({
      async start(controller) {
        try {
          const stack = [{ gen: app(), nextInput: undefined as unknown }];

          while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            const { gen } = frame;

            let result = gen.next(frame.nextInput);
            if (result instanceof Promise) {
              result = await result;
            }

            if (result.done) {
              const value = result.value;
              stack.pop();

              if (stack.length > 0) {
                stack[stack.length - 1].nextInput = value;
              } else {
                if (typeof value === "string") {
                  controller.enqueue(encoder.encode(value));
                }
              }
              continue;
            }

            const value = result.value;
            frame.nextInput = undefined;

            if (isContext(value)) {
              const context = contextMap.get(value);
              if (context === undefined) {
                throw new Error("Context not provided");
              }

              if (typeof context === "function") {
                const possibleGen = (context as Function)();
                if (
                  possibleGen &&
                  typeof (possibleGen as any).next === "function"
                ) {
                  stack.push({
                    gen: possibleGen as any,
                    nextInput: undefined,
                  });
                  continue;
                } else {
                  frame.nextInput = possibleGen;
                }
              } else {
                frame.nextInput = context;
              }
            } else if (isVnode(value)) {
              if (value.kind === "start" && typeof value.type === "string") {
                let attrs = "";
                if (value.props) {
                  for (const [k, v] of Object.entries(value.props)) {
                    if (k === "children") continue;
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
