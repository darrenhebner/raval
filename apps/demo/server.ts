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
  return `<h1>hi, ${name}.</h1>`;
}

export default {
  async fetch() {
    const route = new Route(app)
      .setContext(DataContext, function* () {
        const { id } = yield* ParamsContext;
        return {
          name: `Bill - ${id}`,
        };
      })
      .setContext(ParamsContext, { id: 123 });

    return new Response(route.renderToStream(), {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
