# Compose components via yield* rather than inline template syntax

The `html` tagged template previously accepted component references (`<${Component} />`), powered by the `htm` library, which parsed template literals into a virtual DOM. TypeScript cannot reliably infer yield types through this mechanism, making it impossible to automatically track which Contexts a component tree requires. We replaced `htm` and the virtual DOM entirely with direct `yield*` composition: components are called as `yield* Component(props)`, and `html` is a simple generator that handles only primitive HTML strings, numbers, Css, and arrays thereof.

## Considered options

- **Keep `htm`, fix inference with `ExtractYields`** — `ExtractYields` was already in place but produced unreliable results: TypeScript's template literal inference is too limited to extract yield types from component references in all cases. The approach was patched repeatedly and still had gaps.
- **Require explicit return-type annotations on components** — would have made inference reliable but shifted maintenance burden to every component author, and annotations would silently drift from actual yields.

## Consequences

- The `htm` dependency, `Component` class, `Vnode`/`StartTagVnode`/`EndTagVnode` classes, `ExtractYields` type, and `HtmlTag` type are all removed.
- `html` becomes a simple HTML-escaping generator; context propagation through `yield*` is handled natively by TypeScript.
- Layout components that wrap children accept a `() => Generator<Y, void, unknown>` argument and are generic over `Y`, preserving transitive context tracking through layout boundaries.
- Callers lose the JSX-like inline syntax. The tradeoff was judged worthwhile: type correctness is a core guarantee of the library, and the `yield*` style is explicit and readable.
