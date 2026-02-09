import { createContext } from "raval";
import { EnvContext } from "./env";
import type { Artist, Feed, Release, Review } from "./types";

export const FeedContext = createContext<Feed>();

export async function* FeedHandler() {
  const { DB } = yield* EnvContext;
  const { results } = await DB.prepare(
    `
    SELECT
      rv.url as review_url,
      rv.snippet as review_snippet,
      rv.published_at as review_date,
      p.name as pub_name,
      p.url as pub_url,
      p.feed_url as pub_feed_url,
      r.mbid as release_mbid,
      r.title as release_title,
      r.type as release_type,
      r.artwork_url as release_artwork_url,
      json_group_array(json_object('mbid', a.mbid, 'name', a.name)) as artists
    FROM reviews rv
    JOIN publications p ON rv.publication_id = p.id
    JOIN releases r ON rv.release_mbid = r.mbid
    LEFT JOIN release_artists ra ON r.mbid = ra.release_mbid
    LEFT JOIN artists a ON ra.artist_mbid = a.mbid
    GROUP BY rv.id
    ORDER BY rv.published_at DESC
    LIMIT 50
    `
  ).run();

  const reviews: Review[] = results.map((row) => ({
    url: row.review_url as string,
    snippet: row.review_snippet as string,
    publishedAt: row.review_date as string,
    publication: {
      name: row.pub_name as string,
      url: row.pub_url as string,
      feedUrl: row.pub_feed_url as string,
    },
    release: {
      mbid: row.release_mbid as string,
      title: row.release_title as string,
      artworkUrl: row.release_artwork_url as string,
      type: (row.release_type || "album") as Release["type"],
      artists: JSON.parse(row.artists as string)
        .filter((a: Artist) => a.mbid)
        .map((a: Artist) => ({
          ...a,
          releases: [],
        })),
      reviews: [],
    },
  }));

  return {
    reviews,
  };
}
