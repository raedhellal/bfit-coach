import { en, type Copy } from "../copy";
import { fr } from "../copy.fr";
import type { Locale } from "./locale";

/**
 * EV-324 — the one place a locale becomes a dictionary. Imported by the server accessor
 * (`getCopy`) and the client provider (`CopyProvider`), never by a component: a component
 * that imported `en` directly would be English in a French browser and nothing would say so.
 */
const DICTIONARIES: Record<Locale, Copy> = { en, fr };

export function copyFor(locale: Locale): Copy {
  return DICTIONARIES[locale] ?? en;
}
