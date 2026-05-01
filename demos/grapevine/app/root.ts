import { html } from "raval";
import { ResetCss, ThemeCss } from "../shared/styles";

function* Styles() {
  yield ResetCss;
  yield ThemeCss;
}

export function* Root<ChildYields>(
  title: string,
  children: () => Generator<ChildYields, void, unknown>
) {
  yield* html`<html lang="en-US">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
      <title>${title}</title>`;
  yield* Styles();
  yield* html`</head>
    <body>`;
  yield* children();
  yield* html`</body>
  </html>`;
}
