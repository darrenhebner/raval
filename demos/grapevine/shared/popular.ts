import { createContext } from "raval";
import { EnvContext } from "./env";
import type { Artist, Release } from "./types";

export interface PopularReleases {
  releases: Release[];
}

export const PopularReleasesContext = createContext<PopularReleases>();

export async function* PopularReleasesHandler() {
  const { DB } = yield* EnvContext;

  const { results } = await DB.prepare(
    `
    WITH RecentReviews AS (
      SELECT
        rv.release_mbid,
        rv.id,
        rv.url,
        rv.snippet,
        rv.published_at,
        p.name as pub_name,
        p.url as pub_url,
        p.feed_url as pub_feed_url
      FROM reviews rv
      JOIN publications p ON rv.publication_id = p.id
      WHERE rv.published_at >= date('now', '-7 days')
    ),
    ReleaseArtists AS (
      SELECT
        ra.release_mbid,
        json_group_array(json_object('mbid', a.mbid, 'name', a.name)) as artists_json
      FROM release_artists ra
      JOIN artists a ON ra.artist_mbid = a.mbid
      GROUP BY ra.release_mbid
    )
    SELECT
      r.mbid as release_mbid,
      r.title as release_title,
      r.type as release_type,
      r.artwork_url as release_artwork_url,
      ra.artists_json,
      json_group_array(json_object(
        'url', rr.url,
        'snippet', rr.snippet,
        'publishedAt', rr.published_at,
        'publication', json_object(
          'name', rr.pub_name,
          'url', rr.pub_url,
          'feedUrl', rr.pub_feed_url
        )
      )) as reviews_json,
      COUNT(rr.id) as review_count
    FROM releases r
    JOIN RecentReviews rr ON r.mbid = rr.release_mbid
    LEFT JOIN ReleaseArtists ra ON r.mbid = ra.release_mbid
    GROUP BY r.mbid
    ORDER BY review_count DESC
    LIMIT 50
    `
  ).run();

  const releases: Release[] = results.map((row) => {
    const release: Release = {
      mbid: row.release_mbid as string,
      title: row.release_title as string,
      type: (row.release_type || "album") as Release["type"],
      artworkUrl: row.release_artwork_url as string,
      artists: JSON.parse((row.artists_json as string) || "[]").map(
        (a: Artist) => ({
          ...a,
          releases: [],
        })
      ),
      reviews: JSON.parse((row.reviews_json as string) || "[]").map(
        (r: object) => ({
          ...r,
          // Placeholder, will be set below
          release: null,
        })
      ),
    };

    // Circular reference for Review type
    for (const review of release.reviews) {
      review.release = release;
    }

    return release;
  });

  return {
    releases,
  };
}
