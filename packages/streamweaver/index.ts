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

export class Route<Yields = never, Satisfied = never> {
  #context = new Map<unknown, unknown>();
  #app: () => Generator<Yields, string, unknown>;

  constructor(app: () => Generator<Yields, string, unknown>) {
    this.#app = app;
  }

  setContext<C extends Yields, NewYields = never>(
    context: C,
    value: C extends Context<infer V>
      ? V | (() => Generator<NewYields, V, unknown>)
      : never,
  ) {
    this.#context.set(context, value);
    return this as unknown as Route<
      Exclude<Yields, C> | Exclude<NewYields, Satisfied | C>,
      Satisfied | C
    >;
  }

  renderToStream(this: Route<never>) {
    const encoder = new TextEncoder();
    const app = this.#app;
    const contextMap = this.#context;

    return new ReadableStream({
      start(controller) {
        try {
          const stack: Generator<unknown, unknown, unknown>[] = [];
          let currentGenerator: Generator<unknown, unknown, unknown> = app();
          let nextInput: unknown;

          while (true) {
            const result = currentGenerator.next(nextInput);

            if (result.done) {
              if (stack.length === 0) {
                if (typeof result.value === "string") {
                  controller.enqueue(encoder.encode(result.value));
                }
                controller.close();
                return;
              } else {
                nextInput = result.value;
                currentGenerator = stack.pop()!;
                continue;
              }
            }

            const value = result.value;

            if (contextMap.has(value)) {
              const provider = contextMap.get(value);
              if (typeof provider === "function") {
                // Check if it's a generator factory
                const potentialGenerator = (
                  provider as () => Generator<unknown, unknown, unknown>
                )();

                if (
                  potentialGenerator &&
                  typeof potentialGenerator.next === "function"
                ) {
                  stack.push(currentGenerator);
                  currentGenerator = potentialGenerator;
                  nextInput = undefined;
                } else {
                  // It was a value function, not a generator factory.
                  nextInput = provider;
                }
              } else {
                nextInput = provider;
              }
            } else {
              if (typeof value === "string") {
                controller.enqueue(encoder.encode(value));
              }
              nextInput = undefined;
            }
          }
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}
