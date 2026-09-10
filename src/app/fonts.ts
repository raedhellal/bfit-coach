import { Inter, Space_Grotesk } from "next/font/google";

/**
 * Self-hosted webfonts. `next/font/google` fetches these faces at BUILD time and
 * emits them from our own origin under `/_next/static/media` — nothing is requested
 * from fonts.googleapis.com or fonts.gstatic.com at runtime, so no visitor IP reaches
 * Google. Do not reintroduce a <link> to Google Fonts.
 *
 * Two families, not the admin's three: Space Mono is unused here (there is no code
 * span on any coach screen) and a preloaded font nobody paints is LCP-path bytes
 * spent on nothing.
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/** Applied to <html> so the CSS variables resolve everywhere. */
export const fontVariables = `${spaceGrotesk.variable} ${inter.variable}`;
