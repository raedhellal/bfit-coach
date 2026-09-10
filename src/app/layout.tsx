import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: copy.brand,
  description: copy.tagline,
  robots: { index: false, follow: false }, // internal tool, and there is no public URL
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // AC1 is demoed at 390 px; the layout must reflow rather than be zoomed out.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <div id="app-root">{children}</div>
      </body>
    </html>
  );
}
