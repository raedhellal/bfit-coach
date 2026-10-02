import { UiIcon } from "@/components/ui/icons";

/**
 * The coach's initials in the shell, as drawn: 30 px, `--blue-50` with `--link` text
 * (4.65:1). Decorative — the name is always said next to it or by the control around it.
 * Without a name (a page that did not read `/me`) it is a person glyph, never invented
 * initials.
 */
export function ShellAvatar({ name }: { name?: string | null }) {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: "var(--blue-50)",
        color: "var(--link)",
        display: "grid",
        placeItems: "center",
        flex: "none",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 11,
      }}
    >
      {initials || <UiIcon name="user" size={16} />}
    </span>
  );
}
