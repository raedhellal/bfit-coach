"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHead, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { fullNameOf } from "@/lib/traineeName";
import { formatInstant, formatKcal, truncateName } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { saveTargetsAction } from "@/lib/nutritionActions";
import { parseTarget, targetRefusal } from "@/lib/numberInput";
import { settled } from "@/lib/settled";
import type { NutritionTargets } from "@/lib/coachApi";
import { useCoachForm } from "@/lib/useCoachForm";

/**
 * EV-185b AC2 — the coach's macro targets.
 *
 * Three sentences on this card are the story's, verbatim, and each says something the
 * code cannot:
 *   · the SOURCE line names who set the targets. `COACH` reads "Set by you on {date}"
 *     because a trainee has one coach and this portal only ever shows that coach their
 *     own attribution; if the api ever returns another coach's write, the sentence is
 *     wrong and the contract needs a name, not a rewording here.
 *   · the FLOOR flag is rendered only from `floorCalories` in the api's response. This
 *     component never decides that a floor applied — the floor is 1500 kcal male /
 *     1200 kcal female inside `NutritionService.setTarget`, and this surface does not
 *     know the trainee's sex and must not infer one.
 *   · the STANDING line ("…does not yet check protein or fat.") renders whether or not
 *     a floor fired, because what it states is the limit of the check itself. There is
 *     no protein or fat bound anywhere in the engine; EV-185 says so and refuses to
 *     invent one, so the coach is told rather than left to assume.
 *
 * "Enter a number above 0." is client-side and sends NO request, which is AC2's
 * wording. `saveTargetsAction` repeats the check because a server action is a public
 * endpoint, not because the coach can reach it.
 *
 * PB-2: the four fields are read by `parseTarget`. "1 800" (any space grouping
 * thousands) is 1800; a decimal part ("1800,5", "1800.5", and "1,000", never a
 * thousands separator — BUG-460) gets "Enter a whole number…", which is true of it,
 * instead of "above 0", which was not. Either way nothing is sent.
 * BUG-552: digits that cannot be read ("18 00", "1  800", "1 25") get the format
 * sentence (`numberFormat`); "above 0" is kept for empty, zero and negative fields.
 *
 * BUG-665 / EV-342o: built with `useCoachForm`. A coach who types targets and clicks the
 * Programme tab is asked first; after a save, or a 403 that ends the access, nobody is.
 * The fields re-seed from the server's props (another write, a revalidation) except one
 * the coach is typing in.
 *
 * EV-337g1 G1.2 (plan §5.4) — the card SHOWS the targets and edits them on request. Closed,
 * it draws the four values as a `<dl>` (from the `targets` prop: what the server holds,
 * never what was typed), the source line and the activity pill as before, the EV-190
 * arithmetic line for the stored values, and « Modifier les objectifs ». The button opens
 * the form that used to be always open, unchanged: the four fields, the live arithmetic,
 * the refusals, « Enregistrer les objectifs » through the same confirm dialog. « Annuler »
 * closes it and puts the fields back to the server's values; nothing is sent. A save that
 * lands closes it (the four values then show what was stored, the floor sentence under
 * them); a save that fails or whose answer was lost keeps it open with what was typed.
 * The form's fields are not in the server HTML while it is closed, so nothing can be typed
 * into them before hydration (the `Modal` answer of BUG-686's sweep).
 */
/** One targets card per page: its title names its region. */
const TITLE_ID = "nutrition-targets-title";

export function NutritionTargetsCard({
  clientId,
  traineeDisplayName,
  targets,
}: {
  clientId: string;
  traineeDisplayName: string | null;
  targets: NutritionTargets | null;
}) {
  const copy = useCopy();
  const router = useRouter();
  /** The server's values, in the form's terms: the seed, and what « Annuler » puts back. */
  const serverValues = {
    calories: targets ? String(targets.calories) : "",
    protein: targets ? String(targets.proteinG) : "",
    carbs: targets ? String(targets.carbsG) : "",
    fat: targets ? String(targets.fatG) : "",
  };
  const form = useCoachForm({ server: serverValues });
  const { calories, protein, carbs, fat } = form.values;
  /** The fields as last rendered, for a save's callback to see what was typed since it sent. */
  const latestValues = useRef(form.values);
  latestValues.current = form.values;
  /** The refusal on screen (AC2 or PB-2's sentence), or null. No request was sent. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const invalid = refusal !== null;
  const [confirming, setConfirming] = useState(false);
  const [floorCalories, setFloorCalories] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** G1.2 — the form is open. Closed on every page load. */
  const [editing, setEditing] = useState(false);
  /** The kit's `Button` takes no ref: its wrapper is how focus finds it again. */
  const editButtonWrap = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  /** Where focus goes after the next render: into the form it opened, or back to its opener. */
  const focusNext = useRef<"form" | "opener" | null>(null);

  const fields = [
    { key: "calories", label: copy.nutrition.calories, unit: copy.nutrition.kcal },
    { key: "protein", label: copy.nutrition.protein, unit: copy.nutrition.grams },
    { key: "carbs", label: copy.nutrition.carbs, unit: copy.nutrition.grams },
    { key: "fat", label: copy.nutrition.fat, unit: copy.nutrition.grams },
  ] as const;

  /** The four targets, or null for any field that is not a whole number above 0. */
  function parsed(values: string[] = [calories, protein, carbs, fat]): (number | null)[] {
    return values.map((v) => {
      const target = parseTarget(v);
      return target.kind === "whole" ? target.value : null;
    });
  }

  /**
   * EV-190 U3 / AC3 — the arithmetic the card never did.
   *
   * Four independent numbers with one rule between them ("above 0") meant 2200 kcal
   * could be saved next to macros summing to 2560, and the prompt was handed both. The
   * line below states the sum and the signed difference, live, as the coach types.
   *
   * It is ADVISORY and blocks nothing: "Save targets" is never disabled by it, nothing
   * is auto-corrected, and no request is withheld. A coach may have a reason for a
   * deliberate mismatch, and a tool that refuses a professional's number teaches them
   * to work around it. 4/4/9 kcal per gram and a ±25 kcal tolerance are the story's
   * own figures, so QA computes the expected sentence rather than reading it off.
   *
   * `null` whenever any field is empty or not a positive number: there is no honest
   * arithmetic over a missing value, and "0 kcal" or "NaN" would be an invented one
   * (edge case 5).
   */
  const MATCH_TOLERANCE_KCAL = 25;

  function reconciliation(values?: string[]): { line: string; delta: number } | null {
    const [kcal, proteinG, carbsG, fatG] = parsed(values);
    if (kcal === null || proteinG === null || carbsG === null || fatG === null) return null;
    const macroKcal = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
    const delta = macroKcal - Math.round(kcal);
    const sum = formatKcal(macroKcal, copy.locale);
    if (Math.abs(delta) <= MATCH_TOLERANCE_KCAL) {
      return { line: copy.nutrition.macrosMatch(sum), delta };
    }
    return {
      line:
        delta > 0
          ? copy.nutrition.macrosAbove(sum, formatKcal(delta, copy.locale))
          : copy.nutrition.macrosBelow(sum, formatKcal(-delta, copy.locale)),
      delta,
    };
  }

  /** The line for what the coach is typing: what the dialog's mismatch event reports. */
  const macros = reconciliation();
  /**
   * G1.2 — closed, the card states the arithmetic of the STORED targets (it did on load
   * before, when the open fields held them), read from the prop like the four values.
   */
  const shownMacros = editing
    ? macros
    : targets
      ? reconciliation([targets.calories, targets.proteinG, targets.carbsG, targets.fatG].map(String))
      : null;

  // Focus follows the control the coach pressed: into the first field on open, back to
  // « Modifier les objectifs » when the form closes (neither exists until this render).
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    (target === "form" ? firstField.current : editButtonWrap.current?.querySelector("button"))?.focus();
  });

  function open() {
    setEditing(true);
    focusNext.current = "form";
  }

  /** « Annuler »: the fields go back to the server's values and nothing is sent. */
  function cancel() {
    form.reset(serverValues);
    setRefusal(null);
    setError(null);
    setEditing(false);
    focusNext.current = "opener";
  }

  function requestSave() {
    const read = [calories, protein, carbs, fat].map(parseTarget);
    // A value that is not a whole number above 0 is rejected HERE and nothing is sent.
    // "Above 0" only while a field is empty, zero or negative; digits that cannot be read
    // are told the format (BUG-552), a decimal part "no decimals".
    const refused = targetRefusal(read);
    if (refused !== null) {
      const t = copy.nutrition;
      setRefusal(refused === "malformed" ? t.numberFormat : refused === "notWhole" ? t.wholeNumber : t.invalidNumber);
      setNotice(null);
      setError(null);
      return;
    }
    setRefusal(null);
    setConfirming(true);
  }

  function save() {
    const [kcal, proteinG, carbsG, fatG] = parsed();
    // Unreachable: `requestSave` opened this dialog only on four whole numbers.
    if (kcal === null || proteinG === null || carbsG === null || fatG === null) return;
    if (macros && Math.abs(macros.delta) > MATCH_TOLERANCE_KCAL) {
      // EV-190's own measurement of whether this line is worth keeping: if coaches
      // always save straight through it, it is decorative and it comes out.
      logPortalEvent({
        event: "coach_targets_macro_mismatch",
        delta_kcal: macros.delta,
        saved: true,
      });
    }
    const sent = { calories, protein, carbs, fat };
    form.markSent();
    startTransition(async () => {
      // `settled`: a failed request resolves with `undefined`, and without this the
      // four numbers the coach just typed go down with the error boundary. A request
      // that failed has no answer, so the fallback is `NO_ANSWER` (BUG-711), not FAILED.
      const result = await settled(
        saveTargetsAction(clientId, { calories: kcal, proteinG, carbsG, fatG }),
        { ok: false, code: "NO_ANSWER" } as const
      );
      setConfirming(false);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          // The link ended mid-session. Refreshing re-runs `[id]/layout.tsx`, whose
          // overview read now 403s, and the layout redirects to /clients/denied — the
          // coach leaves a screen of a revoked trainee's data instead of reading a
          // sentence beneath it. `endAccess` first: nothing typed can be saved now, so the
          // leave guard stands down and hands the history back clean, or the refresh
          // would never reach the layout's redirect (`useUnsavedChanges.release`).
          form.endAccess(() => router.refresh());
          return;
        }
        setError(
          result.code === "NO_ANSWER" ? copy.nutrition.targetsNoAnswer : copy.nutrition.targetsFailed
        );
        return;
      }
      setError(null);
      setNotice(copy.nutrition.targetsSaved);
      setFloorCalories(result.result.floorCalories);
      /**
       * The server may have clamped the calories; show what was actually stored — and
       * because the reconciliation line is derived from this state, it recomputes
       * against the STORED calories (AC3's last clause). A coach is never shown
       * arithmetic about a number that was not saved. A field typed while the save was
       * in flight keeps the coach's text (and stays unsaved).
       */
      const stored = result.result.targets;
      form.saved({
        calories: String(stored.calories),
        protein: String(stored.proteinG),
        carbs: String(stored.carbsG),
        fat: String(stored.fatG),
      });
      // G1.2 — the save landed: the card closes on the stored values (the `<dl>` reads the
      // revalidated prop, the floor sentence and « Objectifs enregistrés. » sit under it).
      // Unless a field was typed in while the request was out: that text is unsaved work, and
      // the form stays open on it rather than hiding it behind the values it is not.
      const typedSince = (Object.keys(sent) as (keyof typeof sent)[]).some(
        (key) => latestValues.current[key] !== sent[key]
      );
      if (!typedSince) {
        setEditing(false);
        focusNext.current = "opener";
      }
      // No `router.refresh()` (ADR-0033 branch 2a): `saveTargetsAction` revalidates, so
      // its response carried the page rendered after the write (the source line).
    });
  }

  /**
   * AC1's source line, in the four cases ADR-0015's 2026-09-16 amendment (ruling (b))
   * settles.
   *
   * `source === "COACH"` alone does NOT mean "you": `nutrition_targets` survives a
   * revoke-and-re-link and `set_by` is NULL once an erased account has been forgotten,
   * so a coach can legitimately be reading a target written by the trainee's previous
   * one. The gate is `setByYou`, a boolean the API computes — this component performs
   * no comparison and holds no id to compare, which is the point: the portal is never
   * served another person's user id (ADR-0012 D4's rule, applied to attribution).
   *
   * The not-you line never names the other coach. It has nothing to name them with.
   */
  function sourceLine(): string | null {
    if (!targets) return null;
    if (targets.source === "AUTO") return copy.nutrition.sourceAuto;
    if (targets.source === "MANUAL") return copy.nutrition.sourceManual;
    return targets.setByYou
      ? copy.nutrition.sourceCoach(formatInstant(targets.updatedAt, copy.locale))
      : copy.nutrition.sourceCoachOther(formatInstant(targets.updatedAt, copy.locale));
  }

  const source = sourceLine();

  /** G1.2 — the four values the server holds, in the field order of the form. */
  const tiles = targets
    ? [
        { key: "calories", label: copy.nutrition.calories, value: targets.calories, unit: copy.nutrition.kcal },
        { key: "protein", label: copy.nutrition.protein, value: targets.proteinG, unit: copy.nutrition.grams },
        { key: "carbs", label: copy.nutrition.carbs, value: targets.carbsG, unit: copy.nutrition.grams },
        { key: "fat", label: copy.nutrition.fat, value: targets.fatG, unit: copy.nutrition.grams },
      ]
    : null;

  return (
    // A named region (plan §5.4's « Objectifs journaliers » section): the page's frame and a
    // spec find the card by its name, not by a block that happens to hold its title.
    <section aria-labelledby={TITLE_ID}>
      <Card style={{ marginBottom: 18 }} rootRef={form.scope}>
        <CardHead
          title={<span id={TITLE_ID}>{copy.nutrition.targetsTitle}</span>}
          icon="apple"
          sub={source ?? undefined}
          /**
           * BUG-252: the badge is `nowrap` and 204 px ("Activity level: Moderately active"),
           * 228 px in French, so at phone widths it pushed past the card and scrolled the page
           * sideways. The head may now wrap, which drops the badge under the title when the
           * two do not fit side by side; the badge's own text may wrap too, for a width where
           * even a line of its own is too narrow. Desktop is unchanged: both fit on one line.
           * EV-337g1 G1.3: kept as it is; the redraw is below the head.
           */
          style={{ flexWrap: "wrap" }}
          action={
            targets?.activity ? (
              <Badge tone="purple" style={{ whiteSpace: "normal", maxWidth: "100%" }}>
                {copy.nutrition.activityBadge(
                  copy.nutrition.activityLabels[targets.activity] ?? targets.activity
                )}
              </Badge>
            ) : undefined
          }
        />

        {editing ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {fields.map((field, i) => (
              <label key={field.key} style={{ display: "block" }}>
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}
                >
                  {`${field.label} (${field.unit})`}
                </div>
                <input
                  ref={i === 0 ? firstField : undefined}
                  aria-label={field.label}
                  inputMode="numeric"
                  value={form.values[field.key]}
                  onChange={(e) => form.set(field.key, e.target.value)}
                  style={{
                    height: MIN_TOUCH_TARGET,
                    width: 120,
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${invalid ? "var(--err)" : "var(--border-2)"}`,
                    background: "var(--surface)",
                    padding: "0 12px",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "var(--ink)",
                  }}
                />
              </label>
            ))}
          </div>
        ) : tiles ? (
          /*
            Four labelled values, a `<dl>` (plan §5.4 a11y): each label is its value's term, so
            a screen reader reads « Protéines, 150 g » and not four numbers in a row. A number
            and its unit share a line (`nowrap`, BUG-270/300's rule).
          */
          <div className="nut-tiles-box">
            <dl className="nut-tiles">
              {tiles.map((tile) => (
                <div key={tile.key} className="nut-tile">
                  <dt>{tile.label}</dt>
                  <dd>
                    {formatKcal(tile.value, copy.locale)}
                    {"\u00a0"}
                    <span className="nut-tile-unit">{tile.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          // No targets stored: no value is drawn (X7), and the card says there are none.
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>{copy.nutrition.noTargets}</p>
        )}

        {/*
          Beneath the values, above the controls — the coach reads the arithmetic before they
          press Save, and it is a `status`, not an `alert`: nothing is wrong, and a screen
          reader should not be interrupted mid-field by a running total. Closed, it is the
          stored targets' arithmetic; open, the typed values', live.
        */}
        {shownMacros && (
          <p
            role="status"
            style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ink-2)" }}
          >
            {shownMacros.line}
          </p>
        )}

        {editing && refusal && (
          // AC2, verbatim (or PB-2's whole-number sentence). No request was sent.
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
            {refusal}
          </p>
        )}

        {editing ? (
          <div className="nut-targets-actions">
            <Button icon="check" onClick={requestSave} disabled={pending}>
              {pending ? copy.nutrition.saving : copy.nutrition.saveTargets}
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={pending}>
              {copy.nutrition.cancel}
            </Button>
          </div>
        ) : (
          <div className="nut-targets-actions" ref={editButtonWrap}>
            <Button variant="secondary" onClick={open}>
              {copy.nutrition.editTargets}
            </Button>
          </div>
        )}

        {floorCalories !== null && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--warn-ink)" }}>
            {copy.nutrition.floorApplied(floorCalories)}
          </p>
        )}
        {notice && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>{notice}</p>
        )}
        {error && (
          <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
            {error}
          </p>
        )}

        <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.nutrition.floorStanding}
        </p>

        <Modal
          dirty={false}
          open={confirming}
          onClose={() => !pending && setConfirming(false)}
          title={copy.nutrition.saveTargetsTitle}
          icon="apple"
          width={420}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                {copy.nutrition.cancel}
              </Button>
              <Button onClick={save} disabled={pending}>
                {copy.nutrition.saveTargets}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {/* Slice 1 has no draft: the write is immediate, and the dialog says so. */}
            {copy.nutrition.seesStraightAway(truncateName(fullNameOf(traineeDisplayName, copy)))}
          </p>
        </Modal>
        {form.guard}
      </Card>
    </section>
  );
}
