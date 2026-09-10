import { copy } from "./copy";

/**
 * Date formatting for the coach's screens.
 *
 * Everything is formatted in **UTC**, on purpose and with a known limitation:
 * ADR-0012 Consequences (c) records that this surface sends no `X-Timezone` and the
 * api stores no trainee zone, so "last workout" and "coached since" are the api's UTC
 * days. Formatting them in the coach's browser zone would shift a plain calendar date
 * by a day for anyone west of UTC and make the coach's screen disagree with the
 * trainee's phone. Rendering the api's day as the api's day at least makes the two
 * agree with each other; ADR-0011's `X-Timezone` is the real fix and its api half is
 * not deployed. QA records what this build does rather than assuming.
 */
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `YYYY-MM-DD` (a plain calendar date) → "8 Sep 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return copy.common.dash;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return copy.common.dash;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return DATE.format(d);
}

/** An ISO instant → "8 Sep 2026", in UTC (see the note above). */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return copy.common.dash;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return copy.common.dash;
  return DATE.format(d);
}

/** "23 Aug" — the compact form the weight chart's axis uses. */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** 70.4 → "70.4 kg". One decimal, which is what a body scale reports. */
export function formatKg(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

/** −0.8 → "−0.8 kg" with a real minus sign; +0.4 → "+0.4 kg". */
export function formatKgDelta(delta: number): string {
  const rounded = Number(delta.toFixed(1));
  if (rounded === 0) return "0.0 kg";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} kg`;
}
