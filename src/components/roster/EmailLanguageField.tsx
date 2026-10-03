"use client";

import { useId } from "react";
import { LANGUAGE_NAMES, type Locale } from "@/lib/i18n/locale";

/** French first, as the portal's own switch draws them. */
const LANGUAGE_ORDER: readonly Locale[] = ["fr", "en"];

/**
 * EV-204b — the invitation email's language: French or English, the two the api sends as
 * such (`InitialiseTraineeRequest.locale`; anything else goes out in English). The api does
 * not store it, so Resend asks again. Defaults to the portal's language.
 *
 * The language switch's look (`.lang-switch`), with each language named in itself and
 * marked with its `lang`, so a screen reader says « Français » in French on an English page.
 */
export function EmailLanguageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Locale;
  onChange: (next: Locale) => void;
}) {
  const labelId = useId();
  const name = useId();
  return (
    <div className="lang-switch" role="radiogroup" aria-labelledby={labelId}>
      <span id={labelId} className="lang-switch-legend">
        {label}
      </span>
      <div className="lang-switch-options">
        {LANGUAGE_ORDER.map((option) => (
          <label key={option} className="lang-switch-option">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span className="lang-switch-face" lang={option}>
              {LANGUAGE_NAMES[option].name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
