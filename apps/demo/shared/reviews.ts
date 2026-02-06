import { css, createContext, html } from "streamweaver";
import type { ComponentProps } from "streamweaver";
import { routes } from "../app/routes";
import type { Review } from "./types";
import { formatRelativeTime } from "./date";

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

export function* ReviewItem({
  publication,
  snippet,
  release,
  publishedAt,
  children,
}: ComponentProps<Review>) {
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
      ${children}
    </div>
  </li>`;
}
