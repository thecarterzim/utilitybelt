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
