"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useCopy } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { LanguageSwitch } from "./LanguageSwitch";
import { SignOutButton } from "./SignOutButton";
import { ShellAvatar } from "./ShellAvatar";

/**
 * The account menu of the top bar (< 1024 px): the coach's name, the language switch and
 * sign-out, behind one 44 px avatar button. On the sidebar layout the same three things
 * are laid out openly at the foot of the sidebar instead (`CoachShell`).
 *
 * A DISCLOSURE (button + `aria-expanded` + a region it controls), not an ARIA `menu`: the
 * panel holds a radio group and a button, and `role="menu"` may only own menu items.
 * Escape closes it and puts focus back on the button. A press outside closes it, and so
 * does keyboard focus leaving it (Tab past "Sign out", Shift+Tab before the button):
 * an open panel left behind would cover the control that focus moved to (WCAG 2.4.11).
 */
export function AccountMenu({ coachName, locale }: { coachName?: string | null; locale: Locale }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        // React's onBlur is `focusout`, so it bubbles from the radios and the button inside.
        // `relatedTarget` is where focus went; null is "nowhere in the page" (a click on
        // plain text, the window losing focus) and is left to the pointer handler.
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="account-menu-trigger"
        aria-label={copy.shell.account}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <ShellAvatar name={coachName} />
      </button>
      {open && (
        <div id={panelId} role="region" aria-label={copy.shell.account} className="account-menu-panel">
          {coachName && (
            <p className="shell-account-name" style={{ margin: 0, padding: "4px 4px 0" }}>
              {coachName}
            </p>
          )}
          <LanguageSwitch locale={locale} />
          <SignOutButton block />
        </div>
      )}
    </div>
  );
}
