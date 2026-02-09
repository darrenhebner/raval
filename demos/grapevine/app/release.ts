import { css, html } from "streamweaver";
import { MusicBrainzReleaseContext } from "../shared/musicbrainz";
import { ReleaseContext } from "../shared/release";
import { ReviewItem, ReviewsContext } from "../shared/reviews";
import { ResetCss, ThemeCss } from "../shared/styles";

const PopoverCss = css`
  .Popover {
    background: rgba(0, 0, 0, 0.03);
    backdrop-filter: blur(8px);
    border: none;
    border-radius: 8px;
    padding: 8px;
  }

  #PurchasePopover {
    position-anchor: --purchase-button;
    top: anchor(--purchase-button bottom);
    left: anchor(--purchase-button left);
  }

  #StreamPopover {
    position-anchor: --stream-button;
    top: anchor(--stream-button bottom);
    left: anchor(--stream-button left);
  }
`;

function* Popovers() {
  yield PopoverCss;
  const release = yield* MusicBrainzReleaseContext;

  const streamingLinks = release.relations.filter(
    (relation) =>
      relation.type === "streaming" || relation.type === "free streaming"
  );

  const purchaseLinks = release.relations.filter(
    (relation) => relation.type === "purchase for download"
  );

  yield* html`<div>
    <div id="PurchasePopover" class="Popover" popover="auto">
      <ul>
        ${purchaseLinks.map(
          (link) =>
            html`<li>
              <a href="${link.url.resource}">${link.url.resource}</a>
            </li>`
        )}
      </ul>
    </div>

    <div id="StreamPopover" class="Popover" popover="auto">
      <ul>
        ${streamingLinks.map(
          (link) =>
            html`<li>
              <a href="${link.url.resource}">${link.url.resource}</a>
            </li>`
        )}
      </ul>
    </div>
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

  .ReleaseHeaderButton {
    background: rgba(0, 0, 0, 0.06);
    border: none;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.5);
  }

  .ReleaseHeaderButtons {
    padding-top: 8px;
    display: flex;
    gap: 4px;
  }

  .ReleaseHeaderButtonStream {
    anchor-name: --stream-button;
  }

  .ReleaseHeaderButtonPurchase {
    anchor-name: --purchase-button;
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

        <div class="ReleaseHeaderButtons">
          <button
            class="ReleaseHeaderButton ReleaseHeaderButtonStream"
            commandfor="StreamPopover"
            command="toggle-popover"
          >
            Stream
          </button>
          <button
            class="ReleaseHeaderButton ReleaseHeaderButtonPurchase"
            commandfor="PurchasePopover"
            command="toggle-popover"
          >
            Buy
          </button>
        </div>
      </div>

      ${
        artworkUrl
          ? html`<img
            class="ReleaseHeaderArtwork"
            src="${artworkUrl}"
            width="100"
            height="100"
          />`
          : ""
      }
    </header>
    <${Reviews} />
    <${Popovers} />
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
