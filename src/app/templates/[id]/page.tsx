import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachTemplate } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

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
 *
 * EV-337i: the h1 stays the template's STORED name (the design titles the page « Modifier
 * le modèle »): it is the one thing on this page only a server render can change, and
 * qa/editor-save-no-refresh.spec.ts holds the update action's `revalidatePath` through it.
 */
export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: { id: string } }) {
  const copy = getCopy();
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

  const back = <BackLink href="/templates" label={copy.templates.backToLibrary} flush />;
  return (
    <CoachShell coachName={me?.displayName} section="templates">
      {loaded.template ? (
        <TemplateEditor
          templateId={loaded.template.id}
          initial={{ name: loaded.template.name, document: loaded.template.document }}
          title={loaded.template.name}
          sub={copy.templates.private}
          back={back}
        />
      ) : (
        <>
          {back}
          <PageHead title={copy.templates.editTitle} sub={copy.templates.private} />
          <ClientNotice
            message={loaded.forbidden ? copy.templates.notYours : copy.templates.loadError}
          />
        </>
      )}
    </CoachShell>
  );
}
