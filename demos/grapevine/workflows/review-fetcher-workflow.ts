import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { XMLParser } from "fast-xml-parser";
import { CoverArtArchiveApi, MusicBrainzApi } from "musicbrainz-api";
import type { Publication } from "../shared/types";

interface Env {
  DB: D1Database;
  AI: Ai;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
}

interface FeedItem {
  title: string;
  link: string | string[];
  description: string;
  guid: string;
  pubDate: string;
}

interface BrowserRenderingResponse {
  success: boolean;
  result?: {
    artist_name: string;
    release_title: string;
    snippet: string;
  };
}

interface CoverImage {
  front: boolean;
  image: string;
}

interface CoverArtResponse {
  images: CoverImage[];
}

interface Artist {
  id: string;
  name: string;
}

interface ReleaseGroup {
  id: string;
  title: string;
  "primary-type": string;
}

interface Release {
  id: string;
  title: string;
  date?: string;
}

const publications: Publication[] = [
  {
    name: "+rcmndedlisten",
    url: "https://rcmndedlisten.com",
    feedUrl: "https://rcmndedlisten.com/feed/",
  },
  {
    name: "Pitchfork",
    url: "https://pitchfork.com",
    feedUrl: "https://pitchfork.com/feed/feed-album-reviews/rss",
  },
  {
    name: "NME",
    url: "https://nme.com",
    feedUrl: "https://www.nme.com/reviews/album/feed",
  },
  {
    name: "Consequence",
    url: "https://consequence.net",
    feedUrl:
      "https://consequence.net/category/reviews/feed/?category=album-reviews",
  },
  {
    name: "Stereogum",
    url: "https://stereogum.com",
    feedUrl: "https://stereogum.com/category/reviews/album-of-the-week/feed",
  },
  {
    name: "Clash",
    url: "https://www.clashmusic.com",
    feedUrl: "https://www.clashmusic.com/reviews/feed",
  },
];

const mbApi = new MusicBrainzApi({
  appName: "Grapevine",
  appVersion: "0.0.1",
  appContactInfo: "darrenwilliamhebner@gmail.com",
});

const coverArtApi = new CoverArtArchiveApi();

export class ReviewFetcherWorkflow extends WorkflowEntrypoint<Env> {
  private extractItemUrl(item: FeedItem): string {
    if (typeof item.link === "string") {
      return item.link;
    }

    if (Array.isArray(item.link) && item.link.length > 0) {
      return String(item.link[0]);
    }

    return item.guid;
  }

  private async extractReviewData(itemUrl: string): Promise<{
    artistName: string;
    releaseTitle: string;
    snippet: string;
  } | null> {
    const browserResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: itemUrl,
          prompt:
            "Extract the Artist Name, Release Title, and a representative Snippet (1-2 sentences direct quote) from this review page.",
          response_format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                artist_name: {
                  type: "string",
                },
                release_title: {
                  type: "string",
                },
                snippet: {
                  type: "string",
                },
              },
              required: ["artist_name", "release_title", "snippet"],
            },
          },
        }),
      }
    );

    if (!browserResponse.ok) {
      const errorText = await browserResponse.text();
      console.error("Browser Rendering API error:", errorText);
      return null;
    }

    const data = (await browserResponse.json()) as BrowserRenderingResponse;

    if (data.success && data.result) {
      return {
        artistName: data.result.artist_name,
        releaseTitle: data.result.release_title,
        snippet: data.result.snippet,
      };
    }

    console.error("Browser Rendering API unexpected response:", data);
    return null;
  }

  private async findCanonicalRelease(
    releaseGroupId: string
  ): Promise<Release | null> {
    const groupData = await mbApi.lookup("release-group", releaseGroupId, [
      "releases",
    ]);

    if (!groupData.releases || groupData.releases.length === 0) {
      return null;
    }

    groupData.releases.sort((a: Release, b: Release) => {
      if (!a.date) {
        return 1;
      }
      if (!b.date) {
        return -1;
      }
      return a.date.localeCompare(b.date);
    });

    return groupData.releases[0];
  }

  private async fetchArtwork(releaseGroupId: string): Promise<string | null> {
    try {
      const coverInfo = (await coverArtApi.getReleaseGroupCovers(
        releaseGroupId
      )) as CoverArtResponse;
      const front = coverInfo.images.find((img: CoverImage) => img.front);
      if (front) {
        return front.image;
      }
    } catch (_e) {
      console.warn(`Failed to fetch artwork for ${releaseGroupId}`);
    }
    return null;
  }

  private async saveReview(
    pub: Publication,
    artist: Artist,
    releaseGroup: ReleaseGroup,
    canonicalRelease: Release,
    itemUrl: string,
    item: FeedItem,
    snippet: string
  ): Promise<void> {
    // Insert Publication (ignore if exists)
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO publications (name, url, feed_url) VALUES (?, ?, ?)"
    )
      .bind(pub.name, pub.url, pub.feedUrl)
      .run();

    const pubIdObj = await this.env.DB.prepare(
      "SELECT id FROM publications WHERE url = ?"
    )
      .bind(pub.url)
      .first();
    const pubId = pubIdObj?.id as string | undefined;

    // Insert Artist
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO artists (mbid, name) VALUES (?, ?)"
    )
      .bind(artist.id, artist.name)
      .run();

    // Insert Release
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO releases (mbid, title, type, date, artwork_url) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        canonicalRelease.id,
        canonicalRelease.title,
        releaseGroup["primary-type"],
        canonicalRelease.date,
        null // Will be updated after fetching artwork
      )
      .run();

    // Link Release-Artist
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO release_artists (release_mbid, artist_mbid) VALUES (?, ?)"
    )
      .bind(canonicalRelease.id, artist.id)
      .run();

    // Insert Review
    await this.env.DB.prepare(
      "INSERT INTO reviews (publication_id, release_mbid, url, title, snippet, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())"
    )
      .bind(
        pubId,
        canonicalRelease.id,
        itemUrl,
        item.title,
        snippet,
        item.pubDate ? new Date(item.pubDate).toISOString() : null
      )
      .run();
  }

  private async processFeedItem(
    pub: Publication,
    item: FeedItem
  ): Promise<
    | { success: boolean; artist?: string; release?: string }
    | { skipped: boolean; reason: string }
  > {
    const itemUrl = this.extractItemUrl(item);

    // Check if review already exists
    const existing = await this.env.DB.prepare(
      "SELECT id FROM reviews WHERE url = ?"
    )
      .bind(itemUrl)
      .first();

    if (existing) {
      console.log(`Skipping existing review: ${itemUrl}`);
      return { skipped: true, reason: "exists" };
    }

    // Extract information using Cloudflare Browser Rendering
    console.log(`Extracting data for: ${itemUrl}`);
    const reviewData = await this.extractReviewData(itemUrl);

    if (!reviewData) {
      return { skipped: true, reason: "browser-rendering-error" };
    }

    // Look up MusicBrainz ID
    console.log(`Searching MusicBrainz for artist: "${reviewData.artistName}"`);
    const artistSearch = await mbApi.search("artist", {
      query: reviewData.artistName,
      limit: 1,
    });
    const artist = artistSearch.artists[0];

    if (!artist) {
      console.warn(`Artist not found: "${reviewData.artistName}"`);
      return { skipped: true, reason: "artist-not-found" };
    }
    console.log(`Found artist: ${artist.name} (${artist.id})`);

    // Search for release group
    console.log(
      `Searching MusicBrainz for release: "${reviewData.releaseTitle}" by "${artist.name}"`
    );
    const releaseSearch = await mbApi.search("release-group", {
      query: `release:${reviewData.releaseTitle} AND artist:${artist.name}`,
      limit: 1,
    });

    const releaseGroup = releaseSearch["release-groups"][0];

    if (!releaseGroup) {
      console.warn(`Release group not found: "${reviewData.releaseTitle}"`);
      return { skipped: true, reason: "release-not-found" };
    }
    console.log(
      `Found release group: ${releaseGroup.title} (${releaseGroup.id})`
    );

    // Find canonical release
    const canonicalRelease = await this.findCanonicalRelease(releaseGroup.id);

    if (!canonicalRelease) {
      console.warn("No releases found in group");
      return { skipped: true, reason: "no-releases-in-group" };
    }

    console.log(
      `Found canonical release: ${canonicalRelease.title} (${canonicalRelease.id}) - Date: ${canonicalRelease.date}`
    );

    // Fetch artwork
    const artworkUrl = await this.fetchArtwork(releaseGroup.id);
    if (artworkUrl) {
      console.log(`Found artwork: ${artworkUrl}`);
    }

    // Save to database
    console.log("Saving to database...");
    await this.saveReview(
      pub,
      artist,
      releaseGroup,
      canonicalRelease,
      itemUrl,
      item,
      reviewData.snippet
    );

    console.log("Successfully saved review.");

    return {
      success: true,
      artist: artist.name,
      release: canonicalRelease.title,
    };
  }

  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep) {
    console.log("Workflow Environment Check:", {
      hasAccountID: !!this.env.CLOUDFLARE_ACCOUNT_ID,
      hasToken: !!this.env.CLOUDFLARE_API_TOKEN,
      accountIDLength: this.env.CLOUDFLARE_ACCOUNT_ID?.length,
    });

    const parser = new XMLParser();

    for (const pub of publications) {
      if (!pub.feedUrl) {
        continue;
      }

      const feedItems = await step.do(`fetch-feed-${pub.name}`, async () => {
        const response = await fetch(pub.feedUrl);
        const text = await response.text();
        const feed = parser.parse(text);
        // Normalize feed items
        const items = feed.rss?.channel?.item || feed.feed?.entry || [];
        // Ensure it's an array
        const itemsArray = Array.isArray(items) ? items : [items];

        // Return only necessary fields to keep state small
        return itemsArray
          .map((item: Record<string, unknown>) => ({
            title: String(item.title || ""),
            link: item.link as string | string[],
            description: String(item.description || ""),
            guid: String(item.guid || ""),
            pubDate: String(item.pubDate || ""),
          }))
          .slice(0, 10);
      });

      if (!feedItems) {
        continue;
      }

      for (const item of feedItems) {
        // Use a deterministic step name based on the item URL or GUID
        const itemIdentifier =
          typeof item.link === "string" ? item.link : item.guid;
        // Sanitize identifier for step name
        const stepId = (itemIdentifier || "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(-30);

        if (!stepId) {
          continue;
        }

        await step.do(`process-item-${pub.name}-${stepId}`, async () => {
          return await this.processFeedItem(pub, item);
        });
      }
    }
  }
}
