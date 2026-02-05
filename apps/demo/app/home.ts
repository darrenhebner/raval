import { css, html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import type { Release } from "../shared/types";
import { ResetCss, ThemeCss } from "../shared/styles";

const ReleaseItemCss = css`
  .ReleaseItemTrack {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .ReleaseItemArtwork {
    border-radius: 24px;
    corner-shape: squircle;
  }

  .ReleaseItemReviews {
    list-style: none;
    font-size: 14px;
    padding-left: 12px;
  }

  .ReleaseItemReviews > :not(:last-child) {
    margin-bottom: 12px;
  }

  .ReleaseItemReviewHeading {
    display: flex;
    align-items: center;
    gap: 4px;
  }
`;

function* ReleaseItem({ artists, artworkUrl, title, reviews }: Release) {
  yield ReleaseItemCss;

  yield* html`<li>
    <div class="ReleaseItemTrack">
      <div>
        <h3>${title}</h3>
        <p>${artists.map((artist) => artist.name).join(", ")}</p>
      </div>
      ${artworkUrl
        ? html`<img
            class="ReleaseItemArtwork"
            src="${artworkUrl}"
            alt="${title}"
            width="60"
            height="60"
          />`
        : ""}
    </div>
    <ul class="ReleaseItemReviews">
      ${reviews.map(
        (review) =>
          html`<li class="ReleaseItemReview">
            <h4 class="ReleaseItemReviewHeading">
              <img
                height="16"
                width="16"
                src="https://www.google.com/s2/favicons?domain=${review
                  .publication.url}&sz=16"
              />
              <a href="${review.url}">${review.publication.name}</a>
            </h4>
            ${review.snippet
              ? html`<blockquote>${review.snippet}</blockquote>`
              : ""}
          </li>`,
      )}
    </ul>
  </li>`;
}

const HomeCss = css`
  .Container {
    max-width: 600px;
    margin: 16px auto;
    width: 90%;
  }

  .Feed {
    list-style: none;
  }

  .Feed > :not(:last-child) {
    margin-bottom: 24px;
  }
`;

export function* Home() {
  yield ResetCss;
  yield ThemeCss;
  yield HomeCss;

  const { releases } = yield* FeedContext;

  yield* html`<main class="Container">
    <ol class="Feed">
      ${releases.map((release) => html`<${ReleaseItem} ...${release} />`)}
    </ol>
  </main>`;
}
