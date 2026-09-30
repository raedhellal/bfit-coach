"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { truncateName } from "@/lib/format";
import { deleteRecipeAction } from "@/lib/recipeActions";
import { settled } from "@/lib/settled";
import { MEAL_SLOTS, effectiveSlots } from "@/lib/recipeDocument";
import type { CoachRecipeList, CoachRecipeSummary, MealSlot } from "@/lib/coachApi";

/**
 * EV-256b AC1 and AC5 — the coach's recipe library and its delete.
 *
 * A client island only because Delete is a dialog; nothing is fetched here. The list
 * arrives from the server component above and the one write goes back through a server
 * action. Edit is a LINK to the editor route (middle-clickable, in the browser's own
 * history), the same split as the template library.
 *
 * WHAT A ROW SHOWS: name, kcal, P/C/F and the ingredient count — AC1's list, and what
 * `CoachRecipeSummaryResponse` carries. There is no date on the row because the api
 * serves none (no timestamps on the recipe wire, EV-256a); the list is alphabetical.
 *
 * EV-320c: each row also carries its meal times, and the list can be filtered by one. Both
 * read `mealSlots` through `effectiveSlots`, so an UNTAGGED recipe (`null`) shows and
 * filters as Lunch + Dinner — what the week fill does with it — marked as the default.
 */
export function RecipeLibrary({ library }: { library: CoachRecipeList }) {
  const copy = useCopy();
  const router = useRouter();
  const [deleting, setDeleting] = useState<CoachRecipeSummary | null>(null);
  const [slot, setSlot] = useState<MealSlot | "ALL">("ALL");

  const count = library.recipes.length;
  const shown =
    slot === "ALL"
      ? library.recipes
      : library.recipes.filter((recipe) => effectiveSlots(recipe.mealSlots).includes(slot));
  const newRecipe = (
    <Button icon="plus" onClick={() => router.push("/recipes/new")}>
      {copy.recipes.create}
    </Button>
  );

  return (
    <div>
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
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}
          >
            {newRecipe}
            {/*
              AC1 — "{n} of 100 recipes", with the cap the api SERVES. At the cap the
              refusal sentence is shown beside it, BEFORE a 409 rather than only after.
            */}
            <span data-testid="recipe-count" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {copy.recipes.count(count, library.limit)}
            </span>
            {library.remaining === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--err-ink)" }}>
                {copy.recipes.limitReached(library.limit)}
              </span>
            )}
            {/*
              A separate <label for>, not a wrapping one: a wrapping label folds the
              selected option's text into the select's accessible name.
            */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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
          {shown.length === 0 && (
            // A filter that matches nothing is not an empty LIBRARY: the count above still
            // says how many recipes there are, and this says why none is listed.
            <Card>
              <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
                {copy.recipes.filterEmpty}
              </p>
            </Card>
          )}
          {/*
            BUG-244: `minmax(0, 1fr)`, not the implicit `auto` track. An auto track sizes to
            its widest item's min-content, which for a `nowrap` title is the WHOLE title:
            a 64-character name pushed the track 64 px past a 320 px viewport and clipped
            every card. A 0 minimum lets the track follow the viewport and the title
            ellipsise inside it.
          */}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 12,
            }}
          >
            {shown.map((recipe) => (
              <li key={recipe.id}>
                <RecipeRow recipe={recipe} onDelete={() => setDeleting(recipe)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <DeleteDialog
        recipe={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function RecipeRow({ recipe, onDelete }: { recipe: CoachRecipeSummary; onDelete: () => void }) {
  const copy = useCopy();
  return (
    <Card>
      {/*
        A named group per row: the two controls are otherwise two identical labels with
        nothing tying them to the recipe they act on — for a screen reader and for a
        test asserting "the Delete on THIS row".
      */}
      <div
        role="group"
        aria-label={recipe.name}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <div
            title={recipe.name}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {truncateName(recipe.name)}
          </div>
          <div
            style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-3)" }}
          >
            <span>{copy.recipes.macroLine(recipe.kcal, recipe.proteinG, recipe.carbsG, recipe.fatG)}</span>
            <span>{copy.recipes.ingredientCount(recipe.ingredientCount)}</span>
          </div>
          <SlotBadges mealSlots={recipe.mealSlots} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={`/recipes/${recipe.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: MIN_TOUCH_TARGET,
              padding: "0 14px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {copy.recipes.edit}
          </Link>
          <Button variant="ghost" size="sm" icon="trash" onClick={onDelete}>
            {copy.recipes.remove}
          </Button>
        </div>
      </div>
    </Card>
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
