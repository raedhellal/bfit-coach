"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BlockNote, MonitoringBlock } from "@/components/client/MonitoringBlock";
import { Button, Input } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { firstName } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { saveProgressGoalAction } from "@/lib/progressGoalActions";
import {
  bodyFatAbsent,
  buildProgressGoalRequest,
  describeChange,
  editField,
  hasAnyReading,
  markSent,
  milestoneAttribution,
  progressRows,
  reseedPreservingEdits,
  seedFormState,
  startedOnLine,
  storedValues,
} from "@/lib/progressGoal";
import { settled } from "@/lib/settled";
import type { TraineeProgressGoal } from "@/lib/coachApi";

/**
 * EV-202b — where the trainee started, where they are, and where they are going.
 *
 * TWO fields and four derived numbers. AC2 asserts the absence of the other four
 * controls by counting: "the block contains exactly two form fields". That is a real
 * property of this component and not a convention — the coach types a start date and a
 * milestone, and start weight, current weight, start body fat and current body fat
 * come from the trainee's own rows (EV-202 Ruling 1). There is no third input, and
 * `CoachProgressGoalRequest` has no field one could be wired to.
 *
 * 🔴 **G-GOAL (Ruling 2) constrains the LAYOUT of this block, not just the api.** The
 * milestone must not look like an input to anything:
 *   · no progress bar toward it, no dial, no percentage-of-the-way-there;
 *   · no projection, no "at this rate", no date by which it would be reached;
 *   · nothing that implies the plan or the calorie targets respond to it — the block
 *     lives on the overview, away from the Routine and Nutrition tabs, and says out
 *     loud that plans and targets are not calculated from it.
 * It is a number a coach wrote down. Every one of those omissions is deliberate and
 * none of them is a gap waiting to be filled in a follow-up.
 *
 * 🔴 **Why this is a client island at all**, given the portal is server-first: the
 * block holds a form, and `PUT …/progress-goal` answers the SAME block the `GET`
 * embeds, recomputed. So the save updates the table from its own response with no
 * refetch — which is also the only way the coach can SEE that moving the start date
 * moved the baseline (AC3), immediately, rather than after a reload.
 */
export function ProgressGoalBlock({
  clientId,
  coachId,
  traineeDisplayName,
  goal: incoming,
}: {
  clientId: string;
  /**
   * `null` when `GET /coach-portal/me` failed — that read already degrades the header
   * to a nameless one rather than taking the page down, and a missing display name
   * must not cost the measurement either. The event still fires.
   */
  coachId: string | null;
  traineeDisplayName: string;
  goal: TraineeProgressGoal;
}) {
  const router = useRouter();

  /**
   * The block the coach is looking at — seeded from the server's render and replaced
   * by the api's own answer on every successful save.
   *
   * **Re-seeded when the SERVER's value changes**, compared by signature during
   * render rather than in an effect. A route re-render hands down new props but does
   * NOT remount this island, so state seeded once from props goes stale and the table
   * keeps showing what was submitted instead of what was stored — the defect that
   * shipped in the routine editor.
   *
   * ⚠️ `propSignature` tracks the LAST PROP THIS ISLAND WAS GIVEN, never the last
   * value it saved. Comparing against what it saved made the island treat its own
   * successful write as a disagreement and re-seed back to the pre-save numbers.
   *
   * 🔴 **The TABLE follows the props unconditionally; the FIELDS do not.** Props
   * arrive here on the back of the coach's own save — `revalidatePath` returns a
   * fresh RSC payload with the action's response, in the same tick — so a form that
   * re-seeded on every prop change would delete anything typed during the round trip.
   * `reseedPreservingEdits` skips a field the coach has touched since the last save
   * was sent. `src/lib/progressGoal.ts` carries the measurement behind that rule.
   */
  const signature = `${incoming.startedOn}|${incoming.startedOnSource}|${incoming.milestoneWeightKg}|${incoming.milestoneUpdatedAt}`;
  const [propSignature, setPropSignature] = useState(signature);
  const [goal, setGoal] = useState(incoming);
  const [fields, setFields] = useState(() => seedFormState(incoming));

  if (signature !== propSignature) {
    // The signature is advanced whether or not a field was re-seeded — otherwise a
    // dirty field would leave the island one prop behind for good, and the NEXT,
    // unrelated prop push would re-seed against a signature that is two changes old.
    setPropSignature(signature);
    setGoal(incoming);
    setFields((current) => reseedPreservingEdits(current, incoming));
  }

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<"DATE" | "MILESTONE" | null>(null);
  const [pending, startTransition] = useTransition();

  const name = firstName(traineeDisplayName);
  const empty = !hasAnyReading(goal);
  const noBodyFat = !empty && bodyFatAbsent(goal);

  /**
   * The story's two RENDER events (its third fires on a successful PUT, below).
   *
   * Keyed on the state that makes each true, so a re-render does not re-count one and
   * a trainee who moves from "no readings" to "readings" counts each state once.
   */
  useEffect(() => {
    if (empty) logPortalEvent({ event: "coach_progress_block_empty", coachId, clientId });
  }, [empty, coachId, clientId]);
  useEffect(() => {
    if (noBodyFat) {
      logPortalEvent({ event: "coach_progress_bodyfat_absent", coachId, clientId });
    }
  }, [noBodyFat, coachId, clientId]);

  function save() {
    /**
     * 🔴 ONE call site, and it passes the CONTENTS OF BOTH FIELDS — never "the one
     * that changed". The PUT is a whole representation: a body carrying only the
     * edited value clears the other, silently, and a cleared start date comes back as
     * the link date, which renders as a plausible wrong date rather than as a blank.
     * `buildProgressGoalRequest` is the only place a body is constructed and its
     * return type makes both fields required.
     */
    const built = buildProgressGoalRequest(fields.startedOn, fields.milestone);
    if (!built.ok) {
      // Rejected here; NO request is sent, which is why the sentence names what to do.
      setInvalid(built.reason);
      setNotice(null);
      setError(null);
      return;
    }
    setInvalid(null);
    const body = built.body;
    const changed = describeChange(storedValues(goal), body);
    /**
     * Both fields are now the coach's SETTLED intent: what is on screen is what is
     * being sent. Anything typed from here until the response lands re-marks that
     * field dirty and is therefore kept, which is the whole of the race fix.
     */
    setFields(markSent);

    startTransition(async () => {
      // `settled`: a rejected action resolves to a value instead of taking the two
      // numbers the coach just typed down with the error boundary.
      const result = await settled(saveProgressGoalAction(clientId, body), {
        ok: false,
        code: "FAILED",
      } as const);

      if (!result.ok) {
        setNotice(null);
        if (result.code === "ACCESS_DENIED") {
          /**
           * The link ended mid-session. Refreshing re-runs `[id]/layout.tsx`, whose
           * overview read now 403s, and the layout redirects to /clients/denied — the
           * coach leaves a screen of a revoked trainee's data rather than reading a
           * sentence under it. The 403 is undifferentiated (ADR-0012 D4), so it is
           * never rendered as a consent sentence here.
           */
          router.refresh();
          return;
        }
        setError(
          result.code === "OUT_OF_RANGE" ? copy.progressGoal.outOfRange : copy.progressGoal.failed
        );
        return;
      }

      setError(null);
      setNotice(copy.progressGoal.saved);
      /**
       * The api's own recomputed block, not the coach's input echoed back. It is what
       * makes AC3 visible: a start date later than every reading comes back with a
       * null `startWeight` and a null delta, and the table says so immediately.
       */
      setGoal(result.goal);
      // Same rule as the prop path: a field touched while the save was in flight is
      // the coach's, and the api's echo of the value they had already sent does not
      // get to overwrite it.
      setFields((current) => reseedPreservingEdits(current, result.goal));
      logPortalEvent({
        event: "coach_progress_goal_set",
        coachId,
        clientId,
        hasStartDate: body.startedOn !== null,
        hasMilestone: body.milestoneWeightKg !== null,
        changed,
      });
      /**
       * ⚠️ **No `router.refresh()` here — and that closes nothing by itself, which is
       * the correction to what this comment used to claim.** `revalidatePath` in the
       * action already returns a fresh RSC payload with this response, so the island
       * gets new props either way; a `router.refresh()` would only add a second,
       * redundant round trip for data this component is already holding.
       *
       * The keystroke race that the earlier version of this note said was fixed by
       * the omission is fixed by `reseedPreservingEdits` above, and by the regression
       * test in `qa/coach-progress-goal.spec.ts` that holds the response open, types
       * during it, and fails without that rule.
       */
    });
  }

  const attribution = milestoneAttribution(goal);

  return (
    <MonitoringBlock title={copy.progressGoal.title} icon="trend">
      {empty ? (
        /**
         * AC5, verbatim — and the form below it stays editable and still saves. A
         * coach agreeing a milestone with a trainee who has not weighed in yet is the
         * ordinary first conversation, not an error state.
         */
        <BlockNote>{copy.progressGoal.noWeightYet(name)}</BlockNote>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {progressRows(goal).map((row) => (
            /**
             * ORDINARY INLINE TEXT, not a flex row and not a `<table>`.
             *
             * AC2 quotes the line as one sentence — "Weight — Start 92.0 kg (1 Jun
             * 2026) · Current 86.0 kg (15 Sep 2026) · −6.0 kg · Milestone 80.0 kg ·
             * 6.0 kg to go" — and QA reads it as one. Inline text also wraps at 320 px
             * instead of scrolling sideways, which a five-column table does not, and
             * the separators survive the wrap because they are text rather than gaps
             * between flex items.
             *
             * `data-cell` is on every cell so an ABSENT delta is assertable as a count
             * of zero. An empty `<span>` would be a cell a spec cannot see, and "the
             * delta is empty" would pass against a cell that had stopped rendering for
             * some other reason entirely.
             */
            <p
              key={row.metric}
              data-metric={row.metric}
              style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-2)" }}
            >
              <span style={{ fontWeight: 700, color: "var(--ink)" }}>{row.label}</span>
              <span>{" — "}</span>
              {row.cells.map((cell, index) => (
                <Fragment key={cell.key}>
                  {index > 0 && <span>{" · "}</span>}
                  <span data-cell={cell.key}>{cell.text}</span>
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      )}

      {/* The start date and where it came from. A defaulted date is never passed off
          as a typed one — see `startedOnLine`. */}
      <p
        data-provenance="startedOn"
        style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}
      >
        {startedOnLine(goal)}
      </p>
      {attribution && (
        <p
          data-provenance="milestone"
          style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}
        >
          {attribution}
        </p>
      )}

      {/* ── the edit form: exactly two fields (AC2 counts them) ──────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <Input
            label={copy.progressGoal.startDateLabel}
            type="date"
            full
            value={fields.startedOn}
            error={invalid === "DATE" ? copy.progressGoal.invalidDate : undefined}
            /**
             * `invalidDate` is not dead copy for an unreachable state: a browser
             * without `type="date"` support renders this as a plain text field, which
             * is where a value that is not `YYYY-MM-DD` comes from. The hint is the
             * one that matters day to day — clearing the field is a WRITE that falls
             * back to the link date, not a no-op (edge case 7).
             */
            hint={copy.progressGoal.startDateHint}
            onChange={(e) =>
              setFields((current) => editField(current, "startedOn", e.target.value))
            }
          />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <Input
            label={copy.progressGoal.milestoneLabel}
            full
            value={fields.milestone}
            error={invalid === "MILESTONE" ? copy.progressGoal.invalidMilestone : undefined}
            /**
             * 🔴 G-GOAL, said to the coach in one sentence. It is a NEGATIVE claim
             * about the system, so it owes a witness: EV-202 AC8's static limb and its
             * difference-of-zero limb, both release-blocking on the api side.
             *
             * The field is TEXT and not `type="number"`: 25..300 kg is the api's
             * refusal to make (edge case 6 — "never a silent clamp"), and a `min`/`max`
             * here would have the browser quietly withhold the request the coach asked
             * for instead of showing them why it was refused.
             */
            hint={copy.progressGoal.milestoneNote}
            onChange={(e) =>
              setFields((current) => editField(current, "milestone", e.target.value))
            }
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Button icon="check" onClick={save} disabled={pending}>
          {pending ? copy.progressGoal.saving : copy.progressGoal.save}
        </Button>
      </div>

      {notice && (
        <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}
    </MonitoringBlock>
  );
}
