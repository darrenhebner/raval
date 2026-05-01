# Handler is pure configuration; execution is done by standalone functions

The previous design split rendering and action execution across two classes (`View` and `Action`) that each owned their own execution logic and violation handling. The core context-injection machinery was duplicated between them (causing at least one bug: `Action.handleViolation` returned the wrong type). We merged both into a single `Handler` class that is purely a configuration object — it tracks context dependencies and violation types but has no execution methods. Execution is performed by two standalone functions: `renderToStream(handler, onViolation?)` and `run(handler, onViolation?)`.

## Considered options

- **Keep `View`/`Action` as separate classes** — required duplicating the context resolution loop. Any future execution mode (e.g. `renderToString`) would require another duplicate.
- **Merge into one class with execution methods** — eliminated duplication but made the violation handler's return type ambiguous: streaming violations can only inject a string snippet (HTTP streaming has already committed to a 200 status), while action violations can return a full `Result`. Putting both on the same class with the same `handleViolation` signature required compromising one of them.

## Consequences

- `Handler` has no execution methods. Its only methods are `setContext` (with overloads for plain value, sync generator, and async generator providers).
- Violation handling is deferred to the execution function, where the correct return type is known: `renderToStream` accepts `(violation: V) => string | void`; `run` accepts `(violation: V) => Result | void`.
- Both execution functions enforce at the type level that all Contexts are satisfied and, when Violations are present, that a handler is provided.
- Adding future execution modes (e.g. `renderToString`) requires only a new standalone function, not changes to `Handler`.
