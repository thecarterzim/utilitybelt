// Turns recipe text and/or photos into the app's Import Recipe payload by
// asking Claude to extract it, matching ingredients against the library.
// Macros are deliberately left at zero: this household uses the app for
// shopping and prep, not calorie tracking (see scripts/seed-recipes.mjs).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES, COUNT_UNITS, UNITS } from "@/lib/constants";
import { generateId } from "@/lib/helpers";
import type {
  ImportIngredient,
  LibraryIngredient,
  NewLibraryIngredientInput,
  RecipeImportPayload,
} from "@/lib/types";

const MODEL = "claude-opus-5";

export type ParseImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix
};

export type ParseInput = {
  text?: string;
  images?: ParseImage[];
  sourceUrl?: string | null;
  sourceKind?: "instagram" | "web" | "text" | "photo";
};

export type ParseResult = {
  payload: RecipeImportPayload;
  notes: string;
};

const DraftIngredient = z.object({
  kind: z.enum(["section", "ingredient"]),
  // For a section: the section title. For an ingredient: the cleaned name.
  name: z.string(),
  quantity: z.string(),
  unit: z.enum(UNITS as [string, ...string[]]),
  // The id of the matching library ingredient, or null when it's new.
  libraryId: z.string().nullable(),
  // Only meaningful for new ingredients: whether it's the sort of thing
  // that's always on hand (salt, oil, dried spices).
  pantryStaple: z.boolean(),
});

const RecipeDraft = z.object({
  name: z.string(),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  servings: z.number().int().min(1),
  ingredients: z.array(DraftIngredient),
  instructions: z.array(z.string()),
  prepSteps: z.array(z.string()),
  notes: z.string(),
});

type RecipeDraftT = z.infer<typeof RecipeDraft>;

function systemPrompt(library: LibraryIngredient[]): string {
  const libraryLines = library
    .map((l) => `${l.id} | ${l.name} | ${l.baseUnit}${l.pantryStaple ? " | pantry" : ""}`)
    .join("\n");

  return `You convert a recipe (from a website, an Instagram caption, a photo of a recipe, or pasted text) into structured data for a home recipe app. Extract only what the source actually says; never invent ingredients or quantities.

Rules for ingredients:
- One entry per ingredient line, in the source's order. Name in Title Case with purpose context stripped ("Cilantro for garnish" → "Cilantro"), but keep qualifiers that change what you'd buy ("Unsalted Butter", "Coconut Milk (Full-Fat)"). Canned goods carry the size: "Diced Tomatoes (14oz Can)".
- If the source groups ingredients (e.g. "For the sauce"), emit a kind:"section" entry with that title before the group. For a section entry set quantity "", unit "unit", libraryId null, pantryStaple false.
- quantity is a decimal string ("0.5", not "1/2"). "Juice of 1 lemon" → quantity "1", unit "count", name "Lemon". Unquantified items ("salt to taste") → quantity "1", unit "unit".
- unit must be one of: ${UNITS.join(", ")}. Use "count" for whole items (eggs, lemons, garlic cloves, pitas), "can" for cans, "unit" only when nothing else fits.
- Match each ingredient against the library below. Use a library id only when it is clearly the same thing to buy (case and plural differences are fine; "Olive Oil" matches "olive oil"; "Extra Virgin Olive Oil" does NOT match "Olive Oil"). Otherwise libraryId null.
- pantryStaple is true only for new ingredients that are basics always on hand: salt, pepper, cooking oils, dried spices and herbs, vinegars, baking soda/powder, common condiments. Fresh produce, proteins, dairy and anything perishable are false.

Instructions: one clear step per array entry, in order, in your own words but keeping every temperature, time and quantity exact. If a step belongs to a section, prefix it with the section title in square brackets and upper case, e.g. "[SAUCE] Whisk everything together.".

prepSteps: the steps a helper could do a day or two ahead (marinating, chopping, making a sauce, cooking a grain, roasting a component) as short imperative lines. Empty array if nothing sensibly preps ahead.

servings: an integer; the lower bound of a range; 4 if unstated. category: one of ${CATEGORIES.join(", ")}.

notes: one or two short sentences flagging anything the person should double-check (an illegible quantity, a guessed serving count, an ingredient that might be a duplicate of a library item). Empty string if nothing to flag.

Ingredient library (id | name | base unit | pantry):
${libraryLines || "(empty)"}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "ingredient";
}

function draftToPayload(draft: RecipeDraftT, library: LibraryIngredient[], sourceUrl: string | null): RecipeImportPayload {
  const libraryIds = new Set(library.map((l) => l.id));
  const newIngredients = new Map<string, NewLibraryIngredientInput>();
  const ingredients: ImportIngredient[] = [];

  for (const line of draft.ingredients) {
    if (line.kind === "section") {
      ingredients.push({
        id: generateId(),
        name: line.name.trim(),
        quantity: "",
        unit: "g",
        calories: "0",
        protein: "0",
        fiber: "0",
        servingMode: "whole",
        isFlex: false,
        flexDefault: false,
        isSectionHeader: true,
      });
      continue;
    }

    const name = line.name.trim();
    if (!name) continue;
    const matched = line.libraryId && libraryIds.has(line.libraryId) ? line.libraryId : null;
    let newIngredientRef: string | null = null;
    if (!matched) {
      const ref = slugify(name);
      if (!newIngredients.has(ref)) {
        newIngredients.set(ref, {
          ref,
          name,
          baseUnit: COUNT_UNITS.includes(line.unit) ? "count" : "grams",
          caloriesPerBaseUnit: 0,
          proteinPerBaseUnit: 0,
          fiberPerBaseUnit: 0,
          referenceUnit: null,
          gramsPerReferenceUnit: null,
          pantryStaple: line.pantryStaple,
        });
      }
      newIngredientRef = ref;
    }

    ingredients.push({
      id: generateId(),
      name,
      quantity: line.quantity.trim(),
      unit: line.unit,
      calories: "",
      protein: "",
      fiber: "",
      libraryId: matched,
      newIngredientRef,
      servingMode: "whole",
      isFlex: false,
      flexDefault: false,
    });
  }

  return {
    recipe: {
      name: draft.name.trim(),
      category: draft.category,
      servings: draft.servings,
      instructions: draft.instructions.map((s) => s.trim()).filter(Boolean).join("\n"),
      ingredients,
      sourceUrl,
      prepSteps: draft.prepSteps.map((s) => s.trim()).filter(Boolean).join("\n"),
    },
    newIngredients: [...newIngredients.values()],
  };
}

export async function parseRecipe(input: ParseInput, library: LibraryIngredient[]): Promise<ParseResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY — add it to .env.local to use recipe import.");
  }
  const text = input.text?.trim() ?? "";
  const images = input.images ?? [];
  if (!text && images.length === 0) throw new Error("Nothing to parse — give me a link, some text, or a photo.");

  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of images) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }
  const intro =
    input.sourceKind === "instagram"
      ? "Here is the caption of an Instagram post. Extract the recipe from it."
      : input.sourceKind === "web"
        ? "Here is the text of a recipe web page. Extract the recipe from it."
        : images.length > 0 && !text
          ? "Extract the recipe from the attached photo(s)."
          : "Extract the recipe from the following.";
  content.push({ type: "text", text: text ? `${intro}\n\n${text}` : intro });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: systemPrompt(library), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(RecipeDraft) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to process that source.");
  }
  const draft = response.parsed_output;
  if (!draft) throw new Error("Couldn't read a recipe out of that. Try a screenshot or paste the text.");
  if (!draft.name.trim() || draft.ingredients.every((i) => i.kind === "section")) {
    throw new Error("That didn't contain a recipe with ingredients. Try a screenshot or paste the text.");
  }

  return { payload: draftToPayload(draft, library, input.sourceUrl ?? null), notes: draft.notes.trim() };
}
