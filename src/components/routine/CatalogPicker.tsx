"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Input, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { truncateName } from "@/lib/format";
import { searchCatalogAction } from "@/lib/routineActions";
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
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (exercise: CatalogExercise) => void;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [items, setItems] = useState<CatalogExercise[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
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
      const result = await searchCatalogAction(query, m, e);
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
      setTruncated(result.page.truncated);
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
  }, [open]);

  // Debounced so a five-letter query is one request per pause, not five.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => run(q, muscle, equipment), 180);
    return () => clearTimeout(timer);
  }, [open, q, muscle, equipment, run]);

  return (
    <Modal open={open} onClose={onClose} title={title} icon="search" width={560}>
      {unavailable ? (
        // AC4, verbatim: refuse and offer nothing, rather than half a catalog.
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--err-ink)" }}>
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
            onChange={(e) => setQ(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <FilterSelect
              label={copy.routine.catalogMuscle}
              value={muscle}
              options={muscles}
              onChange={setMuscle}
            />
            <FilterSelect
              label={copy.routine.catalogEquipment}
              value={equipment}
              options={equipmentOptions}
              onChange={setEquipment}
            />
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.routine.catalogPickOnly}
          </p>

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
            {items.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => onPick(item)}
                title={item.name}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  {truncateName(item.name)}
                </span>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {item.primaryMuscles && <Badge tone="blue">{item.primaryMuscles}</Badge>}
                  {item.equipment && <Badge tone="neutral">{item.equipment}</Badge>}
                </span>
              </button>
            ))}
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
  options: string[];
  onChange: (value: string) => void;
}) {
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
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
