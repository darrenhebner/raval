import { css, html } from "raval";
import { routes } from "./routes";

const HeaderCss = css`
  .Header {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .HeaderLink {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    text-decoration: none;
    color: inherit;
    font-weight: bold;
    font-size: 12px;
  }

  .HeaderLink:hover {
    background: rgba(0, 0, 0, 0.06);
  }
`;

export function* Header() {
  yield HeaderCss;

  yield* html`
    <header class="Header">
      <a class="HeaderLink" href="${routes.home.href()}">Latest reviews</a>
      <a class="HeaderLink" href="${routes.popular.href()}">Popular releases</a>
    </header>
  `;
}
