export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type DayNutrition = { calories: number; protein: number; fiber: number };

export type ServingMode = "whole" | "perServing";

export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  fiber: string;
  // Reference to a shared library ingredient this line was filled from or
  // linked to. Always optional — this row's own quantity/unit/calories are
  // the source of truth for the recipe, this is just a backlink.
  libraryId?: string | null;
  // "whole" (default): quantity/calories are the total for the whole
  // recipe, calories get divided across servings. "perServing": the amount
  // and calories are per single serving (toppings, garnishes) — not
  // divided, and multiplied by servings for the shopping list instead.
  servingMode?: ServingMode;
  // Flexible ingredients are swappable options (e.g. "pick your vegetables"
  // in a curry) grouped separately from the recipe's fixed ingredients.
  // `flexDefault` is whether it's ON by default when the recipe is newly
  // scheduled — the actual on/off state for a specific scheduled occurrence
  // lives on that meal_plan row's flexSelection, not here.
  isFlex?: boolean;
  flexDefault?: boolean;
  // A labeled divider inserted into the (non-flex) ingredient list, e.g.
  // "Sauce" vs "Stir Fry" — everything after it, up to the next header or
  // the end of the list, reads as belonging to that section. When true,
  // `name` holds the optional title (blank is fine — still shows a line,
  // just no label) and every other field on this entry is unused. Purely a
  // display grouping — it contributes nothing to macros or the shopping
  // list, so the same ingredient name can appear in two sections without
  // being bought twice (shopping list dedup is already by name+unit).
  isSectionHeader?: boolean;
};

// "grams": caloriesPerBaseUnit etc. are rates PER GRAM — the canonical
// model for anything measured by weight or volume (produce, flour, oil,
// spices...), since grams is the one unit every other weight/volume unit
// converts to via a fixed, ingredient-independent ratio. "count": rates are
// PER ITEM (a whole egg, a can, a clove) — these aren't naturally weighed,
// so forcing a grams conversion would add friction without solving
// anything real; count stays canonical for its own sake.
export type IngredientBaseUnit = "grams" | "count";

// The volume units a library ingredient's reference conversion can be
// expressed in. Ratios between these (1 tbsp = 3 tsp, 1 cup = 48 tsp, etc.)
// are fixed and universal — they live in lib/constants.ts as a shared
// table, not per-ingredient — only the density (grams per one of these)
// actually varies by ingredient.
export type VolumeUnit = "tsp" | "tbsp" | "cup" | "ml" | "l";

// A shared ingredient library entry. caloriesPerBaseUnit etc. are RATES —
// per gram or per item depending on baseUnit — not totals, unlike
// Ingredient's fields.
export type LibraryIngredient = {
  id: string;
  name: string;
  baseUnit: IngredientBaseUnit;
  caloriesPerBaseUnit: number;
  proteinPerBaseUnit: number;
  fiberPerBaseUnit: number;
  // Only meaningful when baseUnit is "grams" and this ingredient is
  // commonly measured by volume in recipes (flour, sugar, oil, spices...).
  // Lets a recipe enter "2 cups" and still get the right grams/macros
  // without a second, duplicate library entry for "the volume version" of
  // the same ingredient. null/absent means no volume conversion is known
  // for this ingredient yet — recipes can still enter it in grams (or any
  // weight unit) directly.
  referenceUnit?: VolumeUnit | null;
  gramsPerReferenceUnit?: number | null;
  // Pantry staples (salt, oil, spices you always have) get skipped when
  // building the shopping list from the meal plan. This is the only place
  // it's set — edited here or when first saving a new ingredient to the
  // library — a recipe's own ingredient line has no override for it.
  pantryStaple: boolean;
};

export type Recipe = {
  id: string;
  name: string;
  category: string;
  servings: number | string;
  ingredients: Ingredient[];
  instructions: string;
  // Where the recipe came from (a website or Instagram post), if anywhere.
  sourceUrl?: string | null;
  // What gets done ahead of time on prep day (Thursday) — one step per line,
  // same convention as `instructions`. Blank means "nothing to prep ahead".
  prepSteps?: string;
};

// A one-off meal typed directly into a slot — never saved to the recipes
// table, only ever lives inside that slot's meal_plan row.
export type CustomMeal = {
  name: string;
  calories: number;
  protein: number;
  fiber: number;
};

// A slot holds either a reference to a saved recipe OR an inline custom
// meal, never both. `null` (or absent) means nothing assigned.
export type MealSlotValue = {
  recipeId: string | null;
  custom: CustomMeal | null;
  // Ids of the recipe's flex ingredients that are ON for this specific
  // occurrence — independent of any other date/slot using the same recipe.
  // null/absent means "use the recipe's own flexDefault flags".
  flexSelection?: string[] | null;
  // Whether this specific occurrence has actually been eaten — toggled from
  // Home's today card. Resets to false whenever the slot is reassigned.
  eaten?: boolean;
};

export type DayPlan = Partial<Record<MealSlot, MealSlotValue | null>>;

// "This week" buckets — the week is planned by role, not by day. "make" is
// what Kristine cooks on prep day, "prep" is what she preps ahead for
// Carter to finish, the rest are just groupings for the shopping list.
export type WeekBucket = "make" | "prep" | "dinners" | "lunches" | "snacks";

export type WeekItem = {
  id: string;
  bucket: WeekBucket;
  recipeId: string;
};

export type MealPlan = Record<string, DayPlan>;

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
  checked: boolean;
};

// Something eaten on a given day outside any planned meal slot. Calories
// only, by design — no protein/fiber tracking for these.
export type DailyExtra = {
  id: string;
  date: string;
  name: string;
  calories: number;
};

// ---------- Recipe import (JSON upload) ----------
//
// The shape expected from the "Import Recipe" screen's .json upload,
// produced by the Claude Skill (or hand-written). Whoever generates this
// file has already matched each ingredient against the current library
// (fetched from /api/ingredients-feed) and computed the recipe's own
// quantity/unit/calories/protein/fiber snapshot values itself — the
// importer's job is just to create any brand-new library ingredients,
// resolve them to real ids, and save the recipe. It does not recompute
// macros from scratch.

export type ImportIngredient = Omit<Ingredient, "libraryId"> & {
  // Either a real, existing library id (already matched) or a reference
  // into this payload's own newIngredients array (brand new) — never both,
  // and section headers have neither.
  libraryId?: string | null;
  newIngredientRef?: string | null;
};

export type NewLibraryIngredientInput = {
  // A short local key this payload's ImportIngredient rows point back to —
  // never a real id, just scoped to this one import.
  ref: string;
  name: string;
  baseUnit: IngredientBaseUnit;
  caloriesPerBaseUnit: number;
  proteinPerBaseUnit: number;
  fiberPerBaseUnit: number;
  referenceUnit?: VolumeUnit | null;
  gramsPerReferenceUnit?: number | null;
  pantryStaple?: boolean;
};

export type RecipeImportPayload = {
  recipe: {
    name: string;
    category: string;
    servings: number | string;
    instructions: string;
    ingredients: ImportIngredient[];
    sourceUrl?: string | null;
    prepSteps?: string;
  };
  newIngredients: NewLibraryIngredientInput[];
};
