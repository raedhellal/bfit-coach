"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { truncateName } from "@/lib/format";
import { deleteRecipeAction } from "@/lib/recipeActions";
import { settled } from "@/lib/settled";
import type { CoachRecipeList, CoachRecipeSummary } from "@/lib/coachApi";

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
 */
export function RecipeLibrary({ library }: { library: CoachRecipeList }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<CoachRecipeSummary | null>(null);

  const count = library.recipes.length;
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
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {library.recipes.map((recipe) => (
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
