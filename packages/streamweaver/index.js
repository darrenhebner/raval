import htm from "htm";

export const ContextSymbol = Symbol("Context");
export const VnodeSymbol = Symbol("Vnode");
export const CssSymbol = Symbol("CSS");

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

/**
 * @template T
 * @returns {import('./types.js').Context<T>}
 */
export function createContext() {
  const context = {
    [ContextSymbol]: true,
    *[Symbol.iterator]() {
      return /** @type {T} */ (yield/** @type {any} */ (context));
    },
  };
  return /** @type {any} */ (context);
}

/**
 * @param {unknown} input
 * @returns {input is import('./types.js').Context<unknown>}
 */
function isContext(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    /** @type {Record<symbol, unknown>} */ (input)[ContextSymbol] === true
  );
}

/** @type {import('./types.js').IsCss} */
export function isCss(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    /** @type {Record<symbol, unknown>} */ (input)[CssSymbol] === true
  );
}

/** @type {import('./types.js').CssTag} */
export function css(strings, ...values) {
  let content = "";

  for (let i = 0; i < strings.length; i++) {
    content += strings[i];
    const value = values[i];

    if (value) {
      content += value;
    }
  }

  return /** @type {import('./types.js').Css} */ ({
    content,
    [CssSymbol]: true,
  });
}

/**
 * @param {unknown} input
 * @returns {input is import('./types.js').Vnode}
 */
function isVnode(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    /** @type {Record<symbol, unknown>} */ (input)[VnodeSymbol] === true
  );
}

export const html = /** @type {import('./types.js').HtmlTag} */ (
  // @ts-expect-error
  htm.bind(
    /**
     * @param {unknown} type
     * @param {Record<string, unknown>} props
     * @param {...unknown} children
     */
    (type, props, ...children) => {
      return /** @type {Iterable<import('./types.js').Vnode | string>} */ ({
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

          yield/** @type {import('./types.js').Vnode} */ ({
            type,
            props,
            children,
            kind: "start",
            [VnodeSymbol]: true,
          });

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
            } else if (
              child &&
              typeof (/** @type {any} */ (child)[Symbol.iterator]) ===
                "function"
            ) {
              yield* /** @type {Iterable<unknown>} */ (child);
            }
          }

          yield/** @type {import('./types.js').Vnode} */ ({
            type,
            props,
            children,
            kind: "end",
            [VnodeSymbol]: true,
          });
        },
      });
    }
  )
);

/**
 * @template [Yields=never]
 * @template [Satisfied=never]
 */
export class Route {
  /** @type {Map<unknown, unknown>} */
  #context = new Map();
  /** @type {() => Generator<Yields, void, unknown>} */
  #app;

  /**
   * @param {() => Generator<Yields, void, unknown>} app
   */
  constructor(app) {
    this.#app = app;
  }

  /** @type {import('./types.js').Route<Yields, Satisfied>['setContext']} */
  setContext(context, value) {
    this.#context.set(context, value);
    return /** @type {any} */ (this);
  }

  /**
   * @this {Route<import('./types.js').Vnode | import('./types.js').Css | undefined>}
   */
  renderToStream() {
    const encoder = new TextEncoder();
    const app = this.#app;
    const contextMap = this.#context;
    /** @type {Set<import('./types.js').Css>} */
    const styles = new Set();

    return new ReadableStream({
      /**
       * @param {ReadableStreamDefaultController<Uint8Array>} controller
       */
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: We will refactor later
      async start(controller) {
        try {
          /** @type {{ gen: Generator<unknown, void, unknown>, nextInput: unknown }[]} */
          const stack = [{ gen: app(), nextInput: undefined }];

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
