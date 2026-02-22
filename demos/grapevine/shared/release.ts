import { createContext, css, html } from "raval";
import type { Artist, Release } from "./types";

export const ReleaseContext = createContext<Release>();

const ReleaseItemStyles = css`
  .ReleaseItem {
    display: flex;
    justify-content: space-between;
  }

  .ReleaseItemArtwork {
    border-radius: 8px;
  }
`;

export function* ReleaseItem({
  title,
  artists,
  artworkUrl,
}: {
  mbid: string;
  title: string;
  artists: Artist[];
  artworkUrl?: string;
}) {
  yield ReleaseItemStyles;

  yield* html`<div class="ReleaseItem">
    <div>
      <h4>${title}</h4>
      <p>
        ${artists.map((artist) => artist.name).join(", ")}
      </p>
    </div>
    ${
      artworkUrl
        ? html`<img
          class="ReleaseItemArtwork"
          src="/image-proxy?originalUrl=${artworkUrl}"
          loading="lazy"
          alt="${title}"
          width="50"
          height="50"
        />`
        : ""
    }
  </div>`;
}
