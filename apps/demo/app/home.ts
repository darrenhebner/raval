import { css, html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import type { Release } from "../shared/types";
import { routes } from "./routes";

const ReleaseItemCss = css`
  li {
    color: blue;
  }
`;

function* ReleaseItem({ artists, artworkUrl, title, mbid, reviews }: Release) {
  yield ReleaseItemCss;

  yield* html`<li>
    ${artworkUrl
      ? html`<img
          src="${artworkUrl}"
          alt="${title}"
          width="100"
          height="100"
        />`
      : ""}
    ${title} - ${artists.map((artist) => artist.name).join(", ")}
    <a href="https://musicbrainz.org/release/${mbid}">Musicbrainz</a>
    <a href="${routes.release.href({ mbid: mbid })}">View</a>
    <ul>
      ${reviews.map(
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
  </li>`;
}

export function* Home() {
  const { releases } = yield* FeedContext;

  yield* html`<ul>
    ${releases.map((release) => html`<${ReleaseItem} ...${release} />`)}
  </ul>`;
}
