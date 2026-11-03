import type { Font } from './fonts';
import { familyName } from './fonts';

const loaded = new Map<string, FontFace>();

function fontUrl(font: Font): string {
  // Fonts are copied into the build by wxt.config.ts, so they are not in WXT's typed public paths.
  return chrome.runtime.getURL(`/fonts/${font.file}`);
}

/**
 * Load a bundled font into `document.fonts`. Resolves to the FontFace, or null if
 * loading failed (callers then keep the page's original font).
 *
 * The bytes are fetched from the extension and passed to FontFace as a buffer, so
 * a page's font-src CSP cannot block them. If that fails, fall back to a URL source.
 */
export async function loadFont(font: Font): Promise<FontFace | null> {
  const cached = loaded.get(font.id);
  if (cached) return cached;
  const descriptors: FontFaceDescriptors = { weight: '100 900', display: 'swap' };
  const family = familyName(font);
  const url = fontUrl(font);
  const attempts: Array<() => Promise<FontFace>> = [
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new FontFace(family, await res.arrayBuffer(), descriptors).load();
    },
    () => new FontFace(family, `url("${url}") format("woff2")`, descriptors).load(),
  ];
  for (const attempt of attempts) {
    try {
      const face = await attempt();
      document.fonts.add(face);
      loaded.set(font.id, face);
      return face;
    } catch {
      // try the next strategy
    }
  }
  return null;
}

/** Remove a font from `document.fonts` once it is no longer used. */
export function unloadFont(font: Font): void {
  const face = loaded.get(font.id);
  if (!face) return;
  document.fonts.delete(face);
  loaded.delete(font.id);
}
