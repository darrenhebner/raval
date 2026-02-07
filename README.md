## Streamweaver
A streaming first library for building UI.

### Features
- Stream HTML as you render
- Render from the server or service workers
- Typesafe context
- Just in time CSS injection

### Getting started

```js
import {html, Route} from 'streamweaver';

// Create your components
function* Intro({name}) {
  yield* html`<h1>Hello, ${name}!</h1>`
}

function* App() {
  yield* html`<main>
    <heading>
      <${Intro} name="World" />
    </heading>
  </main>`;
}

// Boot the app
const route = new Route(App);

export default {
  fetch() {
    // Render the app to a stream and return your response
    return new Response(route.renderToStream(), {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8'
      }
    })
  }
}
````

### Typesafe Context

```ts
import {createContext, html, Route} from 'streamweaver';
  
interface UserPreferences {
  colorScheme: 'dark' | 'light';
}

// Context objects define the interface
const UserPreferencesContext = createContext<UserPreferences>();

function* Logo() {
  // Components at any level of the tree can access context
  const {colorScheme} = yield* UserPreferencesContext;
  
  if (colorScheme === 'dark') {
    yield* html`<img src="/dark-mode-logo.png" />`;
  } else {
    yield* html`<img src="/light-mode-logo.png` />`;
  }
}

export default {
  fetch(request) {
    // All contexts that are consumed within our app bubble up via TypeScript.
    const route = new Route(Logo).setContext(UserPreferencesContext, {
      colorScheme: request.headers.get("sec-ch-prefers-color-scheme") ?? 'light';
    })
    
    // renderToStream cannot be called until all required contexts have an implementation
    return new Response(route.renderToStream(), {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8'
      }
    })
  }
}
```

### Async Contexts

```ts
import {createContext, html, Route} from 'streamweaver';

interface Params {
  id: string;
}

interface Data {
  name: string;
}

const ParamsContext = createContext<Params>();
const DataContext = createContext<Data>();

function* Greeting() {  
  const {name} = yield* DataContext; 
  yield* html`<h1>Hello, ${name}</h1>`
}

// HTML is eagerly streamed as soon as renderToStream is called.
// When a component with an async dependency is encountered,
// the stream pauses and waits for the context to resolve before continuing.
// In this example, the logo would be displayed while Greeting waits for the async DataContext.
function* App() {
  yield* html`
    <main>
      <img src="logo.png" />
      <${Greeting} />  
    </main>
  `
}

export default {
  fetch(request) {
    const route = new Route(App).setContext(DataContext, async function*() {
      // Contexts can be consumed by other contexts
      const {id} = yield* ParamsContext;
      const data = await fetchData(id);
      return data;
    })
    .setContext(ParamsContext, {
      id: new URL(request.url).searchParams.get('id')
    })
    
    return new Response(route.renderToStream(), {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8'
      }
    })
  }
}
```

### Just in time CSS injection

```ts
import {html, css} from 'streamweaver';

const ListItemCss = css`
  .ListItem {
    margin: 4px;
    color: blue;
  }
`

function* ListItem({content}) {
  yield ListItemCss; 
  yield* html`<li class="ListItem">${content}</li>`
}

function* List({items}) {
  yield* html`<ul>${items.map(item => html`<${ListItem} content="${item}"/>`)}</ul>`
}
```

```html
<!-- Generated html -->
<ul>
  <!-- Styles are inlined just before they are used -->
  <style>
    .ListItem {
      margin: 4px;
      color: blue;
    }
  </style>
  <li class="ListItem">Item 1</li>
  
  <!-- Styles are deduped so they are only included once in the document, even if the component is rendered multiple times -->
  <li class="ListItem">Item 2</li>
  <li class="ListItem">Item 3</li>
</ul>
```
