import { createRouter, route } from "@remix-run/fetch-router";
import { createContext, html, map, Route } from "streamweaver";

interface Data {
  name: string;
}

const DataContext = createContext<Data>();

interface Params {
  id: number;
  year: number;
}

const ParamsContext = createContext<Params>();

function* Footer() {
  const { year } = yield* ParamsContext;
  return html`<footer>At is since ${year}</footer>`;
}

function* User(user: string) {
  const { id } = yield* ParamsContext;
  return html`<li data-id="${id}">
    ${user} <a href="${routes.user.href({ user })}">Visit</a>
  </li>`;
}

function* App() {
  const { name } = yield* DataContext;
  const footer = yield* Footer();

  const users = ["Bob", "Jim", "Jude"];

  return html`<main>
    <h1>hi, ${name}.</h1>
    <ul>
      ${users.length > 0 ? yield* map(users, User) : ""}
    </ul>
    ${footer}
  </main>`;
}

const routes = route({
  home: "/",
  user: "/user/:user",
});

const router = createRouter();

router.map(routes, {
  home() {
    const route = new Route(App)
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
  user() {
    return new Response("Not yet implemented", { status: 500 });
  },
});

export default {
  async fetch(request) {
    return router.fetch(request.url);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
