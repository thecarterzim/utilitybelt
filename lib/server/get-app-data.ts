import { createAdminClient } from "@/lib/supabase/server";
import type { LibraryIngredient, Recipe, ShoppingItem, WeekItem } from "@/lib/types";

export async function getAppData() {
  const supabase = createAdminClient();

  const [recipesRes, shoppingRes, ingredientsRes, weekRes] = await Promise.all([
    supabase.from("recipes").select("*").order("name"),
    supabase.from("shopping_list_items").select("*").order("name"),
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("week_items").select("*").order("position").order("created_at"),
  ]);

  const initialRecipes: Recipe[] = (recipesRes.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    servings: r.servings,
    ingredients: r.ingredients,
    instructions: r.instructions,
    sourceUrl: r.source_url ?? null,
    prepSteps: r.prep_steps ?? "",
  }));

  const initialShoppingList: ShoppingItem[] = (shoppingRes.data || []).map((row) => ({
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    recipes: row.recipe_names || [],
    checked: row.checked,
  }));

  const initialIngredientLibrary: LibraryIngredient[] = (ingredientsRes.data || []).map((row) => ({
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
  }));

  const initialWeekItems: WeekItem[] = (weekRes.data || []).map((row) => ({
    id: row.id,
    bucket: row.bucket,
    recipeId: row.recipe_id,
  }));

  return {
    initialRecipes,
    initialShoppingList,
    initialIngredientLibrary,
    initialWeekItems,
  };
}
