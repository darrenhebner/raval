import { css, html } from "raval";
import { FeedContext } from "../shared/feed";
import { ReleaseItem } from "../shared/release";
import { ReviewItem } from "../shared/reviews";
import { Header } from "./header";
import { Root } from "./root";
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

  .ReleaseLink {
    display: block;
    margin-top: 12px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
  }
`;

export function* Feed() {
  yield FeedCss;

  const { reviews } = yield* FeedContext;

  yield* html`<main class="FeedContainer">
    <${Header} />
    <ol class="Feed">
      ${reviews.map(
        (review) =>
          html`<${ReviewItem} ...${review}><a href="${routes.release.href({ mbid: review.release.mbid })}" class="ReleaseLink"><${ReleaseItem} ...${review.release} /></a><//>`
      )}
    </ol>
  </main>`;
}

export function* Home() {
  yield* html`<${Root} title="Grapevine"><${Feed} /><//>`;
}
