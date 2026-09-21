"use client";

import { useMemo, useState } from "react";
import { ChefHat, Check, Copy, Plus, RefreshCw, Search, ShoppingCart, X } from "lucide-react";
import { CATEGORIES, CATEGORY_STYLE, WEEK_BUCKETS } from "@/lib/constants";
import { parseInstructionSteps } from "@/lib/helpers";
import type { Recipe, WeekBucket, WeekItem } from "@/lib/types";

export function WeekView({
  recipes,
  weekItems,
  shoppingListCount,
  onAdd,
  onRemove,
  onOpenRecipe,
  onStartCooking,
  onBuildList,
  onStartNewWeek,
  onCopyLink,
}: {
  recipes: Recipe[];
  weekItems: WeekItem[];
  shoppingListCount: number;
  onAdd: (bucket: WeekBucket, recipeId: string) => void;
  onRemove: (id: string) => void;
  onOpenRecipe: (id: string) => void;
  onStartCooking: (recipe: Recipe) => void;
  onBuildList: () => void;
  onStartNewWeek: () => void;
  onCopyLink: () => void;
}) {
  const [pickerBucket, setPickerBucket] = useState<WeekBucket | null>(null);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const itemsFor = (bucket: WeekBucket) =>
    weekItems.filter((w) => w.bucket === bucket).map((w) => ({ item: w, recipe: recipeById.get(w.recipeId) })).filter(
      (x): x is { item: WeekItem; recipe: Recipe } => Boolean(x.recipe)
    );

  const prepDay = WEEK_BUCKETS.filter((b) => b.prepDay).map((b) => ({ ...b, entries: itemsFor(b.key) }));
  const hasPrepDay = prepDay.some((b) => b.entries.length > 0);
  const totalRecipes = weekItems.filter((w) => recipeById.has(w.recipeId)).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="font-display text-3xl text-stone-900">This week</h1>
          <p className="text-stone-500 text-sm mt-1">
            {totalRecipes === 0
              ? "Pick the recipes you're cooking this week."
              : `${totalRecipes} recipe${totalRecipes === 1 ? "" : "s"} · ${shoppingListCount} item${shoppingListCount === 1 ? "" : "s"} on the shopping list`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onBuildList}
            disabled={totalRecipes === 0}
            className="flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full disabled:opacity-40"
          >
            <ShoppingCart size={15} /> Build shopping list
          </button>
          <button
            onClick={onCopyLink}
            title="Copy a link to this page for the Trello card"
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100"
          >
            <Copy size={14} /> Copy link
          </button>
          <button
            onClick={onStartNewWeek}
            disabled={totalRecipes === 0}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
          >
            <RefreshCw size={14} /> Start new week
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {WEEK_BUCKETS.map((bucket) => {
          const entries = itemsFor(bucket.key);
          return (
            <div key={bucket.key} className="bg-amber-50 border border-stone-200 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-display text-lg text-stone-900 leading-tight">{bucket.label}</h2>
                  {bucket.hint && <p className="text-[11px] text-stone-400">{bucket.hint}</p>}
                </div>
                {bucket.prepDay && (
                  <span className="text-[10px] font-medium uppercase tracking-wide bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full whitespace-nowrap">
                    Thursday
                  </span>
                )}
              </div>

              <div className="space-y-1.5 flex-1">
                {entries.length === 0 && (
                  <p className="text-sm text-stone-400 py-1">Nothing picked yet.</p>
                )}
                {entries.map(({ item, recipe }) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl pl-3 pr-1.5 py-1.5"
                  >
                    <button
                      onClick={() => onOpenRecipe(recipe.id)}
                      className="flex-1 text-left text-sm text-stone-800 hover:text-emerald-800 truncate"
                      title="Open recipe"
                    >
                      {recipe.name}
                    </button>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 flex-shrink-0"
                      title="Remove from this week"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setPickerBucket(bucket.key)}
                className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-dashed border-stone-300 text-sm text-emerald-800 font-medium hover:bg-emerald-50"
              >
                <Plus size={14} /> Add recipe
              </button>
            </div>
          );
        })}
      </div>

      {hasPrepDay && (
        <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5">
          <h2 className="font-display text-xl text-stone-900">Thursday prep</h2>
          <p className="text-stone-500 text-sm mt-1 mb-4">
            What Kristine cooks and preps this week. Tap a recipe for the full instructions and Cooking Mode.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {prepDay.map((bucket) => (
              <div key={bucket.key}>
                <h3 className="text-[11px] font-medium text-emerald-900 uppercase tracking-wide mb-2">
                  {bucket.key === "make" ? "Make tonight" : "Prep for later"}
                </h3>
                {bucket.entries.length === 0 ? (
                  <p className="text-sm text-stone-400">Nothing here this week.</p>
                ) : (
                  <div className="space-y-3">
                    {bucket.entries.map(({ item, recipe }) => {
                      const steps = parseInstructionSteps(recipe.prepSteps ?? "");
                      return (
                        <div key={item.id} className="bg-white border border-stone-200 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <button
                              onClick={() => onOpenRecipe(recipe.id)}
                              className="font-medium text-sm text-stone-900 hover:text-emerald-800 text-left"
                            >
                              {recipe.name}
                            </button>
                            <button
                              onClick={() => onStartCooking(recipe)}
                              className="flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full flex-shrink-0"
                            >
                              <ChefHat size={12} /> Cook
                            </button>
                          </div>
                          {bucket.key === "prep" && steps.length > 0 ? (
                            <ol className="space-y-1 mt-2">
                              {steps.map((step, idx) => (
                                <li key={idx} className="flex gap-2 text-sm text-stone-700">
                                  <span className="font-display text-stone-400 flex-shrink-0 w-4">{idx + 1}</span>
                                  <span>{step.text}</span>
                                </li>
                              ))}
                            </ol>
                          ) : bucket.key === "prep" ? (
                            <p className="text-xs text-stone-400 mt-1">
                              No prep-ahead steps on this recipe yet. Add them on the recipe&apos;s edit page.
                            </p>
                          ) : (
                            <p className="text-xs text-stone-500">
                              {recipe.servings} servings · full recipe in the app
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pickerBucket && (
        <WeekRecipePicker
          recipes={recipes}
          bucket={pickerBucket}
          alreadyIn={new Set(weekItems.filter((w) => w.bucket === pickerBucket).map((w) => w.recipeId))}
          onPick={(id) => {
            onAdd(pickerBucket, id);
          }}
          onClose={() => setPickerBucket(null)}
        />
      )}
    </div>
  );
}

// Suggested category filter per bucket — just a starting point, every
// recipe stays one tap away under "All".
const BUCKET_DEFAULT_CATEGORY: Record<WeekBucket, string> = {
  make: "Dinner",
  prep: "Dinner",
  dinners: "Dinner",
  lunches: "Lunch",
  snacks: "Snack",
};

function WeekRecipePicker({
  recipes,
  bucket,
  alreadyIn,
  onPick,
  onClose,
}: {
  recipes: Recipe[];
  bucket: WeekBucket;
  alreadyIn: Set<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(BUCKET_DEFAULT_CATEGORY[bucket]);
  const label = WEEK_BUCKETS.find((b) => b.key === bucket)?.label ?? "This week";

  const filtered = recipes.filter((r) => {
    const matchesQuery = r.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All" || r.category === category;
    return matchesQuery && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-amber-50 w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display text-xl text-stone-900">Add to {label}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-200">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-3">
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["All", ...CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  category === c ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-5 space-y-1.5">
          {filtered.length === 0 && <p className="text-sm text-stone-400 py-4 text-center">No recipes match.</p>}
          {filtered.map((r) => {
            const added = alreadyIn.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => {
                  if (!added) onPick(r.id);
                }}
                disabled={added}
                className="w-full flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-left disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="text-sm text-stone-800 truncate">{r.name}</p>
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${CATEGORY_STYLE[r.category] ?? "bg-stone-200 text-stone-700"}`}>
                    {r.category}
                  </span>
                </div>
                {added ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-800 flex-shrink-0">
                    <Check size={13} /> Added
                  </span>
                ) : (
                  <Plus size={16} className="text-emerald-800 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
