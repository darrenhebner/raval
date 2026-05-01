import { describe, expect, it } from "vitest";
import { Css, html } from "./index.js";

function collect(gen: Generator<string | Css>): Array<string | Css> {
  return [...gen];
}

function collectStrings(gen: Generator<string | Css>): string {
  return collect(gen)
    .map((v) => (v instanceof Css ? `<style>${v.content}</style>` : v))
    .join("");
}

describe("html generator", () => {
  it("yields raw template string segments as-is", () => {
    const gen = html`<div>hello</div>`;
    expect(collectStrings(gen)).toBe("<div>hello</div>");
  });

  it("escapes & in interpolated strings", () => {
    const gen = html`<p>${"a & b"}</p>`;
    expect(collectStrings(gen)).toBe("<p>a &amp; b</p>");
  });

  it("escapes < in interpolated strings", () => {
    const gen = html`<p>${"<script>"}</p>`;
    expect(collectStrings(gen)).toBe("<p>&lt;script&gt;</p>");
  });

  it("escapes > in interpolated strings", () => {
    const gen = html`<p>${"a > b"}</p>`;
    expect(collectStrings(gen)).toBe("<p>a &gt; b</p>");
  });

  it('escapes " in interpolated strings', () => {
    const gen = html`<p>${'say "hi"'}</p>`;
    expect(collectStrings(gen)).toBe("<p>say &quot;hi&quot;</p>");
  });

  it("escapes ' in interpolated strings", () => {
    const gen = html`<p>${"it's"}</p>`;
    expect(collectStrings(gen)).toBe("<p>it&#39;s</p>");
  });

  it("stringifies and escapes interpolated numbers", () => {
    const gen = html`<span>${42}</span>`;
    expect(collectStrings(gen)).toBe("<span>42</span>");
  });

  it("yields Css instances directly without modification", () => {
    const style = new Css(".red { color: red; }");
    const gen = html`${style}<div></div>`;
    const chunks = collect(gen);
    expect(chunks[0]).toBe(style);
    expect(chunks[1]).toBe("<div></div>");
  });

  it("flattens flat arrays of strings and numbers", () => {
    const items = ["a", "b", "c"];
    const gen = html`<ul>${items}</ul>`;
    expect(collectStrings(gen)).toBe("<ul>abc</ul>");
  });

  it("flattens flat arrays that contain numbers", () => {
    const gen = html`<p>${[1, 2, 3]}</p>`;
    expect(collectStrings(gen)).toBe("<p>123</p>");
  });

  it("flattens nested arrays recursively", () => {
    const gen = html`<ul>${[["a", ["b"]], "c"]}</ul>`;
    expect(collectStrings(gen)).toBe("<ul>abc</ul>");
  });

  it("escapes strings inside arrays", () => {
    const gen = html`<p>${["<b>", "ok"]}</p>`;
    expect(collectStrings(gen)).toBe("<p>&lt;b&gt;ok</p>");
  });

  it("yields Css inside arrays directly", () => {
    const style = new Css("body {}");
    const gen = html`<p>${[style, "text"]}</p>`;
    const chunks = collect(gen);
    expect(chunks).toContain(style);
    const str = chunks
      .map((v) => (v instanceof Css ? `<style>${v.content}</style>` : v))
      .join("");
    expect(str).toBe("<p><style>body {}</style>text</p>");
  });

  it("returns a Generator<string | Css>", () => {
    const gen = html`<div></div>`;
    expect(typeof gen.next).toBe("function");
    expect(typeof gen[Symbol.iterator]).toBe("function");
  });
});
