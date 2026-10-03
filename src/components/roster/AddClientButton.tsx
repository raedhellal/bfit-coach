"use client";

import { useId, useState, useTransition } from "react";
import { Button, Input, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { settled } from "@/lib/settled";
import { formatExpiryUtc } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { addClientAction } from "@/lib/addClientActions";
import {
  checkAddClient,
  retryMinutes,
  type AddClientFailure,
  type AddClientField,
  type AddedClient,
} from "@/lib/addClient";
import type { Copy } from "@/lib/copy";
import { InviteLinkPanel } from "./InviteLinkPanel";
import { EmailLanguageField } from "./EmailLanguageField";

/**
 * EV-204b — « Ajouter un client »: ONE action, two branches decided by the api's answer.
 *
 *   · a new address → `201`: the account exists as PENDING, the api emails the temporary
 *     password, and the dialog says what happens next (`done`);
 *   · an address that already has an Evoli account, active or pending → `409
 *     ACCOUNT_EXISTS` → AC-P8's sentence, and the invite branch: an invite link and its QR,
 *     the same panel « Inviter un client » opens (`invite`). The api has no addressed
 *     invite, so the portal says "share a link", never "we emailed them".
 *
 * Everything else is a refusal in words (`failureLine`). The one write is the server
 * action; nothing is fetched here. 🔴 AC-P9: no state, prop or result in this file can
 * hold a temporary password — the action's result type has none.
 *
 * The name and the address are another person's, typed by the coach, so the browser is
 * told not to autofill them (`autoComplete="off"`).
 */
type Stage = "form" | "done" | "invite";

function outcomeOf(failure: AddClientFailure): "exists" | "profile_required" | "throttled" | "unavailable" | "invalid" | "unknown" {
  switch (failure.code) {
    case "EXISTS":
      return "exists";
    case "PROFILE_REQUIRED":
      return "profile_required";
    case "THROTTLED":
      return "throttled";
    case "UNAVAILABLE":
      return "unavailable";
    case "INVALID":
      return "invalid";
    case "UNKNOWN":
      return "unknown";
  }
}

/** The sentence for a refusal that is not about one field. `null` = said beside a field. */
function failureLines(failure: AddClientFailure, name: string, copy: Copy): string[] | null {
  const c = copy.addClient;
  switch (failure.code) {
    case "EXISTS":
      return [c.exists, c.existsHow];
    case "PROFILE_REQUIRED":
      return [c.profileRequired, c.profileHow];
    case "THROTTLED":
      return [failure.retryAfterSeconds ? c.throttled(retryMinutes(failure.retryAfterSeconds)) : c.throttledNoTime];
    case "UNAVAILABLE":
      return [c.unavailable];
    case "INVALID":
      return failure.field ? null : [c.invalid];
    case "UNKNOWN":
      return [c.unknown(name.trim() || c.nameLabel)];
  }
}

export function AddClientButton({
  capacityNote,
  inviteDisabledReason,
}: {
  /** Set when every profile the tier allows is in use: the account can still be set up. */
  capacityNote?: string;
  /** The sentence the invite branch shows if the api refuses an invite for capacity. */
  inviteDisabledReason?: string;
}) {
  const copy = useCopy();
  const c = copy.addClient;
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<Locale>(copy.locale);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<AddClientFailure | null>(null);
  const [added, setAdded] = useState<AddedClient | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { name: useId(), email: useId(), form: useId() };

  function openDialog() {
    setStage("form");
    setFullName("");
    setEmail("");
    setLocale(copy.locale);
    setAttempted(false);
    setFailure(null);
    setAdded(null);
    setOpen(true);
  }

  const problems = attempted ? checkAddClient({ fullName, email }) : [];
  function fieldError(field: AddClientField): string | undefined {
    const local = problems.find((p) => p.field === field);
    if (local) return c.problems[local.problem];
    if (failure?.code === "INVALID" && failure.field === field) {
      return field === "email" ? c.problems.emailInvalid : c.problems.nameInvisible;
    }
    return undefined;
  }

  function submit() {
    if (pending) return;
    setAttempted(true);
    if (checkAddClient({ fullName, email }).length > 0) return;
    setFailure(null);
    startTransition(async () => {
      const result = await settled(addClientAction({ fullName, email, locale }), {
        ok: false,
        failure: { code: "UNKNOWN" },
      } as const);
      if (result.ok) {
        logPortalEvent({ event: "coach_client_add", outcome: "initialised" });
        setAdded(result.added);
        setStage("done");
        return;
      }
      logPortalEvent({ event: "coach_client_add", outcome: outcomeOf(result.failure) });
      setFailure(result.failure);
    });
  }

  const lines = failure ? failureLines(failure, fullName, copy) : null;
  const title = stage === "invite" ? copy.invite.title : stage === "done" ? c.doneTitle : c.title;
  const sub = stage === "invite" ? copy.invite.subtitle : stage === "done" ? undefined : c.sub;

  const footer =
    stage === "form" ? (
      <>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {c.cancel}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? c.submitting : c.submit}
        </Button>
      </>
    ) : stage === "invite" ? (
      <>
        <Button variant="secondary" onClick={() => setStage("form")}>
          {c.back}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {copy.invite.close}
        </Button>
      </>
    ) : (
      <Button onClick={() => setOpen(false)}>{c.doneClose}</Button>
    );

  return (
    <>
      <Button variant="gradient" icon="plus" onClick={openDialog}>
        {c.button}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        sub={sub}
        icon={stage === "done" ? "check" : "users"}
        width={stage === "invite" ? 460 : 520}
        footer={footer}
      >
        {stage === "done" && added && (
          <div role="status" data-add-client-done="" style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>
              {c.done(added.fullName, added.email)}
            </p>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              {c.doneNext(formatExpiryUtc(added.expiresAt, copy.locale))}
            </p>
          </div>
        )}

        {stage === "invite" && <InviteLinkPanel disabledReason={inviteDisabledReason} />}

        {stage === "form" && (
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
              label={c.nameLabel}
              ariaLabel={c.nameLabel}
              hintId={ids.name}
              value={fullName}
              hint={c.nameHint}
              error={fieldError("fullName")}
              autoComplete="off"
              autoFocus
              onChange={(e) => {
                setFullName(e.target.value);
                setFailure(null);
              }}
              full
            />
            <Input
              label={c.emailLabel}
              ariaLabel={c.emailLabel}
              hintId={ids.email}
              type="email"
              value={email}
              placeholder={c.emailPlaceholder}
              error={fieldError("email")}
              autoComplete="off"
              onChange={(e) => {
                setEmail(e.target.value);
                setFailure(null);
              }}
              full
            />

            <EmailLanguageField label={c.languageLabel} value={locale} onChange={setLocale} />

            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{c.howItWorks}</p>
            {capacityNote && (
              <p data-add-client-capacity="" style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
                {capacityNote}
              </p>
            )}

            {lines && (
              <div
                role="alert"
                data-add-client-refusal={failure?.code}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "11px 13px",
                  borderRadius: "var(--r-md)",
                  background: failure?.code === "EXISTS" ? "var(--info-bg)" : "var(--err-bg)",
                  color: failure?.code === "EXISTS" ? "var(--info-ink)" : "var(--err-ink)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                {failure?.code === "EXISTS" && (
                  <span>
                    <Button variant="secondary" icon="send" onClick={() => setStage("invite")}>
                      {c.existsAction}
                    </Button>
                  </span>
                )}
              </div>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
