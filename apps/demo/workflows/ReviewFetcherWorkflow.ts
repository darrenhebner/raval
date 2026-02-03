import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { XMLParser } from "fast-xml-parser";
import { MusicBrainzApi } from "musicbrainz-api";
import type { Publication } from "../shared/types";

interface Env {
  DB: D1Database;
  AI: Ai;
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
];

const mbApi = new MusicBrainzApi({
  appName: "StreamWeaver",
  appVersion: "0.0.1",
  appContactInfo: "darren@example.com",
});

export class ReviewFetcherWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<any>, step: WorkflowStep) {
    const parser = new XMLParser();

    for (const pub of publications) {
      if (!pub.feedUrl) continue;

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
          .map((item: any) => ({
            title: item.title,
            link: item.link,
            description: item.description,
            guid: item.guid,
            pubDate: item.pubDate,
          }))
          .slice(0, 10);
      });

      for (const item of feedItems) {
        // Use a deterministic step name based on the item URL or GUID
        const itemIdentifier =
          typeof item.link === "string" ? item.link : item.guid;
        // Sanitize identifier for step name
        const stepId = (itemIdentifier || "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(-30);

        if (!stepId) continue;

        await step.do(`process-item-${pub.name}-${stepId}`, async () => {
          const itemUrl =
            typeof item.link === "string"
              ? item.link
              : Array.isArray(item.link)
                ? item.link[0]
                : item.guid; // naive link extraction

          // 4. Check if review already exists
          const existing = await this.env.DB.prepare(
            "SELECT id FROM reviews WHERE url = ?",
          )
            .bind(itemUrl)
            .first();

          if (existing) {
            return { skipped: true, reason: "exists" };
          }

          // 5. Extract information using Cloudflare AI
          const aiResponse = await this.env.AI.run(
            "@cf/meta/llama-3-8b-instruct",
            {
              messages: [
                {
                  role: "system",
                  content:
                    "You are a music data extractor. Extract the Artist Name and Release Title from the provided review title/description. Return JSON only with keys: artist_name, release_title. If unsure, return null.",
                },
                {
                  role: "user",
                  content: `Title: ${item.title}\nDescription: ${item.description?.slice(0, 200)}`,
                },
              ],
            },
          );

          // Parse AI response (it might be a string containing JSON or an object depending on the model/wrapper)
          // The Workers AI binding usually returns the response directly.
          // Llama models usually return { response: "string" }

          let artistName, releaseTitle;
          try {
            // Simple heuristic parsing if JSON extraction fails or if model chats too much
            const jsonMatch = aiResponse.response?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              artistName = parsed.artist_name;
              releaseTitle = parsed.release_title;
            }
          } catch (e) {
            console.error("AI Parse error", e);
            return { skipped: true, reason: "ai-parse-error" };
          }

          if (!artistName || !releaseTitle) {
            return { skipped: true, reason: "ai-missing-data" };
          }

          // 6. Look up MusicBrainz ID
          // Search for artist
          const artistSearch = await mbApi.search("artist", {
            query: artistName,
            limit: 1,
          });
          const artist = artistSearch.artists[0];

          if (!artist) {
            return { skipped: true, reason: "artist-not-found" };
          }

          // Search for release group or release by artist
          const releaseSearch = await mbApi.search("release-group", {
            query: `release:${releaseTitle} AND artist:${artist.name}`,
            limit: 1,
          });

          const releaseGroup = releaseSearch["release-groups"][0];
          // Or search specific release if needed, but release-group is usually better for reviews

          if (!releaseGroup) {
            return { skipped: true, reason: "release-not-found" };
          }

          // 7. Save to database
          // We need to insert Publication (if not exists), Artist, Release, ReleaseArtist, Review

          // Note: using raw SQL for now as we don't have an ORM set up in this file

          // Insert Publication (ignore if exists)
          await this.env.DB.prepare(
            "INSERT OR IGNORE INTO publications (name, url, feed_url) VALUES (?, ?, ?)",
          )
            .bind(pub.name, pub.url, pub.feedUrl)
            .run();

          const pubIdObj = await this.env.DB.prepare(
            "SELECT id FROM publications WHERE url = ?",
          )
            .bind(pub.url)
            .first();
          const pubId = pubIdObj?.id;

          // Insert Artist
          await this.env.DB.prepare(
            "INSERT OR IGNORE INTO artists (mbid, name) VALUES (?, ?)",
          )
            .bind(artist.id, artist.name)
            .run();

          // Insert Release
          await this.env.DB.prepare(
            "INSERT OR IGNORE INTO releases (mbid, title, type, date) VALUES (?, ?, ?, ?)",
          )
            .bind(
              releaseGroup.id,
              releaseGroup.title,
              releaseGroup["primary-type"],
              releaseGroup["first-release-date"],
            )
            .run();

          // Link Release-Artist
          await this.env.DB.prepare(
            "INSERT OR IGNORE INTO release_artists (release_mbid, artist_mbid) VALUES (?, ?)",
          )
            .bind(releaseGroup.id, artist.id)
            .run();

          // Insert Review
          await this.env.DB.prepare(
            "INSERT INTO reviews (publication_id, release_mbid, url, title, created_at) VALUES (?, ?, ?, ?, unixepoch())",
          )
            .bind(pubId, releaseGroup.id, itemUrl, item.title)
            .run();

          return {
            success: true,
            artist: artist.name,
            release: releaseGroup.title,
          };
        });
      }
    }
  }
}
