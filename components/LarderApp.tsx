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
  Search,
  Printer,
  Check,
  Package,
  Shuffle,
  Star,
  ChefHat,
  Minus,
  GripVertical,
  RefreshCw,
  Sparkles,
  Link as LinkIcon,
} from "lucide-react";
import {
  addManualShoppingItemAction,
  addWeekItemAction,
  deleteLibraryIngredientAction,
  deleteRecipeAction,
  deleteShoppingItemsAction,
  importRecipeAction,
  removeWeekItemAction,
  saveLibraryIngredientAction,
  startNewWeekAction,
  saveRecipeAction,
  syncShoppingListAction,
  toggleShoppingItemAction,
  updateLibraryIngredientAction,
} from "@/app/actions";
import { ConfirmModal } from "@/components/ConfirmModal";
import CookingMode from "@/components/CookingMode";
import { EmptyState } from "@/components/EmptyState";
import { HomeView } from "@/components/HomeView";
import { RecipesView } from "@/components/RecipesView";
import { WeekView } from "@/components/WeekView";
import {
  CATEGORIES,
  CATEGORY_STYLE,
  UNITS,
} from "@/lib/constants";
import {
  defaultFlexIds,
  emptyIngredient,
  emptyRecipe,
  emptySectionHeader,
  generateId,
  hasFlexIngredients,
  parseInstructionSteps,
  scaleQuantityDisplay,
} from "@/lib/helpers";
import type {
  ImportIngredient,
  Ingredient,
  LibraryIngredient,
  NewLibraryIngredientInput,
  Recipe,
  RecipeImportPayload,
  ShoppingItem,
  WeekBucket,
  WeekItem,
} from "@/lib/types";

type View =
  | "home"
  | "addRecipe"
  | "browse"
  | "recipeDetail"
  | "week"
  | "shoppingList"
  | "ingredientLibrary"
  | "importRecipe";

type LibraryIngredientInput = {
  name: string;
  pantryStaple: boolean;
};

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
  initialShoppingList,
  initialIngredientLibrary,
  initialWeekItems,
  initialView,
  initialRecipeId,
}: {
  initialRecipes: Recipe[];
  initialShoppingList: ShoppingItem[];
  initialIngredientLibrary: LibraryIngredient[];
  initialWeekItems: WeekItem[];
  initialView?: View;
  // Deep link straight to one recipe (/recipe/<id>) — used by Trello cards.
  initialRecipeId?: string | null;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(initialShoppingList);
  const [ingredientLibrary, setIngredientLibrary] = useState<LibraryIngredient[]>(
    initialIngredientLibrary
  );
  const [weekItems, setWeekItems] = useState<WeekItem[]>(initialWeekItems);
  const [confirmNewWeek, setConfirmNewWeek] = useState(false);

  const startOnRecipe = Boolean(initialRecipeId && initialRecipes.some((r) => r.id === initialRecipeId));
  const [view, setView] = useState<View>(startOnRecipe ? "recipeDetail" : initialView ?? "home");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(startOnRecipe ? initialRecipeId! : null);
  const [cookingSession, setCookingSession] = useState<{
    recipe: Recipe;
    flexIds: string[];
    servingMultiplier: number;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [browseQuery, setBrowseQuery] = useState("");
  const [browseCategory, setBrowseCategory] = useState("All");

  const [toast, showToast] = useToast();


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
      // week_items rows cascade-delete with the recipe (see schema.sql), so
      // mirror that locally rather than leaving dangling bucket entries.
      setRecipes(recipes.filter((r) => r.id !== id));
      setWeekItems((prev) => prev.filter((w) => w.recipeId !== id));
      setConfirmDeleteId(null);
      setSelectedRecipeId(null);
      setView("browse");
      showToast("Recipe deleted.");
    } catch {
      showToast("Couldn't delete recipe — try again.");
    }
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
      (recipe.ingredients || []).forEach((ing) => {
        if (ing.isSectionHeader) return;
        if (!ing.name || !ing.name.trim()) return;
        const linkedLibraryEntry = ing.libraryId
          ? ingredientLibrary.find((l) => l.id === ing.libraryId)
          : null;
        if (linkedLibraryEntry?.pantryStaple) return;
        if (ing.isFlex && !ing.flexDefault) return;
        const key = ing.name.trim().toLowerCase() + "|" + (ing.unit || "");
        const qty = parseFloat(ing.quantity) || 0;
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

  const filteredRecipes = recipes.filter((r) => {
    const matchesQuery = r.name.toLowerCase().includes(browseQuery.toLowerCase());
    const matchesCategory = browseCategory === "All" || r.category === browseCategory;
    return matchesQuery && matchesCategory;
  });


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
            weekItems={weekItems}
            setView={setView}
            setEditingRecipe={setEditingRecipe}
            onOpenRecipe={(id) => {
              setSelectedRecipeId(id);
              setView("recipeDetail");
            }}
            onQuickAdd={addManualShoppingItem}
            shoppingListCount={shoppingList.length}
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
            onWriteOwn={() => {
              setEditingRecipe(null);
              setView("addRecipe");
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

      {cookingSession && (
        <CookingMode
          recipe={cookingSession.recipe}
          flexIds={cookingSession.flexIds}
          servingMultiplier={cookingSession.servingMultiplier}
          onClose={() => setCookingSession(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this recipe? It'll be removed from this week too."
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
  onWriteOwn,
}: {
  onImport: (payload: RecipeImportPayload) => Promise<{ recipeId: string } | null>;
  onDone: (recipeId: string) => void;
  onCancel: () => void;
  onWriteOwn: () => void;
}) {
  const [payload, setPayload] = useState<RecipeImportPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showSmartText, setShowSmartText] = useState(false);

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
      <h1 className="font-display text-2xl text-stone-900 mb-5">Add a recipe</h1>

      {!payload ? (
        <div className="bg-amber-50 border border-stone-200 rounded-2xl p-6 sm:p-8">
          <p className="text-stone-600 text-sm mb-5">
            Paste a link from Instagram or any recipe site. If a site won&apos;t share the recipe, add a screenshot or the
            text instead.
          </p>

          <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Link</label>
          <input
            type="url"
            inputMode="url"
            autoFocus
            value={smartUrl}
            onChange={(e) => setSmartUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canRunSmart && !parsing) runSmartImport();
            }}
            placeholder="https://www.instagram.com/reel/…"
            disabled={parsing}
            className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2.5 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-4"
          />

          <div className="flex items-center gap-3 flex-wrap mb-5">
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
            {smartImages.map((img, idx) => (
              <div key={idx} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="h-14 w-14 object-cover rounded-lg border border-stone-200"
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
              className="text-sm text-stone-600 hover:text-stone-900 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus size={14} /> {smartImages.length === 0 ? "Add a screenshot" : "Add another"}
            </button>
            <button
              type="button"
              onClick={() => setShowSmartText((v) => !v)}
              disabled={parsing}
              className="text-sm text-stone-600 hover:text-stone-900 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus size={14} /> {showSmartText ? "Hide text" : "Paste text"}
            </button>
          </div>

          {showSmartText && (
            <textarea
              value={smartText}
              onChange={(e) => setSmartText(e.target.value)}
              placeholder="Paste the caption or the recipe here…"
              rows={5}
              disabled={parsing}
              className="w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 mb-5"
            />
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={runSmartImport}
              disabled={!canRunSmart || parsing}
              className="inline-flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-40"
            >
              <Sparkles size={15} /> {parsing ? "Reading the recipe…" : "Create recipe"}
            </button>
            <button onClick={onWriteOwn} disabled={parsing} className="text-sm text-stone-500 hover:text-stone-800 hover:underline">
              Or write your own instead
            </button>
          </div>
          {parsing && <p className="text-stone-400 text-xs mt-3">This usually takes 20–40 seconds.</p>}

          {parseError && (
            <div className="mt-4">
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
                    <span className="font-medium">{n.name}</span>
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

        <div className="mb-2">
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Ingredients</label>
        </div>

        <p className="text-[11px] text-stone-400 mb-2 flex items-center gap-1">
          <Shuffle size={10} /> on a row marks it flexible — a swappable option grouped with
          whatever section it&apos;s in, instead of always fixed.
        </p>

        <div className="space-y-2 mb-3">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-stone-400 px-1 pl-7">
            <span className="col-span-6">Ingredient</span>
            <span className="col-span-2">Qty</span>
            <span className="col-span-2">Unit</span>
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
  const [dismissedName, setDismissedName] = useState<string | null>(null);
  const [promptPantryStaple, setPromptPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  // Selecting a suggestion focuses the quantity box, which blurs the name
  // input before React re-renders — without this guard the blur handler
  // would see the old name and wrongly offer to save it to the library.
  const justSelectedRef = useRef(false);

  const trimmedName = ingredient.name.trim();
  const exactMatch = library.find((l) => l.name.toLowerCase() === trimmedName.toLowerCase());
  const suggestions = trimmedName
    ? library.filter((l) => l.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 6)
    : [];

  function link(lib: LibraryIngredient) {
    onChange("name", lib.name);
    onChange("libraryId", lib.id);
  }

  function selectSuggestion(lib: LibraryIngredient) {
    justSelectedRef.current = true;
    link(lib);
    setShowSuggestions(false);
    setShowSavePrompt(false);
    quantityRef.current?.focus();
  }

  function handleNameBlur() {
    setShowSuggestions(false);
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!trimmedName) return;
    const match = library.find((l) => l.name.toLowerCase() === trimmedName.toLowerCase());
    if (match) {
      if (ingredient.libraryId !== match.id) link(match);
      setShowSavePrompt(false);
      return;
    }
    if (dismissedName === trimmedName) return;
    // A brand-new ingredient: offer to add it to the library so the
    // shopping list can learn whether it's a pantry staple.
    setPromptPantryStaple(false);
    setShowSavePrompt(true);
  }

  async function confirmSaveToLibrary() {
    setSaving(true);
    const saved = await onSaveNewLibraryIngredient({
      name: trimmedName,
      pantryStaple: promptPantryStaple,
    });
    setSaving(false);
    if (saved) {
      onChange("libraryId", saved.id);
      setShowSavePrompt(false);
    }
  }

  function dismissSavePrompt() {
    setDismissedName(trimmedName);
    setShowSavePrompt(false);
  }

  function toggleFlex() {
    const next = !ingredient.isFlex;
    onChange("isFlex", next);
    onChange("flexDefault", next ? Boolean(ingredient.flexDefault) : false);
  }

  return (
    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-start">
      <div className="col-span-6 sm:col-span-6 relative">
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
          <BookOpen
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600"
            aria-label={exactMatch.pantryStaple ? "In your library (pantry staple)" : "In your library"}
          />
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((sug) => (
              <button
                key={sug.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(sug)}
                className="w-full text-left px-3 py-2.5 sm:py-2 text-base sm:text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
              >
                <span className="text-stone-800 truncate">{sug.name}</span>
                {sug.pantryStaple && (
                  <span className="text-stone-400 text-xs whitespace-nowrap flex items-center gap-1">
                    <Package size={11} /> Pantry
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {showSavePrompt && (
          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
            <p className="text-stone-700 mb-2">
              Add <span className="font-medium">{trimmedName}</span> to your ingredient library?
            </p>
            <label className="flex items-center gap-1.5 text-sm text-stone-600 mb-3">
              <input
                type="checkbox"
                checked={promptPantryStaple}
                onChange={(e) => setPromptPantryStaple(e.target.checked)}
                className="rounded border-stone-300"
              />
              Pantry staple (always on hand, skip on shopping lists)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmSaveToLibrary}
                disabled={saving}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Add to library"}
              </button>
              <button
                type="button"
                onClick={dismissSavePrompt}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>

      <input
        ref={quantityRef}
        type="number"
        value={ingredient.quantity}
        onChange={(e) => onChange("quantity", e.target.value)}
        placeholder="0"
        title="Quantity"
        className="col-span-2 sm:col-span-2 px-2.5 py-3 sm:px-2 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <select
        value={ingredient.unit}
        onChange={(e) => onChange("unit", e.target.value)}
        title="Unit"
        className="col-span-2 sm:col-span-2 px-1.5 py-3 sm:px-1.5 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
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
            title={ingredient.flexDefault ? "Included by default (click to change)" : "Include by default"}
            className="h-11 sm:h-9 px-1 flex items-center justify-center flex-shrink-0"
          >
            <Star size={17} className={ingredient.flexDefault ? "text-amber-500 fill-amber-500" : "text-stone-300"} />
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
  onBack,
  onAdd,
  onUpdate,
  onDelete,
  onAddToShoppingList,
}: {
  library: LibraryIngredient[];
  onBack: () => void;
  onAdd: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onUpdate: (id: string, input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onDelete: (id: string) => Promise<void>;
  onAddToShoppingList: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pantryOnly, setPantryOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPantryStaple, setFormPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = library.filter(
    (i) => i.name.toLowerCase().includes(query.toLowerCase()) && (!pantryOnly || i.pantryStaple)
  );
  const pantryCount = library.filter((i) => i.pantryStaple).length;

  function startAdd() {
    setEditingId(null);
    setFormName("");
    setFormPantryStaple(false);
    setAdding(true);
  }

  function startEdit(ing: LibraryIngredient) {
    setAdding(false);
    setEditingId(ing.id);
    setFormName(ing.name);
    setFormPantryStaple(ing.pantryStaple);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
  }

  function inputFor(): LibraryIngredientInput {
    return {
      name: formName.trim(),
      pantryStaple: formPantryStaple,
    };
  }

  async function submitForm() {
    if (!formName.trim()) return;
    setSaving(true);
    const result = editingId
      ? await onUpdate(editingId, inputFor())
      : await onAdd(inputFor());
    setSaving(false);
    if (result) cancelForm();
  }

  // A one-tap pantry toggle on each row — the most common edit by far.
  async function togglePantry(ing: LibraryIngredient) {
    await onUpdate(ing.id, {
      name: ing.name,
      pantryStaple: !ing.pantryStaple,
    });
  }

  const form = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 bg-emerald-50/60">
      <input
        autoFocus
        value={formName}
        onChange={(e) => setFormName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitForm();
          if (e.key === "Escape") cancelForm();
        }}
        placeholder="Ingredient name"
        className="flex-1 px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <label className="flex items-center gap-1.5 text-sm text-stone-600 whitespace-nowrap">
        <input
          type="checkbox"
          checked={formPantryStaple}
          onChange={(e) => setFormPantryStaple(e.target.checked)}
          className="rounded border-stone-300"
        />
        Pantry staple
      </label>
      <div className="flex gap-2 justify-end">
        <button onClick={cancelForm} className="px-3 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          onClick={submitForm}
          disabled={saving || !formName.trim()}
          className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
        >
          {saving ? "Saving…" : editingId ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>

      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Ingredients</h1>
          <p className="text-[13px] text-black/45 mt-1">
            {library.length} in your library · {pantryCount} pantry staple{pantryCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 bg-[#b0430c] text-white text-[13.5px] font-semibold px-5 py-3 rounded-full"
        >
          <Plus size={15} /> Add ingredient
        </button>
      </div>

      <p className="text-sm text-stone-500 mb-4">
        Pantry staples are things you always have (salt, oil, spices). They&apos;re skipped when a shopping list is built.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-[420px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients…"
            className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-black/[0.09] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPantryOnly(false)}
            className={`px-[15px] py-2.5 rounded-full text-[12.5px] font-medium ${
              !pantryOnly ? "bg-[#0f4a35] text-white" : "bg-white border border-black/[0.09] text-black/60"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setPantryOnly(true)}
            className={`px-[15px] py-2.5 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 ${
              pantryOnly ? "bg-[#0f4a35] text-white" : "bg-white border border-black/[0.09] text-black/60"
            }`}
          >
            <Package size={12} /> Pantry staples
          </button>
        </div>
      </div>

      <div className="bg-white border border-black/[0.07] rounded-2xl divide-y divide-stone-100 overflow-hidden">
        {adding && form}
        {filtered.length === 0 && !adding && (
          <p className="px-4 py-8 text-sm text-stone-400 text-center">
            {query ? `Nothing matches “${query}”.` : pantryOnly ? "No pantry staples marked yet." : "No ingredients yet."}
          </p>
        )}
        {filtered.map((ing) =>
          editingId === ing.id ? (
            <div key={ing.id}>{form}</div>
          ) : (
            <div key={ing.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p className="text-sm font-medium text-stone-800 truncate">{ing.name}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => togglePantry(ing)}
                  title={ing.pantryStaple ? "Pantry staple (click to unmark)" : "Mark as pantry staple"}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                    ing.pantryStaple ? "bg-stone-800 text-amber-50" : "text-stone-400 hover:bg-stone-100"
                  }`}
                >
                  <Package size={11} /> Pantry
                </button>
                <button
                  onClick={() => onAddToShoppingList(ing.name)}
                  title="Add to shopping list"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => startEdit(ing)}
                  title="Rename"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(ing.id)}
                  title="Delete"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-orange-700 hover:bg-orange-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this ingredient from your library? Recipes that use it keep their own copy."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            await onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
