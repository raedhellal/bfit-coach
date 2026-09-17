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

/**
 * The api's `capacity_tier` enum ("STARTER") as a word a coach reads ("Starter").
 * Shared by the capacity meter and the at-capacity sentence so the two cannot drift.
 */
export function tierLabel(tier: string): string {
  if (!tier) return tier;
  return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
}

/**
 * The length past which a name is truncated in the editor, the publish modal and
 * every attribution line (EV-184 edge case 6, EV-185 edge case 7).
 *
 * 40 is the story's own number ("long exercise and coach names (40+ chars)"), so the
 * case QA drives is the case this constant describes.
 */
export const NAME_TRUNCATE_AT = 40;

/**
 * Truncate for display, with a real ellipsis. CSS `text-overflow` was the alternative
 * and is worse here for two reasons: the publish modal composes its line as a single
 * string (so there is no element to clip), and a clipped element still puts the whole
 * name in the accessibility tree and in `textContent`, which makes "it truncates"
 * unassertable. Call sites pass the full string as `title` so nothing is lost.
 */
export function truncateName(value: string, max: number = NAME_TRUNCATE_AT): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** `YYYY-MM-DD` → "Monday". UTC, for the same reason everything else here is. */
export function formatWeekday(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);
}

/** ISO day-of-week 1–7 (`TrainingDay.dayOfWeek`) → "Monday". */
const ISO_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function isoWeekdayLabel(dayOfWeek: number): string {
  return ISO_WEEKDAYS[dayOfWeek - 1] ?? "";
}
