import { createAdminClient } from "@/lib/supabase/server";
import type { DailyExtra, LibraryIngredient, MealPlan, Recipe, ShoppingItem } from "@/lib/types";

// Meal-plan "today" is computed on the client from the browser's clock, but
// we fetch server-side before we know the client's timezone. Pad the range
// by a day on each side so a skew near midnight never hides a planned meal.
function paddedRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 1);
  const end = new Date(today);
  end.setDate(end.getDate() + 8);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function getAppData() {
  const supabase = createAdminClient();
  const { start, end } = paddedRange();

  const [recipesRes, mealPlanRes, shoppingRes, ingredientsRes, extrasRes] = await Promise.all([
    supabase.from("recipes").select("*").order("name"),
    supabase.from("meal_plan").select("*").gte("date", start).lte("date", end),
    supabase.from("shopping_list_items").select("*").order("name"),
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("daily_extras").select("*").gte("date", start).lte("date", end),
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

  const initialMealPlan: MealPlan = {};
  (mealPlanRes.data || []).forEach((row) => {
    if (!initialMealPlan[row.date]) initialMealPlan[row.date] = {};
    initialMealPlan[row.date][row.slot as keyof MealPlan[string]] = {
      recipeId: row.recipe_id,
      custom: row.custom_meal ?? null,
      flexSelection: row.flex_selection ?? null,
      eaten: Boolean(row.eaten),
    };
  });

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

  const initialDailyExtras: DailyExtra[] = (extrasRes.data || []).map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    calories: Number(row.calories) || 0,
  }));

  return {
    initialRecipes,
    initialMealPlan,
    initialShoppingList,
    initialIngredientLibrary,
    initialDailyExtras,
  };
}
