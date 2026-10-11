import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachTemplate } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { blankTemplate } from "@/lib/templateDocument";
import { getCopy } from "@/lib/i18n/server";

/**
 * The training-template editor: the ONE route behind `/templates/new` and `/templates/{id}`
 * (BUG-739; the rewrites in `next.config.mjs` say why). The id arrives in the query: empty is
 * « New template » (AC1), anything else is AC2's Edit. EV-362 merged the two page modules this
 * route used to render into this file and deleted them; there is no `new/` or `[id]/` folder.
 *
 * One return for both branches: `CoachShell > TemplateEditor | fragment`. The editor sits at the
 * same element position whatever the id, so an id that changes (a create, then its first update)
 * reaches the SAME editor instance. A different record is a fresh editor all the same: the editor
 * re-keys itself on a new record (`useEditorIdentity`).
 *
 * A route rather than a modal on the library: this is the full routine editor, it can be a long
 * screen, and a coach who reloads it or shares the URL should land in the same place. The first
 * successful save POSTs and then corrects the URL to `/templates/{id}` without a remount, so Back
 * from the editor goes to the library and not to a "new" route that would create a second
 * template (see `TemplateEditor`).
 *
 * A new template reads nothing from the api. A blank template has no server state, and this page
 * is honest about that: until Save is pressed the document lives in the browser, because
 * ADR-0016 §Amendment V1b means the server will not hold a half-built one.
 *
 * An existing template has two failure states and they are NOT the same sentence:
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
 * EV-337i: the head (back link, h1, the unsaved pill) is drawn by the editor island, from the
 * props given here. On an existing template the h1 is its STORED name (the design titles the page
 * « Modifier le modèle »): it is the one thing on this page only a server render can change, and
 * qa/editor-save-no-refresh.spec.ts holds the update action's `revalidatePath` through it.
 *
 * `String(…)`: a repeated `?id=a&id=b` is an array, which becomes "a,b" and so reaches the
 * existing-record branch (the api refuses it: load error; read from the source, not run), never
 * the new one.
 */
export const dynamic = "force-dynamic";

type Loaded = { template: CoachTemplate | null; forbidden: boolean };

function loadTemplate(id: string): Promise<Loaded> {
  return coachApi
    .getTemplate(id)
    .then((template): Loaded => ({ template, forbidden: false }))
    .catch((err: unknown): Loaded => ({ template: null, forbidden: isForbidden(err) }));
}

export default async function TemplateEditorPage({ searchParams }: { searchParams: { id?: string | string[] } }) {
  const copy = getCopy();
  const id = String(searchParams.id ?? "");
  /** `null`: a new template, nothing to load. */
  const [me, loaded] = await Promise.all([readCoachMe(), id === "" ? null : loadTemplate(id)]);

  const back = <BackLink href="/templates" label={copy.templates.backToLibrary} flush />;
  return (
    <CoachShell coachName={me?.displayName} section="templates">
      {loaded === null ? (
        <TemplateEditor
          templateId={null}
          initial={blankTemplate(copy)}
          title={copy.templates.newTitle}
          sub={copy.templates.private}
          back={back}
        />
      ) : loaded.template ? (
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
          <ClientNotice message={loaded.forbidden ? copy.templates.notYours : copy.templates.loadError} />
        </>
      )}
    </CoachShell>
  );
}
