"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { settled } from "@/lib/settled";
import { formatDate, formatSteps } from "@/lib/format";
import { createChallengeAction } from "@/lib/challengeActions";
import {
  DAILY_TARGET_MAX,
  DAILY_TARGET_MIN,
  buildChallengeRequest,
  challengeFailureMessage,
  checkChallenge,
  daysBetween,
  defaultChallengeForm,
  localToday,
  problemMessage,
  utcToday,
  type ChallengeField,
  type ChallengeForm,
} from "@/lib/challengeDocument";

/** A trainee the coach may invite: an ACTIVE roster row. STEPS needs no data scope. */
export interface InviteTarget {
  id: string;
  traineeDisplayName: string;
}

/**
 * EV-321b — "New challenge": title, the daily step goal (10 000 by default), the window
 * (today → today + 6) and the clients to invite.
 *
 * A client island because it is a dialog with live validation. Nothing is fetched here:
 * the roster arrives from the page's server read, and the one write goes through
 * `createChallengeAction`. Every check runs through `challengeDocument.ts`, the same
 * module the unit spec drives, and the body is built there too.
 *
 * Problems are shown only after the first Create press: a coach who has not typed a
 * title yet is not in error, they are filling in a form.
 *
 * `rosterFailed`: the page's roster read failed. That is not "no linked clients", and
 * saying so would send a coach who has clients off to invite them again.
 */
export function CreateChallengeDialog({
  clients,
  rosterFailed = false,
}: {
  clients: InviteTarget[];
  rosterFailed?: boolean;
}) {
  const copy = useCopy();
  const c = copy.challenges;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ChallengeForm>(() => defaultChallengeForm(localToday(), copy.locale));
  const [attempted, setAttempted] = useState(false);
  const [server, setServer] = useState<{ field: ChallengeField | null; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { title: useId(), target: useId(), start: useId(), end: useId(), clients: useId(), form: useId() };

  function openDialog() {
    setForm(defaultChallengeForm(localToday(), copy.locale));
    setAttempted(false);
    setServer(null);
    setOpen(true);
  }

  function update(patch: Partial<ChallengeForm>) {
    setForm((f) => ({ ...f, ...patch }));
    setServer(null);
  }

  const problems = attempted ? checkChallenge(form, utcToday()) : [];
  function errorFor(field: ChallengeField): string | undefined {
    const local = problems.find((p) => p.field === field);
    if (local) return problemMessage(local, copy);
    if (server && server.field === field) return server.message;
    return undefined;
  }

  function submit() {
    setAttempted(true);
    const built = buildChallengeRequest(form, utcToday());
    if (!built.ok) return;
    startTransition(async () => {
      const result = await settled(createChallengeAction(built.body), {
        ok: false,
        failure: { code: "FAILED" },
      } as const);
      if (!result.ok) {
        setServer(challengeFailureMessage(result.failure, copy));
        return;
      }
      setOpen(false);
      router.push(`/challenges/${encodeURIComponent(result.id)}?created=1`);
    });
  }

  const selected = new Set(form.clientIds);
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ clientIds: clients.filter((t) => next.has(t.id)).map((t) => t.id) });
  }

  const span = daysBetween(form.startsOn, form.endsOn);
  const windowSummary =
    Number.isFinite(span) && span >= 0
      ? `${c.window(formatDate(form.startsOn, copy.locale), formatDate(form.endsOn, copy.locale))} · ${c.days(span + 1)}`
      : null;
  const clientsError = errorFor("clientIds");
  const formError = server && server.field === null ? server.message : null;

  return (
    <>
      <Button icon="plus" onClick={openDialog}>
        {c.create}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={c.dialogTitle}
        sub={c.dialogSub}
        icon="trophy"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {c.cancel}
            </Button>
            <Button onClick={submit} disabled={pending || clients.length === 0}>
              {pending ? c.submitting : c.submit}
            </Button>
          </>
        }
      >
        <form
          id={ids.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ display: "grid", gap: 16 }}
        >
          <Input
            label={c.titleLabel}
            ariaLabel={c.titleLabel}
            hintId={ids.title}
            value={form.title}
            placeholder={c.titlePlaceholder}
            error={errorFor("title")}
            onChange={(e) => update({ title: e.target.value })}
            full
          />

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
              {c.metricLabel}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink)" }}>{c.metricSteps}</div>
          </div>

          <Input
            label={c.targetLabel}
            ariaLabel={c.targetLabel}
            hintId={ids.target}
            value={form.dailyTarget}
            hint={c.targetHint(formatSteps(DAILY_TARGET_MIN, copy.locale), formatSteps(DAILY_TARGET_MAX, copy.locale))}
            error={errorFor("dailyTarget")}
            onChange={(e) => update({ dailyTarget: e.target.value })}
            full
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Input
              label={c.startLabel}
              ariaLabel={c.startLabel}
              hintId={ids.start}
              type="date"
              value={form.startsOn}
              error={errorFor("startsOn")}
              onChange={(e) => update({ startsOn: e.target.value })}
              full
            />
            <Input
              label={c.endLabel}
              ariaLabel={c.endLabel}
              hintId={ids.end}
              type="date"
              value={form.endsOn}
              error={errorFor("endsOn")}
              onChange={(e) => update({ endsOn: e.target.value })}
              full
            />
          </div>
          {/*
            The window in the page's language. A native date field is drawn in the BROWSER's
            locale, not the page's (an English Chrome shows 09/30/2026 on a French page), so
            the dialog restates the choice the way the rest of the portal prints dates.
          */}
          <p style={{ margin: "-8px 0 0", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
            {windowSummary && (
              <span data-testid="challenge-window" style={{ display: "block", color: "var(--ink-2)", fontWeight: 600 }}>
                {windowSummary}
              </span>
            )}
            {c.windowHint}
          </p>

          <fieldset
            aria-describedby={ids.clients}
            aria-invalid={clientsError ? true : undefined}
            style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
          >
            <legend style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7, padding: 0 }}>
              {c.clientsLabel}
            </legend>
            {clients.length === 0 ? (
              <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {rosterFailed ? c.clientsLoadError : c.noClients}
              </p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update({ clientIds: clients.map((t) => t.id) })}
                  >
                    {c.selectAll}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => update({ clientIds: [] })}>
                    {c.selectNone}
                  </Button>
                  <span aria-live="polite" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {c.selected(selected.size)}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                  {clients.map((t) => (
                    <li key={t.id}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minHeight: MIN_TOUCH_TARGET,
                          padding: "0 8px",
                          borderRadius: "var(--r-md)",
                          cursor: "pointer",
                          background: selected.has(t.id) ? "var(--blue-50)" : "transparent",
                          fontSize: 13.5,
                          color: "var(--ink)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                          style={{ width: 18, height: 18, flexShrink: 0 }}
                        />
                        <span style={{ overflowWrap: "anywhere" }}>{t.traineeDisplayName}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div
              id={ids.clients}
              role={clientsError ? "alert" : undefined}
              style={{ fontSize: 12, marginTop: 6, color: clientsError ? "var(--err)" : "var(--ink-3)" }}
            >
              {clientsError ?? c.clientsHint}
            </div>
          </fieldset>

          {formError && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--err-ink)", lineHeight: 1.5 }}>
              {formError}
            </p>
          )}
          {/* Enter in a text field submits, like any form; the visible button is in the footer. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </>
  );
}
