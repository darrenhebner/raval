import { createRouter } from "@remix-run/fetch-router";
import { Route } from "streamweaver";
import { routes } from "./app/routes";
import { Home } from "./app/home";
import { FeedContext, FeedHandler } from "./shared/feed";
import { EnvContext } from "./shared/env";

export { ReviewFetcherWorkflow } from "./workflows/ReviewFetcherWorkflow";

export default {
  async fetch(request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/__scheduled") {
      await env.REVIEW_FETCHER_WORKFLOW.create({
        id: `review-fetcher-${new Date().toISOString().replace(/[:.]/g, "-")}`,
        params: {},
      });
      return new Response("Scheduled workflow triggered manually");
    }

    const router = createRouter();

    router.map(routes, {
      async home() {
        const route = new Route(Home)
          .setContext(FeedContext, FeedHandler)
          .setContext(EnvContext, env);

        return new Response(route.renderToStream(), {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
          },
        });
      },
    });

    return router.fetch(request.url);
  },
  async scheduled(event, env: Env, ctx: ExecutionContext) {
    await env.REVIEW_FETCHER_WORKFLOW.create({
      id: `review-fetcher-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      params: {},
    });
  },
} satisfies ExportedHandler<Env>;
