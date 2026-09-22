import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { blankTemplate } from "@/lib/templateDocument";
import { copy } from "@/lib/copy";

/**
 * /templates/new — AC1's "New template".
 *
 * A route rather than a modal on the library: this is the full routine editor, it can
 * be a long screen, and a coach who reloads it or shares the URL should land in the
 * same place. The first successful save POSTs and then REPLACES the URL with
 * `/templates/{id}` — `replace`, not `push`, so Back from the editor goes to the
 * library and not to a "new" route that would create a second template.
 *
 * Nothing is read from the api here. A blank template has no server state, and this
 * page exists to be honest about that: until Save is pressed the document lives in the
 * browser, because ADR-0016 §Amendment V1b means the server will not hold a half-built
 * one.
 */
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName} section="templates">
      <PageHead
        title={copy.templates.newTitle}
        sub={copy.templates.private}
        actions={
          <Link href="/templates" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.templates.backToLibrary}
          </Link>
        }
      />
      <TemplateEditor templateId={null} initial={blankTemplate()} />
    </CoachShell>
  );
}
