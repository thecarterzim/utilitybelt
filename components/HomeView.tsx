"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { BookOpen, CalendarDays, ChefHat, Plus } from "lucide-react";
import { WEEK_BUCKETS } from "@/lib/constants";
import type { Recipe, WeekItem } from "@/lib/types";

type View =
  | "home"
  | "addRecipe"
  | "browse"
  | "recipeDetail"
  | "mealPlan"
  | "week"
  | "shoppingList"
  | "ingredientLibrary"
  | "importRecipe";

const RECENT_SHORTCUTS = ["Milk", "Eggs", "Olive oil"];

export function HomeView({
  recipes,
  weekItems,
  setView,
  setEditingRecipe,
  onOpenRecipe,
  onQuickAdd,
  shoppingListCount,
}: {
  recipes: Recipe[];
  weekItems: WeekItem[];
  setView: (v: View) => void;
  setEditingRecipe: (r: Recipe | null) => void;
  onOpenRecipe: (id: string) => void;
  onQuickAdd: (name: string) => void;
  shoppingListCount: number;
}) {
  const [quickAddName, setQuickAddName] = useState("");

  function submitQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    onQuickAdd(quickAddName.trim());
    setQuickAddName("");
  }

  const dayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const buckets = WEEK_BUCKETS.map((b) => ({
    ...b,
    recipes: weekItems
      .filter((w) => w.bucket === b.key)
      .map((w) => recipeById.get(w.recipeId))
      .filter((r): r is Recipe => Boolean(r)),
  }));
  const weekCount = buckets.reduce((sum, b) => sum + b.recipes.length, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="mb-1 md:hidden">
        <h1 className="font-display text-3xl text-stone-900">The Larder</h1>
      </div>

      {/* This week card */}
      <div className="bg-[#fdf9ec] border border-[#f0dd9c] rounded-2xl p-[26px_30px]">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10.5px] tracking-[.14em] uppercase font-semibold text-[#8a6a10] mb-1.5">
              This week
            </div>
            <div className="font-display text-[27px] font-semibold tracking-tight text-stone-900">{dayLabel}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-semibold tabular-nums leading-none text-[#0f4a35]">
              {weekCount}
            </div>
            <div className="text-[10.5px] tracking-[.12em] uppercase text-black/45 mt-1">
              recipe{weekCount === 1 ? "" : "s"} picked
            </div>
          </div>
        </div>

        {weekCount === 0 ? (
          <p className="mt-5 text-sm text-black/50">
            Nothing picked yet. Choose what Kristine makes and preps, plus any other dinners, lunches, and snacks.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-black/[0.08] rounded-xl overflow-hidden mt-6">
            {buckets
              .filter((b) => b.recipes.length > 0)
              .map((b) => (
                <div key={b.key} className="bg-white p-4">
                  <div className="text-[10.5px] tracking-[.13em] uppercase font-semibold text-black/45 mb-1.5">
                    {b.label}
                  </div>
                  <div className="flex flex-col gap-1">
                    {b.recipes.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onOpenRecipe(r.id)}
                        className="text-left text-[15px] font-semibold text-stone-900 hover:text-[#0f4a35] flex items-center gap-2"
                      >
                        {r.name}
                        {b.prepDay && <ChefHat size={13} className="text-[#b0430c] flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <button
          onClick={() => setView("week")}
          className="mt-4 text-[13.5px] font-semibold text-[#0f4a35] hover:underline"
        >
          {weekCount === 0 ? "Plan this week →" : "Open this week →"}
        </button>
      </div>

      {/* Quick add + numbers */}
      <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-[18px]">
        <div className="bg-white border border-black/[0.07] rounded-2xl p-[22px_24px]">
          <div className="mb-4">
            <span className="font-display text-lg font-semibold text-stone-900">Quick add to shopping list</span>
            <p className="text-xs text-black/40 mt-1">
              {shoppingListCount} item{shoppingListCount === 1 ? "" : "s"} on the list
            </p>
          </div>
          <form onSubmit={submitQuickAdd} className="flex gap-2.5">
            <input
              value={quickAddName}
              onChange={(e) => setQuickAddName(e.target.value)}
              placeholder="e.g. Paper towels"
              className="flex-1 min-w-0 h-12 px-[18px] rounded-full bg-[#f7f6f3] border border-black/[0.08] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <button
              type="submit"
              disabled={!quickAddName.trim()}
              className="flex-none flex items-center gap-2 h-12 px-6 rounded-full bg-[#0f4a35] text-white text-sm font-semibold disabled:opacity-40"
            >
              <Plus size={15} /> Add
            </button>
          </form>
          <div className="hidden sm:flex flex-wrap items-center gap-1.5 mt-3.5">
            {RECENT_SHORTCUTS.map((item) => (
              <button
                key={item}
                onClick={() => onQuickAdd(item)}
                className="text-xs px-3 py-2 rounded-full bg-[#f7f6f3] text-black/60 hover:bg-black/[0.08]"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-black/[0.07] rounded-2xl p-[22px_24px]">
          <div className="text-[10.5px] tracking-[.14em] uppercase font-semibold text-black/45 mb-3.5">
            At a glance
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Recipes this week</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">{weekCount}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Shopping list</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">{shoppingListCount}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Recipes saved</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">{recipes.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <ActionCard
          title="Add a recipe"
          subtitle="From a link, or write your own"
          Icon={Plus}
          tileColor="#0f4a35"
          onClick={() => {
            setEditingRecipe(null);
            setView("importRecipe");
          }}
        />
        <ActionCard
          title="Plan this week"
          subtitle="Pick recipes, build the list"
          Icon={CalendarDays}
          tileColor="#b0430c"
          onClick={() => setView("week")}
        />
        <ActionCard
          title="Browse recipes"
          subtitle={`${recipes.length} saved`}
          Icon={BookOpen}
          tileColor="#2f2b24"
          onClick={() => setView("browse")}
        />
      </div>
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  Icon,
  tileColor,
  onClick,
}: {
  title: string;
  subtitle: string;
  Icon: typeof Plus;
  tileColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-black/[0.07] rounded-2xl p-[22px_24px] hover:border-black/20 hover:shadow-sm transition-all"
    >
      <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center" style={{ background: tileColor }}>
        <Icon size={17} className="text-white" />
      </div>
      <p className="font-display text-lg font-semibold text-stone-900 mt-4">{title}</p>
      <p className="text-[13.5px] text-black/50 mt-1">{subtitle}</p>
    </button>
  );
}
