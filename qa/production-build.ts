import type { Page } from "@playwright/test";

/**
 * Is the page served by a production build (`next start`) rather than `next dev`?
 *
 * `router.prefetch` and `<Link>` prefetches are no-ops under `next dev`
 * (`next/dist/client/components/app-router.js`), so every test of a prefetch must know
 * which server it is talking to. The witness is the webpack runtime the document loads:
 * a production build names it with a content hash (`/_next/static/chunks/webpack-<hex>.js`),
 * `next dev` serves `/_next/static/chunks/webpack.js?v=…`. Read from a loaded page.
 */
export async function isProductionBuild(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).some((s) =>
      /\/_next\/static\/chunks\/webpack-[0-9a-f]+\.js$/.test(new URL(s.src).pathname)
    )
  );
}
