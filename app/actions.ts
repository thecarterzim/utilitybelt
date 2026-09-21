"use server";

import { generateId } from "@/lib/helpers";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  CustomMeal,
  DailyExtra,
  IngredientBaseUnit,
  LibraryIngredient,
  MealPlan,
  MealSlot,
  Recipe,
  RecipeImportPayload,
  ShoppingItem,
  VolumeUnit,
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

export async function assignMealAction(
  date: string,
  slot: MealSlot,
  recipeId: string,
  flexSelection: string[] | null
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .upsert(
      { date, slot, recipe_id: recipeId, custom_meal: null, flex_selection: flexSelection, eaten: false },
      { onConflict: "date,slot" }
    );
  if (error) throw new Error(error.message);
}

export async function assignCustomMealAction(
  date: string,
  slot: MealSlot,
  custom: CustomMeal
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .upsert(
      { date, slot, recipe_id: null, custom_meal: custom, flex_selection: null, eaten: false },
      { onConflict: "date,slot" }
    );
  if (error) throw new Error(error.message);
}

export async function setMealEatenAction(
  date: string,
  slot: MealSlot,
  eaten: boolean
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .update({ eaten })
    .eq("date", date)
    .eq("slot", slot);
  if (error) throw new Error(error.message);
}

export async function updateFlexSelectionAction(
  date: string,
  slot: MealSlot,
  flexSelection: string[]
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .update({ flex_selection: flexSelection })
    .eq("date", date)
    .eq("slot", slot);
  if (error) throw new Error(error.message);
}

export async function clearMealAction(date: string, slot: MealSlot): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .delete()
    .eq("date", date)
    .eq("slot", slot);
  if (error) throw new Error(error.message);
}

type MealPlanRow = {
  date: string;
  slot: MealSlot;
  recipe_id: string | null;
  custom_meal: CustomMeal | null;
  flex_selection: string[] | null;
  eaten: boolean | null;
};

// Drag-to-move (or click-to-swap) a meal-plan cell onto another one. Moves
// into an empty target; swaps both ways if the target is already occupied —
// never silently overwrites a planned meal. Not a real DB transaction (this
// project's Supabase client doesn't have one available) but is a single
// server round trip from the client's perspective, matching the same
// non-transactional-but-one-call pattern already used by
// syncShoppingListAction's delete-then-insert.
export async function moveMealSlotAction(
  from: { date: string; slot: MealSlot },
  to: { date: string; slot: MealSlot }
): Promise<void> {
  const supabase = createAdminClient();

  const { data: fromRow, error: fromError } = await supabase
    .from("meal_plan")
    .select("*")
    .eq("date", from.date)
    .eq("slot", from.slot)
    .maybeSingle<MealPlanRow>();
  if (fromError) throw new Error(fromError.message);
  if (!fromRow) throw new Error("There's nothing in that slot to move.");

  const { data: toRow, error: toError } = await supabase
    .from("meal_plan")
    .select("*")
    .eq("date", to.date)
    .eq("slot", to.slot)
    .maybeSingle<MealPlanRow>();
  if (toError) throw new Error(toError.message);

  const { error: writeToError } = await supabase.from("meal_plan").upsert(
    {
      date: to.date,
      slot: to.slot,
      recipe_id: fromRow.recipe_id,
      custom_meal: fromRow.custom_meal,
      flex_selection: fromRow.flex_selection,
      eaten: fromRow.eaten ?? false,
    },
    { onConflict: "date,slot" }
  );
  if (writeToError) throw new Error(writeToError.message);

  if (toRow) {
    const { error: writeFromError } = await supabase.from("meal_plan").upsert(
      {
        date: from.date,
        slot: from.slot,
        recipe_id: toRow.recipe_id,
        custom_meal: toRow.custom_meal,
        flex_selection: toRow.flex_selection,
        eaten: toRow.eaten ?? false,
      },
      { onConflict: "date,slot" }
    );
    if (writeFromError) throw new Error(writeFromError.message);
  } else {
    const { error: deleteError } = await supabase
      .from("meal_plan")
      .delete()
      .eq("date", from.date)
      .eq("slot", from.slot);
    if (deleteError) throw new Error(deleteError.message);
  }
}

// The initial page load only fetches meal-plan/extras data for a padded
// window around today (see lib/server/get-app-data.ts) — paging Meal Plan
// to a week outside that window needs its own fetch. Called on demand by
// the client and merged into its already-loaded state.
export async function getMealPlanRangeAction(
  start: string,
  end: string
): Promise<{ mealPlan: MealPlan; dailyExtras: DailyExtra[] }> {
  const supabase = createAdminClient();

  const [mealPlanRes, extrasRes] = await Promise.all([
    supabase.from("meal_plan").select("*").gte("date", start).lte("date", end),
    supabase.from("daily_extras").select("*").gte("date", start).lte("date", end),
  ]);
  if (mealPlanRes.error) throw new Error(mealPlanRes.error.message);
  if (extrasRes.error) throw new Error(extrasRes.error.message);

  const mealPlan: MealPlan = {};
  (mealPlanRes.data as MealPlanRow[] | null || []).forEach((row) => {
    if (!mealPlan[row.date]) mealPlan[row.date] = {};
    mealPlan[row.date][row.slot] = {
      recipeId: row.recipe_id,
      custom: row.custom_meal,
      flexSelection: row.flex_selection,
      eaten: Boolean(row.eaten),
    };
  });

  const dailyExtras: DailyExtra[] = (extrasRes.data || []).map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    calories: Number(row.calories) || 0,
  }));

  return { mealPlan, dailyExtras };
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

type IngredientLibraryRow = {
  id: string;
  name: string;
  base_unit: IngredientBaseUnit;
  calories_per_base_unit: number | string;
  protein_per_base_unit: number | string;
  fiber_per_base_unit: number | string;
  reference_unit: VolumeUnit | null;
  grams_per_reference_unit: number | string | null;
  pantry_staple: boolean;
};

type LibraryIngredientInput = {
  name: string;
  baseUnit: IngredientBaseUnit;
  caloriesPerBaseUnit: number;
  proteinPerBaseUnit: number;
  fiberPerBaseUnit: number;
  referenceUnit?: VolumeUnit | null;
  gramsPerReferenceUnit?: number | null;
  pantryStaple: boolean;
};

function rowToLibraryIngredient(row: IngredientLibraryRow): LibraryIngredient {
  return {
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    caloriesPerBaseUnit: Number(row.calories_per_base_unit) || 0,
    proteinPerBaseUnit: Number(row.protein_per_base_unit) || 0,
    fiberPerBaseUnit: Number(row.fiber_per_base_unit) || 0,
    referenceUnit: row.reference_unit,
    gramsPerReferenceUnit:
      row.grams_per_reference_unit === null ? null : Number(row.grams_per_reference_unit),
    pantryStaple: Boolean(row.pantry_staple),
  };
}

function libraryIngredientPayload(input: LibraryIngredientInput) {
  return {
    base_unit: input.baseUnit,
    calories_per_base_unit: input.caloriesPerBaseUnit,
    protein_per_base_unit: input.proteinPerBaseUnit,
    fiber_per_base_unit: input.fiberPerBaseUnit,
    reference_unit: input.baseUnit === "grams" ? input.referenceUnit ?? null : null,
    grams_per_reference_unit: input.baseUnit === "grams" ? input.gramsPerReferenceUnit ?? null : null,
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

// Imports a recipe produced by the Claude Skill (or hand-written) JSON
// upload: creates any brand-new library ingredients first, resolves the
// recipe's newIngredientRef placeholders to their real ids, then saves the
// recipe — all in one call so the two can't end up half-done relative to
// each other. Macro values on the recipe's own ingredient rows are used
// exactly as provided; this does not recompute them (see RecipeImportPayload).
export async function importRecipeAction(
  payload: RecipeImportPayload
): Promise<{ recipe: Recipe; newIngredients: LibraryIngredient[] }> {
  const supabase = createAdminClient();

  const refToId = new Map<string, string>();
  const createdIngredients: LibraryIngredient[] = [];

  for (const newIng of payload.newIngredients) {
    const saved = await saveLibraryIngredientAction({
      name: newIng.name,
      baseUnit: newIng.baseUnit,
      caloriesPerBaseUnit: newIng.caloriesPerBaseUnit,
      proteinPerBaseUnit: newIng.proteinPerBaseUnit,
      fiberPerBaseUnit: newIng.fiberPerBaseUnit,
      referenceUnit: newIng.referenceUnit,
      gramsPerReferenceUnit: newIng.gramsPerReferenceUnit,
      pantryStaple: newIng.pantryStaple ?? false,
    });
    refToId.set(newIng.ref, saved.id);
    createdIngredients.push(saved);
  }

  // Never trust the imported file's own "id" values as unique — they're
  // written by an external Skill with no way to guarantee that, and a
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

type DailyExtraRow = {
  id: string;
  date: string;
  name: string;
  calories: number | string;
};

function rowToDailyExtra(row: DailyExtraRow): DailyExtra {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    calories: Number(row.calories) || 0,
  };
}

export async function addDailyExtraAction(
  date: string,
  name: string,
  calories: number
): Promise<DailyExtra> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("daily_extras")
    .insert({ date, name: name.trim(), calories })
    .select()
    .single<DailyExtraRow>();
  if (error || !data) throw new Error(error?.message || "Failed to add extra.");
  return rowToDailyExtra(data);
}

export async function deleteDailyExtraAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("daily_extras").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
