import { createContext, Route } from "streamweaver";

interface Data {
  name: string;
}

const DataContext = createContext<Data>();

interface Params {
  id: number;
}

const ParamsContext = createContext<Params>();

function* app() {
  const { name } = yield* DataContext;
  const { id } = yield* ParamsContext;
  return `<h1>hi, ${name}. Id: ${id}</h1>`;
}

export default {
  async fetch() {
    const route = new Route(app)
      .setContext(DataContext, { name: "bill" })
      .setContext(ParamsContext, { id: 123 });

    return new Response(route.renderToStream(), {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
