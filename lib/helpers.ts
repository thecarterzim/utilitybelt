import type { Ingredient, Recipe } from "./types";

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

export function emptyIngredient(): Ingredient {
  return {
    id: generateId(),
    name: "",
    quantity: "",
    unit: "g",
    libraryId: null,
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
    libraryId: null,
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
