"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { truncateName } from "@/lib/format";
import { equipmentLabel, filterOptions, muscleLabel, musclesLabel } from "@/lib/catalogLabels";
import { searchCatalogAction } from "@/lib/routineActions";
import { settled } from "@/lib/settled";
import type { CatalogExercise } from "@/lib/coachApi";

/**
 * Catalog search — the ONLY way an exercise enters a draft (EV-184 AC2).
 *
 * There is no free-text path: the search box filters the catalog and the coach picks a
 * ROW, which carries its own `slug`. Nothing the coach types is ever submitted as an
 * exercise, so "selecting an exercise that does not exist in the catalog is not
 * possible" is a property of the data flow rather than a validation rule that could be
 * bypassed.
 *
 * The muscle and equipment options come back WITH the results (`CatalogPage.muscles` /
 * `.equipment`) rather than being hard-coded here — a hard-coded list in the web tier
 * is product data invented outside the 1,235-row catalog, and it would silently
 * disagree with it.
 *
 * ADR-0013: when the catalog is unavailable the picker shows the refusal sentence and
 * offers nothing to pick. It does not fall back to a cached list.
 */
export function CatalogPicker({
  open,
  title,
  keepOpen,
  onClose,
  onPick,
  rowBlock,
  limitNote,
  focusSearch,
}: {
  open: boolean;
  title: string;
  /**
   * EV-190 U4. ADDING is a repeated act — a six-exercise day was six open / search /
   * pick cycles — so the picker stays open while adding and the coach closes it when
   * they are done. REPLACING is a single act and still closes on the pick, because
   * there is nothing left to replace.
   */
  keepOpen?: boolean;
  onClose: () => void;
  onPick: (exercise: CatalogExercise) => void;
  /**
   * EV-341y2 YP2 — a row the coach cannot pick here, and why. `note` is shown on the row (the
   * other list's « Déjà dans l'autre liste »); a row blocked with no note is one already in the
   * list being filled. The day editor passes nothing: every row stays pickable there.
   */
  rowBlock?: (exercise: CatalogExercise) => { note: string | null } | null;
  /**
   * EV-341y2 YP2 — the list is full: every row rests and this line says why (« 10 exercices au
   * maximum. »). Null or absent: no limit is reached.
   */
  limitNote?: string | null;
  /** EV-341y2 YP8 — the search field takes the focus when the picker opens (keyboard-only use). */
  focusSearch?: boolean;
}) {
  const copy = useCopy();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [items, setItems] = useState<CatalogExercise[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  /** The last exercise added in THIS opening, so the pick is visibly acknowledged. */
  const [added, setAdded] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  /**
   * `onClose` is a fresh arrow on every parent render, and `run` is a dependency of
   * the debounce effect below — closing over the prop directly would re-arm that timer
   * on every render of the editor. The ref keeps `run` stable while still calling the
   * current handler. `router` from `useRouter` is stable and can be a real dependency.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const run = useCallback((query: string, m: string, e: string) => {
    startTransition(async () => {
      /**
       * `settled`, and this is the call site that made the rule general: the search
       * runs behind a debounce on every keystroke, so it is the action most likely to
       * meet a failing request — and an unguarded failure here took the whole editor,
       * and the coach's unsaved plan, down with it. A failed search says the catalogue
       * is unavailable; it does not lose a plan.
       */
      const result = await settled(searchCatalogAction(query, m, e), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          // The catalog is a server-wide read, so a 403 here is about the SESSION, not
          // the catalog: the coach profile is gone or the session is no longer a
          // coach's. Refreshing lets the route boundaries answer it (the layout's
          // overview read, then middleware) instead of the picker inventing a sentence
          // about an outage that is not happening.
          onCloseRef.current();
          router.refresh();
          return;
        }
        setUnavailable(result.code === "CATALOG_UNAVAILABLE");
        setFailed(result.code !== "CATALOG_UNAVAILABLE");
        setItems([]);
        return;
      }
      setUnavailable(false);
      setFailed(false);
      setItems(result.page.items);
      setMuscles(result.page.muscles);
      setEquipmentOptions(result.page.equipment);
      /**
       * There is no `truncated` boolean on the wire — `CoachCatalogPageResponse` is the
       * ordinary paged envelope every collection endpoint on b-fit-api serves, and the
       * portal typed a field nobody sends until 2026-09-18. "More matched than we are
       * showing" is the page's own arithmetic, and it is done here rather than in
       * `coachApi.ts` because this is a client island and that module is `server-only`.
       */
      setTruncated(result.page.totalElements > result.page.items.length);
    });
  }, [router]);

  /**
   * Every opening starts from the whole catalog.
   *
   * The picker stays mounted between openings (the modal renders null when closed),
   * so without this the second "Add exercise" reopens holding the previous query and
   * filters — a coach who searched "Lat Pulldown" to replace one exercise then sees a
   * one-row catalog when they go to add the next, with no visible reason. Nothing is
   * lost by resetting: a pick is a single act.
   */
  useEffect(() => {
    if (!open) return;
    setQ("");
    setMuscle("");
    setEquipment("");
    setAdded(null);
  }, [open]);

  // Escape closes the picker (edge case 14: "pressing Escape after the third keeps all
  // three"). Since BUG-171 the kit's `Modal` owns Escape for every dialog; the local
  // handler EV-190b added here would now call `onClose` a second time, so it is gone.
  // `onCloseRef` stays: the search's ACCESS_DENIED branch still closes through it.

  // Debounced so a five-letter query is one request per pause, not five.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => run(q, muscle, equipment), 180);
    return () => clearTimeout(timer);
  }, [open, q, muscle, equipment, run]);

  /**
   * EV-341y2 (BUG-824, BUG-825) — opt-in: only a picker given `rowBlock` / `limitNote` can make a
   * row rest, so only such a picker moves the focus. A row picked with the keyboard that then
   * RESTS (already in the list, or the list is now full) would drop the focus to <body>; it goes
   * to the limit line when the list is full, else back to the search box for the next pick.
   * Set by the pick, read after the parent's new props have rendered.
   */
  const optIn = rowBlock !== undefined || limitNote !== undefined;
  const pickedRow = useRef<string | null>(null);
  const searchAnchor = useRef<HTMLParagraphElement | null>(null);
  const limitLine = useRef<HTMLParagraphElement | null>(null);
  /**
   * BUG-1075 — while `limitNote` is set, the search box's `aria-describedby` names the limit line,
   * so a picker that opens already refusing (the intake list during « Recharger », BUG-1073) gives
   * the reason with the focused field. It also holds when the list fills inside the open picker and
   * the coach goes back to the search box (qa/catalog-picker-limit-description.spec.ts « F »). A
   * picker given no `limitNote` gets no attribute.
   */
  const limitId = useId();
  useEffect(() => {
    const name = pickedRow.current;
    if (!open || !optIn || name === null) return;
    const dialog = searchAnchor.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const row = Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-catalog-row]")).find(
      (el) => el.getAttribute("data-catalog-row") === name
    );
    if (row && !row.disabled) return; // the row still takes picks: the focus stays on it
    pickedRow.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active !== row) return; // the coach moved on
    if (limitNote && limitLine.current) limitLine.current.focus();
    else dialog.querySelector<HTMLInputElement>("input")?.focus();
  });

  /**
   * EV-341y2 (BUG-826) — opt-in with `focusSearch`: the search box that took the focus is
   * replaced by the refusal when the catalogue answers 503, which drops the focus to <body>. It
   * goes to the refusal, which is read out.
   */
  const unavailableLine = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (!open || !focusSearch || !unavailable) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    unavailableLine.current?.focus();
  }, [open, focusSearch, unavailable]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      // BUG-699 — every opening starts from an empty query and no filter (the effect above).
      dirty={!unavailable && (q !== "" || muscle !== "" || equipment !== "")}
      // BUG-171 — orchestrator ruling (BUG-171 staff r2), to be recorded by senior-po on
      // BUG-171's row: a dirty dialog ignores Escape, but this one opts out. Every pick is
      // committed to the editor the moment it is made, so Escape loses only the search text and
      // the filters — view state, not data the coach typed — and edge case 14 ("Escape after the
      // third keeps all three") holds. The backdrop still follows `dirty` (BUG-699).
      escapeIgnoresDirty
      title={title}
      icon="search"
      width={560}
      // Only the multi-add opening needs a way out that is not "pick something": a
      // replace picker already closes on the pick.
      footer={
        keepOpen ? (
          <Button variant="secondary" onClick={onClose}>
            {copy.routine.catalogDone}
          </Button>
        ) : undefined
      }
    >
      {unavailable ? (
        // AC4, verbatim: refuse and offer nothing, rather than half a catalog.
        <p
          role="alert"
          ref={unavailableLine}
          tabIndex={focusSearch ? -1 : undefined}
          data-catalog-unavailable=""
          style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}
        >
          {copy.routine.catalogUnavailable}
        </p>
      ) : (
        <>
          <Input
            label={copy.routine.catalogSearch}
            value={q}
            icon="search"
            placeholder={copy.routine.catalogSearch}
            full
            autoFocus={focusSearch}
            ariaDescribedBy={limitNote ? limitId : undefined}
            onChange={(e) => setQ(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <FilterSelect
              label={copy.routine.catalogMuscle}
              value={muscle}
              options={filterOptions(muscles, muscleLabel, copy)}
              onChange={setMuscle}
            />
            <FilterSelect
              label={copy.routine.catalogEquipment}
              value={equipment}
              options={filterOptions(equipmentOptions, equipmentLabel, copy)}
              onChange={setEquipment}
            />
          </div>
          <p ref={searchAnchor} style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.routine.catalogPickOnly}
          </p>
          {/*
            EV-201 AC3 — said only on the opening it is true of.

            `keepOpen` is the ADD opening; the REPLACE picker closes on the pick and
            this line must not appear there. It sits next to `catalogPickOnly` rather
            than by the footer's "Done" so it is read before the first pick, which is
            the pick whose silence it explains.
          */}
          {keepOpen && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
              {copy.routine.catalogStaysOpen}
            </p>
          )}

          {limitNote && (
            <p
              id={limitId}
              data-catalog-limit=""
              ref={limitLine}
              tabIndex={-1}
              style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}
            >
              {limitNote}
            </p>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {pending && items.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
                {copy.routine.catalogSearching}
              </p>
            )}
            {!pending && failed && (
              <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--err-ink)" }}>
                {copy.common.unexpectedError}
              </p>
            )}
            {!pending && !failed && items.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
                {copy.routine.catalogNoResults}
              </p>
            )}
            {items.map((item) => {
              const block = rowBlock?.(item) ?? null;
              const resting = !!limitNote || block !== null;
              return (
              <button
                key={item.slug}
                type="button"
                disabled={resting}
                data-catalog-row={item.name}
                onClick={() => {
                  if (resting) return;
                  if (optIn) pickedRow.current = item.name;
                  onPick(item);
                  if (keepOpen) setAdded(item.name);
                }}
                title={item.name}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  // Only a row with a note wraps (EV-341y2); the day editor's rows are as before.
                  flexWrap: block?.note ? "wrap" : undefined,
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: resting ? "var(--surface-2)" : "var(--surface)",
                  cursor: resting ? "default" : "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, color: resting ? "var(--ink-3)" : "var(--ink)" }}>
                  {truncateName(item.name)}
                  {block?.note && (
                    <span data-catalog-row-note="" style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}>
                      {block.note}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {/* BUG-489: words, not the catalogue's raw values ("quads,glutes", "NONE"). */}
                  {item.primaryMuscles && <Badge tone="blue">{musclesLabel(item.primaryMuscles, copy)}</Badge>}
                  {item.equipment && <Badge tone="neutral">{equipmentLabel(item.equipment, copy)}</Badge>}
                </span>
              </button>
              );
            })}
            {/*
              The day the exercise landed on is BEHIND this dialog, so without this the
              only feedback for a pick is the modal not closing. `status` announces it
              to a screen reader too; the full name is used, not the truncated one.
            */}
            {added && (
              <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ok-ink)" }}>
                {copy.routine.catalogAdded(added)}
              </p>
            )}
            {truncated && (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)" }}>
                {copy.routine.catalogTruncated}
              </p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  /** `value` is the api's raw filter value; `label` is what the coach reads (BUG-489). */
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
        {label}
      </div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: MIN_TOUCH_TARGET,
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border-2)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          padding: "0 10px",
          minWidth: 150,
        }}
      >
        <option value="">{copy.routine.catalogAll}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
