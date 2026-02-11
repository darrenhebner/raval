import { createRouter } from "@remix-run/fetch-router";
import { MusicBrainzApi } from "musicbrainz-api";
import { Route } from "raval";
import { Home } from "./app/home";
import { Release } from "./app/release";
import { routes } from "./app/routes";
import { EnvContext } from "./shared/env";
import { FeedContext, FeedHandler } from "./shared/feed";
import { MusicBrainzReleaseContext } from "./shared/musicbrainz";
import { ReleaseContext } from "./shared/release";
import { ReviewsContext } from "./shared/reviews";
import type { Release as ReleaseType } from "./shared/types";

// biome-ignore lint/performance/noBarrelFile: Cloudflare workers require this re-export
export { ReviewFetcherWorkflow } from "./workflows/review-fetcher-workflow";

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
      home() {
        const route = new Route(Home)
          .setContext(FeedContext, FeedHandler)
          .setContext(EnvContext, env);

        return new Response(route.renderToStream(), {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
          },
        });
      },
      release({ params }) {
        const route = new Route(Release)
          .setContext(ReleaseContext, async function* () {
            const { DB } = yield* EnvContext;
            const { results } = await DB.prepare(
              `
          SELECT
            r.mbid as release_mbid, r.title as release_title, r.type as release_type, r.artwork_url as release_artwork_url,
            a.mbid as artist_mbid, a.name as artist_name,
            rv.url as review_url, rv.score as review_score, rv.published_at as review_date, rv.snippet as review_snippet,
            p.name as pub_name, p.url as pub_url, p.feed_url as pub_feed_url
          FROM releases r
          JOIN release_artists ra ON r.mbid = ra.release_mbid
          JOIN artists a ON ra.artist_mbid = a.mbid
          LEFT JOIN reviews rv ON r.mbid = rv.release_mbid
          LEFT JOIN publications p ON rv.publication_id = p.id
          WHERE r.mbid = ?
        `
            )
              .bind(params.mbid)
              .run();

            if (!results.length) {
              throw new Error("Release not found");
            }

            const release: ReleaseType = {
              mbid: results[0].release_mbid as string,
              title: results[0].release_title as string,
              type: (results[0].release_type ?? "album") as ReleaseType["type"],
              artworkUrl: results[0].release_artwork_url as string | undefined,
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
                    release,
                    publishedAt: row.review_date as string,
                    snippet: row.review_snippet as string,
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
          .setContext(ReviewsContext, function* () {
            const { reviews } = yield* ReleaseContext;
            return { reviews };
          })
          .setContext(MusicBrainzReleaseContext, async function* () {
            yield;
            const mbApi = new MusicBrainzApi({
              appName: "Grapevien",
              appVersion: "0.0.1",
              appContactInfo: "darrenwilliamhebner@gmail.com",
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
      async imageProxy({ request }) {
        async function fetchWithRetry() {
          const url = new URL(request.url);
          const originalUrl = url.searchParams.get("originalUrl");
          if (!originalUrl) {
            return new Response("Missing originalUrl parameter", { status: 400 });
          }

          try {
            const response = await fetch(originalUrl, {
              redirect: "follow",
            });

            if (!response.ok) {
              return new Response(`Upstream error: ${response.statusText}`, {
                status: response.status,
              });
            }

            const contentType = response.headers.get("content-type");

            return new Response(response.body, {
              headers: {
                "Content-Type": contentType || "application/octet-stream",
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } catch (error: unknown) {
            console.error(error)
            if (error !== null && typeof error === 'object' && 'retryable' in error && error.retryable === true) {
              return fetchWithRetry()
            }

            return new Response("Error fetching image", { status: 500 });
          }
        }

        return await fetchWithRetry()
      }
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
