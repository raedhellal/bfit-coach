import type { ReactNode } from "react";
import { Card, CardHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import type {
  CoachFoodLogDay,
  CoachFoodLogEatenMeal,
  CoachFoodLogEntry,
  CoachFoodLogMacros,
  CoachFoodLogResponse,
} from "@/lib/coachApi";
import { copy } from "@/lib/copy";
import {
  formatDate,
  formatGrams,
  formatKcal,
  formatShortDate,
  formatUtcTime,
  formatWeekday,
} from "@/lib/format";

/**
 * EV-284b — the Food log section: seven days of what the trainee logged, against the
 * day's targets. A SERVER component: the days are read once on the server and every
 * day expands through a native `<details>`, so there is no client JavaScript and no
 * data fetching in the browser.
 *
 * Rules that are decisions, not styling:
 *   · The numbers are the api's. `totals` is computed by the same code as the
 *     trainee's Today screen (AC2) and is never re-summed here — a second sum is a
 *     second answer, and the phone and the portal must not disagree.
 *   · A day with nothing recorded says "Nothing logged" and nothing else. Never 0 kcal,
 *     and never an eaten/target pair with an eaten half invented from a null.
 *   · A QUICK entry shows its kcal and a dash per macro, as a rule on the SOURCE: macros
 *     are stored NOT NULL DEFAULT 0 (V28), so an unentered macro cannot be told from a
 *     real 0 on any other entry, and those show their 0 (AC5, amended).
 *   · Newest day first: the coach opens this to see how yesterday and today went.
 *   · `failed` is the load error for THIS section only. It never reads as "not
 *     shared": the api being down is not the trainee withholding anything.
 */
export function FoodLogCard({
  log,
  failed,
}: {
  log: CoachFoodLogResponse | null;
  failed: boolean;
}) {
  const days = !failed && log && Array.isArray(log.days) ? [...log.days].reverse() : null;
  return (
    <section aria-labelledby="food-log-title" style={{ marginTop: 18 }}>
      <Card>
        <CardHead
          icon="apple"
          title={<span id="food-log-title">{copy.foodLog.title}</span>}
          sub={days && log ? copy.foodLog.window(formatDate(log.from), formatDate(log.to)) : undefined}
        />
        {days ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {days.map((day, i) => (
              <li
                key={day.date}
                data-date={day.date}
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", padding: "6px 0" }}
              >
                <FoodDay day={day} />
              </li>
            ))}
          </ol>
        ) : (
          <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>
            {copy.foodLog.loadError}
          </p>
        )}
      </Card>
    </section>
  );
}

function dayLabel(date: string): string {
  return `${formatWeekday(date)} ${formatShortDate(date)}`;
}

/**
 * Anything recorded at all. `totals` is null exactly when nothing was (api contract);
 * the lists are asked too so an entry is never hidden behind a missing total.
 */
function recorded(day: CoachFoodLogDay): boolean {
  const entries = Array.isArray(day.entries) ? day.entries.length : 0;
  const eaten = Array.isArray(day.eatenMeals) ? day.eatenMeals.length : 0;
  return entries + eaten > 0 || (day.totals !== null && day.totals !== undefined);
}

function FoodDay({ day }: { day: CoachFoodLogDay }) {
  if (!recorded(day)) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "4px 16px",
          minHeight: 44,
          padding: "6px 0",
        }}
      >
        <DayName date={day.date} />
        <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{copy.foodLog.nothingLogged}</span>
      </div>
    );
  }
  const entries = Array.isArray(day.entries) ? day.entries : [];
  const eaten = Array.isArray(day.eatenMeals) ? day.eatenMeals : [];
  return (
    <details className="food-day">
      <summary>
        <DayName date={day.date} />
        {/* Spans, not a <dl>: <summary> takes phrasing content only. */}
        <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px" }}>
          <Pair
            label={copy.foodLog.calories}
            eaten={day.totals?.calories}
            target={day.targets?.calories}
            format={formatKcal}
            unit={copy.foodLog.kcal}
          />
          <Pair
            label={copy.foodLog.protein}
            eaten={day.totals?.proteinG}
            target={day.targets?.proteinG}
            format={formatGrams}
            unit={copy.foodLog.grams}
          />
        </span>
        <span className="food-day-chev" aria-hidden="true">
          <UiIcon name="chevR" size={16} color="var(--ink-3)" />
        </span>
      </summary>
      <div style={{ padding: "4px 0 10px", display: "flex", flexDirection: "column", gap: 14 }}>
        {entries.length > 0 && (
          <Group label={copy.foodLog.logged}>
            {entries.map((e, i) => (
              <Entry key={`${e.loggedAt}-${i}`} entry={e} />
            ))}
          </Group>
        )}
        {eaten.length > 0 && (
          <Group label={copy.foodLog.fromThePlan}>
            {eaten.map((m, i) => (
              <EatenMeal key={`${m.eatenAt}-${i}`} meal={m} />
            ))}
          </Group>
        )}
      </div>
    </details>
  );
}

function DayName({ date }: { date: string }) {
  return (
    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", minWidth: 120 }}>
      {dayLabel(date)}
    </span>
  );
}

/**
 * "417 / 2,150 kcal", or "300 kcal · No target" when the trainee has no stored
 * target. A missing eaten half (an older or odd response) is a dash, never a 0.
 */
function Pair({
  label,
  eaten,
  target,
  format,
  unit,
}: {
  label: string;
  eaten: number | undefined;
  target: number | undefined;
  format: (n: number) => string;
  unit: string;
}) {
  const had = typeof eaten === "number" ? format(eaten) : copy.common.dash;
  const value =
    typeof target === "number"
      ? copy.foodLog.pair(had, format(target), unit)
      : copy.foodLog.noTarget(had, unit);
  return (
    <span data-pair={label} style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
      <span data-value="" style={{ fontSize: 13.5, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </span>
  );
}

/** A labelled list inside an open day: "Logged" and "From the plan". */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div
        aria-hidden="true"
        style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4 }}
      >
        {label}
      </div>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </ul>
    </div>
  );
}

function Macros({ values, dashes }: { values: CoachFoodLogMacros; dashes: boolean }) {
  const grams = (n: number) => (dashes ? copy.common.dash : `${formatGrams(n)} ${copy.foodLog.grams}`);
  const cells: [string, string][] = [
    [copy.foodLog.calories, `${formatKcal(values.calories)} ${copy.foodLog.kcal}`],
    [copy.foodLog.protein, grams(values.proteinG)],
    [copy.foodLog.carbs, grams(values.carbsG)],
    [copy.foodLog.fat, grams(values.fatG)],
  ];
  return (
    <dl className="food-macros">
      {cells.map(([label, value]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{label}</dt>
          <dd style={{ margin: 0, fontSize: 13, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const lineStyle = { fontSize: 12.5, color: "var(--ink-3)", marginTop: 2, overflowWrap: "anywhere" } as const;

function Entry({ entry }: { entry: CoachFoodLogEntry }) {
  const meta = [
    copy.foodLog.source[entry.source],
    typeof entry.servingG === "number" ? copy.foodLog.serving(formatGrams(entry.servingG)) : null,
    formatUtcTime(entry.loggedAt) ? copy.foodLog.at(formatUtcTime(entry.loggedAt)) : null,
  ].filter(Boolean);
  return (
    <li data-entry="" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, color: "var(--ink)", overflowWrap: "anywhere" }}>
        <span style={{ fontWeight: 600 }}>{entry.name}</span>
        {entry.brand && <span style={{ color: "var(--ink-3)" }}> · {entry.brand}</span>}
      </div>
      <div style={lineStyle}>{meta.join(" · ")}</div>
      <Macros values={entry} dashes={entry.source === "QUICK"} />
    </li>
  );
}

function EatenMeal({ meal }: { meal: CoachFoodLogEatenMeal }) {
  const meta = [
    meal.slot ? copy.nutrition.mealSlots[meal.slot] : null,
    formatUtcTime(meal.eatenAt) ? copy.foodLog.at(formatUtcTime(meal.eatenAt)) : null,
  ].filter(Boolean);
  return (
    <li data-eaten-meal="" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" }}>
        {meal.name}
      </div>
      <div style={lineStyle}>{meta.join(" · ")}</div>
      <Macros values={meal} dashes={false} />
    </li>
  );
}
