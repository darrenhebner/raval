import { html } from "streamweaver";
import { FeedContext } from "../shared/feed";

export function* Home() {
  const { releases } = yield* FeedContext;

  yield* html`<ul>
    ${releases.map(
      (release) =>
        html`<li>
          ${release.title} -
          ${release.artists.map((artist) => artist.name).join(", ")}
          ${release.mbid}
          <ul>
            ${release.reviews.map(
              (review) =>
                html`<li>
                  ${review.publication.name} <a href="${review.url}">Visit</a>
                </li>`,
            )}
          </ul>
        </li>`,
    )}
  </ul>`;
}
