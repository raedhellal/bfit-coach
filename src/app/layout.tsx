import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { LegalFooter } from "@/components/shell/LegalFooter";
import { CopyProvider } from "@/lib/i18n/client";
import { getCopy, getLocale } from "@/lib/i18n/server";

/**
 * EV-324 — the title and description are in the request's language, so `metadata` is a
 * function of the request rather than a constant (a constant would be evaluated once, at
 * build time, in no language at all).
 */
export function generateMetadata(): Metadata {
  const copy = getCopy();
  return {
    title: copy.brand,
    description: copy.tagline,
    robots: { index: false, follow: false }, // internal tool, and there is no public URL
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // AC1 is demoed at 390 px; the layout must reflow rather than be zoomed out.
  viewportFit: "cover",
};

/**
 * EV-324: `lang` is the language the page is written in (AC3), decided once per request by
 * `getLocale` (the switch's cookie, then `Accept-Language`, then French). Client components
 * get the same decision through `CopyProvider`, as a string, so the server render and the
 * hydration cannot disagree.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const copy = getCopy();
  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <CopyProvider locale={locale}>
          <div id="app-root">{children}</div>
        </CopyProvider>
        <LegalFooter copy={copy} />
      </body>
    </html>
  );
}
