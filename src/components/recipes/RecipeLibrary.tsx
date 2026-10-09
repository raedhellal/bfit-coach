"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { useCopy } from "@/lib/i18n/client";
import { truncateName } from "@/lib/format";
import { deleteRecipeAction } from "@/lib/recipeActions";
import { settled } from "@/lib/settled";
import { MEAL_SLOTS, effectiveSlots } from "@/lib/recipeDocument";
import { matchesSearch, searchKey } from "@/lib/rosterView";
import type { CoachRecipeList, CoachRecipeSummary, MealSlot } from "@/lib/coachApi";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";

/**
 * EV-256b AC1 and AC5 — the coach's recipe library and its delete.
 *
 * A client island only because Delete is a dialog and the list is narrowed in the browser;
 * nothing is fetched here. The list arrives from the server component above and the one
 * write goes back through a server action. Edit is a LINK to the editor route
 * (middle-clickable, in the browser's own history), the same split as the template library.
 *
 * WHAT A ROW SHOWS: name, kcal, P/C/F and the ingredient count — AC1's list, and what
 * `CoachRecipeSummaryResponse` carries. There is no date on the row because the api
 * serves none (no timestamps on the recipe wire, EV-256a); the list is alphabetical.
 *
 * EV-320c: each row also carries its meal times, and the list can be filtered by one. Both
 * read `mealSlots` through `effectiveSlots`, so an UNTAGGED recipe (`null`) shows and
 * filters as Lunch + Dinner — what the week fill does with it — marked as the default.
 *
 * EV-337j2 (plan §5.9, story J2.1–J2.3) — the redesign of this list, EV-337i's pattern:
 *   · one card of rows from 768 px, one card per recipe below it (CSS decides; the
 *     `.tpl-*` list classes are shared with the training-template library);
 *   · a search over the names the api listed, in the browser, case- and accent-insensitive
 *     (the roster's `searchKey`), AND-ed with the meal-time filter. Typing sends nothing:
 *     the list is already here, and the api has no name query to send it to;
 *   · when the search leaves nothing, J2.2's sentence quoting the query, and a control that
 *     clears it. A meal time with no recipe keeps its own sentence (`filterEmpty`) even
 *     while a search is typed: that is the true reason the list is empty.
 * Not drawn (R8, plan §7 G16/G17): a photo or its placeholder, tags and a tag filter,
 * portions, prep time, a usage count. The api serves none of them.
 */
export function RecipeLibrary({ library }: { library: CoachRecipeList }) {
  const copy = useCopy();
  const router = useRouter();
  const [deleting, setDeleting] = useState<CoachRecipeSummary | null>(null);
  const [slot, setSlot] = useState<MealSlot | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  // BUG-686 follow-up: what was typed into the server HTML before hydration reaches state.
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();

  const count = library.recipes.length;
  const forSlot =
    slot === "ALL"
      ? library.recipes
      : library.recipes.filter((recipe) => effectiveSlots(recipe.mealSlots).includes(slot));
  const shown = forSlot.filter((recipe) => matchesSearch(searchKey(recipe.name), query));
  const newRecipe = (
    <Button
      icon="plus"
      onClick={() => {
        // EV-342a: no `loading.tsx` above `/recipes/new` any more; the bar covers a slow render.
        startNavigationProgress("/recipes/new");
        router.push("/recipes/new");
      }}
    >
      {copy.recipes.create}
    </Button>
  );

  return (
    <div ref={scope}>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.recipes.private}
      </p>

      {count === 0 ? (
        // AC1 — "No recipes yet." and a New recipe button. Never a blank page.
        <Card>
          <EmptyState
            icon="file"
            title={copy.recipes.emptyTitle}
            sub={copy.recipes.emptyBody}
            action={newRecipe}
          />
        </Card>
      ) : (
        <>
          <div className="rcp-head-line">
            {newRecipe}
            {/*
              AC1 — "{n} of 100 recipes", with the cap the api SERVES. At the cap the
              refusal sentence is shown beside it, BEFORE a 409 rather than only after.
              The count is the LIBRARY's, never what a filter or a search left.
            */}
            <span data-testid="recipe-count" className="tpl-count">
              {copy.recipes.count(count, library.limit)}
            </span>
            {library.remaining === 0 && (
              <span className="tpl-count" data-full="">
                {copy.recipes.limitReached(library.limit)}
              </span>
            )}
          </div>
          <div className="tpl-toolbar">
            <label className="roster-search rcp-search" htmlFor={searchId}>
              <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--ink-3)" }}>
                <UiIcon name="search" size={17} />
              </span>
              <span className="sr-only">{copy.recipes.librarySearch}</span>
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.recipes.librarySearch}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {/*
              A separate <label for>, not a wrapping one: a wrapping label folds the
              selected option's text into the select's accessible name.
            */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%" }}>
              <label
                htmlFor="recipe-slot-filter"
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}
              >
                {copy.recipes.filterLabel}
              </label>
              <select
                id="recipe-slot-filter"
                value={slot}
                onChange={(e) => setSlot(e.target.value as MealSlot | "ALL")}
                style={{
                  height: MIN_TOUCH_TARGET,
                  minWidth: 0,
                  maxWidth: "100%",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  padding: "0 10px",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  color: "var(--ink)",
                }}
              >
                <option value="ALL">{copy.recipes.filterAll}</option>
                {MEAL_SLOTS.map((value) => (
                  <option key={value} value={value}>
                    {copy.nutrition.mealSlots[value] ?? value}
                  </option>
                ))}
              </select>
            </span>
          </div>

          {forSlot.length === 0 ? (
            // A filter that matches nothing is not an empty LIBRARY: the count above still
            // says how many recipes there are, and this says why none is listed.
            <div className="tpl-list">
              <div className="tpl-nomatch tpl-nomatch-card">
                <p role="status" className="rcp-nomatch-text">
                  {copy.recipes.filterEmpty}
                </p>
              </div>
            </div>
          ) : shown.length === 0 ? (
            // J2.2 — the search left nothing: say so, quoting what was typed (trimmed).
            <div className="tpl-list">
              <div className="tpl-nomatch tpl-nomatch-card">
                <p role="status" className="rcp-nomatch-text">
                  {copy.recipes.noMatch(query.trim())}
                </p>
                {/* This button unmounts itself; focus goes back to the field, not to <body>. */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  {copy.templateLibrary.clearSearch}
                </Button>
              </div>
            </div>
          ) : (
            /*
              BUG-244: every track and flex item that holds a name has a 0 minimum (`min-width:
              0` in `.tpl-*`), so a 64-character title ellipsises instead of widening the page.
            */
            <ul className="tpl-list">
              {shown.map((recipe) => (
                <li key={recipe.id} className="tpl-item">
                  <RecipeRow recipe={recipe} onDelete={() => setDeleting(recipe)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <DeleteDialog
        recipe={deleting}
        onClose={() => setDeleting(null)}
        // No `router.refresh()` (ADR-0033 branch 2a): `deleteRecipeAction` revalidates.
        onDone={() => setDeleting(null)}
      />
    </div>
  );
}

function RecipeRow({ recipe, onDelete }: { recipe: CoachRecipeSummary; onDelete: () => void }) {
  const copy = useCopy();
  return (
    /*
      A named group per row: the two controls are otherwise two identical labels with
      nothing tying them to the recipe they act on — for a screen reader and for a
      test asserting "the Delete on THIS row".
    */
    <div role="group" aria-label={recipe.name} className="tpl-row">
      <div className="tpl-row-id">
        <div className="tpl-row-name" title={recipe.name}>
          {truncateName(recipe.name)}
        </div>
        <p className="tpl-row-meta rcp-row-meta">
          <span>{copy.recipes.macroLine(recipe.kcal, recipe.proteinG, recipe.carbsG, recipe.fatG)}</span>
          <span>{copy.recipes.ingredientCount(recipe.ingredientCount)}</span>
        </p>
        <SlotBadges mealSlots={recipe.mealSlots} />
      </div>
      <div className="tpl-row-actions">
        <Link href={`/recipes/${recipe.id}`} className="link-button" data-variant="secondary">
          {copy.recipes.edit}
        </Link>
        <Button variant="dangerSoft" size="sm" icon="trash" onClick={onDelete}>
          {copy.recipes.remove}
        </Button>
      </div>
    </div>
  );
}

/**
 * EV-320c — a row's meal times. Tagged: one badge per slot, in the api's order. UNTAGGED
 * (`null`): ONE badge naming what the fill uses it for, "Lunch, Dinner (default)" — never
 * nothing, and never read as an empty list. `data-slots` / `data-default` state the drawn
 * value for a spec (a badge row is otherwise asserted by its words only).
 */
function SlotBadges({ mealSlots }: { mealSlots: MealSlot[] | null }) {
  const copy = useCopy();
  const labels = copy.nutrition.mealSlots;
  const untagged = mealSlots === null;
  const slots = effectiveSlots(mealSlots);
  return (
    <ul
      aria-label={copy.recipes.slotsHeading}
      data-testid="recipe-slots"
      data-slots={slots.join(",")}
      data-default={untagged ? "true" : "false"}
      style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}
    >
      {untagged ? (
        <li>
          <Badge title={copy.recipes.slotsDefaultTitle}>
            {copy.recipes.slotsDefault(labels.LUNCH ?? "LUNCH", labels.DINNER ?? "DINNER")}
          </Badge>
        </li>
      ) : (
        slots.map((slot) => (
          <li key={slot}>
            <Badge tone="blue">{labels[slot] ?? slot}</Badge>
          </li>
        ))
      )}
    </ul>
  );
}

/**
 * AC5 — the confirm, verbatim, naming the recipe and stating default D-f in the same
 * breath: a meal already placed is a snapshot and is not touched by the delete.
 */
function DeleteDialog({
  recipe,
  onClose,
  onDone,
}: {
  recipe: CoachRecipeSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const copy = useCopy();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [seeded, setSeeded] = useState<string | null>(null);

  // A fresh dialog per recipe: an error from the previous opening is not about this one.
  if (recipe && seeded !== recipe.id) {
    setSeeded(recipe.id);
    setError(null);
  }
  if (!recipe && seeded !== null) setSeeded(null);

  function submit() {
    if (!recipe) return;
    startTransition(async () => {
      const result = await settled(deleteRecipeAction(recipe.id), {
        ok: false,
        failure: { code: "FAILED", field: null, key: null, computedKcal: null },
      } as const);
      if (!result.ok) {
        // A 403 here is a recipe already deleted in another tab: say so rather than
        // "could not be deleted", which would invite a retry that cannot succeed.
        setError(
          result.failure.code === "ACCESS_DENIED" ? copy.recipes.notYours : copy.recipes.deleteFailed
        );
        return;
      }
      onDone();
    });
  }

  return (
    <Modal
      dirty={false}
      open={recipe !== null}
      onClose={() => !pending && onClose()}
      title={copy.recipes.deleteTitle}
      icon="trash"
      iconTone="red"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {copy.recipes.cancel}
          </Button>
          <Button variant="danger" onClick={submit} disabled={pending}>
            {copy.recipes.remove}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, overflowWrap: "anywhere" }}>
        {recipe ? copy.recipes.deleteBody(recipe.name) : ""}
      </p>
      {error && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
