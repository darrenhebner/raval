# Raval

A TypeScript library providing a type-safe context injection layer for generator-based server request handlers. Supports both HTML streaming and action (non-streaming) execution modes.

## Language

**Handler**:
A generator function with typed context dependencies and tracked violation types, prepared for execution. The core configuration object — holds no execution logic itself.
_Avoid_: View, Action, Route

**Context**:
A typed token that declares a dependency. Consumed inside generators via `yield*`; provided at the Handler level before execution.
_Avoid_: dependency, provider, injectable

**Context provider**:
A value, function, or generator function that resolves a Context's value, and which may itself consume other Contexts, creating transitive dependencies.
_Avoid_: resolver, factory

**Violation**:
A named condition yielded from a generator to short-circuit execution. In streaming mode, the violation handler injects a snippet and closes the stream. In action mode, it returns a value of the same type as the handler's result.
_Avoid_: error, exception, early exit

**Execution function**:
`renderToStream` or `run` — standalone functions that execute a Handler. Each accepts an optional violation handler typed appropriately for its mode.
_Avoid_: runner, executor

**Transitive context dependency**:
A Context required by a context provider (not the root generator directly). The type system tracks these so they appear in the Handler's required Context set.

## Relationships

- A **Handler** tracks zero or more required **Contexts** and zero or more possible **Violations**
- A **Context provider** can consume other **Contexts**, producing **transitive context dependencies** that surface on the **Handler**
- `renderToStream` executes a **Handler** as a streaming HTML response; its violation handler returns `string | void`
- `run` executes a **Handler** as a value-returning async computation; its violation handler returns `Result | void`
- A **Violation** can be yielded from the root generator or from any **context provider**

## Example dialogue

> **Dev:** "If a context provider yields a Violation, who handles it?"
> **Domain expert:** "The execution function — whichever one you call. `renderToStream` injects a snippet into the stream; `run` returns whatever the violation handler gives back."

> **Dev:** "What if I forget to provide a required Context?"
> **Domain expert:** "The type system catches it — `renderToStream` and `run` only accept a Handler where all Contexts are satisfied."

## Flagged ambiguities

- "View" and "Action" were previously distinct classes — resolved: merged into **Handler**. The execution mode is chosen at call time by which execution function you use, not at configuration time.
- "Route" was used as an earlier name for the core class — resolved: renamed to **Handler**.
