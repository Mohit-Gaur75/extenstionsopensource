# Contributing to Cursed Fonts

Thanks for helping. The project is small on purpose: TypeScript, WXT, a tiny React popup, no backend, no network calls, no analytics. PRs that add any of those will not be accepted.

## Setup

```bash
npm install
npm run dev
```

Before opening a PR, make sure these pass:

```bash
npm run lint && npm run format:check && npm run compile && npm test && npm run build && npm run build:firefox
```

## Guidelines

- Keep logic in small pure functions under `src/lib/` so they are easy to test.
- No `any`. Prefer narrow types and runtime validation at trust boundaries (storage, imported JSON).
- Add or update Vitest tests for changes to `pick`, `state` or `quiz`.
- Do not add permissions without explaining why in the PR and in the README.
- Fonts must be OFL or similarly permissive, bundled as `.woff2`, and never loaded from a CDN.

## Good first issues

1. **New fonts.** Add OFL fonts, especially more `blackletter` and `mono` options. See "Add a font" in the README.
2. **New quiz facts.** Many `fact` lines in `src/fonts/fonts.json` can be sharper or more surprising. Verify designer and year against the foundry or specimen page, and cite it in the PR.
3. **Safari support.** Add a Safari build via `xcrun safari-web-extension-converter` and document the steps. Check the FontFace and `adoptedStyleSheets` code paths.
4. **Per-site pinned fonts.** Let a user pin a font to a hostname so it never changes. It should sit above the daily pick in the resolution order in `src/lib/state.ts`, and not expire at midnight.
5. **Share-your-day card.** Render today's font, name, streak and a sample line to a canvas and let users download or copy it as a PNG. It must work offline.

## Reporting bugs

Include your browser and version, the site where the page looked wrong, and (if it is a missing glyph or broken icon) the element's computed `font-family`.
