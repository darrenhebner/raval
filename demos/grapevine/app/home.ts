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

  yield* html`<main class="FeedContainer">`;
  yield* Header();
  yield* html`<ol class="Feed">`;

  for (const review of reviews) {
    yield* ReviewItem(review, function* () {
      yield* html`<a href="${routes.release.href({ mbid: review.release.mbid })}" class="ReleaseLink">`;
      yield* ReleaseItem(review.release);
      yield* html`</a>`;
    });
  }

  yield* html`</ol>
  </main>`;
}

export function* Home() {
  yield* Root("Grapevine", function* () {
    yield* Feed();
  });
}
