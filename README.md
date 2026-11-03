# Cursed Fonts

Every website you visit gets a different font, every day. The font is chosen from the date, so it stays the same all day and changes at midnight. Hit **🎲 Random** to reroll instantly, or play the daily "guess today's font" quiz to train your design sense.

Everything runs locally. No backend, no network calls, no analytics.

<!-- TODO: replace with a GIF: the same page on 3 different days, then the Random spin. -->

![Cursed Fonts demo (GIF placeholder)](docs/demo.gif)

## Features

- **Daily font:** deterministic from the local date (seeded mulberry32). It never repeats yesterday's font.
- **Random:** a spinning picker. Scope it to this tab, this site, or everywhere until midnight.
- **Live swap:** fonts change with no reload and no flicker.
- **Quiz:** guess the daily font from 4 options of the same category. Streak and accuracy are tracked. Random never affects the quiz.
- **Cursed level:** 1 tasteful, 2 quirky, 3 unhinged. A level includes every font at that level or below.
- **Dyslexia-safe mode:** limits both the daily pick and Random to dyslexia-friendly fonts.
- **Safe by default:** skips icon fonts, `<code>`/`<pre>` (unless the font is monospace), and inputs/editable areas.
- **Shortcuts:** `Alt+Shift+R` random font for this tab, `Alt+Shift+F` toggle the extension on this site. Change them at `chrome://extensions/shortcuts`.

## Install from source

Requires Node 20 or newer.

```bash
npm install
npm run build            # Chrome / Edge / Brave -> .output/chrome-mv3
npm run build:firefox    # Firefox (MV3)         -> .output/firefox-mv3
```

**Chrome:** open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose `.output/chrome-mv3`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and choose `.output/firefox-mv3/manifest.json`.

For development with hot reload, run `npm run dev` (Chrome) or `npm run dev:firefox`.

## Permissions

| Permission                | Why                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `storage`                 | Saves settings (sync), plus overrides, streak and quiz stats (local).                       |
| `activeTab`               | Lets the popup and keyboard shortcuts read the current tab's URL to know its hostname.      |
| `scripting`               | Reserved for programmatic injection into the active tab.                                    |
| `alarms`                  | Fires at local midnight to expire Random overrides and refresh the daily font.              |
| Content script on http(s) | Injects the font stylesheet. It only reads settings from storage and never reads page data. |

There are no host permissions beyond the content script's `http://*/*` and `https://*/*` match patterns. The extension makes no network requests. Fonts are bundled files, never loaded from Google Fonts.

## How it works

- `src/lib/pick.ts` holds `pickFont` (deterministic daily pick) and `pickRandom`.
- `src/lib/state.ts` resolves which font applies: **tab override > site override > global override > daily pick**. Site and global overrides expire at local midnight.
- `src/entrypoints/background.ts` keeps tab overrides (mirrored to `storage.session` so they survive the service worker sleeping), runs the midnight alarm and handles the shortcuts.
- `src/entrypoints/content.ts` loads the font with the FontFace API, then swaps a constructable stylesheet. A `<style>` element is the fallback.

Clearing with **↩ Back to today's font** removes the tab override, this site's override, and the global override.

## Add a font

1. Check the font's license. Only fonts under the SIL Open Font License (OFL) or similarly permissive licenses are accepted.
2. Drop a Latin-subset `.woff2` into `src/fonts/` (for example from the matching [Fontsource](https://fontsource.org) package). Name it `<id>.woff2`.
3. Add an entry to `src/fonts/fonts.json`:

   ```json
   {
     "id": "my-font",
     "name": "My Font",
     "category": "display",
     "cursedLevel": 2,
     "dyslexiaSafe": false,
     "designer": "Jane Doe",
     "year": 2020,
     "fact": "One interesting sentence for the quiz reveal.",
     "license": "OFL-1.1",
     "file": "my-font.woff2"
   }
   ```

   `category` is one of `serif`, `sans`, `mono`, `display`, `handwriting`, `blackletter`. `cursedLevel` is 1 (tasteful), 2 (quirky) or 3 (unhinged). Keep at least 4 fonts per category so the quiz can pick 3 look-alikes.

4. Run `npm test` (it validates `fonts.json`), then open a PR.

Adding or removing fonts changes the daily sequence for everyone, so batch additions into one PR.

### Licenses

All bundled fonts are OFL-1.1 except Permanent Marker, which Google Fonts distributes under Apache-2.0. Fonts are Latin subsets from Fontsource.

## Development

```bash
npm run dev           # watch build + launch Chrome
npm test              # unit tests (Vitest)
npm run lint          # ESLint
npm run format        # Prettier
npm run compile       # type check
```

## License

MIT, see [LICENSE](LICENSE). Bundled fonts keep their own licenses.
