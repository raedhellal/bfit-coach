"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALE_SWITCH_ABANDONED, useCopy } from "@/lib/i18n/client";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";
import { LANGUAGE_NAMES, type Locale } from "@/lib/i18n/locale";
import { settled } from "@/lib/settled";

/**
 * FR / EN (redesign branch 1; Raed 2026-10-02: "a FR/EN language switch in the account
 * menu"). The choice is a cookie written by a server action, which re-renders the route —
 * `<html lang>` included — in the same response (see `setLocaleAction`).
 *
 * Two NATIVE radios in a `radiogroup`: one option is always in force and they exclude each
 * other; the native input brings the arrow keys and the checked state with no ARIA to keep
 * in sync. A `radiogroup` and not a `<fieldset>`: a fieldset is a `group`, and specs that
 * list a page's groups (template days, recipe rows) would find the chrome's among them.
 * Each label is a 44 px target. The visible text is the short code; the accessible name starts with it
 * and adds the language's own name, marked with its `lang` so a screen reader pronounces
 * « Français » in French on an English page.
 *
 * `locale` is the server's decision for this request; the radio follows it, and the
 * optimistic value only bridges the round trip.
 *
 * `inline` (EV-337k) is the shell-less pages' form — /login and /activate, as drawn under the
 * sign-in form: the two options centred, the legend visually hidden but still the group's
 * accessible name. The behaviour is the same switch.
 */
export function LanguageSwitch({ locale, inline = false }: { locale: Locale; inline?: boolean }) {
  const copy = useCopy();
  const name = useId();
  const labelId = `${name}-label`;
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Locale | null>(null);
  const [failed, setFailed] = useState(false);
  // BUG-686 follow-up: an option chosen before hydration is chosen, not just drawn checked.
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();
  const current = pending && chosen ? chosen : locale;

  // BUG-703: the dictionary loader abandoned the switch (its chunk failed over unsaved
  // work). The cookie is already back; say so in the same line a failed action uses.
  useEffect(() => {
    const onAbandoned = () => setFailed(true);
    window.addEventListener(LOCALE_SWITCH_ABANDONED, onAbandoned);
    return () => window.removeEventListener(LOCALE_SWITCH_ABANDONED, onAbandoned);
  }, []);

  function choose(next: Locale) {
    if (next === locale) return;
    setChosen(next);
    setFailed(false);
    startTransition(async () => {
      const result = await settled(setLocaleAction(next), { ok: false });
      // The radio falls back to the server's language by itself; say why it did.
      if (!result.ok) setFailed(true);
    });
  }

  return (
    <div
      ref={scope}
      className={inline ? "lang-switch lang-switch--inline" : "lang-switch"}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-busy={pending || undefined}
      data-testid="language-switch"
    >
      <span id={labelId} className={inline ? "sr-only" : "lang-switch-legend"}>
        {copy.shell.language}
      </span>
      <div className="lang-switch-options">
        {LOCALES_IN_ORDER.map((option) => (
          <label key={option} className="lang-switch-option">
            <input
              type="radio"
              name={name}
              value={option}
              checked={current === option}
              onChange={() => choose(option)}
            />
            <span className="lang-switch-face">
              {LANGUAGE_NAMES[option].short}
              <span className="sr-only">
                {" — "}
                <span lang={option}>{LANGUAGE_NAMES[option].name}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
      {/* Always in the DOM, so a screen reader announces the sentence when it appears. */}
      <p role="status" className="lang-switch-status">
        {failed ? copy.shell.languageFailed : null}
      </p>
    </div>
  );
}

/** French first, as drawn — it is the portal's default language. */
const LOCALES_IN_ORDER: readonly Locale[] = ["fr", "en"];
