import { css, html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import type { Review } from "../shared/types";
import { ResetCss, ThemeCss } from "../shared/styles";
import { formatRelativeTime } from "../shared/date";

const ReviewItemCss = css`
  .ReviewItem {
    display: flex;
    gap: 12px;
    padding: 16px;
  }

  .ReviewItemIcon {
    border-radius: 4px;
  }

  .ReviewItemHeading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }

  .ReviewItemHeading h4 {
    margin: 0;
  }

  .ReviewItemMeta {
    color: rgba(0, 0, 0, 0.5);
  }

  .ReviewItemRelease {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
  }

  .ReviewItemArtwork {
    border-radius: 8px;
  }

  .ReviewItemSnippet {
    max-width: 50ch;
    margin: 0 0 12px 0;
  }

  .ReviewItem:not(last-child) {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
`;

function* ReviewItem({
  publication,
  snippet,
  release,
  publishedAt,
  url,
}: Review) {
  yield ReviewItemCss;

  yield* html`<li class="ReviewItem">
    <img
      class="ReviewItemIcon"
      height="32"
      width="32"
      src="https://www.google.com/s2/favicons?domain=${publication.url}&sz=32"
      alt="${publication.name}"
    />
    <div>
      <div class="ReviewItemHeading">
        <h4>${publication.name}</h4>
        <span class="ReviewItemMeta">${formatRelativeTime(publishedAt)}</span>
      </div>

      ${snippet
        ? html`<blockquote class="ReviewItemSnippet">${snippet}</blockquote>`
        : ""}

      <a href="${url}" target="_blank" class="ReviewItemRelease">
        <div>
          <h4>${release.title}</h4>
          <p>${release.artists.map((artist) => artist.name).join(", ")}</p>
        </div>
        ${release.artworkUrl
          ? html`<img
              class="ReviewItemArtwork"
              src="${release.artworkUrl}"
              alt="${release.title}"
              width="50"
              height="50"
            />`
          : ""}
      </a>
    </div>
  </li>`;
}

const FeedCss = css`
  .Container {
    width: 100%;
    max-width: max-content;
    margin: 0;
  }

  .Feed {
    list-style: none;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
  }
`;

export function* Feed() {
  yield ResetCss;
  yield ThemeCss;
  yield FeedCss;

  const { reviews } = yield* FeedContext;

  yield* html`<main class="Container">
    <ol class="Feed">
      ${reviews.map((review) => html`<${ReviewItem} ...${review} />`)}
    </ol>
  </main>`;
}

export function* Home() {
  yield* html`
    <html lang="en-US">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <title>Music Review Feed</title>
      </head>
      <body>
        <${Feed} />
      </body>
    </html>
  `;
}
