import { css, html } from "raval";
import { PopularReleasesContext } from "../shared/popular";
import { ReleaseItem } from "../shared/release";
import { Header } from "./header";
import { Root } from "./root";
import { routes } from "./routes";

const PopularCss = css`
  .PopularContainer {
    width: 100%;
    margin: 0;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
  }

  .PopularListItem {
    padding: 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .PopularListItem a {
    color: inherit;
    text-decoration: none;
  }
`;

export function* Popular() {
  yield PopularCss;

  const { releases } = yield* PopularReleasesContext;

  yield* html`
    <main class="PopularContainer">
      <${Header} />
      <ol class="PopularList">
        ${releases.map(
          (release) => html`
            <li class="PopularListItem"><a href="${routes.release.href({ mbid: release.mbid })}"><${ReleaseItem} ...${release} /></a></li>
          `
        )}
      </ol>
    </main>
  `;
}

export function* PopularReleases() {
  yield* html`<${Root} title="Popular releases (7-days)"><${Popular} /><//>`;
}
