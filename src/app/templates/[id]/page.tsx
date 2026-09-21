import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachTemplate } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /templates/[id] — AC2's Edit.
 *
 * Two failure states and they are NOT the same sentence:
 *   · 403 → `notYours`. The api answers ONE body for a foreign template, an id that
 *     never existed and one deleted in another tab (ADR-0012 D4), so the portal renders
 *     ONE sentence. Rendering three would turn the prefix into the existence oracle the
 *     api refuses to be, and a coach with a stale tab open on a template they deleted
 *     would be told it "belongs to another coach".
 *   · anything else → the load error. The api being down is not a statement about
 *     whose template this is.
 *
 * It is never a `notFound()`: a 404 page would say "this does not exist", which is
 * precisely the fact the 403 exists to withhold.
 */
export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: { id: string } }) {
  const [me, loaded] = await Promise.all([
    readCoachMe(),
    coachApi
      .getTemplate(params.id)
      .then((template): { template: CoachTemplate | null; forbidden: boolean } => ({
        template,
        forbidden: false,
      }))
      .catch((err: unknown) => ({ template: null, forbidden: isForbidden(err) })),
  ]);

  return (
    <CoachShell coachName={me?.displayName} section="templates">
      <PageHead
        title={loaded.template ? loaded.template.name : copy.templates.editTitle}
        sub={copy.templates.private}
        actions={
          <Link href="/templates" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {copy.templates.backToLibrary}
          </Link>
        }
      />
      {loaded.template ? (
        <TemplateEditor
          templateId={loaded.template.id}
          initial={{ name: loaded.template.name, document: loaded.template.document }}
        />
      ) : (
        <ClientNotice
          message={loaded.forbidden ? copy.templates.notYours : copy.templates.loadError}
        />
      )}
    </CoachShell>
  );
}
