#!/usr/bin/env node
// Seeds recipes (and the library ingredients they use) into Supabase from
// the JSON files in scripts/seed/. Safe to re-run: a recipe whose name
// already exists is skipped, and library ingredients are matched by name.
//
//   node scripts/seed-recipes.mjs            # seed everything in scripts/seed/*.json
//   node scripts/seed-recipes.mjs --dry-run  # print what would be inserted
//
// Seed file shape (an array of these):
// {
//   "name": "Oat Cookies", "category": "Snack", "servings": 12,
//   "sourceUrl": "https://…" | null,
//   "ingredients": [
//     { "section": "Wet" },
//     { "name": "Ripe Banana", "quantity": "2", "unit": "count" }
//   ],
//   "instructions": ["step", "step"],
//   "prepSteps": ["step"]           // optional
// }
//
// Macros are intentionally left blank — this household uses the app for
// shopping and prep, not calorie tracking. Fill them in from the ingredient
// library later if that ever changes.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

// Minimal .env.local loader — avoids a dotenv dependency just for this.
function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

const VALID_UNITS = new Set(["g", "oz", "kg", "lb", "ml", "l", "cup", "tbsp", "tsp", "count", "can", "unit"]);
const COUNT_UNITS = new Set(["count", "can", "unit"]);
const VALID_CATEGORIES = new Set(["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"]);

// Things this kitchen always has on hand — skipped by the shopping list
// builder. Edit in the app's ingredient library any time.
const PANTRY_STAPLES = new Set(
  [
    "salt", "kosher salt", "sea salt", "black pepper", "pepper", "salt and pepper",
    "olive oil", "extra virgin olive oil", "avocado oil", "coconut oil", "sesame oil",
    "garlic powder", "onion powder", "cumin", "ground cumin", "chili powder", "paprika",
    "smoked paprika", "oregano", "dried oregano", "dried basil", "italian seasoning",
    "cinnamon", "ground cinnamon", "pumpkin pie spice", "curry powder", "turmeric",
    "ground ginger", "ground coriander", "red pepper flakes", "cayenne",
    "baking soda", "baking powder", "vanilla extract", "soy sauce", "coconut aminos",
    "maple syrup", "honey", "coconut sugar", "rice vinegar", "apple cider vinegar",
    "garlic", "chia seeds",
  ].map((s) => s.toLowerCase())
);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function loadSeedRecipes() {
  const dir = join(root, "scripts", "seed");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const recipes = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!Array.isArray(data)) throw new Error(`${file}: expected a JSON array`);
    for (const r of data) recipes.push({ ...r, _file: file });
  }
  return recipes;
}

function validate(recipe) {
  const errors = [];
  if (!recipe.name) errors.push("missing name");
  if (!VALID_CATEGORIES.has(recipe.category)) errors.push(`bad category '${recipe.category}'`);
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1) errors.push(`bad servings '${recipe.servings}'`);
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) errors.push("no ingredients");
  if (!Array.isArray(recipe.instructions) || recipe.instructions.length === 0) errors.push("no instructions");
  for (const [i, ing] of (recipe.ingredients || []).entries()) {
    if (ing.section !== undefined) continue;
    if (!ing.name) errors.push(`ingredient #${i + 1} missing name`);
    if (!VALID_UNITS.has(ing.unit)) errors.push(`ingredient '${ing.name}' has bad unit '${ing.unit}'`);
    if (ing.quantity === undefined || Number.isNaN(parseFloat(ing.quantity)))
      errors.push(`ingredient '${ing.name}' has non-numeric quantity '${ing.quantity}'`);
  }
  return errors;
}

async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const seeds = loadSeedRecipes();
  const problems = seeds.flatMap((r) => validate(r).map((e) => `${r._file} › ${r.name || "(unnamed)"}: ${e}`));
  if (problems.length > 0) {
    console.error("Seed data has problems:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  const { data: existingRecipes, error: recipesErr } = await supabase.from("recipes").select("id,name");
  if (recipesErr) throw new Error(recipesErr.message);
  const existingNames = new Set((existingRecipes || []).map((r) => r.name.toLowerCase()));

  const { data: libraryRows, error: libErr } = await supabase.from("ingredients").select("id,name");
  if (libErr) throw new Error(libErr.message);
  const library = new Map((libraryRows || []).map((r) => [r.name.toLowerCase(), r.id]));

  let inserted = 0;
  let skipped = 0;
  let newLibrary = 0;

  for (const seed of seeds) {
    const name = normalizeName(seed.name);
    if (existingNames.has(name.toLowerCase())) {
      skipped++;
      console.log(`skip   ${name} (already exists)`);
      continue;
    }

    const ingredients = [];
    for (const ing of seed.ingredients) {
      if (ing.section !== undefined) {
        ingredients.push({
          id: generateId(), name: ing.section, quantity: "", unit: "g",
          calories: "0", protein: "0", fiber: "0", libraryId: null,
          servingMode: "whole", isFlex: false, flexDefault: false, isSectionHeader: true,
        });
        continue;
      }

      const ingName = normalizeName(ing.name);
      const key = ingName.toLowerCase();
      let libraryId = library.get(key) ?? null;
      if (!libraryId) {
        const row = {
          name: ingName,
          base_unit: COUNT_UNITS.has(ing.unit) ? "count" : "grams",
          calories_per_base_unit: 0, protein_per_base_unit: 0, fiber_per_base_unit: 0,
          reference_unit: null, grams_per_reference_unit: null,
          pantry_staple: PANTRY_STAPLES.has(key),
        };
        if (dryRun) {
          libraryId = "dry-run";
        } else {
          const { data, error } = await supabase.from("ingredients").insert(row).select("id").single();
          if (error) throw new Error(`library insert '${ingName}': ${error.message}`);
          libraryId = data.id;
        }
        library.set(key, libraryId);
        newLibrary++;
      }

      ingredients.push({
        id: generateId(), name: ingName, quantity: String(ing.quantity), unit: ing.unit,
        calories: "", protein: "", fiber: "", libraryId,
        servingMode: ing.perServing ? "perServing" : "whole", isFlex: false, flexDefault: false,
      });
    }

    const row = {
      name,
      category: seed.category,
      servings: seed.servings,
      ingredients,
      instructions: seed.instructions.join("\n"),
      source_url: seed.sourceUrl || null,
      prep_steps: (seed.prepSteps || []).join("\n"),
    };

    if (!dryRun) {
      const { error } = await supabase.from("recipes").insert(row);
      if (error) throw new Error(`recipe insert '${name}': ${error.message}`);
    }
    existingNames.add(name.toLowerCase());
    inserted++;
    console.log(`${dryRun ? "would add" : "added "} ${name} (${ingredients.filter((i) => !i.isSectionHeader).length} ingredients)`);
  }

  console.log(`\n${dryRun ? "Dry run. " : ""}Recipes: ${inserted} added, ${skipped} skipped. New library ingredients: ${newLibrary}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
