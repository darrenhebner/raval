import { createContext } from "streamweaver";
import type { Feed, Release } from "./types";
import { EnvContext } from "./env";

export const FeedContext = createContext<Feed>();

export async function* FeedHandler() {
  const { DB } = yield* EnvContext;
  const { results } = await DB.prepare(
    `
  WITH top_releases AS (
    SELECT
      r.mbid,
      MAX(rv.published_at) as latest_review,
      r.created_at
    FROM releases r
    LEFT JOIN reviews rv ON r.mbid = rv.release_mbid
    GROUP BY r.mbid
    ORDER BY latest_review DESC, r.created_at DESC
    LIMIT 50
  )
  SELECT
    r.mbid as release_mbid, r.title as release_title, r.type as release_type, r.artwork_url as release_artwork_url,
    a.mbid as artist_mbid, a.name as artist_name,
    rv.url as review_url, rv.score as review_score, rv.snippet as review_snippet, rv.published_at as review_date,
    p.name as pub_name, p.url as pub_url, p.feed_url as pub_feed_url
  FROM top_releases tr
  JOIN releases r ON tr.mbid = r.mbid
  JOIN release_artists ra ON r.mbid = ra.release_mbid
  JOIN artists a ON ra.artist_mbid = a.mbid
  LEFT JOIN reviews rv ON r.mbid = rv.release_mbid
  LEFT JOIN publications p ON rv.publication_id = p.id
  ORDER BY tr.latest_review DESC, tr.created_at DESC, rv.published_at DESC
`,
  ).run();

  const releasesMap = new Map<string, Release>();

  for (const row of results) {
    const releaseMbid = row.release_mbid as string;
    if (!releasesMap.has(releaseMbid)) {
      releasesMap.set(releaseMbid, {
        mbid: releaseMbid,
        title: row.release_title as string,
        artworkUrl: row.release_artwork_url as string,
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
        snippet: row.review_snippet as string,
        publication: {
          name: row.pub_name as string,
          url: row.pub_url as string,
          feedUrl: row.pub_feed_url as string,
        },
      });
    }
  }

  const releases = Array.from(releasesMap.values());

  return {
    releases,
  };
}
