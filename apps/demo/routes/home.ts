import { html } from "streamweaver";
import { FeedContext } from "../shared/feed";

export function* Home() {
  const { releases } = yield* FeedContext;

  yield* html`<ul>
    ${releases.map((release) => html`<li>${release.title}</li>`)}
  </ul>`;
}
