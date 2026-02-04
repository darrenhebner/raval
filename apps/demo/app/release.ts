import { html } from "streamweaver";
import { ReleaseContext } from "../shared/release";
import { MusicBrainzReleaseContext } from "../shared/musicbrainz";

function* Details() {
  const release = yield* MusicBrainzReleaseContext;

  yield* html`<div class="mb-details">
    <h3>Details from MusicBrainz</h3>
    <dl>
      <dt>Released</dt>
      <dd>${release.date} (${release.country})</dd>
    </dl>
  </div>`;
}

export function* Release() {
  const { title } = yield* ReleaseContext;

  yield* html`<main>
    <h1>${title}</h1>
    <${Details} />
  </main>`;
}
