import { defineConfig } from 'wxt';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FONTS_DIR = resolve(__dirname, 'src/fonts');

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // Fonts live in src/fonts (not src/public), so copy the .woff2 files into
    // the build output at fonts/*.woff2 where web_accessible_resources points.
    'build:publicAssets': (_wxt, files) => {
      for (const name of readdirSync(FONTS_DIR)) {
        if (name.endsWith('.woff2')) {
          files.push({
            relativeDest: `fonts/${name}`,
            absoluteSrc: resolve(FONTS_DIR, name),
          });
        }
      }
    },
  },
  manifest: {
    name: 'Cursed Fonts',
    description: 'A different font on every website, every day. Local only, no tracking.',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      'random-font': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Pick a random font for the current tab',
      },
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Toggle Cursed Fonts on the current site',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'cursed-fonts@example.invalid',
        strict_min_version: '115.0',
        // Not in the WXT manifest types yet; Firefox requires this declaration.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
