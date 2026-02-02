export interface Context<T> {
  [Symbol.iterator](): Generator<Context<T>, T, unknown>;
}

export function createContext<T>(): Context<T> {
  const context = {
    *[Symbol.iterator](): Generator<Context<T>, T, unknown> {
      return (yield context) as T;
    },
  };
  return context;
}

export class Route<Yields = never> {
  #context = new Map<unknown, unknown>();
  #app: () => Generator<Yields, string, unknown>;

  constructor(app: () => Generator<Yields, string, unknown>) {
    this.#app = app;
  }

  setContext<C extends Yields>(
    context: C,
    value: C extends Context<infer V> ? V : never,
  ): Route<Exclude<Yields, C>> {
    this.#context.set(context, value);
    return this as unknown as Route<Exclude<Yields, C>>;
  }

  renderToStream(this: Route<never>) {
    const encoder = new TextEncoder();
    const generator = this.#app();
    const contextMap = this.#context;

    return new ReadableStream({
      start(controller) {
        try {
          let nextInput: unknown;
          let result = generator.next(nextInput);

          while (!result.done) {
            const value = result.value;

            if (contextMap.has(value)) {
              nextInput = contextMap.get(value);
            } else {
              if (typeof value === "string") {
                controller.enqueue(encoder.encode(value));
              }
              nextInput = undefined;
            }

            result = generator.next(nextInput);
          }

          if (typeof result.value === "string") {
            controller.enqueue(encoder.encode(result.value));
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}
