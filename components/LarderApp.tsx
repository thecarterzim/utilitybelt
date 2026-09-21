"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  Home as HomeIcon,
  BookOpen,
  CalendarDays,
  ShoppingCart,
  Plus,
  X,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Search,
  Printer,
  Check,
  Flame,
  Dumbbell,
  Wheat,
  Package,
  Shuffle,
  Star,
  ChefHat,
  Minus,
  GripVertical,
  RefreshCw,
  Upload,
  Sparkles,
  Copy,
  Link as LinkIcon,
} from "lucide-react";
import {
  addDailyExtraAction,
  addManualShoppingItemAction,
  addWeekItemAction,
  assignCustomMealAction,
  assignMealAction,
  clearMealAction,
  deleteDailyExtraAction,
  deleteLibraryIngredientAction,
  deleteRecipeAction,
  deleteShoppingItemsAction,
  getMealPlanRangeAction,
  importRecipeAction,
  moveMealSlotAction,
  removeWeekItemAction,
  saveLibraryIngredientAction,
  startNewWeekAction,
  setMealEatenAction,
  saveRecipeAction,
  syncShoppingListAction,
  toggleShoppingItemAction,
  updateFlexSelectionAction,
  updateLibraryIngredientAction,
} from "@/app/actions";
import { ConfirmModal } from "@/components/ConfirmModal";
import CookingMode from "@/components/CookingMode";
import { EmptyState } from "@/components/EmptyState";
import { HomeView } from "@/components/HomeView";
import {
  ExtrasModal,
  FlexModifyModal,
  MealPlanView,
  MealSlotActionModal,
  RecipePickerModal,
} from "@/components/MealPlanView";
import { NutritionChips } from "@/components/NutritionChips";
import { RecipesView } from "@/components/RecipesView";
import { WeekView } from "@/components/WeekView";
import {
  CATEGORIES,
  CATEGORY_STYLE,
  COUNT_UNITS,
  MEAL_SLOTS,
  SLOT_LABEL,
  UNITS,
  VOLUME_UNITS,
} from "@/lib/constants";
import {
  defaultFlexIds,
  defaultUnitForLibraryIngredient,
  emptyIngredient,
  emptyRecipe,
  emptySectionHeader,
  generateId,
  getNext7Days,
  hasFlexIngredients,
  isConvertibleUnit,
  libraryIngredientMacros,
  libraryIngredientSummary,
  parseInstructionSteps,
  recipeCalories,
  recipeFiber,
  recipeProtein,
  scaleQuantityDisplay,
} from "@/lib/helpers";
import type {
  CustomMeal,
  DailyExtra,
  DayNutrition,
  ImportIngredient,
  Ingredient,
  IngredientBaseUnit,
  LibraryIngredient,
  MealPlan,
  MealSlot,
  NewLibraryIngredientInput,
  Recipe,
  RecipeImportPayload,
  ShoppingItem,
  VolumeUnit,
  WeekBucket,
  WeekItem,
} from "@/lib/types";

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

type LibraryIngredientInput = {
  name: string;
  baseUnit: IngredientBaseUnit;
  caloriesPerBaseUnit: number;
  proteinPerBaseUnit: number;
  fiberPerBaseUnit: number;
  referenceUnit?: VolumeUnit | null;
  gramsPerReferenceUnit?: number | null;
  pantryStaple: boolean;
};

// Keying checked-ingredient/step state by date+slot (when launched from a
// scheduled meal) keeps each occurrence's cooking session independent, same
// as flexSelection already is; launched from Recipe Detail with no
// date/slot, it just keys off the recipe.
function cookingSessionKey(recipeId: string, date?: string, slot?: MealSlot): string {
  return `cookingMode:${recipeId}${date && slot ? `:${date}:${slot}` : ""}`;
}

function useToast(): [string | null, (msg: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function show(msg: string) {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }
  return [message, show];
}

export default function LarderApp({
  initialRecipes,
  initialMealPlan,
  initialShoppingList,
  initialIngredientLibrary,
  initialDailyExtras,
  initialWeekItems,
  initialView,
  initialRecipeId,
}: {
  initialRecipes: Recipe[];
  initialMealPlan: MealPlan;
  initialShoppingList: ShoppingItem[];
  initialIngredientLibrary: LibraryIngredient[];
  initialDailyExtras: DailyExtra[];
  initialWeekItems: WeekItem[];
  initialView?: View;
  // Deep link straight to one recipe (/recipe/<id>) — used by Trello cards.
  initialRecipeId?: string | null;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [mealPlan, setMealPlan] = useState<MealPlan>(initialMealPlan);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(initialShoppingList);
  const [ingredientLibrary, setIngredientLibrary] = useState<LibraryIngredient[]>(
    initialIngredientLibrary
  );
  const [dailyExtras, setDailyExtras] = useState<DailyExtra[]>(initialDailyExtras);
  const [weekItems, setWeekItems] = useState<WeekItem[]>(initialWeekItems);
  const [confirmNewWeek, setConfirmNewWeek] = useState(false);

  const startOnRecipe = Boolean(initialRecipeId && initialRecipes.some((r) => r.id === initialRecipeId));
  const [view, setView] = useState<View>(startOnRecipe ? "recipeDetail" : initialView ?? "home");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(startOnRecipe ? initialRecipeId! : null);
  const [pickerSlot, setPickerSlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [modifySlot, setModifySlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [slotActionTarget, setSlotActionTarget] = useState<{ date: string; slot: MealSlot } | null>(
    null
  );
  const [cookingSession, setCookingSession] = useState<{
    recipe: Recipe;
    flexIds: string[];
    date?: string;
    slot?: MealSlot;
    servingMultiplier: number;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [extrasDate, setExtrasDate] = useState<string | null>(null);

  const [browseQuery, setBrowseQuery] = useState("");
  const [browseCategory, setBrowseCategory] = useState("All");

  const [toast, showToast] = useToast();

  const days = useMemo(() => getNext7Days(), []);

  const mainRef = useRef<HTMLElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Scoped to <main> (not the whole page) so it never fires behind a
  // fixed-position modal or Cooking Mode — those render as siblings of
  // <main>, not descendants, so their touches never reach this listener.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const PULL_THRESHOLD = 70;
    const MAX_PULL = 110;
    let startY: number | null = null;
    let distance = 0;

    function setPull(v: number) {
      distance = v;
      setPullDistance(v);
    }

    function handleTouchStart(e: TouchEvent) {
      if (refreshing) return;
      startY = window.scrollY === 0 ? e.touches[0].clientY : null;
    }

    function handleTouchMove(e: TouchEvent) {
      if (startY === null || refreshing) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0 || window.scrollY > 0) {
        startY = null;
        setPull(0);
        return;
      }
      e.preventDefault();
      setPull(Math.min(delta * 0.5, MAX_PULL));
    }

    function handleTouchEnd() {
      if (startY === null) return;
      startY = null;
      if (distance >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPull(PULL_THRESHOLD);
        window.location.reload();
      } else {
        setPull(0);
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [refreshing]);

  async function saveRecipe(recipe: Recipe) {
    try {
      const saved = await saveRecipeAction(recipe);
      const exists = recipes.some((r) => r.id === saved.id);
      const next = exists
        ? recipes.map((r) => (r.id === saved.id ? saved : r))
        : [...recipes, saved];
      setRecipes(next);
      setEditingRecipe(null);
      setView("browse");
      showToast(exists ? "Recipe updated." : "Recipe saved.");
    } catch {
      showToast("Couldn't save recipe — try again.");
    }
  }

  async function importRecipe(payload: RecipeImportPayload): Promise<{ recipeId: string } | null> {
    try {
      const { recipe, newIngredients } = await importRecipeAction(payload);
      setRecipes((prev) => [...prev, recipe]);
      if (newIngredients.length > 0) {
        setIngredientLibrary((prev) =>
          [...prev, ...newIngredients].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      showToast(
        newIngredients.length > 0
          ? `Recipe imported — added ${newIngredients.length} new ingredient${newIngredients.length === 1 ? "" : "s"}.`
          : "Recipe imported."
      );
      return { recipeId: recipe.id };
    } catch {
      showToast("Couldn't import that recipe — try again.");
      return null;
    }
  }

  async function deleteRecipe(id: string) {
    try {
      await deleteRecipeAction(id);
      const next = recipes.filter((r) => r.id !== id);
      const nextPlan: MealPlan = {};
      Object.entries(mealPlan).forEach(([date, slots]) => {
        const cleaned = { ...slots };
        MEAL_SLOTS.forEach((mt) => {
          if (cleaned[mt]?.recipeId === id) cleaned[mt] = null;
        });
        nextPlan[date] = cleaned;
      });
      setRecipes(next);
      setMealPlan(nextPlan);
      setConfirmDeleteId(null);
      setSelectedRecipeId(null);
      setView("browse");
      showToast("Recipe deleted.");
    } catch {
      showToast("Couldn't delete recipe — try again.");
    }
  }

  async function assignMeal(date: string, slot: MealSlot, recipeId: string) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const flexSelection = recipe ? defaultFlexIds(recipe) : [];
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { recipeId, custom: null, flexSelection } },
    };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await assignMealAction(date, slot, recipeId, flexSelection);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't save that meal — try again.");
    }
  }

  async function updateFlexSelection(date: string, slot: MealSlot, flexSelection: string[]) {
    const currentSlot = mealPlan[date]?.[slot];
    if (!currentSlot) return;
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { ...currentSlot, flexSelection } },
    };
    setMealPlan(next);
    setModifySlot(null);
    try {
      await updateFlexSelectionAction(date, slot, flexSelection);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't update that meal — try again.");
    }
  }

  async function assignCustomMeal(date: string, slot: MealSlot, custom: CustomMeal) {
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { recipeId: null, custom } },
    };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await assignCustomMealAction(date, slot, custom);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't save that meal — try again.");
    }
  }

  async function clearMeal(date: string, slot: MealSlot) {
    const prev = mealPlan;
    const next = { ...mealPlan, [date]: { ...(mealPlan[date] || {}), [slot]: null } };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await clearMealAction(date, slot);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't clear that meal — try again.");
    }
  }

  async function toggleMealEaten(date: string, slot: MealSlot, eaten: boolean) {
    const prev = mealPlan;
    const current = mealPlan[date]?.[slot];
    if (!current) return;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { ...current, eaten } },
    };
    setMealPlan(next);
    try {
      await setMealEatenAction(date, slot, eaten);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't update that — try again.");
    }
  }

  // Drag-to-move (or the picker's implicit swap) between two meal-plan
  // cells. Moves into an empty target; swaps both ways if it's occupied.
  async function moveMeal(
    from: { date: string; slot: MealSlot },
    to: { date: string; slot: MealSlot }
  ) {
    const prev = mealPlan;
    const fromValue = (mealPlan[from.date] || {})[from.slot] ?? null;
    const toValue = (mealPlan[to.date] || {})[to.slot] ?? null;
    const next: MealPlan = {
      ...mealPlan,
      [from.date]: { ...(mealPlan[from.date] || {}), [from.slot]: toValue },
      [to.date]: { ...(mealPlan[to.date] || {}), [to.slot]: fromValue },
    };
    setMealPlan(next);
    try {
      await moveMealSlotAction(from, to);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't move that meal — try again.");
    }
  }

  // The initial page load only covers a padded window around today (see
  // lib/server/get-app-data.ts) — paging Meal Plan to a week outside that
  // needs its own fetch. Widens outward and re-fetches the requested range
  // whenever it's not already fully covered; a little redundant refetching
  // at the edges is cheap and simpler than tracking exact gaps.
  const loadedRangeRef = useRef<{ start: string; end: string }>((() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 8);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  })());

  async function ensureMealPlanRange(start: string, end: string) {
    const loaded = loadedRangeRef.current;
    if (start >= loaded.start && end <= loaded.end) return;
    const nextStart = start < loaded.start ? start : loaded.start;
    const nextEnd = end > loaded.end ? end : loaded.end;
    try {
      const { mealPlan: fetched, dailyExtras: fetchedExtras } = await getMealPlanRangeAction(nextStart, nextEnd);
      loadedRangeRef.current = { start: nextStart, end: nextEnd };
      setMealPlan((prevPlan) => ({ ...prevPlan, ...fetched }));
      setDailyExtras((prevExtras) => {
        const byId = new Map(prevExtras.map((e) => [e.id, e]));
        fetchedExtras.forEach((e) => byId.set(e.id, e));
        return Array.from(byId.values());
      });
    } catch {
      showToast("Couldn't load that week — try again.");
    }
  }

  function dayNutrition(date: string) {
    const slots = mealPlan[date] || {};
    const fromMeals = MEAL_SLOTS.reduce(
      (acc, mt) => {
        const slot = slots[mt];
        if (slot?.custom) {
          return {
            calories: acc.calories + slot.custom.calories,
            protein: acc.protein + slot.custom.protein,
            fiber: acc.fiber + slot.custom.fiber,
          };
        }
        const r = recipes.find((rc) => rc.id === slot?.recipeId);
        if (!r) return acc;
        const flexIds = slot?.flexSelection;
        return {
          calories: acc.calories + recipeCalories(r, flexIds).perServing,
          protein: acc.protein + recipeProtein(r, flexIds).perServing,
          fiber: acc.fiber + recipeFiber(r, flexIds).perServing,
        };
      },
      { calories: 0, protein: 0, fiber: 0 }
    );
    const extraCalories = dailyExtras
      .filter((e) => e.date === date)
      .reduce((sum, e) => sum + e.calories, 0);
    return { ...fromMeals, calories: fromMeals.calories + extraCalories };
  }

  async function addWeekItem(bucket: WeekBucket, recipeId: string) {
    if (weekItems.some((w) => w.bucket === bucket && w.recipeId === recipeId)) return;
    try {
      const saved = await addWeekItemAction(bucket, recipeId);
      setWeekItems((prev) => [...prev.filter((w) => w.id !== saved.id), saved]);
    } catch {
      showToast("Couldn't add that recipe — try again.");
    }
  }

  async function removeWeekItem(id: string) {
    const prev = weekItems;
    setWeekItems(prev.filter((w) => w.id !== id));
    try {
      await removeWeekItemAction(id);
    } catch {
      setWeekItems(prev);
      showToast("Couldn't remove that — try again.");
    }
  }

  async function startNewWeek() {
    setConfirmNewWeek(false);
    try {
      const list = await startNewWeekAction();
      setWeekItems([]);
      setShoppingList(list);
      showToast("New week started.");
    } catch {
      showToast("Couldn't start a new week — try again.");
    }
  }

  async function copyWeekLink() {
    const url = `${window.location.origin}/week`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied — paste it into the Trello card.");
    } catch {
      showToast(url);
    }
  }

  async function copyRecipeLink(recipeId: string) {
    const url = `${window.location.origin}/recipe/${recipeId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Recipe link copied.");
    } catch {
      showToast(url);
    }
  }

  // The shopping list builds from "This week" — every bucket, every recipe
  // in it, once each. Pantry staples are skipped; flex ingredients use the
  // recipe's own defaults since a week bucket has no per-occurrence choice.
  async function buildShoppingList() {
    const map: Record<
      string,
      { name: string; unit: string; quantity: number; recipes: Set<string> }
    > = {};

    const seen = new Set<string>();
    weekItems.forEach((item) => {
      if (seen.has(item.recipeId)) return;
      seen.add(item.recipeId);
      const recipe = recipes.find((r) => r.id === item.recipeId);
      if (!recipe) return;
      const servings = parseFloat(String(recipe.servings)) || 1;
      (recipe.ingredients || []).forEach((ing) => {
        if (ing.isSectionHeader) return;
        if (!ing.name || !ing.name.trim()) return;
        const linkedLibraryEntry = ing.libraryId
          ? ingredientLibrary.find((l) => l.id === ing.libraryId)
          : null;
        if (linkedLibraryEntry?.pantryStaple) return;
        if (ing.isFlex && !ing.flexDefault) return;
        const key = ing.name.trim().toLowerCase() + "|" + (ing.unit || "");
        const enteredQty = parseFloat(ing.quantity) || 0;
        // "Whole recipe" quantities are already the total to buy. "Per
        // serving" quantities (toppings, garnishes) need scaling up by
        // how many servings the recipe makes.
        const qty = ing.servingMode === "perServing" ? enteredQty * servings : enteredQty;
        if (!map[key]) {
          map[key] = { name: ing.name.trim(), unit: ing.unit || "", quantity: 0, recipes: new Set() };
        }
        map[key].quantity += qty;
        map[key].recipes.add(recipe.name);
      });
    });

    const list: ShoppingItem[] = Object.values(map)
      .map((item) => ({
        id: generateId(),
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        recipes: Array.from(item.recipes),
        checked: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    try {
      const saved = await syncShoppingListAction(list);
      setShoppingList(saved);
      setView("shoppingList");
      showToast(saved.length ? "Shopping list ready." : "Nothing in this week yet — add some recipes first.");
    } catch {
      showToast("Couldn't build the shopping list — try again.");
    }
  }

  async function toggleShoppingItem(id: string) {
    const prev = shoppingList;
    const next = shoppingList.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    setShoppingList(next);
    const item = next.find((i) => i.id === id);
    try {
      if (item) await toggleShoppingItemAction(id, item.checked);
    } catch {
      setShoppingList(prev);
      showToast("Couldn't update that item — try again.");
    }
  }

  async function clearCheckedItems() {
    const checkedIds = shoppingList.filter((i) => i.checked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    const prev = shoppingList;
    const next = shoppingList.filter((i) => !i.checked);
    setShoppingList(next);
    try {
      await deleteShoppingItemsAction(checkedIds);
      showToast("Removed purchased items.");
    } catch {
      setShoppingList(prev);
      showToast("Couldn't clear checked items — try again.");
    }
  }

  async function addManualShoppingItem(name: string) {
    if (!name.trim()) return;
    try {
      const saved = await addManualShoppingItemAction(name);
      setShoppingList((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      showToast("Added to shopping list.");
    } catch {
      showToast("Couldn't add that item — try again.");
    }
  }

  async function saveLibraryIngredient(
    input: LibraryIngredientInput
  ): Promise<LibraryIngredient | null> {
    try {
      const saved = await saveLibraryIngredientAction(input);
      setIngredientLibrary((prev) => {
        const exists = prev.some((i) => i.id === saved.id);
        const next = exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      return saved;
    } catch {
      showToast("Couldn't save to ingredient library — try again.");
      return null;
    }
  }

  async function updateLibraryIngredient(
    id: string,
    input: LibraryIngredientInput
  ): Promise<LibraryIngredient | null> {
    try {
      const saved = await updateLibraryIngredientAction(id, input);
      setIngredientLibrary((prev) =>
        prev.map((i) => (i.id === saved.id ? saved : i)).sort((a, b) => a.name.localeCompare(b.name))
      );
      showToast("Ingredient updated.");
      return saved;
    } catch {
      showToast("Couldn't update ingredient — that name might already be in use.");
      return null;
    }
  }

  async function deleteLibraryIngredient(id: string) {
    const prev = ingredientLibrary;
    setIngredientLibrary((cur) => cur.filter((i) => i.id !== id));
    try {
      await deleteLibraryIngredientAction(id);
      showToast("Ingredient removed from library.");
    } catch {
      setIngredientLibrary(prev);
      showToast("Couldn't delete ingredient — try again.");
    }
  }

  async function addDailyExtra(date: string, name: string, calories: number) {
    try {
      const saved = await addDailyExtraAction(date, name, calories);
      setDailyExtras((prev) => [...prev, saved]);
    } catch {
      showToast("Couldn't add that — try again.");
    }
  }

  async function deleteDailyExtra(id: string) {
    const prev = dailyExtras;
    setDailyExtras((cur) => cur.filter((e) => e.id !== id));
    try {
      await deleteDailyExtraAction(id);
    } catch {
      setDailyExtras(prev);
      showToast("Couldn't remove that — try again.");
    }
  }

  const filteredRecipes = recipes.filter((r) => {
    const matchesQuery = r.name.toLowerCase().includes(browseQuery.toLowerCase());
    const matchesCategory = browseCategory === "All" || r.category === browseCategory;
    return matchesQuery && matchesCategory;
  });

  const todaysPlan = mealPlan[days[0]?.date] || {};

  return (
    <div className="min-h-screen bg-stone-100 pb-20 md:pb-8">
      <TopBar view={view} setView={setView} />

      <div
        className="fixed top-0 inset-x-0 flex justify-center z-40 pointer-events-none transition-[transform,opacity] duration-150 ease-out"
        style={{
          transform: `translateY(${pullDistance > 0 || refreshing ? Math.min(pullDistance, 60) - 36 : -36}px)`,
          opacity: pullDistance > 0 || refreshing ? 1 : 0,
        }}
      >
        <div className="mt-3 w-9 h-9 rounded-full bg-amber-50 border border-stone-200 shadow flex items-center justify-center">
          <RefreshCw
            size={16}
            className={`text-emerald-800 ${refreshing ? "animate-spin" : ""}`}
            style={
              refreshing
                ? undefined
                : { transform: `rotate(${Math.min((pullDistance / 70) * 180, 180)}deg)` }
            }
          />
        </div>
      </div>

      <main ref={mainRef} className="max-w-5xl mx-auto px-4 pt-6 md:pt-10">
        {view === "home" && (
          <HomeView
            recipes={recipes}
            days={days}
            mealPlan={mealPlan}
            todaysPlan={todaysPlan}
            dayNutrition={dayNutrition}
            setView={setView}
            setEditingRecipe={setEditingRecipe}
            onQuickAdd={addManualShoppingItem}
            shoppingListCount={shoppingList.length}
            onCookToday={(date, slot, recipe) =>
              setCookingSession({
                recipe,
                flexIds: mealPlan[date]?.[slot]?.flexSelection ?? defaultFlexIds(recipe),
                date,
                slot,
                servingMultiplier: 1,
              })
            }
            onToggleEaten={toggleMealEaten}
          />
        )}

        {view === "addRecipe" && (
          <RecipeForm
            initial={editingRecipe || emptyRecipe()}
            onCancel={() => {
              setEditingRecipe(null);
              setView(editingRecipe ? "recipeDetail" : "browse");
            }}
            onSave={saveRecipe}
            ingredientLibrary={ingredientLibrary}
            onSaveLibraryIngredient={saveLibraryIngredient}
          />
        )}

        {view === "browse" && (
          <RecipesView
            recipes={filteredRecipes}
            allRecipesCount={recipes.length}
            query={browseQuery}
            setQuery={setBrowseQuery}
            category={browseCategory}
            setCategory={setBrowseCategory}
            onOpen={(id) => {
              setSelectedRecipeId(id);
              setView("recipeDetail");
            }}
            onAdd={() => {
              setEditingRecipe(null);
              setView("addRecipe");
            }}
            onImport={() => setView("importRecipe")}
            onManageIngredients={() => setView("ingredientLibrary")}
          />
        )}

        {view === "importRecipe" && (
          <ImportRecipeView
            onImport={importRecipe}
            onDone={(recipeId) => {
              setSelectedRecipeId(recipeId);
              setView("recipeDetail");
            }}
            onCancel={() => setView("browse")}
          />
        )}

        {view === "ingredientLibrary" && (
          <IngredientLibraryView
            library={ingredientLibrary}
            onAdd={saveLibraryIngredient}
            onUpdate={updateLibraryIngredient}
            onDelete={deleteLibraryIngredient}
            onAddToShoppingList={addManualShoppingItem}
            onBack={() => setView("browse")}
          />
        )}

        {view === "recipeDetail" &&
          (() => {
            const recipe = recipes.find((r) => r.id === selectedRecipeId);
            if (!recipe) {
              setView("browse");
              return null;
            }
            return (
              <RecipeDetail
                recipe={recipe}
                onBack={() => setView("browse")}
                onEdit={() => {
                  setEditingRecipe(recipe);
                  setView("addRecipe");
                }}
                onDelete={() => setConfirmDeleteId(recipe.id)}
                onPrint={() => showToast("4×6 label export is coming in a future version.")}
                onCopyLink={() => copyRecipeLink(recipe.id)}
                onStartCooking={(multiplier) =>
                  setCookingSession({
                    recipe,
                    flexIds: defaultFlexIds(recipe),
                    servingMultiplier: multiplier,
                  })
                }
              />
            );
          })()}

        {view === "mealPlan" && (
          <MealPlanView
            mealPlan={mealPlan}
            recipes={recipes}
            dailyExtras={dailyExtras}
            dayNutrition={dayNutrition}
            activeDayIdx={activeDayIdx}
            setActiveDayIdx={setActiveDayIdx}
            openPicker={(date, slot) => setPickerSlot({ date, slot })}
            openExtras={(date) => setExtrasDate(date)}
            openSlotActions={(date, slot) => setSlotActionTarget({ date, slot })}
            onBuildList={buildShoppingList}
            onMoveMeal={moveMeal}
            onEnsureRange={ensureMealPlanRange}
            cookingCell={
              cookingSession && cookingSession.date && cookingSession.slot
                ? { date: cookingSession.date, slot: cookingSession.slot }
                : null
            }
          />
        )}

        {view === "week" && (
          <WeekView
            recipes={recipes}
            weekItems={weekItems}
            shoppingListCount={shoppingList.length}
            onAdd={addWeekItem}
            onRemove={removeWeekItem}
            onOpenRecipe={(id) => {
              setSelectedRecipeId(id);
              setView("recipeDetail");
            }}
            onStartCooking={(recipe) =>
              setCookingSession({ recipe, flexIds: defaultFlexIds(recipe), servingMultiplier: 1 })
            }
            onBuildList={buildShoppingList}
            onStartNewWeek={() => setConfirmNewWeek(true)}
            onCopyLink={copyWeekLink}
          />
        )}

        {view === "shoppingList" && (
          <ShoppingListView
            list={shoppingList}
            onToggle={toggleShoppingItem}
            onRebuild={buildShoppingList}
            onClearChecked={clearCheckedItems}
            onAdd={addManualShoppingItem}
          />
        )}
      </main>

      {confirmNewWeek && (
        <ConfirmModal
          message="Start a new week? This clears every bucket and the recipe items on the shopping list. Items you added by hand stay."
          confirmLabel="Start new week"
          onCancel={() => setConfirmNewWeek(false)}
          onConfirm={startNewWeek}
        />
      )}

      {pickerSlot && (
        <RecipePickerModal
          recipes={recipes}
          slot={pickerSlot}
          current={(mealPlan[pickerSlot.date] || {})[pickerSlot.slot] || null}
          onPick={(id) => assignMeal(pickerSlot.date, pickerSlot.slot, id)}
          onSaveCustom={(custom) => assignCustomMeal(pickerSlot.date, pickerSlot.slot, custom)}
          onClear={() => clearMeal(pickerSlot.date, pickerSlot.slot)}
          onClose={() => setPickerSlot(null)}
          onAddNew={() => {
            setPickerSlot(null);
            setEditingRecipe(null);
            setView("addRecipe");
          }}
        />
      )}

      {extrasDate && (
        <ExtrasModal
          date={extrasDate}
          extras={dailyExtras.filter((e) => e.date === extrasDate)}
          ingredientLibrary={ingredientLibrary}
          onAdd={(name, calories) => addDailyExtra(extrasDate, name, calories)}
          onDelete={deleteDailyExtra}
          onClose={() => setExtrasDate(null)}
        />
      )}

      {modifySlot &&
        (() => {
          const slotValue = mealPlan[modifySlot.date]?.[modifySlot.slot];
          const recipe = slotValue?.recipeId
            ? recipes.find((r) => r.id === slotValue.recipeId)
            : null;
          if (!recipe) {
            setModifySlot(null);
            return null;
          }
          return (
            <FlexModifyModal
              recipeName={recipe.name}
              flexIngredients={recipe.ingredients.filter((i) => i.isFlex)}
              selected={slotValue?.flexSelection ?? defaultFlexIds(recipe)}
              onSave={(ids) => updateFlexSelection(modifySlot.date, modifySlot.slot, ids)}
              onClose={() => setModifySlot(null)}
            />
          );
        })()}

      {slotActionTarget &&
        (() => {
          const slotValue = mealPlan[slotActionTarget.date]?.[slotActionTarget.slot];
          if (!slotValue || (!slotValue.recipeId && !slotValue.custom)) {
            setSlotActionTarget(null);
            return null;
          }
          const recipe = slotValue.recipeId
            ? recipes.find((r) => r.id === slotValue.recipeId) ?? null
            : null;
          const canModify = Boolean(recipe && hasFlexIngredients(recipe));
          const canCook = Boolean(recipe);
          const name = slotValue.custom ? slotValue.custom.name : recipe?.name ?? "";
          return (
            <MealSlotActionModal
              name={name}
              canModify={canModify}
              canCook={canCook}
              onRemove={() => {
                clearMeal(slotActionTarget.date, slotActionTarget.slot);
                setSlotActionTarget(null);
              }}
              onModify={() => {
                setModifySlot(slotActionTarget);
                setSlotActionTarget(null);
              }}
              onSwap={() => {
                setPickerSlot(slotActionTarget);
                setSlotActionTarget(null);
              }}
              onCook={() => {
                if (recipe) {
                  setCookingSession({
                    recipe,
                    flexIds: slotValue.flexSelection ?? defaultFlexIds(recipe),
                    date: slotActionTarget.date,
                    slot: slotActionTarget.slot,
                    servingMultiplier: 1,
                  });
                }
                setSlotActionTarget(null);
              }}
              onClose={() => setSlotActionTarget(null)}
            />
          );
        })()}

      {cookingSession && (
        <CookingMode
          recipe={cookingSession.recipe}
          flexIds={cookingSession.flexIds}
          servingMultiplier={cookingSession.servingMultiplier}
          sessionKey={cookingSessionKey(
            cookingSession.recipe.id,
            cookingSession.date,
            cookingSession.slot
          )}
          onClose={() => setCookingSession(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this recipe? It'll be removed from any planned meals too."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteRecipe(confirmDeleteId)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-amber-50 text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ---------- Navigation ---------- */

function NavItems({
  view,
  setView,
  orientation,
}: {
  view: View;
  setView: (v: View) => void;
  orientation: "row" | "col";
}) {
  const items: { key: View; label: string; Icon: typeof HomeIcon }[] = [
    { key: "home", label: "Home", Icon: HomeIcon },
    { key: "browse", label: "Recipes", Icon: BookOpen },
    { key: "week", label: "This Week", Icon: CalendarDays },
    { key: "shoppingList", label: "Shopping", Icon: ShoppingCart },
  ];
  const isRow = orientation === "row";
  return (
    <>
      {items.map(({ key, label, Icon }) => {
        const active =
          view === key ||
          (key === "browse" &&
            (view === "recipeDetail" ||
              view === "addRecipe" ||
              view === "ingredientLibrary" ||
              view === "importRecipe"));
        return (
          <button
            key={key}
            onClick={() => setView(key)}
            className={
              isRow
                ? `flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    active ? "bg-emerald-800 text-amber-50" : "text-stone-600 hover:bg-stone-200"
                  }`
                : `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs font-medium ${
                    active ? "text-emerald-800" : "text-stone-400"
                  }`
            }
          >
            <Icon size={isRow ? 16 : 20} strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </button>
        );
      })}
    </>
  );
}

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <header className="hidden md:flex items-center justify-between max-w-5xl mx-auto px-4 pt-6">
      <button onClick={() => setView("home")} className="font-display text-2xl text-stone-900 tracking-tight">
        The Larder
      </button>
      <nav className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-full">
        <NavItems view={view} setView={setView} orientation="row" />
      </nav>
    </header>
  );
}

function BottomNav({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-amber-50 border-t border-stone-200 flex z-40">
      <NavItems view={view} setView={setView} orientation="col" />
    </nav>
  );
}

/* ---------- Import Recipe (JSON upload) ---------- */

function validateImportPayload(
  json: unknown
): { ok: true; payload: RecipeImportPayload } | { ok: false; error: string } {
  if (!json || typeof json !== "object") {
    return { ok: false, error: "That file doesn't contain a JSON object." };
  }
  const obj = json as Record<string, unknown>;
  const recipe = obj.recipe;
  if (!recipe || typeof recipe !== "object") {
    return { ok: false, error: 'Missing a "recipe" object.' };
  }
  const r = recipe as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) {
    return { ok: false, error: "The recipe is missing a name." };
  }
  if (!Array.isArray(r.ingredients)) {
    return { ok: false, error: "The recipe is missing an ingredients array." };
  }
  const newIngredients = Array.isArray(obj.newIngredients) ? obj.newIngredients : [];
  const refs = new Set(
    newIngredients.map((n) => (n as { ref?: unknown }).ref).filter((ref) => typeof ref === "string")
  );
  for (const ing of r.ingredients as Record<string, unknown>[]) {
    if (ing.newIngredientRef && !refs.has(ing.newIngredientRef as string)) {
      return {
        ok: false,
        error: `"${ing.name}" references a new ingredient ("${ing.newIngredientRef}") that isn't listed in newIngredients.`,
      };
    }
  }

  return {
    ok: true,
    payload: {
      recipe: {
        name: r.name as string,
        category: typeof r.category === "string" ? r.category : "Dinner",
        servings: (r.servings as number | string) ?? 4,
        instructions: typeof r.instructions === "string" ? r.instructions : "",
        ingredients: r.ingredients as ImportIngredient[],
        sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : null,
        prepSteps: typeof r.prepSteps === "string" ? r.prepSteps : "",
      },
      newIngredients: newIngredients as NewLibraryIngredientInput[],
    },
  };
}

type SmartImage = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string; name: string };

// Phone photos are 3–5 MB each; the parser reads text off them just as
// well at 1600px, so shrink client-side before shipping base64 over the
// wire. Falls back to the original bytes when the browser can't decode
// the file (rare — a format canvas doesn't support).
async function fileToSmartImage(file: File): Promise<SmartImage> {
  const MAX_EDGE = 1600;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1], name: file.name };
  } catch {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
    const mediaType = allowed.find((t) => t === file.type);
    if (!mediaType) throw new Error(`Couldn't read ${file.name} — try a JPEG or PNG screenshot.`);
    const buf = await file.arrayBuffer();
    let binary = "";
    new Uint8Array(buf).forEach((b) => (binary += String.fromCharCode(b)));
    return { mediaType, data: btoa(binary), name: file.name };
  }
}

function ImportRecipeView({
  onImport,
  onDone,
  onCancel,
}: {
  onImport: (payload: RecipeImportPayload) => Promise<{ recipeId: string } | null>;
  onDone: (recipeId: string) => void;
  onCancel: () => void;
}) {
  const [inputMode, setInputMode] = useState<"smart" | "upload" | "paste">("smart");
  const [pasteText, setPasteText] = useState("");
  const [payload, setPayload] = useState<RecipeImportPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Smart" mode: a link, pasted text, and/or photos go to /api/import/parse,
  // which fetches the page (if any) and has Claude turn it into a payload.
  const [smartUrl, setSmartUrl] = useState("");
  const [smartText, setSmartText] = useState("");
  const [smartImages, setSmartImages] = useState<SmartImage[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseNotes, setParseNotes] = useState<string | null>(null);
  const [needsScreenshot, setNeedsScreenshot] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotos(files: FileList) {
    setParseError(null);
    try {
      const next = await Promise.all(Array.from(files).slice(0, 6).map(fileToSmartImage));
      setSmartImages((prev) => [...prev, ...next].slice(0, 6));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that photo.");
    }
  }

  async function runSmartImport() {
    if (parsing) return;
    setParseError(null);
    setNeedsScreenshot(false);
    setParsing(true);
    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: smartUrl.trim() || undefined,
          text: smartText.trim() || undefined,
          images: smartImages.map(({ mediaType, data }) => ({ mediaType, data })),
        }),
      });
      const json = (await res.json()) as {
        payload?: RecipeImportPayload;
        notes?: string;
        error?: string;
        needsScreenshot?: boolean;
      };
      if (!res.ok || !json.payload) {
        setParseError(json.error ?? "Something went wrong reading that recipe.");
        setNeedsScreenshot(Boolean(json.needsScreenshot));
        return;
      }
      const validated = validateImportPayload(json.payload);
      if (!validated.ok) {
        setParseError(validated.error);
        return;
      }
      setParseNotes(json.notes?.trim() || null);
      setPayload(validated.payload);
    } catch {
      setParseError("Couldn't reach the server. Is the app still running?");
    } finally {
      setParsing(false);
    }
  }

  const canRunSmart = Boolean(smartUrl.trim() || smartText.trim() || smartImages.length > 0);

  function parseAndSetPayload(text: string) {
    setParseError(null);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      setParseError("That doesn't look like valid JSON.");
      return;
    }
    const validated = validateImportPayload(json);
    if (!validated.ok) {
      setParseError(validated.error);
      return;
    }
    setPayload(validated.payload);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => parseAndSetPayload(String(reader.result));
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function updateRecipeIngredient(idx: number, patch: Partial<ImportIngredient>) {
    setPayload((prev) => {
      if (!prev) return prev;
      const ingredients = prev.recipe.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing));
      return { ...prev, recipe: { ...prev.recipe, ingredients } };
    });
  }

  function toggleIngredientFlex(idx: number, ing: ImportIngredient) {
    const nextIsFlex = !ing.isFlex;
    updateRecipeIngredient(idx, { isFlex: nextIsFlex, flexDefault: nextIsFlex ? (ing.flexDefault ?? false) : false });
  }

  function toggleIngredientFlexDefault(idx: number, ing: ImportIngredient) {
    updateRecipeIngredient(idx, { flexDefault: !ing.flexDefault });
  }

  function toggleNewIngredientPantryStaple(ref: string) {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        newIngredients: prev.newIngredients.map((n) =>
          n.ref === ref ? { ...n, pantryStaple: !n.pantryStaple } : n
        ),
      };
    });
  }

  async function confirmImport() {
    if (!payload) return;
    setImporting(true);
    const result = await onImport(payload);
    setImporting(false);
    if (result) onDone(result.recipeId);
  }

  const steps = payload ? parseInstructionSteps(payload.recipe.instructions) : [];

  return (
    <div>
      <button onClick={onCancel} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>
      <h1 className="font-display text-2xl text-stone-900 mb-5">Import recipe</h1>

      {!payload ? (
        <div className="bg-amber-50 border border-dashed border-stone-300 rounded-2xl p-8">
          <div className="flex gap-1.5 justify-center mb-6 flex-wrap">
            <button
              onClick={() => {
                setInputMode("smart");
                setParseError(null);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                inputMode === "smart"
                  ? "bg-stone-800 text-amber-50 border-stone-800"
                  : "border-stone-200 text-stone-600"
              }`}
            >
              Link, text or photo
            </button>
            <button
              onClick={() => {
                setInputMode("upload");
                setParseError(null);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                inputMode === "upload"
                  ? "bg-stone-800 text-amber-50 border-stone-800"
                  : "border-stone-200 text-stone-600"
              }`}
            >
              Upload file
            </button>
            <button
              onClick={() => {
                setInputMode("paste");
                setParseError(null);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                inputMode === "paste"
                  ? "bg-stone-800 text-amber-50 border-stone-800"
                  : "border-stone-200 text-stone-600"
              }`}
            >
              Paste JSON
            </button>
          </div>

          {inputMode === "smart" ? (
            <div>
              <p className="text-stone-600 text-sm mb-1 text-center">Drop in a recipe from anywhere</p>
              <p className="text-stone-400 text-xs mb-5 text-center">
                A link (Instagram or any recipe site), pasted text, a screenshot — or any mix.
              </p>

              <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Link</label>
              <input
                type="url"
                inputMode="url"
                value={smartUrl}
                onChange={(e) => setSmartUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/…"
                disabled={parsing}
                className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-4"
              />

              <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Text</label>
              <textarea
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                placeholder="Paste a caption or a recipe here (optional)…"
                rows={4}
                disabled={parsing}
                className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-4"
              />

              <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Photos</label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handlePhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mt-1.5 sm:mt-1 flex flex-wrap items-center gap-2 mb-5">
                {smartImages.map((img, idx) => (
                  <div key={idx} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${img.mediaType};base64,${img.data}`}
                      alt={img.name}
                      className="h-16 w-16 object-cover rounded-lg border border-stone-200"
                    />
                    <button
                      type="button"
                      onClick={() => setSmartImages((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={parsing}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-800 text-amber-50 flex items-center justify-center"
                      title="Remove photo"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={parsing || smartImages.length >= 6}
                  className="h-16 px-4 rounded-lg border border-dashed border-stone-300 text-sm text-stone-600 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Plus size={14} /> {smartImages.length === 0 ? "Add screenshot" : "Add another"}
                </button>
              </div>

              <div className="text-center">
                <button
                  onClick={runSmartImport}
                  disabled={!canRunSmart || parsing}
                  className="inline-flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-40"
                >
                  <Sparkles size={15} /> {parsing ? "Reading the recipe…" : "Create recipe"}
                </button>
                {parsing && (
                  <p className="text-stone-400 text-xs mt-3">This usually takes 20–40 seconds.</p>
                )}
              </div>
            </div>
          ) : inputMode === "upload" ? (
            <div className="text-center">
              <Upload size={28} className="mx-auto text-stone-400 mb-3" />
              <p className="text-stone-600 text-sm mb-1">Upload a recipe .json file</p>
              <p className="text-stone-400 text-xs mb-4">
                Generated by the recipe-import Claude Skill, or hand-written to match its format.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full"
              >
                <Upload size={15} /> Choose file
              </button>
            </div>
          ) : (
            <div>
              <p className="text-stone-600 text-sm mb-1 text-center">Paste the recipe JSON</p>
              <p className="text-stone-400 text-xs mb-4 text-center">
                Copy the whole output from Claude Chat and paste it below.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="{ &quot;recipe&quot;: { ... }, &quot;newIngredients&quot;: [...] }"
                rows={8}
                className="w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-3"
              />
              <div className="text-center">
                <button
                  onClick={() => parseAndSetPayload(pasteText)}
                  disabled={!pasteText.trim()}
                  className="inline-flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full disabled:opacity-40"
                >
                  Parse pasted JSON
                </button>
              </div>
            </div>
          )}

          {parseError && (
            <div className="mt-4 text-center">
              <p className="text-orange-700 text-sm">{parseError}</p>
              {needsScreenshot && (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-800 font-medium hover:underline"
                >
                  <Plus size={14} /> Add a screenshot
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5">
            <span
              className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${
                CATEGORY_STYLE[payload.recipe.category] ?? "bg-stone-200 text-stone-700"
              }`}
            >
              {payload.recipe.category}
            </span>
            <h2 className="font-display text-xl text-stone-900">{payload.recipe.name}</h2>
            <p className="text-stone-500 text-sm mt-1">
              {payload.recipe.servings} servings
              {payload.recipe.sourceUrl && (
                <>
                  {" · "}
                  <a
                    href={payload.recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-800 underline underline-offset-2"
                  >
                    {sourceLabel(payload.recipe.sourceUrl)}
                  </a>
                </>
              )}
            </p>
            {parseNotes && (
              <p className="mt-3 text-sm text-amber-900 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                <span className="font-medium">Worth a check:</span> {parseNotes}
              </p>
            )}
          </div>

          {payload.newIngredients.length > 0 && (
            <div className="bg-amber-100 border border-amber-200 rounded-2xl p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-amber-900 mb-2">
                <Sparkles size={14} /> {payload.newIngredients.length} new ingredient
                {payload.newIngredients.length === 1 ? "" : "s"} will be added to your library
              </h3>
              <ul className="space-y-1.5">
                {payload.newIngredients.map((n) => (
                  <li
                    key={n.ref}
                    className="text-sm text-stone-700 flex items-center justify-between gap-2 bg-white/60 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="font-medium">{n.name}</span>
                      {n.caloriesPerBaseUnit > 0 && (
                        <span className="text-xs text-stone-500 ml-2">
                          {n.baseUnit === "grams"
                            ? `${Math.round(n.caloriesPerBaseUnit * 100 * 100) / 100} cal/100g`
                            : `${n.caloriesPerBaseUnit} cal/item`}
                          {n.referenceUnit && n.gramsPerReferenceUnit
                            ? ` · ${n.gramsPerReferenceUnit}g/${n.referenceUnit}`
                            : ""}
                        </span>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-stone-600 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={n.pantryStaple ?? false}
                        onChange={() => toggleNewIngredientPantryStaple(n.ref)}
                        className="rounded border-stone-300"
                      />
                      Pantry staple
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5">
            <h3 className="font-display text-lg text-stone-900 mb-3">Ingredients</h3>
            <p className="flex items-center gap-1 text-[11px] text-stone-400 mb-2">
              <Shuffle size={10} /> = flexible ·{" "}
              <Star size={10} className="text-amber-500 fill-amber-500" /> = its default option
            </p>
            <table className="w-full text-sm">
              <tbody>
                {payload.recipe.ingredients.map((ing, idx) =>
                  ing.isSectionHeader ? (
                    <tr key={idx}>
                      <td colSpan={4} className={idx === 0 ? "pt-0 pb-2" : "pt-6 pb-2"}>
                        {ing.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wide whitespace-nowrap">
                              {ing.name}
                            </span>
                            <div className="flex-1 border-t-2 border-stone-300" />
                          </div>
                        ) : (
                          <div className="border-t-2 border-stone-300" />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={idx} className="border-b border-stone-200 last:border-0">
                      <td className="py-2 text-stone-800">
                        {ing.name}
                        {ing.newIngredientRef && (
                          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full">
                            New
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-stone-500 text-right whitespace-nowrap">
                        {ing.quantity} {ing.unit}
                      </td>
                      <td className="py-2 text-stone-400 text-right w-16">{ing.calories || 0} cal</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleIngredientFlex(idx, ing)}
                            title={ing.isFlex ? "Flexible ingredient — click to make fixed" : "Make this a flexible ingredient"}
                            className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              ing.isFlex ? "bg-emerald-100 text-emerald-700" : "text-stone-300 hover:text-stone-500"
                            }`}
                          >
                            <Shuffle size={12} />
                          </button>
                          {ing.isFlex && (
                            <button
                              type="button"
                              onClick={() => toggleIngredientFlexDefault(idx, ing)}
                              title={
                                ing.flexDefault
                                  ? "Included by default when scheduled"
                                  : "Include by default when scheduled"
                              }
                              className="w-6 h-6 rounded-full flex items-center justify-center"
                            >
                              <Star size={12} className={ing.flexDefault ? "text-amber-500 fill-amber-500" : "text-stone-300"} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5">
            <h3 className="font-display text-lg text-stone-900 mb-3">Instructions</h3>
            {steps.length === 0 ? (
              <p className="text-stone-500 text-sm">No instructions.</p>
            ) : (
              <ol className="space-y-3">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="font-display text-stone-400 flex-shrink-0 w-5">{idx + 1}</span>
                    <div>
                      {step.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {step.categories.map((c) => (
                            <span
                              key={c}
                              className="text-[10px] font-medium uppercase tracking-wide bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-stone-700 leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {payload.recipe.prepSteps?.trim() && (
            <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5">
              <h3 className="font-display text-lg text-stone-900 mb-1">Prep ahead</h3>
              <p className="text-[11px] text-stone-400 mb-3">
                Suggested steps a helper can do a day or two early. Edit these on the recipe after importing.
              </p>
              <ol className="space-y-1.5">
                {parseInstructionSteps(payload.recipe.prepSteps).map((step, idx) => (
                  <li key={idx} className="flex gap-2 text-sm">
                    <span className="font-display text-stone-400 flex-shrink-0 w-4">{idx + 1}</span>
                    <span className="text-stone-700">{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setPayload(null);
                setPasteText("");
                setParseNotes(null);
              }}
              className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Start over
            </button>
            <button
              onClick={confirmImport}
              disabled={importing}
              className="px-5 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
            >
              {importing ? "Importing…" : "Confirm & import"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Recipe Detail ---------- */

function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  onDelete,
  onPrint,
  onCopyLink,
  onStartCooking,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onCopyLink: () => void;
  onStartCooking: (servingMultiplier: number) => void;
}) {
  const [multiplier, setMultiplier] = useState(1);
  const { perServing } = recipeCalories(recipe);
  const { perServing: proteinPerServing } = recipeProtein(recipe);
  const { perServing: fiberPerServing } = recipeFiber(recipe);
  const steps = parseInstructionSteps(recipe.instructions);
  const prepSteps = parseInstructionSteps(recipe.prepSteps ?? "");
  const baseServings = parseFloat(String(recipe.servings)) || 0;
  const scaledServings = Math.round(baseServings * multiplier * 10) / 10;
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${CATEGORY_STYLE[recipe.category]}`}>
              {recipe.category}
            </span>
            <h1 className="font-display text-3xl text-stone-900">{recipe.name}</h1>
            <div className="flex items-center gap-3 flex-wrap mt-1.5">
              <span className="text-stone-500 text-sm">
                {scaledServings} serving{scaledServings === 1 ? "" : "s"}
              </span>
              <NutritionChips
                nutrition={{ calories: perServing, protein: proteinPerServing, fiber: fiberPerServing }}
                size="sm"
              />
              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-800 underline underline-offset-2 truncate max-w-[16rem]"
                  title={recipe.sourceUrl}
                >
                  {sourceLabel(recipe.sourceUrl)}
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-full p-1">
              <button
                onClick={() => setMultiplier((m) => Math.max(0.5, Math.round((m - 0.5) * 10) / 10))}
                title="Scale recipe down"
                className="w-7 h-7 flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
              >
                <Minus size={13} />
              </button>
              <span className="text-xs font-medium text-stone-700 w-8 text-center">{multiplier}×</span>
              <button
                onClick={() => setMultiplier((m) => Math.round((m + 0.5) * 10) / 10)}
                title="Scale recipe up"
                className="w-7 h-7 flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              onClick={() => onStartCooking(multiplier)}
              className="flex items-center gap-1.5 bg-amber-700 text-amber-50 text-sm font-medium px-3.5 py-2 rounded-full"
            >
              <ChefHat size={15} /> Start cooking
            </button>
            <button
              onClick={onCopyLink}
              title="Copy a link to this recipe"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
            >
              <LinkIcon size={15} />
            </button>
            <button
              onClick={onPrint}
              title="Export as 4×6 label PDF (coming soon)"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
            >
              <Printer size={15} />
            </button>
            <button
              onClick={onEdit}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onDelete}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-orange-700 hover:bg-orange-50"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-6">
          <div className="md:col-span-1">
            <h2 className="font-display text-lg text-stone-900 mb-3">Ingredients</h2>
            <table className="w-full text-sm">
              <tbody>
                {recipe.ingredients.map((ing, idx) =>
                  ing.isSectionHeader ? (
                    <tr key={ing.id}>
                      <td colSpan={2} className={idx === 0 ? "pt-0 pb-2" : "pt-6 pb-2"}>
                        {ing.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wide whitespace-nowrap">
                              {ing.name}
                            </span>
                            <div className="flex-1 border-t-2 border-stone-300" />
                          </div>
                        ) : (
                          <div className="border-t-2 border-stone-300" />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={ing.id} className="border-b border-stone-200 last:border-0">
                      <td className="py-2 text-stone-800">
                        <span className="flex items-center gap-1.5">
                          {ing.name}
                          {ing.servingMode === "perServing" && (
                            <span className="text-[10px] text-stone-400">/serving</span>
                          )}
                          {ing.isFlex && <Shuffle size={11} className="text-stone-400" />}
                          {ing.isFlex && ing.flexDefault && (
                            <Star size={11} className="text-amber-500 fill-amber-500" />
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-stone-500 text-right whitespace-nowrap">
                        {scaleQuantityDisplay(ing.quantity, multiplier)} {ing.unit}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {hasFlexIngredients(recipe) && (
              <p className="text-[11px] text-stone-400 mt-3 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <Shuffle size={10} className="text-stone-400" /> flexible
                </span>
                <span className="flex items-center gap-1">
                  <Star size={10} className="text-amber-500 fill-amber-500" /> its default option
                </span>
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <h2 className="font-display text-lg text-stone-900 mb-3">Instructions</h2>
            {steps.length === 0 ? (
              <p className="text-stone-500 text-sm">No instructions added.</p>
            ) : (
              <ol className="space-y-3">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="font-display text-stone-400 flex-shrink-0 w-5">{idx + 1}</span>
                    <div>
                      {step.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {step.categories.map((c) => (
                            <span
                              key={c}
                              className="text-[10px] font-medium uppercase tracking-wide bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-stone-700 leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {prepSteps.length > 0 && (
              <div className="mt-6 pt-5 border-t border-stone-200">
                <h3 className="font-display text-base text-stone-900 mb-2">Prep ahead</h3>
                <ol className="space-y-1.5">
                  {prepSteps.map((step, idx) => (
                    <li key={idx} className="flex gap-2 text-sm">
                      <span className="font-display text-stone-400 flex-shrink-0 w-4">{idx + 1}</span>
                      <span className="text-stone-700">{step.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// "jenneatsgoood.com" / "instagram.com" — the hostname is all a recipe card
// needs to say about where it came from; the full URL is on the link itself.
function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ---------- Recipe Form ---------- */

function RecipeForm({
  initial,
  onCancel,
  onSave,
  ingredientLibrary,
  onSaveLibraryIngredient,
}: {
  initial: Recipe;
  onCancel: () => void;
  onSave: (r: Recipe) => void;
  ingredientLibrary: LibraryIngredient[];
  onSaveLibraryIngredient: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
}) {
  const [recipe, setRecipe] = useState<Recipe>(initial);

  function updateField<K extends keyof Recipe>(field: K, value: Recipe[K]) {
    setRecipe((r) => ({ ...r, [field]: value }));
  }

  function updateIngredient<K extends keyof Ingredient>(id: string, field: K, value: Ingredient[K]) {
    setRecipe((r) => ({
      ...r,
      ingredients: r.ingredients.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)),
    }));
  }

  function addIngredientRow() {
    setRecipe((r) => ({ ...r, ingredients: [...r.ingredients, emptyIngredient()] }));
  }

  function addSectionHeader() {
    setRecipe((r) => ({ ...r, ingredients: [...r.ingredients, emptySectionHeader()] }));
  }

  function removeIngredientRow(id: string) {
    setRecipe((r) => ({ ...r, ingredients: r.ingredients.filter((ing) => ing.id !== id) }));
  }

  // Drag-to-reorder via a dedicated handle (pointer events, not native HTML5
  // drag-and-drop, so it works with touch on iPad) — reorders live as the
  // dragged row crosses another one, same hit-testing approach as the meal
  // plan's drag-to-move. The handle is the only draggable target, so it
  // never fights with clicking into a row's own inputs.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function beginDragRow(e: ReactPointerEvent, id: string) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function handleDragRowMove(e: ReactPointerEvent) {
    if (!draggingId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetId = (el?.closest("[data-ingredient-row]") as HTMLElement | null)?.dataset.ingredientRow;
    if (!targetId || targetId === draggingId) return;
    setRecipe((r) => {
      const fromIdx = r.ingredients.findIndex((i) => i.id === draggingId);
      const toIdx = r.ingredients.findIndex((i) => i.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return r;
      const next = [...r.ingredients];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...r, ingredients: next };
    });
  }

  function endDragRow() {
    setDraggingId(null);
  }

  function handleSave() {
    if (!recipe.name.trim()) return;
    // Section headers are kept regardless of title (blank is a valid,
    // untitled divider) — only blank-named real ingredient rows get dropped.
    // Order is preserved as-is now that flex ingredients can live inside a
    // section alongside fixed ones, rather than always being moved to the end.
    const cleanedIngredients = recipe.ingredients.filter((i) => i.isSectionHeader || i.name.trim());
    const hasRealIngredient = cleanedIngredients.some((i) => !i.isSectionHeader);
    onSave({ ...recipe, ingredients: hasRealIngredient ? cleanedIngredients : [emptyIngredient()] });
  }

  const realIngredientCount = recipe.ingredients.filter((i) => !i.isSectionHeader).length;

  const { perServing } = recipeCalories(recipe);
  const { perServing: proteinPerServing } = recipeProtein(recipe);
  const { perServing: fiberPerServing } = recipeFiber(recipe);

  return (
    <div>
      <button onClick={onCancel} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Cancel
      </button>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-6">
        <h1 className="font-display text-2xl text-stone-900 mb-5">{initial.name ? "Edit recipe" : "New recipe"}</h1>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="sm:col-span-2">
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Recipe name</label>
            <input
              value={recipe.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Weeknight Chili"
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div>
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Category</label>
            <select
              value={recipe.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Servings</label>
            <input
              type="number"
              min="1"
              value={recipe.servings}
              onChange={(e) => updateField("servings", e.target.value)}
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Source link</label>
            <input
              type="url"
              inputMode="url"
              value={recipe.sourceUrl ?? ""}
              onChange={(e) => updateField("sourceUrl", e.target.value)}
              placeholder="https://… (website or Instagram post, optional)"
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Ingredients</label>
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1 text-orange-800">
              <Flame size={12} /> {perServing} cal/serving
            </span>
            <span className="flex items-center gap-1 text-emerald-800">
              <Dumbbell size={12} /> {proteinPerServing}g protein
            </span>
            <span className="flex items-center gap-1 text-[#7a5230]">
              <Wheat size={12} /> {fiberPerServing}g fiber
            </span>
          </div>
        </div>

        <p className="text-[11px] text-stone-400 mb-2 flex items-center gap-1">
          <Shuffle size={10} /> on a row marks it flexible — a swappable option grouped with
          whatever section it's in, instead of always fixed.
        </p>

        <div className="space-y-2 mb-3">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-stone-400 px-1 pl-7">
            <span className="col-span-4">Ingredient</span>
            <span className="col-span-1">Qty</span>
            <span className="col-span-1">Unit</span>
            <span className="col-span-4 text-center flex items-center justify-center gap-1" title="Calories · Protein · Fiber · whole recipe vs. per serving (click a row's chip to edit)">
              <Flame size={10} />
              <Dumbbell size={10} />
              <Wheat size={10} />
            </span>
            <span
              className="col-span-2 flex items-center justify-end gap-2"
              title="Flexible · included by default · delete"
            >
              <Shuffle size={10} />
              <Star size={10} />
            </span>
          </div>
          {recipe.ingredients.map((ing) => (
            <div
              key={ing.id}
              data-ingredient-row={ing.id}
              className={`relative pl-7 transition-opacity ${draggingId === ing.id ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                onPointerDown={(e) => beginDragRow(e, ing.id)}
                onPointerMove={handleDragRowMove}
                onPointerUp={endDragRow}
                onPointerCancel={endDragRow}
                title="Drag to reorder"
                className="absolute left-0 top-2 w-7 h-8 flex items-center justify-center text-stone-300 hover:text-stone-500 cursor-grab touch-none"
              >
                <GripVertical size={15} />
              </button>
              {ing.isSectionHeader ? (
                <SectionHeaderEditRow
                  title={ing.name}
                  onChangeTitle={(title) => updateIngredient(ing.id, "name", title)}
                  onRemove={() => removeIngredientRow(ing.id)}
                />
              ) : (
                <IngredientRow
                  ingredient={ing}
                  library={ingredientLibrary}
                  onChange={(field, value) => updateIngredient(ing.id, field, value)}
                  onRemove={() => removeIngredientRow(ing.id)}
                  disableRemove={realIngredientCount === 1}
                  onSaveNewLibraryIngredient={onSaveLibraryIngredient}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button onClick={addIngredientRow} className="flex items-center gap-1.5 py-2 sm:py-0 text-base sm:text-sm text-emerald-800 font-medium hover:underline">
            <Plus size={16} className="sm:hidden" />
            <Plus size={14} className="hidden sm:block" />
            Add ingredient
          </button>
          <button onClick={addSectionHeader} className="flex items-center gap-1.5 py-2 sm:py-0 text-base sm:text-sm text-stone-500 font-medium hover:underline">
            <Plus size={16} className="sm:hidden" />
            <Plus size={14} className="hidden sm:block" />
            Add section
          </button>
        </div>

        <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Instructions</label>
        <textarea
          value={recipe.instructions}
          onChange={(e) => updateField("instructions", e.target.value)}
          rows={6}
          placeholder="Step by step…"
          className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <p className="text-[11px] text-stone-400 mt-1.5">
          One step per line. Start a line with <span className="text-stone-500">[CATEGORY]</span> to
          tag it with an ingredient section above — used by Cooking Mode to jump to the right
          ingredients.
        </p>

        <div className="mt-5">
          <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Prep ahead</label>
          <textarea
            value={recipe.prepSteps ?? ""}
            onChange={(e) => updateField("prepSteps", e.target.value)}
            rows={4}
            placeholder="What gets done on prep day, one step per line…"
            className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          <p className="text-[11px] text-stone-400 mt-1.5">
            Shows up in the weekly prep guide. Leave blank if it&apos;s all cooked day-of.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-5 py-3 sm:px-4 sm:py-2 rounded-full text-base sm:text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!recipe.name.trim()}
            className="px-6 py-3 sm:px-5 sm:py-2 rounded-full text-base sm:text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
          >
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeaderEditRow({
  title,
  onChangeTitle,
  onRemove,
}: {
  title: string;
  onChangeTitle: (title: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="flex-1 border-t border-stone-300" />
      <input
        value={title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="Section title (optional)"
        className="px-2 py-1.5 text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-emerald-700 rounded"
      />
      <div className="flex-1 border-t border-stone-300" />
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 h-9 w-9 flex items-center justify-center text-stone-400 hover:text-orange-700"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function IngredientRow({
  ingredient,
  library,
  onChange,
  onRemove,
  disableRemove,
  onSaveNewLibraryIngredient,
}: {
  ingredient: Ingredient;
  library: LibraryIngredient[];
  onChange: <K extends keyof Ingredient>(field: K, value: Ingredient[K]) => void;
  onRemove: () => void;
  disableRemove: boolean;
  onSaveNewLibraryIngredient: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showMacrosEditor, setShowMacrosEditor] = useState(false);
  const [dismissedName, setDismissedName] = useState<string | null>(null);
  const [promptBaseUnit, setPromptBaseUnit] = useState<IngredientBaseUnit>("grams");
  const [promptCalories, setPromptCalories] = useState("");
  const [promptProtein, setPromptProtein] = useState("");
  const [promptFiber, setPromptFiber] = useState("");
  const [promptReferenceUnit, setPromptReferenceUnit] = useState<VolumeUnit | "">("");
  const [promptGramsPerReferenceUnit, setPromptGramsPerReferenceUnit] = useState("");
  const [promptPantryStaple, setPromptPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  // Guards against a stale-closure bug: calling quantityRef.focus() inside
  // selectSuggestion synchronously blurs the name input (still mid-click,
  // before React re-renders with the just-selected values), so handleNameBlur
  // would otherwise run against the OLD ingredient and wrongly show the
  // save-to-library prompt right after a valid pick.
  const justSelectedRef = useRef(false);

  const trimmedName = ingredient.name.trim();
  const exactMatch = library.find((l) => l.name.toLowerCase() === trimmedName.toLowerCase());
  const suggestions = trimmedName
    ? library.filter((l) => l.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 6)
    : [];

  // Copies a library ingredient's macros/link onto this row — shared by
  // every way of matching one (picking a suggestion, typing/blurring on an
  // exact name match, or just changing the quantity on an already-linked
  // row) so they all behave identically. Keeps whatever unit is already on
  // the row if it's convertible for this ingredient (grams is always
  // convertible, so a fresh row's default "g" is respected rather than
  // getting silently swapped to e.g. "tbsp"); only falls back to the
  // ingredient's own natural unit when the current one genuinely can't
  // produce a number (e.g. switching from a count-style ingredient).
  function applyLibraryMatch(lib: LibraryIngredient, quantity: string, explicitUnit?: string) {
    const qty = parseFloat(quantity) || 1;
    const targetUnit =
      explicitUnit ??
      (isConvertibleUnit(lib, ingredient.unit) ? ingredient.unit : defaultUnitForLibraryIngredient(lib));
    if (targetUnit !== ingredient.unit) onChange("unit", targetUnit);
    const macros = libraryIngredientMacros(lib, qty, targetUnit);
    if (macros) {
      onChange("calories", String(Math.round(macros.calories * 100) / 100));
      onChange("protein", String(Math.round(macros.protein * 100) / 100));
      onChange("fiber", String(Math.round(macros.fiber * 100) / 100));
    }
    onChange("libraryId", lib.id);
  }

  function selectSuggestion(lib: LibraryIngredient) {
    justSelectedRef.current = true;
    onChange("name", lib.name);
    applyLibraryMatch(lib, ingredient.quantity);
    setShowSuggestions(false);
    setShowSavePrompt(false);
    quantityRef.current?.focus();
  }

  function handleQuantityChange(value: string) {
    onChange("quantity", value);
    // Live-rescale macros for a linked ingredient as the amount changes.
    if (ingredient.libraryId) {
      const linked = library.find((l) => l.id === ingredient.libraryId);
      if (linked) applyLibraryMatch(linked, value);
    }
  }

  function handleUnitChange(newUnit: string) {
    // Live-rescale macros for a linked ingredient as the unit changes —
    // e.g. switching a linked "Flour" row from grams to cups.
    if (ingredient.libraryId) {
      const linked = library.find((l) => l.id === ingredient.libraryId);
      if (linked) {
        applyLibraryMatch(linked, ingredient.quantity, newUnit);
        return;
      }
    }
    onChange("unit", newUnit);
  }

  function handleNameBlur() {
    // Delay so a suggestion/save-prompt click has a chance to register
    // before we evaluate and possibly hide everything on blur.
    setTimeout(() => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      setShowSuggestions(false);
      const name = ingredient.name.trim();
      if (!name) return;
      const match = library.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (match) {
        if (ingredient.libraryId !== match.id) applyLibraryMatch(match, ingredient.quantity);
        setShowSavePrompt(false);
        return;
      }
      if (ingredient.libraryId || dismissedName === name) return;
      const qty = parseFloat(ingredient.quantity) || 0;
      const cals = parseFloat(ingredient.calories) || 0;
      const protein = parseFloat(ingredient.protein) || 0;
      const fiber = parseFloat(ingredient.fiber) || 0;
      const isCountUnit = COUNT_UNITS.includes(ingredient.unit);
      setPromptBaseUnit(isCountUnit ? "count" : "grams");
      // Only safe to prefill a rate when this row's own unit is already
      // grams (direct per-100g conversion) or count-style (direct per-item
      // pass-through) — any other unit (oz, cup, tbsp...) would need a
      // conversion this prompt doesn't have enough info to make, so it's
      // left blank rather than showing a wrong number.
      if (ingredient.unit === "g" && qty > 0) {
        setPromptCalories(cals > 0 ? String(Math.round((cals / qty) * 100 * 100) / 100) : "");
        setPromptProtein(protein > 0 ? String(Math.round((protein / qty) * 100 * 100) / 100) : "");
        setPromptFiber(fiber > 0 ? String(Math.round((fiber / qty) * 100 * 100) / 100) : "");
      } else if (isCountUnit && qty > 0) {
        setPromptCalories(cals > 0 ? String(Math.round((cals / qty) * 100) / 100) : "");
        setPromptProtein(protein > 0 ? String(Math.round((protein / qty) * 100) / 100) : "");
        setPromptFiber(fiber > 0 ? String(Math.round((fiber / qty) * 100) / 100) : "");
      } else {
        setPromptCalories("");
        setPromptProtein("");
        setPromptFiber("");
      }
      setPromptReferenceUnit("");
      setPromptGramsPerReferenceUnit("");
      setPromptPantryStaple(false);
      setShowSavePrompt(true);
    }, 150);
  }

  async function confirmSaveToLibrary() {
    const enteredCalories = parseFloat(promptCalories);
    if (!trimmedName || Number.isNaN(enteredCalories)) return;
    setSaving(true);
    // The prompt collects rates per 100g (grams) or per item (count) —
    // convert grams-based entries down to the canonical per-gram rate the
    // library actually stores.
    const perBaseUnit = (entered: string) => {
      const n = parseFloat(entered) || 0;
      return promptBaseUnit === "grams" ? n / 100 : n;
    };
    const saved = await onSaveNewLibraryIngredient({
      name: trimmedName,
      baseUnit: promptBaseUnit,
      caloriesPerBaseUnit: perBaseUnit(promptCalories),
      proteinPerBaseUnit: perBaseUnit(promptProtein),
      fiberPerBaseUnit: perBaseUnit(promptFiber),
      referenceUnit: promptBaseUnit === "grams" && promptReferenceUnit ? promptReferenceUnit : null,
      gramsPerReferenceUnit:
        promptBaseUnit === "grams" && promptGramsPerReferenceUnit
          ? parseFloat(promptGramsPerReferenceUnit) || null
          : null,
      pantryStaple: promptPantryStaple,
    });
    setSaving(false);
    if (saved) {
      applyLibraryMatch(saved, ingredient.quantity);
      setShowSavePrompt(false);
    }
  }

  function toggleFlex() {
    const next = !ingredient.isFlex;
    onChange("isFlex", next);
    if (!next) onChange("flexDefault", false);
  }

  function dismissSavePrompt() {
    setDismissedName(trimmedName);
    setShowSavePrompt(false);
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-12 gap-2 items-start">
      <div className="col-span-4 sm:col-span-4 relative">
        <input
          value={ingredient.name}
          onChange={(e) => {
            onChange("name", e.target.value);
            if (ingredient.libraryId) onChange("libraryId", null);
            setShowSuggestions(true);
            setShowSavePrompt(false);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleNameBlur}
          placeholder="Ingredient"
          className="w-full px-3.5 py-3 sm:px-2.5 sm:py-2 pr-7 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        {exactMatch && (
          <BookOpen size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-3 py-2.5 sm:py-2 text-base sm:text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
              >
                <span className="text-stone-800 truncate">{s.name}</span>
                <span className="text-stone-400 text-xs whitespace-nowrap">
                  {libraryIngredientSummary(s)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={quantityRef}
        type="number"
        value={ingredient.quantity}
        onChange={(e) => handleQuantityChange(e.target.value)}
        placeholder="0"
        title="Quantity"
        className="col-span-1 sm:col-span-1 px-2.5 py-3 sm:px-1.5 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <select
        value={ingredient.unit}
        onChange={(e) => handleUnitChange(e.target.value)}
        title="Unit"
        className="col-span-1 sm:col-span-1 px-1.5 py-3 sm:px-1 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <div
        className="col-span-2 sm:col-span-4 relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setShowMacrosEditor(false);
        }}
      >
        <button
          type="button"
          onClick={() => setShowMacrosEditor((v) => !v)}
          title="Edit calories, protein, fiber, and whole recipe vs. per serving"
          className="w-full min-h-11 sm:min-h-9 py-2 sm:py-1 px-1 rounded-lg flex items-center justify-center flex-wrap gap-x-2 sm:gap-x-1.5 gap-y-0.5 text-sm sm:text-xs hover:bg-stone-200/60 transition-colors"
        >
          <span className="flex items-center gap-0.5 text-orange-800 font-medium">
            <Flame size={13} /> {ingredient.calories || 0}
          </span>
          <span className="flex items-center gap-0.5 text-emerald-800 font-medium">
            <Dumbbell size={13} /> {ingredient.protein || 0}
          </span>
          <span className="flex items-center gap-0.5 text-[#7a5230] font-medium">
            <Wheat size={13} /> {ingredient.fiber || 0}
          </span>
        </button>

        {showMacrosEditor && (
          <div className="absolute z-20 right-0 mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg p-3 space-y-2.5">
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Calories</label>
              <input
                type="number"
                autoFocus
                value={ingredient.calories}
                onChange={(e) => onChange("calories", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Protein (g)</label>
              <input
                type="number"
                value={ingredient.protein}
                onChange={(e) => onChange("protein", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Fiber (g)</label>
              <input
                type="number"
                value={ingredient.fiber}
                onChange={(e) => onChange("fiber", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-stone-400 uppercase tracking-wide">
                {ingredient.servingMode === "perServing" ? "Per serving" : "Whole recipe"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={ingredient.servingMode === "perServing"}
                onClick={() =>
                  onChange("servingMode", ingredient.servingMode === "perServing" ? "whole" : "perServing")
                }
                title={
                  ingredient.servingMode === "perServing"
                    ? "Per serving — click for whole recipe"
                    : "Whole recipe — click for per serving"
                }
              >
                <span
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                    ingredient.servingMode === "perServing" ? "bg-emerald-700" : "bg-stone-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      ingredient.servingMode === "perServing" ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowMacrosEditor(false)}
              className="w-full text-sm sm:text-xs font-medium text-emerald-800 hover:underline pt-1"
            >
              Done
            </button>
          </div>
        )}
      </div>
      <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={toggleFlex}
          title={ingredient.isFlex ? "Flexible ingredient (click to make fixed)" : "Make this a flexible ingredient"}
          className={`h-11 sm:h-9 w-8 flex-shrink-0 flex items-center justify-center rounded-full ${
            ingredient.isFlex ? "text-emerald-700 bg-emerald-50" : "text-stone-300 hover:text-stone-500"
          }`}
        >
          <Shuffle size={15} />
        </button>
        {ingredient.isFlex && (
          <button
            type="button"
            onClick={() => onChange("flexDefault", !ingredient.flexDefault)}
            title={
              ingredient.flexDefault
                ? "Included by default when scheduled (click to change)"
                : "Include by default when scheduled"
            }
            className="h-11 sm:h-9 px-1 flex items-center justify-center flex-shrink-0"
          >
            <Star
              size={17}
              className={ingredient.flexDefault ? "text-amber-500 fill-amber-500" : "text-stone-300"}
            />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disableRemove}
          className="h-11 sm:h-9 px-1 flex items-center justify-center text-stone-400 hover:text-orange-700 disabled:opacity-30"
        >
          <Trash2 size={17} className="sm:hidden" />
          <Trash2 size={15} className="hidden sm:block" />
        </button>
      </div>

      {showSavePrompt && (
        <div className="col-span-2 sm:col-span-12 p-3 sm:p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm sm:text-xs space-y-2">
          <p className="text-stone-700">Save “{trimmedName}” to your ingredient library?</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPromptBaseUnit("grams")}
              className={`flex-1 px-2 py-1.5 rounded border text-sm sm:text-xs font-medium ${
                promptBaseUnit === "grams"
                  ? "bg-stone-800 text-amber-50 border-stone-800"
                  : "border-stone-200 text-stone-600 bg-white"
              }`}
            >
              By weight/volume (grams)
            </button>
            <button
              type="button"
              onClick={() => setPromptBaseUnit("count")}
              className={`flex-1 px-2 py-1.5 rounded border text-sm sm:text-xs font-medium ${
                promptBaseUnit === "count"
                  ? "bg-stone-800 text-amber-50 border-stone-800"
                  : "border-stone-200 text-stone-600 bg-white"
              }`}
            >
              By item (count)
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-1.5">
            <input
              type="number"
              value={promptCalories}
              onChange={(e) => setPromptCalories(e.target.value)}
              placeholder={promptBaseUnit === "grams" ? "Cal/100g" : "Cal/item"}
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
            <input
              type="number"
              value={promptProtein}
              onChange={(e) => setPromptProtein(e.target.value)}
              placeholder={promptBaseUnit === "grams" ? "Protein/100g" : "Protein/item"}
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
            <input
              type="number"
              value={promptFiber}
              onChange={(e) => setPromptFiber(e.target.value)}
              placeholder={promptBaseUnit === "grams" ? "Fiber/100g" : "Fiber/item"}
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
          </div>
          {promptBaseUnit === "grams" && (
            <div className="grid grid-cols-2 gap-2 sm:gap-1.5">
              <select
                value={promptReferenceUnit}
                onChange={(e) => setPromptReferenceUnit(e.target.value as VolumeUnit | "")}
                className="px-2 py-2 sm:px-1.5 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
              >
                <option value="">No volume conversion</option>
                {VOLUME_UNITS.map((u) => (
                  <option key={u} value={u}>
                    Convert {u}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={promptGramsPerReferenceUnit}
                onChange={(e) => setPromptGramsPerReferenceUnit(e.target.value)}
                placeholder={promptReferenceUnit ? `Grams per ${promptReferenceUnit}` : "Grams per —"}
                disabled={!promptReferenceUnit}
                className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs disabled:opacity-40"
              />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-stone-600">
            <input
              type="checkbox"
              checked={promptPantryStaple}
              onChange={(e) => setPromptPantryStaple(e.target.checked)}
              className="rounded border-stone-300"
            />
            Pantry staple (skip in shopping list)
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={dismissSavePrompt} className="text-stone-500 hover:underline">
              Not now
            </button>
            <button
              type="button"
              onClick={confirmSaveToLibrary}
              disabled={saving || !promptCalories}
              className="text-emerald-800 font-medium hover:underline disabled:opacity-40"
            >
              Save to library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Shopping List ---------- */

function ShoppingListView({
  list,
  onToggle,
  onRebuild,
  onClearChecked,
  onAdd,
}: {
  list: ShoppingItem[];
  onToggle: (id: string) => void;
  onRebuild: () => void;
  onClearChecked: () => void;
  onAdd: (name: string) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const sortedList = useMemo(
    () => [...list].sort((a, b) => Number(a.checked) - Number(b.checked)),
    [list]
  );
  const hasChecked = list.some((item) => item.checked);

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;
    onAdd(newItemName.trim());
    setNewItemName("");
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Shopping list</h1>
          <p className="text-[13px] text-black/45 mt-1">
            {list.length} item{list.length === 1 ? "" : "s"}
            {hasChecked ? ` · ${list.filter((i) => i.checked).length} checked` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {hasChecked && (
            <button
              onClick={onClearChecked}
              className="text-[13px] font-medium px-4 py-[11px] rounded-full bg-white border border-black/[0.09] text-orange-700"
            >
              Clear checked
            </button>
          )}
          <button
            onClick={onRebuild}
            className="text-[13px] font-medium px-4 py-[11px] rounded-full bg-white border border-black/[0.09] text-black/65"
          >
            Rebuild from plan
          </button>
        </div>
      </div>

      <form onSubmit={submitAdd} className="flex gap-2.5 mb-5">
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add an item…"
          className="flex-1 h-12 px-[18px] rounded-full bg-[#f7f6f3] border border-black/[0.08] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <button
          type="submit"
          disabled={!newItemName.trim()}
          className="flex items-center gap-1.5 h-12 px-6 rounded-full bg-[#0f4a35] text-white text-sm font-semibold disabled:opacity-40"
        >
          <Plus size={15} /> Add
        </button>
      </form>

      {list.length === 0 ? (
        <EmptyState title="No shopping list yet" body="Plan some meals for the week, then build your list from there." />
      ) : (
        <div className="bg-white border border-black/[0.07] rounded-2xl divide-y divide-black/[0.06]">
          {sortedList.map((item) => (
            <button key={item.id} onClick={() => onToggle(item.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  item.checked ? "bg-[#0f4a35] border-[#0f4a35]" : "border-black/20"
                }`}
              >
                {item.checked && <Check size={12} className="text-white" />}
              </span>
              <div className="flex-1">
                <p className={`text-sm ${item.checked ? "line-through text-black/35" : "text-stone-800"}`}>{item.name}</p>
                {item.recipes && item.recipes.length > 0 && (
                  <p className="text-[11px] text-stone-400">for {item.recipes.join(", ")}</p>
                )}
              </div>
              {item.unit && (
                <span className={`text-sm font-medium ${item.checked ? "text-stone-300" : "text-stone-600"}`}>
                  {Math.round(item.quantity * 100) / 100} {item.unit}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Ingredient Library ---------- */

function IngredientLibraryView({
  library,
  onAdd,
  onUpdate,
  onDelete,
  onAddToShoppingList,
  onBack,
}: {
  library: LibraryIngredient[];
  onAdd: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onUpdate: (id: string, input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onDelete: (id: string) => void;
  onAddToShoppingList: (name: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pantryOnly, setPantryOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formBaseUnit, setFormBaseUnit] = useState<IngredientBaseUnit>("grams");
  const [formCalories, setFormCalories] = useState("");
  const [formProtein, setFormProtein] = useState("");
  const [formFiber, setFormFiber] = useState("");
  const [formReferenceUnit, setFormReferenceUnit] = useState<VolumeUnit | "">("");
  const [formGramsPerReferenceUnit, setFormGramsPerReferenceUnit] = useState("");
  const [formPantryStaple, setFormPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Same shape as /api/ingredients-feed — a client-side copy of that same
  // export, for pasting straight into Claude Chat when a live fetch isn't
  // reliable (its fetch tool caches by URL, which made a repeat check
  // return stale data even with the feed's own no-store headers).
  async function copyLibraryAsJson() {
    const payload = {
      ingredients: library.map((l) => ({
        id: l.id,
        name: l.name,
        baseUnit: l.baseUnit,
        caloriesPerBaseUnit: l.caloriesPerBaseUnit,
        proteinPerBaseUnit: l.proteinPerBaseUnit,
        fiberPerBaseUnit: l.fiberPerBaseUnit,
        referenceUnit: l.referenceUnit ?? null,
        gramsPerReferenceUnit: l.gramsPerReferenceUnit ?? null,
        pantryStaple: l.pantryStaple,
      })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — nothing
      // more graceful to do than leave the button as if nothing happened.
    }
  }

  const filtered = library.filter(
    (i) => i.name.toLowerCase().includes(query.toLowerCase()) && (!pantryOnly || i.pantryStaple)
  );
  const isAdding = editingId === "new";

  function startAdd() {
    setEditingId("new");
    setFormName("");
    setFormBaseUnit("grams");
    setFormCalories("");
    setFormProtein("");
    setFormFiber("");
    setFormReferenceUnit("");
    setFormGramsPerReferenceUnit("");
    setFormPantryStaple(false);
  }

  function startEdit(ing: LibraryIngredient) {
    setEditingId(ing.id);
    setFormName(ing.name);
    setFormBaseUnit(ing.baseUnit);
    // Displayed per 100g (grams) or per item (count) — the natural unit a
    // nutrition label already gives you — even though the stored rate is
    // always per gram internally.
    const scale = ing.baseUnit === "grams" ? 100 : 1;
    setFormCalories(String(ing.caloriesPerBaseUnit * scale));
    setFormProtein(String(ing.proteinPerBaseUnit * scale));
    setFormFiber(String(ing.fiberPerBaseUnit * scale));
    setFormReferenceUnit(ing.referenceUnit ?? "");
    setFormGramsPerReferenceUnit(
      ing.gramsPerReferenceUnit != null ? String(ing.gramsPerReferenceUnit) : ""
    );
    setFormPantryStaple(ing.pantryStaple);
  }

  async function submitForm() {
    const name = formName.trim();
    const enteredCalories = parseFloat(formCalories);
    if (!name || Number.isNaN(enteredCalories) || !editingId) return;
    setSaving(true);
    const scale = formBaseUnit === "grams" ? 100 : 1;
    const input: LibraryIngredientInput = {
      name,
      baseUnit: formBaseUnit,
      caloriesPerBaseUnit: enteredCalories / scale,
      proteinPerBaseUnit: (parseFloat(formProtein) || 0) / scale,
      fiberPerBaseUnit: (parseFloat(formFiber) || 0) / scale,
      referenceUnit: formBaseUnit === "grams" && formReferenceUnit ? formReferenceUnit : null,
      gramsPerReferenceUnit:
        formBaseUnit === "grams" && formGramsPerReferenceUnit
          ? parseFloat(formGramsPerReferenceUnit) || null
          : null,
      pantryStaple: formPantryStaple,
    };
    const result = isAdding ? await onAdd(input) : await onUpdate(editingId, input);
    setSaving(false);
    if (result) setEditingId(null);
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>

      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Ingredient library</h1>
          <p className="text-[13px] text-black/45 mt-1">{library.length} saved</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={copyLibraryAsJson}
            title="Copy the full ingredient library as JSON — paste into the recipe-import Claude Skill"
            className="flex items-center gap-1.5 bg-white border border-black/[0.09] text-black/65 text-[13px] font-medium rounded-full px-4 py-[11px]"
          >
            {copied ? <Check size={15} className="text-emerald-700" /> : <Copy size={15} />}
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 bg-[#0f4a35] text-white text-[13.5px] font-semibold px-5 py-3 rounded-full"
          >
            <Plus size={15} /> Add ingredient
          </button>
        </div>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingredients…"
          className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-black/[0.09] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>

      <div className="flex gap-1.5 mb-5">
        <button
          onClick={() => setPantryOnly(false)}
          className={`px-[15px] py-2.5 rounded-full text-[12.5px] font-medium ${
            !pantryOnly ? "bg-[#0f4a35] text-white" : "bg-white border border-black/[0.09] text-black/60"
          }`}
        >
          All ingredients
        </button>
        <button
          onClick={() => setPantryOnly(true)}
          className={`flex items-center gap-1 px-[15px] py-2.5 rounded-full text-[12.5px] font-medium ${
            pantryOnly ? "bg-[#0f4a35] text-white" : "bg-white border border-black/[0.09] text-black/60"
          }`}
        >
          <Package size={11} /> Pantry staples
        </button>
      </div>

      {isAdding && (
        <IngredientLibraryForm
          title="New ingredient"
          name={formName}
          setName={setFormName}
          baseUnit={formBaseUnit}
          setBaseUnit={setFormBaseUnit}
          calories={formCalories}
          setCalories={setFormCalories}
          protein={formProtein}
          setProtein={setFormProtein}
          fiber={formFiber}
          setFiber={setFormFiber}
          referenceUnit={formReferenceUnit}
          setReferenceUnit={setFormReferenceUnit}
          gramsPerReferenceUnit={formGramsPerReferenceUnit}
          setGramsPerReferenceUnit={setFormGramsPerReferenceUnit}
          pantryStaple={formPantryStaple}
          setPantryStaple={setFormPantryStaple}
          onCancel={() => setEditingId(null)}
          onSubmit={submitForm}
          saving={saving}
        />
      )}

      {library.length === 0 ? (
        <EmptyState
          title="No ingredients yet"
          body="Add ingredients here, or save them straight from a recipe as you go."
          actionLabel="Add ingredient"
          onAction={startAdd}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-500 text-center py-10">
          {pantryOnly
            ? query
              ? `No pantry staples match “${query}”.`
              : "No pantry staples marked yet. Mark ingredients as staples while editing them."
            : `No ingredients match “${query}”.`}
        </p>
      ) : (
        <div className="bg-white border border-black/[0.07] rounded-2xl divide-y divide-black/[0.06]">
          {filtered.map((ing) =>
            editingId === ing.id ? (
              <IngredientLibraryForm
                key={ing.id}
                title="Edit ingredient"
                name={formName}
                setName={setFormName}
                baseUnit={formBaseUnit}
                setBaseUnit={setFormBaseUnit}
                calories={formCalories}
                setCalories={setFormCalories}
                protein={formProtein}
                setProtein={setFormProtein}
                fiber={formFiber}
                setFiber={setFormFiber}
                referenceUnit={formReferenceUnit}
                setReferenceUnit={setFormReferenceUnit}
                gramsPerReferenceUnit={formGramsPerReferenceUnit}
                setGramsPerReferenceUnit={setFormGramsPerReferenceUnit}
                pantryStaple={formPantryStaple}
                setPantryStaple={setFormPantryStaple}
                onCancel={() => setEditingId(null)}
                onSubmit={submitForm}
                saving={saving}
                inline
              />
            ) : (
              <div key={ing.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                    {ing.name}
                    {ing.pantryStaple && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-normal text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full"
                        title="Pantry staple — skipped in shopping lists by default"
                      >
                        <Package size={9} /> Pantry
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-400">
                    {ing.baseUnit === "grams" ? (
                      <>
                        {Math.round(ing.caloriesPerBaseUnit * 100 * 100) / 100} cal ·{" "}
                        {Math.round(ing.proteinPerBaseUnit * 100 * 100) / 100}g protein ·{" "}
                        {Math.round(ing.fiberPerBaseUnit * 100 * 100) / 100}g fiber{" "}
                        <span className="text-stone-300">/ 100g</span>
                      </>
                    ) : (
                      <>
                        {ing.caloriesPerBaseUnit} cal · {ing.proteinPerBaseUnit}g protein ·{" "}
                        {ing.fiberPerBaseUnit}g fiber <span className="text-stone-300">/ item</span>
                      </>
                    )}
                    {ing.referenceUnit && ing.gramsPerReferenceUnit && (
                      <span className="text-stone-300">
                        {" "}
                        · {ing.gramsPerReferenceUnit}g/{ing.referenceUnit}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onAddToShoppingList(ing.name)}
                    title="Add to shopping list"
                    className="w-8 h-8 flex items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => startEdit(ing)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(ing.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-orange-700 hover:bg-orange-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this ingredient from your library? Recipes that already used it keep their own saved amounts — this only affects future autocomplete and autofill."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}

function IngredientLibraryForm({
  title,
  name,
  setName,
  baseUnit,
  setBaseUnit,
  calories,
  setCalories,
  protein,
  setProtein,
  fiber,
  setFiber,
  referenceUnit,
  setReferenceUnit,
  gramsPerReferenceUnit,
  setGramsPerReferenceUnit,
  pantryStaple,
  setPantryStaple,
  onCancel,
  onSubmit,
  saving,
  inline,
}: {
  title: string;
  name: string;
  setName: (v: string) => void;
  baseUnit: IngredientBaseUnit;
  setBaseUnit: (v: IngredientBaseUnit) => void;
  calories: string;
  setCalories: (v: string) => void;
  protein: string;
  setProtein: (v: string) => void;
  fiber: string;
  setFiber: (v: string) => void;
  referenceUnit: VolumeUnit | "";
  setReferenceUnit: (v: VolumeUnit | "") => void;
  gramsPerReferenceUnit: string;
  setGramsPerReferenceUnit: (v: string) => void;
  pantryStaple: boolean;
  setPantryStaple: (v: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  inline?: boolean;
}) {
  const rateSuffix = baseUnit === "grams" ? "100g" : "item";
  return (
    <div className={inline ? "p-4 bg-emerald-50" : "bg-amber-50 border border-stone-200 rounded-2xl p-4 mb-4"}>
      <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">{title}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ingredient name"
        className="w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-2"
      />
      <div className="flex gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => setBaseUnit("grams")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
            baseUnit === "grams" ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600 bg-white"
          }`}
        >
          By weight/volume (grams)
        </button>
        <button
          type="button"
          onClick={() => setBaseUnit("count")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
            baseUnit === "count" ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600 bg-white"
          }`}
        >
          By item (count)
        </button>
      </div>
      <p className="text-[11px] text-stone-400 mb-2">
        {baseUnit === "grams"
          ? "For anything measured by weight or volume — produce, flour, oil, spices. Recipes can enter it in grams or, with a conversion below, cups/tbsp/tsp too."
          : "For discrete items with no natural weight — an egg, a can, a clove."}
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input
          type="number"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          placeholder={`Cal/${rateSuffix}`}
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <input
          type="number"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder={`Protein/${rateSuffix}`}
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <input
          type="number"
          value={fiber}
          onChange={(e) => setFiber(e.target.value)}
          placeholder={`Fiber/${rateSuffix}`}
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>
      {baseUnit === "grams" && (
        <div className="mb-3">
          <label className="text-[10px] text-stone-400 uppercase tracking-wide">
            Volume conversion (optional)
          </label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <select
              value={referenceUnit}
              onChange={(e) => setReferenceUnit(e.target.value as VolumeUnit | "")}
              className="px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="">No conversion</option>
              {VOLUME_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={gramsPerReferenceUnit}
              onChange={(e) => setGramsPerReferenceUnit(e.target.value)}
              placeholder={referenceUnit ? `Grams per ${referenceUnit}` : "Grams per —"}
              disabled={!referenceUnit}
              className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-40"
            />
          </div>
        </div>
      )}
      <label className="flex items-center gap-1.5 text-sm text-stone-600 mb-3">
        <input
          type="checkbox"
          checked={pantryStaple}
          onChange={(e) => setPantryStaple(e.target.checked)}
          className="rounded border-stone-300"
        />
        Pantry staple (skip in shopping list by default)
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={saving || !name.trim() || !calories}
          className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ---------- Cooking Mode ---------- */
/* See components/CookingMode.tsx for the full view. */
