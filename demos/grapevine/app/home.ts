import { css, html } from "raval";
import { FeedContext } from "../shared/feed";
import { ReviewItem } from "../shared/reviews";
import { ResetCss, ThemeCss } from "../shared/styles";
import { routes } from "./routes";

const FeedCss = css`
  .FeedContainer {
    width: 100%;
    max-width: max-content;
    margin: 0;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
  }

  .Feed {
    list-style: none;
  }
`;

export function* Feed() {
  yield ResetCss;
  yield ThemeCss;
  yield FeedCss;

  const { reviews } = yield* FeedContext;

  yield* html`<main class="FeedContainer">
    <ol class="Feed">
      ${reviews.map(
        (review) =>
          html`<${ReviewItem} ...${review}
            >${html`<a
              href="${routes.release.href({ mbid: review.release.mbid })}"
              class="ReviewItemRelease"
            >
              <div>
                <h4>${review.release.title}</h4>
                <p>
                  ${review.release.artists
                    .map((artist) => artist.name)
                    .join(", ")}
                </p>
              </div>
              ${
                review.release.artworkUrl
                  ? html`<img
                    class="ReviewItemArtwork"
                    src="/image-proxy?originalUrl=${review.release.artworkUrl}"
                    loading="lazy"
                    alt="${review.release.title}"
                    width="50"
                    height="50"
                  />`
                  : ""
              }
            </a>`}<//
          >`
      )}
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
