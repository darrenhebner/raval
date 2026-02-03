import { createRouter, route } from "@remix-run/fetch-router";
import { createContext, html, Route } from "streamweaver";

interface Data {
  name: string;
}

const DataContext = createContext<Data>();

interface Params {
  id: number;
  year: number;
}

const ParamsContext = createContext<Params>();

interface User {
  name: string;
}

const UserContext = createContext<User>();

function* Footer() {
  const { year } = yield* ParamsContext;
  return html`<footer>At is since ${year}</footer>`;
}

function* User({ user }: { user: string }) {
  const { id } = yield* ParamsContext;
  return html`<li data-id="${id}">
    ${user} <a href="${routes.user.href({ user })}">Visit</a>
  </li>`;
}

function* Home() {
  const { name } = yield* DataContext;

  const users = ["bob", "jude"];

  yield* html`<main id="main">
    <h1>hi, ${name}.</h1>
    <ul>
      ${users.map((user) => html`<${User} user=${user} />`)}
    </ul>
    <${Footer} />
  </main>`;
}

function* ShowUser() {
  const { name } = yield* UserContext;
  yield* html`<main>
    Name: ${name}. <a href="${routes.home.href()}">Home</a>
  </main>`;
}

const routes = route({
  home: "/",
  user: "/user/:user",
});

const router = createRouter();

router.map(routes, {
  home() {
    const route = new Route(Home)
      .setContext(DataContext, {
        name: "Bill",
      })
      .setContext(ParamsContext, { id: 123, year: 1992 });

    return new Response(route.renderToStream(), {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
  user({ params }) {
    const route = new Route(ShowUser).setContext(UserContext, {
      name: params.user,
    });

    return new Response(route.renderToStream(), {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
});

export default {
  async fetch(request) {
    return router.fetch(request.url);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
