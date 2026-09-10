import type { WeightPoint } from "./coachApi";
import { copy } from "./copy";
import { formatKgDelta } from "./format";

/**
 * Block 4's caption, derived from the SAME series the tile and the sparkline draw
 * (BUG-144).
 *
 * The bug this replaces: the tile rendered the latest weight whenever the series had a
 * point, but the caption fell back to "No weigh-ins in the last 8 weeks" whenever there
 * was no *delta* — so exactly one weigh-in produced "72.5 kg" over a sentence saying
 * there had been none. Two conditions read from one series is how that happens, so
 * there is now one function and one switch on `series.length`.
 *
 * `import type` above is deliberate: `coachApi` is `server-only` and this module is
 * imported by a server component today, but nothing here touches a cookie or the api,
 * and a type import is erased.
 */
export function weightCaption(series: WeightPoint[]): string {
  if (series.length === 0) return copy.client.noWeighIns;
  if (series.length === 1) return copy.client.oneWeighIn;
  const delta = series[series.length - 1].weightKg - series[0].weightKg;
  return copy.client.weighInDelta(formatKgDelta(delta), series.length);
}
