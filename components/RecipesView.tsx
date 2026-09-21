"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, Link as LinkIcon, Pencil, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CATEGORIES, CATEGORY_INK, CATEGORY_RAIL } from "@/lib/constants";
import type { Recipe } from "@/lib/types";

type SortMode = "name" | "ingredients";

export function RecipesView({
  recipes,
  allRecipesCount,
  query,
  setQuery,
  category,
  setCategory,
  onOpen,
  onAdd,
  onImport,
  onManageIngredients,
}: {
  recipes: Recipe[];
  allRecipesCount: number;
  query: string;
  setQuery: (q: string) => void;
  category: string;
  setCategory: (c: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onManageIngredients: () => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    function onDocClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addOpen]);

  const sorted = useMemo(() => {
    const copy = [...recipes];
    if (sortMode === "ingredients") {
      copy.sort((a, b) => b.ingredients.length - a.ingredients.length);
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy;
  }, [recipes, sortMode]);

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Recipes</h1>
          <p className="text-[13px] text-black/45 mt-1">{allRecipesCount} saved</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onManageIngredients}
            title="Manage ingredients"
            className="flex items-center justify-center gap-1.5 bg-white border border-black/[0.09] text-black/65 text-[13px] font-medium rounded-full hover:bg-black/[0.03] w-9 h-9 md:w-auto md:px-4 md:py-[11px]"
          >
            <BookOpen size={15} />
            <span className="hidden md:inline">Manage ingredients</span>
          </button>
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="flex items-center gap-1.5 bg-[#b0430c] text-white text-[13.5px] font-semibold px-5 py-3 rounded-full"
            >
              <Plus size={15} /> Add recipe
            </button>
            {addOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white border border-black/[0.09] rounded-2xl shadow-lg p-1.5 z-30">
                <button
                  onClick={() => {
                    setAddOpen(false);
                    onImport();
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-black/[0.04]"
                >
                  <LinkIcon size={16} className="mt-0.5 text-[#0f4a35] flex-shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-stone-900">From a link</span>
                    <span className="block text-xs text-black/50">Instagram, a website, or a photo</span>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setAddOpen(false);
                    onAdd();
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-black/[0.04]"
                >
                  <Pencil size={16} className="mt-0.5 text-[#0f4a35] flex-shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-stone-900">Write your own</span>
                    <span className="block text-xs text-black/50">Type it in by hand</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-[420px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-black/[0.09] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap px-[15px] py-2.5 rounded-full text-[12.5px] font-medium ${
                category === c
                  ? "bg-[#0f4a35] text-white"
                  : "bg-white border border-black/[0.09] text-black/60"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="appearance-none text-[12.5px] text-black/45 bg-transparent pr-5 focus:outline-none cursor-pointer"
          >
            <option value="name">Sort: name (A–Z)</option>
            <option value="ingredients">Sort: most ingredients</option>
          </select>
          <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No recipes match that"
          body="Try a different search or category."
          actionLabel="Clear filters"
          onAction={() => {
            setQuery("");
            setCategory("All");
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((r) => {
              const rail = CATEGORY_RAIL[r.category] ?? "#8a9bb0";
              const ink = CATEGORY_INK[r.category] ?? "#46505c";
              return (
                <button
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="text-left flex bg-[#fdf9ec] border border-[#f0dd9c] rounded-[14px] overflow-hidden hover:border-[#e6cf7d] hover:bg-[#fffdf4] transition-colors"
                >
                  <span className="w-1.5 flex-none" style={{ background: rail }} />
                  <div className="flex-1 p-[18px] min-w-0">
                    <div className="flex items-baseline gap-2.5 mb-2.5">
                      <span
                        className="text-[10px] tracking-[.13em] uppercase font-bold"
                        style={{ color: ink }}
                      >
                        {r.category}
                      </span>
                      <span className="ml-auto text-[11.5px] text-black/40 whitespace-nowrap">
                        {r.ingredients.length} ingredients
                      </span>
                    </div>
                    <div className="font-display text-[19px] font-semibold leading-[1.25] tracking-tight text-stone-900">
                      {r.name || "Untitled recipe"}
                    </div>
                    <div className="text-[12.5px] text-black/45 mt-3">
                      {r.servings} serving{String(r.servings) === "1" ? "" : "s"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-[12.5px] text-black/40">
            Showing {sorted.length} of {allRecipesCount}
          </div>
        </>
      )}
    </div>
  );
}
