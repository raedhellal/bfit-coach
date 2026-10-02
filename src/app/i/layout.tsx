import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCopy } from "@/lib/i18n/server";

/**
 * The `/i` segment's head (EV-337k, staff on 1f16b4c — R1 / A1 / edge case 4).
 *
 * The `/i` 404s (`/i`, `/i/<token>/<anything>`, `src/app/i/not-found.tsx`) were served the
 * ROOT head from the first byte: `<title>Evoli Pro</title>`, the root `/icon.svg` and
 * `/apple-icon.png` — the Pro mark. The segment's own icon FILES (`icon.svg`,
 * `apple-icon.png` beside this file) reached the 404's head only after hydration, and the
 * title never did. Stated here explicitly, they are in the 404's first HTML too.
 *
 * The invitation page (`[token]/page.tsx`) still sets its own title (« … vous invite sur
 * Evoli Fit ») over this one. The title is the trainee brand, never « Evoli Pro ».
 * `qa/pro-auth-screens.spec.ts` (edge case 4) reads the first HTML's `<title>` and icon
 * links, and `document.title` after load, on all three kinds of /i URL.
 */
export function generateMetadata(): Metadata {
  const copy = getCopy();
  return {
    title: copy.invitePage.brand,
    icons: {
      icon: [{ url: "/i/icon.svg", type: "image/svg+xml" }],
      apple: "/i/apple-icon.png",
    },
  };
}

export default function InviteLayout({ children }: { children: ReactNode }) {
  return children;
}
