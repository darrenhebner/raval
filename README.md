## Raval

A streaming-first library for building server-rendered UI with type-safe context injection.

### Features

- Stream HTML as you render
- Render from the server or service workers
- Type-safe context — missing dependencies are compile-time errors
- Just-in-time CSS injection with automatic deduplication
- Compose components via `yield*`

---

### Getting started

```ts
import { Handler, html, renderToStream } from 'raval';

function* Greeting(name: string) {
  yield* html`<h1>Hello, ${name}!</h1>`;
}

function* App() {
  yield* html`<main>`;
  yield* Greeting("World");
  yield* html`</main>`;
}

const handler = Handler.prepare(App);

export default {
  fetch() {
    return new Response(renderToStream(handler), {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }
}
```

Components are plain generator functions composed via `yield*` — no JSX, no virtual DOM.

---

### Type-safe context

Context is declared once and consumed anywhere in the tree. TypeScript tracks which contexts are unsatisfied and prevents calling `renderToStream` until all are provided.

```ts
import { createContext, Handler, html, renderToStream } from 'raval';

interface User { name: string; role: string; }

const UserCtx = createContext<User>();

function* Profile() {
  const user = yield* UserCtx;
  yield* html`<p>${user.name} — ${user.role}</p>`;
}

function* App() {
  yield* Profile();
}

export default {
  fetch(request: Request) {
    const handler = Handler.prepare(App)
      .setContext(UserCtx, { name: 'Alice', role: 'admin' });

    // TypeScript error here if any required context is missing
    return new Response(renderToStream(handler), {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }
}
```

---

### Async context providers

Contexts can be resolved asynchronously. The stream pauses at each context yield and resumes once the value is available.

```ts
import { createContext, Handler, html, renderToStream } from 'raval';

const SessionCtx = createContext<{ userId: string }>();
const ProfileCtx = createContext<{ name: string }>();

function* Page() {
  const profile = yield* ProfileCtx;
  yield* html`<h1>Welcome, ${profile.name}</h1>`;
}

export default {
  async fetch(request: Request) {
    const handler = Handler.prepare(Page)
      .setContext(SessionCtx, async () => {
        const token = request.headers.get('authorization') ?? '';
        return verifyToken(token);
      })
      .setContext(ProfileCtx, async function* () {
        // Generator providers can consume other contexts
        const session = yield* SessionCtx;
        const profile = await fetchProfile(session.userId);
        return profile;
      });

    return new Response(renderToStream(handler), {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }
}
```

Context providers can be:
- A plain value: `.setContext(Ctx, value)`
- An async function: `.setContext(Ctx, async () => value)`
- A sync generator: `.setContext(Ctx, function* () { ... })`
- An async generator: `.setContext(Ctx, async function* () { ... })`

Generator providers can `yield*` other contexts — those transitive dependencies are automatically tracked in the Handler's required context set.

---

### Violations

Violations let a context provider or the root generator signal that something went wrong (missing auth, invalid input, etc.) and short-circuit execution. Violation names are tracked as a union type so the handler at the call site is exhaustive.

```ts
import { createContext, Handler, html, renderToStream, Violation } from 'raval';

const AuthCtx = createContext<{ userId: string }>();

function* Page() {
  const auth = yield* AuthCtx;
  yield* html`<p>Hello user ${auth.userId}</p>`;
}

export default {
  fetch(request: Request) {
    const handler = Handler.prepare(Page)
      .setContext(AuthCtx, async function* () {
        const token = request.headers.get('authorization');
        if (!token) {
          yield* new Violation('unauthorized');
          return { userId: '' }; // unreachable
        }
        return verifyToken(token);
      });

    // violation handler is required because AuthCtx provider can yield 'unauthorized'
    return new Response(
      renderToStream(handler, (v) => {
        if (v.name === 'unauthorized') {
          return `<meta http-equiv="refresh" content="0;url=/login">`;
        }
      }),
      { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
    );
  }
}
```

---

### Actions (`run`)

Use `run` for non-rendering handlers — form submissions, API routes, etc. It resolves all contexts, ignores HTML yields, and returns the generator's final value.

```ts
import { createContext, Handler, run, Violation } from 'raval';

const RequestCtx = createContext<Request>();

const submitHandler = Handler.prepare(function* () {
  const request = yield* RequestCtx;
  const form = yield* (async () => request.formData());
  await saveData(Object.fromEntries(form));
  return Response.redirect('/success');
});

export default {
  fetch(request: Request) {
    const handler = submitHandler.setContext(RequestCtx, request);
    return run(handler);
  }
}
```

---

### Just-in-time CSS injection

Yield a `Css` instance to inject a `<style>` block. Identical instances are deduplicated — shared styles are emitted only once per stream.

```ts
import { css, html, Handler, renderToStream } from 'raval';

const cardCss = css`
  .card { border: 1px solid #ccc; padding: 1rem; }
`;

function* Card(title: string) {
  yield cardCss;
  yield* html`<div class="card">${title}</div>`;
}

function* Page() {
  yield* Card("First");
  yield* Card("Second"); // cardCss is not emitted again
}
```

```html
<!-- Generated HTML -->
<style>.card { border: 1px solid #ccc; padding: 1rem; }</style>
<div class="card">First</div>
<div class="card">Second</div>
```
