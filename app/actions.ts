"use server";

import { generateId } from "@/lib/helpers";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  LibraryIngredient,
  Recipe,
  RecipeImportPayload,
  ShoppingItem,
  WeekBucket,
  WeekItem,
} from "@/lib/types";

type RecipeRow = {
  id: string;
  name: string;
  category: string;
  servings: number;
  ingredients: Recipe["ingredients"];
  instructions: string;
  source_url: string | null;
  prep_steps: string | null;
};

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    servings: row.servings,
    ingredients: row.ingredients,
    instructions: row.instructions,
    sourceUrl: row.source_url ?? null,
    prepSteps: row.prep_steps ?? "",
  };
}

function rowToShoppingItem(row: {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  recipe_names: string[] | null;
  checked: boolean;
}): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    recipes: row.recipe_names || [],
    checked: row.checked,
  };
}

export async function saveRecipeAction(recipe: Recipe): Promise<Recipe> {
  const supabase = createAdminClient();
  const payload = {
    name: recipe.name,
    category: recipe.category,
    servings: Number(recipe.servings) || 1,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    source_url: recipe.sourceUrl?.trim() || null,
    prep_steps: recipe.prepSteps ?? "",
  };

  const query = recipe.id
    ? supabase.from("recipes").update(payload).eq("id", recipe.id)
    : supabase.from("recipes").insert(payload);

  const { data, error } = await query.select().single<RecipeRow>();
  if (error || !data) throw new Error(error?.message || "Failed to save recipe.");

  return rowToRecipe(data);
}

export async function deleteRecipeAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function syncShoppingListAction(
  items: ShoppingItem[]
): Promise<ShoppingItem[]> {
  const supabase = createAdminClient();

  // Only wipe recipe-derived items — manually/quick-added items are left
  // alone so rebuilding the list from the meal plan doesn't erase them.
  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("source", "recipe");
  if (deleteError) throw new Error(deleteError.message);

  if (items.length > 0) {
    const payload = items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      recipe_names: item.recipes,
      checked: item.checked,
      source: "recipe",
    }));

    const { error: insertError } = await supabase.from("shopping_list_items").insert(payload);
    if (insertError) throw new Error(insertError.message);
  }

  const { data, error } = await supabase.from("shopping_list_items").select("*").order("name");
  if (error) throw new Error(error.message);

  return (data || []).map(rowToShoppingItem);
}

export async function addManualShoppingItemAction(name: string): Promise<ShoppingItem> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert({ name: name.trim(), quantity: 1, unit: "", recipe_names: [], checked: false, source: "manual" })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to add item.");
  return rowToShoppingItem(data);
}

export async function toggleShoppingItemAction(
  id: string,
  checked: boolean
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteShoppingItemsAction(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("shopping_list_items").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

// The ingredients table still carries the old macro/unit-conversion
// columns (all with defaults); only name and pantry_staple are read or
// written any more.
type IngredientLibraryRow = {
  id: string;
  name: string;
  pantry_staple: boolean;
};

type LibraryIngredientInput = {
  name: string;
  pantryStaple: boolean;
};

function rowToLibraryIngredient(row: IngredientLibraryRow): LibraryIngredient {
  return {
    id: row.id,
    name: row.name,
    pantryStaple: Boolean(row.pantry_staple),
  };
}

function libraryIngredientPayload(input: LibraryIngredientInput) {
  return {
    pantry_staple: input.pantryStaple,
  };
}

export async function saveLibraryIngredientAction(
  input: LibraryIngredientInput
): Promise<LibraryIngredient> {
  const supabase = createAdminClient();
  const name = input.name.trim();
  const payload = libraryIngredientPayload(input);

  const { data: existing, error: findError } = await supabase
    .from("ingredients")
    .select("*")
    .ilike("name", name)
    .maybeSingle<IngredientLibraryRow>();
  if (findError) throw new Error(findError.message);

  const query = existing
    ? supabase.from("ingredients").update(payload).eq("id", existing.id)
    : supabase.from("ingredients").insert({ name, ...payload });

  const { data, error } = await query.select().single<IngredientLibraryRow>();
  if (error || !data) throw new Error(error?.message || "Failed to save ingredient.");

  return rowToLibraryIngredient(data);
}

export async function updateLibraryIngredientAction(
  id: string,
  input: LibraryIngredientInput
): Promise<LibraryIngredient> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingredients")
    .update({ name: input.name.trim(), ...libraryIngredientPayload(input) })
    .eq("id", id)
    .select()
    .single<IngredientLibraryRow>();
  if (error || !data) throw new Error(error?.message || "Failed to update ingredient.");

  return rowToLibraryIngredient(data);
}

export async function deleteLibraryIngredientAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Imports a recipe payload (from the in-app Claude parser or a hand-written
// JSON upload): creates any brand-new library ingredients first, resolves
// the recipe's newIngredientRef placeholders to their real ids, then saves
// the recipe — all in one call so the two can't end up half-done relative
// to each other (see RecipeImportPayload).
export async function importRecipeAction(
  payload: RecipeImportPayload
): Promise<{ recipe: Recipe; newIngredients: LibraryIngredient[] }> {
  const refToId = new Map<string, string>();
  const createdIngredients: LibraryIngredient[] = [];

  for (const newIng of payload.newIngredients) {
    const saved = await saveLibraryIngredientAction({
      name: newIng.name,
      pantryStaple: newIng.pantryStaple ?? false,
    });
    refToId.set(newIng.ref, saved.id);
    createdIngredients.push(saved);
  }

  // Never trust the payload's own "id" values as unique — a hand-written
  // file has no way to guarantee that, and a
  // collision (seen in practice: multiple rows with id null) breaks React's
  // key uniqueness once rendered. Every other way of creating an ingredient
  // row in this app calls generateId() itself rather than accepting a
  // caller-supplied id; imported rows get the same treatment here.
  const ingredients: Recipe["ingredients"] = payload.recipe.ingredients.map((ing) => {
    const { newIngredientRef, ...rest } = ing;
    const resolvedLibraryId = newIngredientRef ? refToId.get(newIngredientRef) ?? null : ing.libraryId ?? null;
    return { ...rest, id: generateId(), libraryId: resolvedLibraryId };
  });

  const recipe = await saveRecipeAction({
    id: "",
    name: payload.recipe.name,
    category: payload.recipe.category,
    servings: payload.recipe.servings,
    instructions: payload.recipe.instructions,
    ingredients,
    sourceUrl: payload.recipe.sourceUrl ?? null,
    prepSteps: payload.recipe.prepSteps ?? "",
  });

  return { recipe, newIngredients: createdIngredients };
}

// ---------- "This week" buckets ----------

export async function addWeekItemAction(bucket: WeekBucket, recipeId: string): Promise<WeekItem> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("week_items")
    .upsert({ bucket, recipe_id: recipeId }, { onConflict: "bucket,recipe_id" })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "Couldn't add that recipe to the week.");
  return { id: data.id, bucket: data.bucket, recipeId: data.recipe_id };
}

export async function removeWeekItemAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("week_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Clears the week's buckets and the recipe-derived shopping items. Items
// added by hand ("manual") are left alone — same rule as a list rebuild.
export async function startNewWeekAction(): Promise<ShoppingItem[]> {
  const supabase = createAdminClient();
  const { error: weekError } = await supabase.from("week_items").delete().not("id", "is", null);
  if (weekError) throw new Error(weekError.message);
  const { error: listError } = await supabase.from("shopping_list_items").delete().eq("source", "recipe");
  if (listError) throw new Error(listError.message);
  const { data, error } = await supabase.from("shopping_list_items").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data || []).map(rowToShoppingItem);
}
