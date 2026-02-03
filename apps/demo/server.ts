import { createRouter } from "@remix-run/fetch-router";
import { Route } from "streamweaver";
import { routes } from "./routes/routes";
import { Home } from "./routes/home";
import { FeedContext } from "./shared/feed";
import type { Release } from "./shared/types";

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request, env: Env) {
    const router = createRouter();

    router.map(routes, {
      async home() {
        const { results } = await env.DB.prepare(
          `
          SELECT
            r.mbid as release_mbid, r.title as release_title, r.type as release_type,
            a.mbid as artist_mbid, a.name as artist_name,
            rv.url as review_url, rv.score as review_score,
            p.name as pub_name, p.url as pub_url
          FROM releases r
          JOIN release_artists ra ON r.mbid = ra.release_mbid
          JOIN artists a ON ra.artist_mbid = a.mbid
          LEFT JOIN reviews rv ON r.mbid = rv.release_mbid
          LEFT JOIN publications p ON rv.publication_id = p.id
          ORDER BY r.created_at DESC
          LIMIT 50
        `,
        ).run();

        const releasesMap = new Map<string, Release>();

        for (const row of results) {
          const releaseMbid = row.release_mbid as string;
          if (!releasesMap.has(releaseMbid)) {
            releasesMap.set(releaseMbid, {
              mbid: releaseMbid,
              title: row.release_title as string,
              type: (row.release_type || "album") as any,
              artists: [],
              reviews: [],
            });
          }

          const release = releasesMap.get(releaseMbid)!;

          // Add artist if not present
          const artistMbid = row.artist_mbid as string;
          if (!release.artists.find((a) => a.mbid === artistMbid)) {
            release.artists.push({
              mbid: artistMbid,
              name: row.artist_name as string,
              releases: [], // Placeholder to satisfy interface
            });
          }

          // Add review if present and not added
          const reviewUrl = row.review_url as string;
          if (reviewUrl && !release.reviews.find((r) => r.url === reviewUrl)) {
            release.reviews.push({
              url: reviewUrl,
              release: release,
              publication: {
                name: row.pub_name as string,
                url: row.pub_url as string,
              },
            });
          }
        }

        const releases = Array.from(releasesMap.values());

        const route = new Route(Home).setContext(FeedContext, {
          releases: releases,
        });

        return new Response(route.renderToStream(), {
          headers: {
            "Content-Type": "text/html",
          },
        });
      },
    });

    return router.fetch(request.url);
  },
  scheduled() {},
} satisfies ExportedHandler<Env>;
