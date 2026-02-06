import { css, html } from "streamweaver";
import { FeedContext } from "../shared/feed";
import { ReviewItem } from "../shared/reviews";
import { ResetCss, ThemeCss } from "../shared/styles";

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
