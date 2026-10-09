import { intlLocale, type Locale } from "./i18n/locale";

/**
 * EV-324 AC3 — every function below that prints a date, a weekday or a number takes the
 * page's `Locale` as a REQUIRED argument (`copy.locale`). Required, not defaulted: a
 * forgotten argument is a compile error rather than an English date on a French page.
 *
 * English is unchanged (AC2): en-GB, exactly as before this row. French is fr-FR, so a
 * date reads "3 oct. 2026" and 7412 reads "7 412" (U+202F, the narrow no-break space ICU
 * groups French digits with). A decimal takes a comma in French ("70,4 kg").
 */
const DASH = "—";

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
const DATE: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(intlLocale("en"), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }),
  fr: new Intl.DateTimeFormat(intlLocale("fr"), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }),
};

/**
 * The two places a printed date departs from what ICU writes, both in ONE part of it:
 *
 *   · BUG-210 — English: ICU 72+ abbreviates September "Sept" in en-GB, and no other month
 *     to four letters, so a column of dates changed width in September and every story's
 *     verbatim "15 Sep 2026" was false. Pinned to "Sep" here rather than left to whichever
 *     ICU builds the page (an older one already printed "Sep", which is how it shipped).
 *   · BUG-491 — French: the first of the month is "1er" (premier), the ordinal French
 *     writes in a date: "1er oct. 2026", "jeu. 1er oct.". Every other day is a cardinal.
 *     `Intl.DateTimeFormat` has no ordinal, so the day part is rewritten.
 *
 * `formatToParts`, not a string replace: "Sept" and "1" are matched as the MONTH and the
 * DAY part, never as text that happens to look like them. French "sept." is the correct
 * French abbreviation and is left alone.
 */
function datePrinted(format: Intl.DateTimeFormat, d: Date, locale: Locale): string {
  return format
    .formatToParts(d)
    .map((part) => {
      if (locale === "fr" && part.type === "day" && part.value === "1") return "1er";
      if (locale === "en" && part.type === "month" && part.value === "Sept") return "Sep";
      return part.value;
    })
    .join("");
}

/** A French decimal takes a comma: "70.4" → "70,4". English is untouched. */
function decimal(text: string, locale: Locale): string {
  return locale === "fr" ? text.replace(".", ",") : text;
}

/**
 * The space between a number and its unit: U+00A0, NO-BREAK, in both languages.
 *
 * BUG-270: English used an ordinary space, so at 320 px the Weight row ended one line
 * with "−6.0" and started the next with "kg" — the failure `formatPct` already names.
 * The glyph is the same width; only the line-break opportunity is gone. `locale` stays a
 * parameter so a language that ever wants another separator has one place to say so.
 */
function unitSpace(_locale: Locale): string {
  return "\u00a0";
}

/** `YYYY-MM-DD` (a plain calendar date) → "8 Sep 2026" / "8 sept. 2026" / "1er oct. 2026". */
export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return DASH;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return datePrinted(DATE[locale], d, locale);
}

/** An ISO instant → "8 Sep 2026" / "8 sept. 2026", in UTC (see the note above). */
export function formatInstant(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return datePrinted(DATE[locale], d, locale);
}

/** "23 Aug" / "23 août" — the compact form the weight chart's axis uses. */
export function formatShortDate(iso: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return datePrinted(
    new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }),
    d,
    locale
  );
}

/** 70.4 → "70.4 kg" / "70,4 kg". One decimal, which is what a body scale reports. */
export function formatKg(kg: number, locale: Locale): string {
  return `${decimal(kg.toFixed(1), locale)}${unitSpace(locale)}kg`;
}

/** −0.8 → "−0.8 kg" with a real minus sign; +0.4 → "+0.4 kg". French: "−0,8 kg". */
export function formatKgDelta(delta: number, locale: Locale): string {
  const rounded = Number(delta.toFixed(1));
  if (rounded === 0) return `${decimal("0.0", locale)}${unitSpace(locale)}kg`;
  return `${rounded > 0 ? "+" : "−"}${decimal(Math.abs(rounded).toFixed(1), locale)}${unitSpace(locale)}kg`;
}

/**
 * A stored number written back INTO a field the coach edits — BUG-464 (the weight
 * milestone), BUG-465 / BUG-571 (a recipe quantity). The row above the field already
 * printed "70,4 kg"; the field itself said "70.4".
 *
 * English is `String(value)`, exactly as before. French takes a decimal comma and, when
 * `grouped`, groups thousands with U+202F the way `formatKcal` prints them: 1000.5 →
 * "1 000,5", 12.5 → "12,5", 0.25 → "0,25".
 *
 * 🔴 It must ROUND-TRIP through the field's reader, unchanged: a pre-filled value saved
 * untouched sends the stored number. `readNumber` (`numberInput.ts`) reads a comma
 * fraction and U+202F thousands; the milestone's own parser (`buildProgressGoalRequest`)
 * reads a comma but NOT a grouping space, which is why it calls this ungrouped (25..300 kg
 * never reaches a thousand anyway). `qa/french-polish-2.spec.ts` pins both round trips.
 *
 * `String()`, not `Intl`: it is the shortest text that reads back as the same double, so
 * no digit is rounded away or invented — a stored third decimal stays visible and is
 * refused as before, rather than silently rounded to two. Anything `String()` writes in
 * another shape (exponent notation) is returned as it was.
 */
const NNBSP = String.fromCharCode(0x202f);
export function formatNumberInput(value: number, locale: Locale, grouped: boolean): string {
  const text = String(value);
  if (locale === "en") return text;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return text;
  const integer = grouped ? m[2].replace(/\B(?=(\d{3})+$)/g, NNBSP) : m[2];
  return `${m[1]}${integer}${m[3] === undefined ? "" : `,${m[3]}`}`;
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

/**
 * `YYYY-MM-DD` → "Monday" / "Lundi". UTC, for the same reason everything else here is.
 *
 * French weekdays are lower-case in running text; this returns the CAPITALISED label
 * (a day heading, a select option). A French sentence that embeds one lower-cases it
 * itself — see `placement.confirm` in `copy.fr.ts`.
 */
export function formatWeekday(iso: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return capitalise(new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" }).format(d));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** ISO day-of-week 1–7 (`TrainingDay.dayOfWeek`) → "Monday" / "Lundi". */
const ISO_WEEKDAYS: Record<Locale, readonly string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  fr: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
};
export function isoWeekdayLabel(dayOfWeek: number, locale: Locale): string {
  return ISO_WEEKDAYS[locale][dayOfWeek - 1] ?? "";
}

/** The seven ISO weekdays, in order, for a control that offers all of them. */
export const ISO_WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * 2560 → "2,560" / "2 560" (U+202F). Grouped, because the macro reconciliation line
 * (EV-190 AC3) puts a four-figure kcal total in the middle of a sentence and "2560 kcal"
 * reads as a code.
 */
const KCAL: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(intlLocale("en"), { maximumFractionDigits: 0 }),
  fr: new Intl.NumberFormat(intlLocale("fr"), { maximumFractionDigits: 0 }),
};
export function formatKcal(value: number, locale: Locale): string {
  return KCAL[locale].format(Math.round(value));
}

/* ── EV-202b: body composition ─────────────────────────────────────────────── */

/**
 * 24.0 → "24.0 %". One decimal, the same precision a caliper or an InBody reports.
 *
 * The space is U+00A0, NO-BREAK: the Body fat row wraps at 320 px (EV-274b AC5), and an
 * ordinary space let "20.0" end one line with "%" starting the next.
 */
export function formatPct(value: number, locale: Locale): string {
  return `${decimal(value.toFixed(1), locale)}\u00a0%`;
}

/**
 * −4 → "−4.0 pts" with a real minus sign; +1.5 → "+1.5 pts"; 0 → "0.0 pts".
 *
 * **Percentage POINTS, not per cent** (EV-202a's own field name, `bodyFatDeltaPts`).
 * A drop from 28 % to 24 % is four points and a fourteen per cent relative change, and
 * a coach reading "−4.0 %" cannot tell which was meant. `0.0 pts` is a real delta of
 * zero and is a different fact from an ABSENT delta, which renders no cell at all.
 */
export function formatPtsDelta(delta: number, locale: Locale): string {
  const rounded = Number(delta.toFixed(1));
  // U+00A0, as in `formatPct`: the number and its unit never wrap apart.
  if (rounded === 0) return `${decimal("0.0", locale)}\u00a0pts`;
  return `${rounded > 0 ? "+" : "−"}${decimal(Math.abs(rounded).toFixed(1), locale)}\u00a0pts`;
}

/**
 * "Lina M." → "Lina".
 *
 * EV-202 AC5 and AC6 address the trainee by first name ("{FirstName} hasn't recorded a
 * weight yet."), and `traineeDisplayName` is the only name this surface is ever given
 * — ADR-0012 D4 keeps user ids and full records off the portal's wire. A display name
 * with no space is returned whole rather than cut, and an empty one falls back to the
 * generic word so a sentence never begins with a space.
 */
export function firstName(displayName: string | null | undefined, locale: Locale): string {
  const trimmed = (displayName ?? "").trim();
  if (trimmed === "") return locale === "fr" ? "Ce client" : "This trainee";
  return trimmed.split(/\s+/)[0];
}

/* ── EV-284b: the food log ──────────────────────────────────────────────────── */

/**
 * 17.3 → "17.3", 0 → "0", 24 → "24". At most one decimal, the precision the food
 * database stores; a real 0 prints as 0 (EV-284 AC5: only a QUICK entry gets dashes).
 */
const GRAMS: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(intlLocale("en"), { maximumFractionDigits: 1 }),
  fr: new Intl.NumberFormat(intlLocale("fr"), { maximumFractionDigits: 1 }),
};
export function formatGrams(value: number, locale: Locale): string {
  return GRAMS[locale].format(value);
}

/** An ISO instant → "07:45", in UTC like every other time on this portal. */
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
export function formatUtcTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return TIME.format(d);
}

/**
 * EV-204b — an account's deletion instant as the invitation email states it: the UTC date
 * and time ("2 Nov 2026, 09:30 UTC" / "2 nov. 2026, 09:30 UTC"). The api's email prints
 * `d MMMM yyyy, HH:mm 'UTC'` (`InvitationMail`), and the activation screen already reads
 * this way, so the coach, the email and the trainee name one instant, not three days.
 */
export function formatExpiryUtc(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return DASH;
  const date = formatInstant(iso, locale);
  return date === DASH ? DASH : `${date}, ${formatUtcTime(iso)} UTC`;
}

/**
 * An ISO instant → "14:42" in the RUNTIME's time zone — for a client component, where
 * that zone is the coach's browser. On the server it would be the host's zone (UTC on
 * Vercel), which is exactly why the challenge page does not call it there. 24-hour in
 * both locales, like `formatUtcTime`.
 */
export function formatLocalTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/* ── EV-321b: step challenges ──────────────────────────────────────────────── */

/**
 * 10000 → "10,000" / "10 000" (U+202F, the narrow no-break space ICU groups French
 * digits with — four digits too: 1000 → "1 000", in Node 22's ICU 78 and Chrome 153 alike,
 * read from the DOM's code points. The U+202F is nearly invisible in the portal's font, so a
 * screenshot looks like "1000"; do not "fix" it from a picture). Rounded only defensively.
 *
 * Never called with a null: a day with no data is "—" (`copy.common.dash`), and the
 * caller that has a null must say so rather than format a 0.
 */
const STEPS: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(intlLocale("en"), { maximumFractionDigits: 0 }),
  fr: new Intl.NumberFormat(intlLocale("fr"), { maximumFractionDigits: 0 }),
};
export function formatSteps(value: number, locale: Locale): string {
  return STEPS[locale].format(Math.round(value));
}

/**
 * `YYYY-MM-DD` → "Tue 29 Sep" / "mar. 29 sept." / "jeu. 1er oct." — the day strip's label.
 * A calendar date in the TRAINEE's day (the api's `ChallengeDay.day`), so it is
 * formatted in UTC like every other plain date here: no zone shifts it.
 */
export function formatDayLabel(iso: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return datePrinted(
    new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    d,
    locale
  );
}

/**
 * An instant relative to `now`: "5 minutes ago" / "il y a 5 minutes", for anything under
 * a day; older than that, the date (`formatInstant`). Null → "—". A `syncedAt` slightly in
 * the FUTURE (a phone clock ahead of the server) reads as "now" rather than "in 2 minutes".
 */
export function formatSince(iso: string | null | undefined, now: number, locale: Locale): string {
  if (!iso) return DASH;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return DASH;
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (seconds < 60) return rtf.format(0, "second");
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), "hour");
  return formatInstant(iso, locale);
}
