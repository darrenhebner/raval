import { createContext, css, html } from "raval";
import { formatRelativeTime } from "./date";
import type { Review } from "./types";

export interface Reviews {
  reviews: Review[];
}

export const ReviewsContext = createContext<Reviews>();

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

  .ReviewItemSnippet {
    max-width: 50ch;
    margin: 0 0 12px 0;
  }

  .ReviewItem:not(last-child) {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
`;

export function* ReviewItem<ChildYields = never>(
  {
    publication,
    snippet,
    publishedAt,
  }: Pick<Review, "publication" | "snippet" | "publishedAt">,
  children?: () => Generator<ChildYields, void, unknown>
) {
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
      </div>`;

  if (snippet) {
    yield* html`<blockquote class="ReviewItemSnippet">${snippet}</blockquote>`;
  }

  if (children) {
    yield* children();
  }

  yield* html`</div>
  </li>`;
}
