import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { fontVariables } from "./fonts";
import { LegalFooter } from "@/components/shell/LegalFooter";
import { BootMark } from "@/components/shell/BootMark";
import { NavigationProgress } from "@/components/shell/NavigationProgress";
import { SessionEpochGuard } from "@/components/shell/SessionEpochGuard";
import { UrlChangeCounter } from "@/components/shell/UrlChangeCounter";
import { CopyProvider } from "@/lib/i18n/client";
import { getCopy, getLocale } from "@/lib/i18n/server";
import { preloadCopyChunk } from "@/lib/i18n/chunk";
import { COACH_API_MODE } from "@/lib/env";
import { SESSION_EPOCH_COOKIE } from "@/lib/sessionEpoch";

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
  // EV-350: on a document load, this page language's dictionary chunk leaves with the
  // first-wave scripts, not after them (CopyProvider's import() then reuses it).
  preloadCopyChunk(locale);
  const jar = cookies();
  /**
   * BUG-745 (ADR-0033 D33.14, staff r2 N5) — the session epoch this document is rendered under,
   * echoed for `SessionEpochGuard`, which compares it with the cookie at every navigation. An
   * ECHO, never an input: nothing here decides anything from it. `""` = no epoch yet.
   */
  const epoch = jar.get(SESSION_EPOCH_COOKIE)?.value ?? "";
  // Fixture mode only: the witnesses of the guard's layers (a)–(c) run with layer (d) removed.
  const wakeOff = COACH_API_MODE === "fixture" && jar.get("evoli_fixture_session_wake")?.value === "off";
  return (
    <html
      lang={locale}
      className={fontVariables}
      data-session-epoch={epoch}
      data-session-wake={wakeOff ? "off" : undefined}
    >
      <body>
        <CopyProvider locale={locale}>
          {/* EV-356d D.6: marks the document's first commit for error.tsx. Outside the Suspense
              below, which hydrates in a later commit. */}
          <BootMark />
          {/* A slow page change's only feedback once a route has no loading.tsx.
              Suspense: it reads useSearchParams. */}
          <Suspense fallback={null}>
            <NavigationProgress />
            {/* BUG-691: « Retour aux clients » needs to know whether the roster is one entry back. */}
            <UrlChangeCounter />
          </Suspense>
          {/*
            BUG-745 (ADR-0033 D33.14): a session change in another tab hides #app-root before
            the next frame and reloads. A SIBLING of #app-root and outside the Suspense above,
            with none of its own: it wraps nothing (a Suspense around {children} would move the
            flush above every page, and /clients/[id]'s redirect would become a 200). Its
            session-ended banner therefore lives outside #app-root and outside every editor.
          */}
          <SessionEpochGuard />
          <div id="app-root">{children}</div>
        </CopyProvider>
        <LegalFooter copy={copy} />
      </body>
    </html>
  );
}
