import type { WeekBucket } from "./types";

export const UNITS = ["g", "oz", "kg", "lb", "ml", "l", "cup", "tbsp", "tsp", "count", "can", "unit"];

export const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"];

export const CATEGORY_STYLE: Record<string, string> = {
  Breakfast: "bg-amber-200 text-amber-900",
  Lunch: "bg-emerald-200 text-emerald-900",
  Dinner: "bg-orange-200 text-orange-900",
  Snack: "bg-stone-200 text-stone-700",
  Dessert: "bg-rose-200 text-rose-900",
};

// The recipe card's color rail (a solid edge bar) and matching "ink" label
// color, so a grid of recipes reads by meal type before any word is read.
export const CATEGORY_RAIL: Record<string, string> = {
  Breakfast: "#e0b93a",
  Lunch: "#4f9c6e",
  Dinner: "#e8934f",
  Snack: "#8a9bb0",
  Dessert: "#d98aa0",
};

export const CATEGORY_INK: Record<string, string> = {
  Breakfast: "#7a5a08",
  Lunch: "#0f4a35",
  Dinner: "#8a4218",
  Snack: "#46505c",
  Dessert: "#8a2b45",
};

// Display order and labels for the "This week" buckets. `prepDay` marks the
// two buckets that make up Kristine's prep day, which the week screen
// summarizes separately.
export const WEEK_BUCKETS: { key: WeekBucket; label: string; hint: string; prepDay: boolean }[] = [
  { key: "make", label: "Kristine makes", hint: "Cooked on prep day", prepDay: true },
  { key: "prep", label: "Kristine preps", hint: "Prepped ahead, finished later", prepDay: true },
  { key: "dinners", label: "Other dinners", hint: "Mon, Tue, Wed…", prepDay: false },
  { key: "lunches", label: "Lunches", hint: "", prepDay: false },
  { key: "snacks", label: "Leighton snacks", hint: "", prepDay: false },
];
