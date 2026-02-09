export interface Context<T> {
  [Symbol.iterator](): Generator<Context<T>, T, unknown>;
}

export interface Css {
  content: string;
}

export interface Vnode {
  type: string | (() => HtmlTag);
  props: Record<string, unknown>;
  children: Vnode[];
  kind?: "start" | "end";
}

export type ExtractYields<T> =
  T extends Generator<infer Y, unknown, unknown>
    ? Y
    : T extends (props: unknown) => Generator<infer Y, unknown, unknown>
      ? Y
      : T extends { [Symbol.iterator](): Generator<infer Y, unknown, unknown> }
        ? Y
        : T extends ReadonlyArray<infer U>
          ? ExtractYields<U>
          : never;

export type HtmlTag = <Values extends unknown[]>(
  strings: TemplateStringsArray,
  ...values: Values
) => Iterable<
  | (Values[number] extends unknown ? ExtractYields<Values[number]> : never)
  | Vnode
>;

export type CreateContext = <T>() => Context<T>;

export type IsCss = (input: unknown) => input is Css;

export type CssTag = (
  strings: TemplateStringsArray,
  ...values: string[]
) => Css;

export type ComponentProps<T> = T & { children?: unknown };

export interface Route<Yields = never, Satisfied = never> {
  setContext<C extends Context<unknown>, NewYields = never>(
    context: C,
    value: C extends Context<infer V>
      ?
          | V
          | (() => Generator<NewYields, V, unknown>)
          | (() => AsyncGenerator<NewYields, V, unknown>)
      : never
  ): Route<
    Exclude<Yields, C> | Exclude<NewYields, Satisfied | C>,
    Satisfied | C
  >;

  renderToStream(this: Route<never>): ReadableStream<Uint8Array>;
}
