import { html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import { routes } from "./routes";

export function* Home() {
  const { releases } = yield* FeedContext;

  yield* html`<ul>
    ${releases.map(
      (release) =>
        html`<li>
          ${release.title} -
          ${release.artists.map((artist) => artist.name).join(", ")}
          <a href="https://musicbrainz.org/release/${release.mbid}"
            >Musicbrainz</a
          >
          <a href="${routes.release.href({ mbid: release.mbid })}">View</a>
          <ul>
            ${release.reviews.map(
              (review) =>
                html`<li>
                  ${review.publication.name} <a href="${review.url}">Visit</a>
                  ${review.snippet ? html`<blockquote>${review.snippet}</blockquote>` : ""}
                </li>`,
            )}
          </ul>
        </li>`,
    )}
  </ul>`;
}
