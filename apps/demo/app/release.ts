import { css, html } from "streamweaver";
import { ReleaseContext } from "../shared/release";
import { MusicBrainzReleaseContext } from "../shared/musicbrainz";
import { ResetCss, ThemeCss } from "../shared/styles";
import { ReviewsContext, ReviewItem } from "../shared/reviews";

function* Details() {
  const release = yield* MusicBrainzReleaseContext;

  yield* html`<div class="mb-details">
    <h3>Details from MusicBrainz</h3>
    <dl>
      <dt>Released</dt>
      <dd>${release.date} (${release.country})</dd>
    </dl>
  </div>`;
}

function* Reviews() {
  const { reviews } = yield* ReviewsContext;

  yield* html`<ol>
    ${reviews.map((review) => html`<${ReviewItem} ...${review} />`)}
  </ol>`;
}

const ReleaseCss = css`
  .ReleaseContainer {
    width: 100%;
    max-width: max-content;
    margin: 0;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
  }

  .ReleaseHeader {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .ReleaseHeaderArtwork {
    border-radius: 24px;
    corner-shape: squircle;
  }
`;

export function* ReleaseContent() {
  yield ResetCss;
  yield ThemeCss;
  yield ReleaseCss;

  const { title, artists, artworkUrl } = yield* ReleaseContext;

  yield* html`<main class="ReleaseContainer">
    <header class="ReleaseHeader">
      <div>
        <h1>${title}</h1>
        <p>${artists.map((artist) => artist.name).join(", ")}</p>
      </div>

      ${artworkUrl
        ? html`<img
            class="ReleaseHeaderArtwork"
            src="${artworkUrl}"
            width="100"
            height="100"
          />`
        : ""}
    </header>
    <${Reviews} />
  </main>`;
}

export function* Release() {
  yield* html`
    <html lang="en-US">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <title>Music Review Feed</title>
      </head>
      <body>
        <${ReleaseContent} />
      </body>
    </html>
  `;
}
