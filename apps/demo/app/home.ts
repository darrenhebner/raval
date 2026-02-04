import { html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import { routes } from "./routes";

export function* Home() {
  const { releases } = yield* FeedContext;

  yield* html`<ul>
    ${releases.map(
      (release) =>
        html`<li>
          ${release.artworkUrl
            ? html`<img
                src="${release.artworkUrl}"
                alt="${release.title}"
                width="100"
                height="100"
              />`
            : ""}
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
                  <img
                    src="https://www.google.com/s2/favicons?domain=${review
                      .publication.url}&sz=16"
                  />
                  ${review.publication.name} <a href="${review.url}">Visit</a>
                  ${review.snippet
                    ? html`<blockquote>${review.snippet}</blockquote>`
                    : ""}
                </li>`,
            )}
          </ul>
        </li>`,
    )}
  </ul>`;
}
