"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { settled } from "@/lib/settled";
import { saveAsTemplateAction, type TemplateFailure } from "@/lib/templateActions";
import { TEMPLATE_NAME_MAX } from "@/lib/templateDocument";
import type { CoachTemplateSource } from "@/lib/coachApi";

/**
 * AC1's other two entry points, on the trainee's Routine page: save THIS trainee's
 * published plan, or the coach's unpublished draft for them, into the coach's library.
 *
 * It renders nothing at all when there is no source — edge case 12, the legacy
 * population with an active plan and no routine document. AC1 says the control is
 * "unavailable in the portal" there, and a disabled button beside an explanation is
 * still a control a coach tries; the api refuses a direct call with
 * `400 COACH_TEMPLATE_SOURCE_EMPTY` and that refusal is handled below as the belt to
 * this brace.
 *
 * ⚠ What travels: the api copies the trainee's ROUTINE DOCUMENT and strips
 * `constraints.equipment` and `constraints.injuries` at the write boundary. The portal
 * sends a NAME and a SOURCE and nothing else — there is no path here by which a
 * trainee's own answers could reach a template, because the portal never holds the
 * document on this path at all.
 */
export function SaveAsTemplateButton({
  clientId,
  /** The published plan's name, for the pre-fill. Null when there is no plan. */
  planName,
  hasDraft,
}: {
  clientId: string;
  planName: string | null;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState<CoachTemplateSource>("PLAN");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sources: CoachTemplateSource[] = [
    ...(planName !== null ? (["PLAN"] as const) : []),
    ...(hasDraft ? (["DRAFT"] as const) : []),
  ];
  // Edge case 12 — no plan document and no draft: there is nothing to copy, so there
  // is no control.
  if (sources.length === 0) return null;

  function start() {
    const first = sources[0];
    setSource(first);
    // AC1 — "pre-named with the plan's name and editable before saving".
    setName(planName ?? "");
    setNotice(null);
    setError(null);
    setOpen(true);
  }

  const trimmed = name.trim();
  const localRefusal =
    trimmed === ""
      ? copy.templates.nameRequired
      : trimmed.length > TEMPLATE_NAME_MAX
        ? copy.templates.nameTooLong
        : null;

  const FAILURE_COPY: Record<TemplateFailure, string> = {
    NAME_TAKEN: copy.templates.nameTaken,
    LIMIT_REACHED: copy.templates.limitReached(50),
    TOO_LARGE: copy.templates.saveAsTemplateFailed,
    SOURCE_EMPTY: copy.templates.sourceEmpty,
    NOT_PUBLISHABLE: copy.templates.saveAsTemplateFailed,
    PLAN_EMPTY: copy.routine.planEmpty,
    CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
    ACCESS_DENIED: copy.client.notFound,
    FAILED: copy.templates.saveAsTemplateFailed,
  };

  function submit() {
    if (localRefusal) return;
    startTransition(async () => {
      const result = await settled(saveAsTemplateAction(clientId, trimmed, source), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        setError(FAILURE_COPY[result.code]);
        return;
      }
      setOpen(false);
      setError(null);
      setNotice(copy.templates.saveAsTemplateDone(result.template.name));
      // The library is a different route; refreshing here is what makes a coach who
      // navigates to it next see the new row rather than a cached list.
      router.refresh();
    });
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.templates.private}
        </p>
        <Button variant="secondary" icon="file" onClick={start} disabled={pending}>
          {copy.templates.saveAsTemplate}
        </Button>
      </div>
      {notice && (
        <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
          {notice}
        </p>
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={copy.templates.saveAsTemplateTitle}
        icon="file"
        iconTone="blue"
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {copy.templates.cancel}
            </Button>
            <Button onClick={submit} disabled={pending || localRefusal !== null}>
              {copy.templates.saveAsTemplate}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          {sources.length > 1 && (
            <div role="radiogroup" aria-label={copy.templates.saveAsTemplateTitle}>
              {sources.map((option) => (
                <label
                  key={option}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: MIN_TOUCH_TARGET,
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                  }}
                >
                  <input
                    type="radio"
                    name="template-source"
                    checked={source === option}
                    onChange={() => setSource(option)}
                  />
                  {option === "PLAN" ? copy.templates.fromPlan : copy.templates.fromDraft}
                </label>
              ))}
            </div>
          )}
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {copy.templates.nameLabel}
            </div>
            <input
              value={name}
              maxLength={TEMPLATE_NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              style={{
                height: MIN_TOUCH_TARGET,
                width: "100%",
                minWidth: 0,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border-2)",
                background: "var(--surface)",
                padding: "0 12px",
                fontSize: 14,
                color: "var(--ink)",
              }}
            />
          </label>
          {localRefusal && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)" }}>{localRefusal}</p>
          )}
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--err-ink)" }}>
              {error}
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
}
