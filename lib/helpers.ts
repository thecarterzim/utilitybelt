import { VOLUME_TO_ML, WEIGHT_TO_GRAMS } from "./constants";
import type { Ingredient, LibraryIngredient, MealSlotValue, Recipe, VolumeUnit } from "./types";

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Used by Recipe Detail's serving-size multiplier and by Cooking Mode's
// ingredient checklist (launched with that same multiplier) to show a scaled
// quantity without touching the recipe's stored data. Non-numeric amounts
// ("a pinch") pass through unscaled since there's nothing to multiply.
export function scaleQuantityDisplay(quantity: string, multiplier: number): string {
  if (multiplier === 1) return quantity;
  const num = parseFloat(quantity);
  if (Number.isNaN(num)) return quantity;
  const scaled = Math.round(num * multiplier * 100) / 100;
  return String(scaled);
}

// Converts a quantity+unit into grams for a specific library ingredient.
// Weight units (g/oz/lb/kg) convert via a fixed universal ratio, no
// per-ingredient data needed. Volume units (tsp/tbsp/cup/ml/l) need that
// ingredient's own density — derived from its one stored
// (referenceUnit, gramsPerReferenceUnit) pair — since a tablespoon of
// cornstarch and a tablespoon of oil weigh very different amounts. Returns
// null when the unit can't be converted (a count-style unit, or a volume
// unit on an ingredient with no known density yet) — callers should treat
// that as "can't autofill from this", not an error.
export function gramsForQuantity(
  ingredient: LibraryIngredient,
  quantity: number,
  unit: string
): number | null {
  if (unit in WEIGHT_TO_GRAMS) {
    return quantity * WEIGHT_TO_GRAMS[unit];
  }
  if (unit in VOLUME_TO_ML) {
    if (!ingredient.referenceUnit || !ingredient.gramsPerReferenceUnit) return null;
    const gramsPerMl = ingredient.gramsPerReferenceUnit / VOLUME_TO_ML[ingredient.referenceUnit];
    return quantity * VOLUME_TO_ML[unit as VolumeUnit] * gramsPerMl;
  }
  return null;
}

// The suggested calories/protein/fiber for a given quantity+unit of a
// library ingredient — the autofill shown when linking a recipe row (or a
// daily extra) to the library. Always just a starting point: the recipe's
// own values are a separate, freely-editable snapshot from here on, same
// as any other ingredient row.
export function libraryIngredientMacros(
  ingredient: LibraryIngredient,
  quantity: number,
  unit: string
): { calories: number; protein: number; fiber: number } | null {
  if (ingredient.baseUnit === "count") {
    if (unit in WEIGHT_TO_GRAMS || unit in VOLUME_TO_ML) return null;
    return {
      calories: quantity * ingredient.caloriesPerBaseUnit,
      protein: quantity * ingredient.proteinPerBaseUnit,
      fiber: quantity * ingredient.fiberPerBaseUnit,
    };
  }
  const grams = gramsForQuantity(ingredient, quantity, unit);
  if (grams === null) return null;
  return {
    calories: grams * ingredient.caloriesPerBaseUnit,
    protein: grams * ingredient.proteinPerBaseUnit,
    fiber: grams * ingredient.fiberPerBaseUnit,
  };
}

// The unit to default a recipe row to when first linking it to a library
// ingredient with no unit already chosen — its own reference unit if it has
// one (the most natural unit for that specific ingredient), else grams or
// a generic count.
export function defaultUnitForLibraryIngredient(ingredient: LibraryIngredient): string {
  if (ingredient.baseUnit === "count") return "count";
  return ingredient.referenceUnit ?? "g";
}

// Whether `unit` is one this app knows how to convert to grams for a
// "grams" library ingredient (a weight unit always; a volume unit only if
// the ingredient has density info) — used to decide whether changing units
// on a linked row should trigger an autofill rescale at all.
export function isConvertibleUnit(ingredient: LibraryIngredient, unit: string): boolean {
  if (ingredient.baseUnit === "count") return !(unit in WEIGHT_TO_GRAMS) && !(unit in VOLUME_TO_ML);
  return gramsForQuantity(ingredient, 1, unit) !== null;
}

export function emptyIngredient(): Ingredient {
  return {
    id: generateId(),
    name: "",
    quantity: "",
    unit: "g",
    calories: "",
    protein: "",
    fiber: "",
    libraryId: null,
    servingMode: "whole",
    isFlex: false,
    flexDefault: false,
  };
}

export function emptySectionHeader(): Ingredient {
  return {
    id: generateId(),
    name: "",
    quantity: "",
    unit: "g",
    calories: "0",
    protein: "0",
    fiber: "0",
    libraryId: null,
    servingMode: "whole",
    isFlex: false,
    flexDefault: false,
    isSectionHeader: true,
  };
}

export function hasFlexIngredients(recipe: Recipe): boolean {
  return (recipe.ingredients || []).some((i) => i.isFlex);
}

export function defaultFlexIds(recipe: Recipe): string[] {
  return (recipe.ingredients || []).filter((i) => i.isFlex && i.flexDefault).map((i) => i.id);
}

export function emptyRecipe(): Recipe {
  return {
    id: "",
    name: "",
    category: "Dinner",
    servings: 4,
    ingredients: [emptyIngredient()],
    instructions: "",
    sourceUrl: null,
    prepSteps: "",
  };
}

// `activeFlexIds`, when passed, says exactly which flex ingredients count
// (used for a specific scheduled occurrence). Omit it to fall back to the
// recipe's own flexDefault flags (used anywhere there's no schedule context
// — Browse cards, Recipe Detail, the recipe editor). Pass [] deliberately
// to mean "all flex ingredients off", distinct from "no selection given".
function sumIngredientField(
  recipe: Recipe,
  field: "calories" | "protein" | "fiber",
  activeFlexIds?: string[] | null
) {
  const servings = parseFloat(String(recipe.servings)) || 1;
  let wholeTotal = 0;
  let perServingTotal = 0;
  (recipe.ingredients || []).forEach((i) => {
    if (i.isSectionHeader) return;
    if (i.isFlex) {
      const isOn = activeFlexIds ? activeFlexIds.includes(i.id) : Boolean(i.flexDefault);
      if (!isOn) return;
    }
    const value = parseFloat(i[field]) || 0;
    if (i.servingMode === "perServing") {
      perServingTotal += value;
    } else {
      wholeTotal += value;
    }
  });
  const perServing = wholeTotal / servings + perServingTotal;
  return { total: Math.round(perServing * servings), perServing: Math.round(perServing) };
}

export function recipeCalories(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "calories", activeFlexIds);
}

export function recipeProtein(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "protein", activeFlexIds);
}

export function recipeFiber(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "fiber", activeFlexIds);
}

// A single line of `Recipe.instructions`. A line may start with one or more
// bracketed, comma-separated category tags — e.g. "[SAUCE] Whisk together…"
// — matched case-insensitively against ingredient section titles. Tags are
// always stripped from `text`; no tags means an empty `categories` array.
export type InstructionStep = {
  text: string;
  categories: string[];
};

const STEP_TAG_RE = /^\[([^\]]+)\]\s*/;

export function parseInstructionSteps(instructions: string): InstructionStep[] {
  return (instructions || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(STEP_TAG_RE);
      if (!match) return { text: line, categories: [] };
      const categories = match[1]
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      return { text: line.slice(match[0].length).trim(), categories };
    });
}

// Splits a flat ingredient list into groups at each `isSectionHeader` entry,
// the same grouping Recipe Detail's ingredient table already renders — used
// by Cooking Mode to match a step's category tags to the section they refer
// to. A leading run of ingredients before any header comes back as a group
// with `title: null`; empty groups (two headers back to back) are dropped.
export type IngredientSection = {
  key: string;
  title: string | null;
  items: Ingredient[];
};

export function groupIngredientsBySection(ingredients: Ingredient[]): IngredientSection[] {
  const groups: IngredientSection[] = [{ key: "default", title: null, items: [] }];
  ingredients.forEach((ing) => {
    if (ing.isSectionHeader) {
      groups.push({ key: ing.id, title: ing.name?.trim() || null, items: [] });
    } else {
      groups[groups.length - 1].items.push(ing);
    }
  });
  return groups.filter((g) => g.items.length > 0);
}

// Maps each ingredient section to the first step that tags it, so Cooking
// Mode can tell whether a section is "done" (its step already passed),
// "current" (matches the active step), or "upcoming" relative to wherever
// the cook is. Sections with no matching step (untagged, e.g. a leading
// ungrouped run of ingredients) are left out of the map — those are always
// shown rather than gated by step progress.
export function sectionStepIndex(
  sections: IngredientSection[],
  steps: InstructionStep[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const section of sections) {
    if (!section.title) continue;
    const upper = section.title.toUpperCase();
    const idx = steps.findIndex((s) => s.categories.includes(upper));
    if (idx !== -1) map.set(section.key, idx);
  }
  return map;
}

export type PlanDay = {
  date: string;
  weekday: string;
  dayNum: number;
  month: string;
  isToday: boolean;
};

// A 7-day window starting at `anchor` (defaults to today). `isToday` is
// computed against the real current date, independent of the anchor, so it
// still correctly marks "today" even when paged to a past/future week.
export function getWeek(anchor?: Date): PlanDay[] {
  const start = anchor ? new Date(anchor) : new Date();
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayIso = now.toISOString().slice(0, 10);

  const days: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: iso === todayIso,
    });
  }
  return days;
}

export function getNext7Days(): PlanDay[] {
  return getWeek();
}

// The display name for a filled meal-plan slot — a custom meal's own name,
// or the linked recipe's name, or null for an empty/dangling slot. Shared by
// Home's today card and every Meal Plan cell.
export function slotDisplayName(
  slot: MealSlotValue | null | undefined,
  recipes: Recipe[]
): string | null {
  if (!slot) return null;
  if (slot.custom) return slot.custom.name;
  if (slot.recipeId) return recipes.find((r) => r.id === slot.recipeId)?.name ?? null;
  return null;
}

// A compact "3.6 cal/g" / "72 cal/item" summary for library ingredient
// suggestion dropdowns — shared across every place one appears (recipe
// ingredient rows, daily extras).
export function libraryIngredientSummary(lib: LibraryIngredient): string {
  const per = lib.baseUnit === "grams" ? "g" : "item";
  return `${Math.round(lib.caloriesPerBaseUnit * 100) / 100} cal/${per}`;
}
