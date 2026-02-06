import { createRouter } from "@remix-run/fetch-router";
import { Route } from "streamweaver";
import { MusicBrainzApi } from "musicbrainz-api";
import { routes } from "./app/routes";
import { Home } from "./app/home";
import { FeedContext, FeedHandler } from "./shared/feed";
import { EnvContext } from "./shared/env";
import { Release } from "./app/release";
import { ReleaseContext } from "./shared/release";
import { MusicBrainzReleaseContext } from "./shared/musicbrainz";

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
      async release({ params }) {
        const route = new Route(Release)
          .setContext(ReleaseContext, async function* () {
            const { DB } = yield* EnvContext;
            const { results } = await DB.prepare(
              `
              SELECT
                r.mbid as release_mbid, r.title as release_title, r.type as release_type,
                a.mbid as artist_mbid, a.name as artist_name,
                rv.url as review_url, rv.score as review_score, rv.published_at as review_date,
                p.name as pub_name, p.url as pub_url, p.feed_url as pub_feed_url
              FROM releases r
              JOIN release_artists ra ON r.mbid = ra.release_mbid
              JOIN artists a ON ra.artist_mbid = a.mbid
              LEFT JOIN reviews rv ON r.mbid = rv.release_mbid
              LEFT JOIN publications p ON rv.publication_id = p.id
              WHERE r.mbid = ?
            `,
            )
              .bind(params.mbid)
              .run();

            if (!results.length) {
              throw new Error("Release not found");
            }

            const release: any = {
              mbid: results[0].release_mbid as string,
              title: results[0].release_title as string,
              type: (results[0].release_type || "album") as any,
              artists: [],
              reviews: [],
            };

            const artistIds = new Set<string>();
            const reviewUrls = new Set<string>();

            for (const row of results) {
              const artistMbid = row.artist_mbid as string;
              if (!artistIds.has(artistMbid)) {
                release.artists.push({
                  mbid: artistMbid,
                  name: row.artist_name as string,
                  releases: [],
                });
                artistIds.add(artistMbid);
              }

              if (row.review_url) {
                const reviewUrl = row.review_url as string;
                if (!reviewUrls.has(reviewUrl)) {
                  release.reviews.push({
                    url: reviewUrl,
                    release: release,
                    publication: {
                      name: row.pub_name as string,
                      url: row.pub_url as string,
                      feedUrl: row.pub_feed_url as string,
                    },
                  });
                  reviewUrls.add(reviewUrl);
                }
              }
            }

            return release;
          })
          .setContext(MusicBrainzReleaseContext, async function* () {
            yield;
            const mbApi = new MusicBrainzApi({
              appName: "streamweaver-demo",
              appVersion: "0.0.1",
              appContactInfo: "info@streamweaver.com",
            });
            const result = await mbApi.lookup("release", params.mbid, [
              "artists",
              "media",
              "url-rels",
            ]);

            return result;
          })
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
  async scheduled(_event, env) {
    await env.REVIEW_FETCHER_WORKFLOW.create({
      id: `review-fetcher-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      params: {},
    });
  },
} satisfies ExportedHandler<Env>;
