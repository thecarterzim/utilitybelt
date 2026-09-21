"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { BookOpen, CalendarDays, ChefHat, Check, Dumbbell, Flame, Plus, Wheat } from "lucide-react";
import { MEAL_SLOTS, SLOT_LABEL } from "@/lib/constants";
import { getNext7Days, slotDisplayName } from "@/lib/helpers";
import type { DayNutrition, MealPlan, MealSlot, Recipe } from "@/lib/types";

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

function MacroFigure({
  Icon,
  value,
  unit,
  color,
  label,
}: {
  Icon: typeof Flame;
  value: number;
  unit?: string;
  color: string;
  label: string;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        <Icon size={16} style={{ color }} />
        <span className="font-display text-2xl font-semibold tabular-nums leading-none" style={{ color }}>
          {value.toLocaleString()}
          {unit && <span className="text-[15px]">{unit}</span>}
        </span>
      </div>
      <div className="text-[10.5px] tracking-[.12em] uppercase text-black/45 mt-1">{label}</div>
    </div>
  );
}

export function HomeView({
  recipes,
  days,
  mealPlan,
  todaysPlan,
  dayNutrition,
  setView,
  setEditingRecipe,
  onQuickAdd,
  shoppingListCount,
  onCookToday,
  onToggleEaten,
}: {
  recipes: Recipe[];
  days: ReturnType<typeof getNext7Days>;
  mealPlan: MealPlan;
  todaysPlan: MealPlan[string];
  dayNutrition: (date: string) => DayNutrition;
  setView: (v: View) => void;
  setEditingRecipe: (r: Recipe | null) => void;
  onQuickAdd: (name: string) => void;
  shoppingListCount: number;
  onCookToday: (date: string, slot: MealSlot, recipe: Recipe) => void;
  onToggleEaten: (date: string, slot: MealSlot, eaten: boolean) => void;
}) {
  const today = days[0];
  const [quickAddName, setQuickAddName] = useState("");

  function submitQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    onQuickAdd(quickAddName.trim());
    setQuickAddName("");
  }

  const dayLabel = new Date(today.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // "Meals planned" only counts breakfast/lunch/dinner (matching the 7×3
  // denominator) — snack is tracked but isn't one of the "three meals."
  const countedSlots: MealSlot[] = ["breakfast", "lunch", "dinner"];
  const plannedCount = days.reduce(
    (sum, d) => sum + countedSlots.filter((slot) => slotDisplayName((mealPlan[d.date] || {})[slot], recipes)).length,
    0
  );
  const plannedTotal = days.length * countedSlots.length;
  const avgCalories = Math.round(
    days.reduce((sum, d) => sum + dayNutrition(d.date).calories, 0) / days.length
  );

  // "Next up" is simply the first planned-but-not-yet-eaten slot, in
  // MEAL_SLOTS order — no clock involved, so a meal you're running late on
  // correctly stays "next" instead of silently handing that off once its
  // usual time passes.
  const nextUpIdx = MEAL_SLOTS.findIndex(
    (slot) => slotDisplayName(todaysPlan[slot], recipes) && !todaysPlan[slot]?.eaten
  );
  const nutrition = dayNutrition(today.date);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="mb-1 md:hidden">
        <h1 className="font-display text-3xl text-stone-900">The Larder</h1>
      </div>

      {/* Today card */}
      <div className="bg-[#fdf9ec] border border-[#f0dd9c] rounded-2xl p-[26px_30px]">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10.5px] tracking-[.14em] uppercase font-semibold text-[#8a6a10] mb-1.5">
              Today
            </div>
            <div className="font-display text-[27px] font-semibold tracking-tight text-stone-900">{dayLabel}</div>
          </div>
          <div className="flex gap-[30px]">
            <MacroFigure Icon={Flame} value={nutrition.calories} color="#b0430c" label="calories" />
            <MacroFigure Icon={Dumbbell} value={nutrition.protein} unit="g" color="#0f4a35" label="protein" />
            <MacroFigure Icon={Wheat} value={nutrition.fiber} unit="g" color="#8a6a10" label="fiber" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/[0.08] rounded-xl overflow-hidden mt-6">
          {MEAL_SLOTS.map((slot, idx) => {
            const name = slotDisplayName(todaysPlan[slot], recipes);
            const recipe = todaysPlan[slot]?.recipeId
              ? recipes.find((r) => r.id === todaysPlan[slot]?.recipeId)
              : null;
            const isEaten = Boolean(todaysPlan[slot]?.eaten);
            const isNext = Boolean(name) && idx === nextUpIdx;
            return (
              <button
                key={slot}
                type="button"
                disabled={!name}
                onClick={() => onToggleEaten(today.date, slot, !isEaten)}
                className={`bg-white p-4 text-left ${name ? "cursor-pointer hover:bg-black/[0.02]" : "cursor-default"}`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {isEaten ? (
                    <span className="w-[15px] h-[15px] rounded-full bg-[#0f4a35] text-white flex items-center justify-center">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  ) : isNext ? (
                    <span className="w-[15px] h-[15px] rounded-full border-[1.5px] border-[#8a6a10]" />
                  ) : (
                    <span className="w-[15px] h-[15px] rounded-full border-[1.5px] border-dashed border-black/20" />
                  )}
                  <span
                    className={`text-[10.5px] tracking-[.13em] uppercase font-semibold ${
                      isEaten ? "text-black/45" : isNext ? "text-[#8a6a10]" : "text-black/35"
                    }`}
                  >
                    {SLOT_LABEL[slot]}
                    {isNext ? " · next" : ""}
                  </span>
                </div>
                {name ? (
                  isEaten ? (
                    <p className="text-[15px] font-semibold text-black/45 line-through">{name}</p>
                  ) : isNext ? (
                    <p className="text-[15px] font-semibold text-stone-900 flex items-center gap-2.5 flex-wrap">
                      {name}
                      {recipe && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCookToday(today.date, slot, recipe);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              onCookToday(today.date, slot, recipe);
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#b0430c] px-3 py-1.5 rounded-full"
                        >
                          <ChefHat size={12} /> Cook
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[15px] font-semibold text-stone-900">{name}</p>
                  )
                ) : (
                  <p className="text-sm text-black/35">Nothing planned</p>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setView("week")}
          className="mt-4 text-[13.5px] font-semibold text-[#0f4a35] hover:underline"
        >
          Plan this week →
        </button>
      </div>

      {/* Quick add + This week */}
      <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-[18px]">
        <div className="bg-white border border-black/[0.07] rounded-2xl p-[22px_24px]">
          <div className="mb-4">
            <span className="font-display text-lg font-semibold text-stone-900">Quick add to shopping list</span>
            <p className="text-xs text-black/40 mt-1">{shoppingListCount} items on the list</p>
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
            This week
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Meals planned</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">
                {plannedCount} <span className="text-[13px] text-black/40">/ {plannedTotal}</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Avg. calories</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">
                {avgCalories.toLocaleString()}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black/70">Recipes saved</span>
              <span className="font-display text-[17px] font-semibold tabular-nums">{recipes.length}</span>
            </div>
          </div>
          <span className="block h-1 rounded bg-black/[0.08] relative mt-4">
            <span
              className="absolute left-0 top-0 bottom-0 rounded bg-[#0f4a35]"
              style={{ width: `${plannedTotal > 0 ? Math.min(100, (plannedCount / plannedTotal) * 100) : 0}%` }}
            />
          </span>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <ActionCard
          title="Add a recipe"
          subtitle="Write down something new"
          Icon={Plus}
          tileColor="#0f4a35"
          onClick={() => {
            setEditingRecipe(null);
            setView("addRecipe");
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
  Icon: typeof Flame;
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
