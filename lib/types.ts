export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  // Reference to a shared library ingredient this line was filled from or
  // linked to. Always optional — this row's own quantity/unit are the
  // source of truth for the recipe, this is just a backlink.
  libraryId?: string | null;
  // Flexible ingredients are swappable options (e.g. "pick your vegetables"
  // in a curry) grouped separately from the recipe's fixed ingredients.
  // `flexDefault` is whether it's ON by default — Cooking Mode and the
  // shopping list both start from the defaults.
  isFlex?: boolean;
  flexDefault?: boolean;
  // A labeled divider inserted into the (non-flex) ingredient list, e.g.
  // "Sauce" vs "Stir Fry" — everything after it, up to the next header or
  // the end of the list, reads as belonging to that section. When true,
  // `name` holds the optional title (blank is fine — still shows a line,
  // just no label) and every other field on this entry is unused. Purely a
  // display grouping — it contributes nothing to the shopping list, so the same ingredient name can appear in two sections without
  // being bought twice (shopping list dedup is already by name+unit).
  isSectionHeader?: boolean;
};

// A shared ingredient library entry. The only thing it carries beyond a
// canonical name is the pantry-staple flag.
export type LibraryIngredient = {
  id: string;
  name: string;
  // Pantry staples (salt, oil, spices you always have) get skipped when
  // building the shopping list from the week. This is the only place it's
  // set — edited here or when first saving a new ingredient to the library
  // — a recipe's own ingredient line has no override for it.
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

// "This week" buckets — the week is planned by role, not by day. "make" is
// what Kristine cooks on prep day, "prep" is what she preps ahead for
// Carter to finish, the rest are just groupings for the shopping list.
export type WeekBucket = "make" | "prep" | "dinners" | "lunches" | "snacks";

export type WeekItem = {
  id: string;
  bucket: WeekBucket;
  recipeId: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
  checked: boolean;
};

// ---------- Recipe import ----------
//
// The shape produced by the "Import Recipe" screen (Claude parses a link,
// pasted text, or photos server-side — see lib/server/parse-recipe.ts) or
// by a hand-written .json upload. Whoever generates it has already matched
// each ingredient against the current library; the importer's job is just
// to create any brand-new library ingredients, resolve them to real ids,
// and save the recipe.

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
