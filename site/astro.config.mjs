// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://coral-cohen-sleep.pages.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'auto' },
  compressHTML: true,
});
