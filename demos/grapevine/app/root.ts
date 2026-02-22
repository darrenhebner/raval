import { type ComponentProps, html } from "raval";
import { ResetCss, ThemeCss } from "../shared/styles";

function* Styles() {
  yield ResetCss;
  yield ThemeCss;
}

export function* Root({ title, children }: ComponentProps<{ title: string }>) {
  yield* html`<html lang="en-US">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
      <title>${title}</title>
      <${Styles} />
    </head>
    <body>${children}</body>
  </html>`;
}
