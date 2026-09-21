"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, ReactElement, SetStateAction, TouchEvent as ReactTouchEvent } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import CookingModeDesktop from "@/components/CookingModeDesktop";
import CookingModePhone from "@/components/CookingModePhone";
import {
  generateId,
  groupIngredientsBySection,
  parseInstructionSteps,
  scaleQuantityDisplay,
  sectionStepIndex,
} from "@/lib/helpers";
import type { IngredientSection, InstructionStep } from "@/lib/helpers";
import type { Ingredient, Recipe } from "@/lib/types";

export type CookTimer = {
  id: string;
  // null = a general-purpose timer started from the sidebar's "+" button,
  // not tied to any particular step.
  stepIndex: number | null;
  label: string;
  // The "set" duration — doubles as the editable value while `pending`, and
  // the progress-bar total once running.
  durationMs: number;
  endsAt: number; // authoritative only while status === "running"
  remainingMsWhenPaused: number; // authoritative only while status === "paused"
  status: "pending" | "running" | "paused";
};

export type SectionStatus = "general" | "current" | "done" | "future";

// Everything both CookingModeDesktop and CookingModePhone need — all state
// and handlers live here in the orchestrator; the two layouts are purely
// presentational forks of the same session.
export type CookingLayoutProps = {
  recipe: Recipe;
  steps: InstructionStep[];
  sections: IngredientSection[];
  stepIndexBySection: Map<string, number>;
  checked: Set<string>;
  toggleChecked: (id: string) => void;
  activeStep: number | null;
  setActiveStep: Dispatch<SetStateAction<number | null>>;
  sidebarScope: "step" | "all";
  setSidebarScope: Dispatch<SetStateAction<"step" | "all">>;
  sectionStatus: (section: IngredientSection) => SectionStatus;
  isSectionCollapsed: (section: IngredientSection, status: SectionStatus) => boolean;
  toggleSectionCollapse: (section: IngredientSection, status: SectionStatus) => void;
  comingUpSections: { section: IngredientSection; stepIdx: number }[];
  sectionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  timers: CookTimer[];
  now: number;
  anyTimerRinging: boolean;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  addMinuteToTimer: (id: string) => void;
  clearTimer: (id: string) => void;
  addPendingTimer: () => void;
  adjustPendingDuration: (id: string, deltaMinutes: number) => void;
  setPendingDurationMinutes: (id: string, minutes: number) => void;
  startPendingTimer: (id: string) => void;
  timerForActiveStep: CookTimer | undefined;
  activeCategories: string[];
  startTimer: (stepIndex: number, label: string, minutes: number) => void;
  defaultTimerLabel: (stepIndex: number, categories: string[]) => string;
  StartTimerControl: (props: { onStart: (minutes: number) => void; defaultMinutes?: number }) => ReactElement;
  goToPrevStep: () => void;
  goToNextStep: () => void;
  handleStepTouchStart: (e: ReactTouchEvent) => void;
  handleStepTouchEnd: (e: ReactTouchEvent) => void;
  renderIngredientRow: (ing: Ingredient) => ReactElement;
  focusContentRef: MutableRefObject<HTMLDivElement | null>;
  stepTextRef: MutableRefObject<HTMLParagraphElement | null>;
  stepFontSize: number;
  setConfirmingExit: Dispatch<SetStateAction<boolean>>;
  formatClock: (ms: number) => string;
  timerRemainingMs: (t: CookTimer, now: number) => number;
  // Phone-only, harmless/unused on desktop.
  currentStepItems: Ingredient[];
  sheetOpen: boolean;
  setSheetOpen: Dispatch<SetStateAction<boolean>>;
};

const TIMER_PRESET_MINUTES = [1, 5, 10, 15, 20, 30];

function timerRemainingMs(t: CookTimer, now: number): number {
  if (t.status === "running") return Math.max(0, t.endsAt - now);
  if (t.status === "paused") return t.remainingMsWhenPaused;
  return t.durationMs; // pending — "remaining" is just the editable set duration
}

// A step that says "...for 10 minutes" (or just "...a few minutes", with no
// leading number) offers to start a timer inline; a step that never
// mentions minutes doesn't — timers stopped being a default part of every
// step once this shipped.
const MINUTES_RE = /(\d+(?:\.\d+)?)\s*minutes?\b/i;

export function stepMentionsMinutes(text: string): boolean {
  return /\bminutes?\b/i.test(text);
}

export function extractStepTimerMinutes(text: string): number | null {
  const match = text.match(MINUTES_RE);
  return match ? parseFloat(match[1]) : null;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function defaultTimerLabel(stepIndex: number, categories: string[]): string {
  if (categories.length > 0) {
    return categories[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return `Step ${stepIndex + 1}`;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // audio isn't essential — the visual ringing state still shows
  }
}

function timerStorageKey(sessionKey: string) {
  return `cookTimers:${sessionKey}`;
}

function loadTimers(sessionKey: string): CookTimer[] {
  try {
    const raw = localStorage.getItem(timerStorageKey(sessionKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTimers(sessionKey: string, timers: CookTimer[]) {
  try {
    localStorage.setItem(timerStorageKey(sessionKey), JSON.stringify(timers));
  } catch {
    // localStorage unavailable (private mode, etc.) — timers just won't
    // survive a reload.
  }
}

function loadCookingState(key: string): { checked: string[]; step: number | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { checked: [], step: null };
    const parsed = JSON.parse(raw);
    return {
      checked: Array.isArray(parsed.checked) ? parsed.checked : [],
      step: typeof parsed.step === "number" ? parsed.step : null,
    };
  } catch {
    return { checked: [], step: null };
  }
}

function saveCookingState(key: string, state: { checked: string[]; step: number | null }) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode, etc.) — cooking still works,
    // it just won't survive an accidental reload.
  }
}

function StartTimerControl({
  onStart,
  defaultMinutes = 10,
}: {
  onStart: (minutes: number) => void;
  defaultMinutes?: number;
}) {
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-3.5 rounded-full bg-white border border-black/10 text-[var(--cook-ink)]"
        >
          {minutes} min
          <span className={`text-black/40 transition-transform inline-block ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="absolute z-10 bottom-full mb-2 left-0 bg-white border border-black/10 rounded-xl shadow-lg p-1.5 w-40">
            {TIMER_PRESET_MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMinutes(m);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  m === minutes ? "bg-[var(--cook-green)]/10 text-[var(--cook-green)] font-semibold" : "hover:bg-black/5"
                }`}
              >
                {m} min
              </button>
            ))}
            <div className="flex items-center gap-1.5 px-1 pt-1 mt-1 border-t border-black/[0.06]">
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom"
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-black/10 focus:outline-none"
              />
              <button
                onClick={() => {
                  const n = parseFloat(custom);
                  if (n > 0) {
                    setMinutes(n);
                    setOpen(false);
                    setCustom("");
                  }
                }}
                className="text-xs font-semibold text-[var(--cook-green)] px-2 flex-none"
              >
                Set
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => onStart(minutes)}
        className="text-[13.5px] font-semibold px-[22px] py-3.5 rounded-full bg-[var(--cook-orange)] text-white"
      >
        Start timer
      </button>
    </div>
  );
}

export default function CookingMode({
  recipe,
  flexIds,
  servingMultiplier,
  onClose,
}: {
  recipe: Recipe;
  flexIds: string[];
  servingMultiplier: number;
  onClose: () => void;
}) {
  // Checked-ingredient/step state and timers persist in localStorage keyed
  // by recipe, so an accidental reload mid-cook picks up where it left off.
  const sessionKey = `cookingMode:${recipe.id}`;
  const steps = useMemo(() => parseInstructionSteps(recipe.instructions), [recipe.instructions]);
  const sections = useMemo(() => {
    // Flex ingredients live wherever they were placed in the recipe rather
    // than a separate trailing group — only the ones active for this
    // cooking session are included.
    const cookingIngredients = recipe.ingredients.filter((i) => !i.isFlex || flexIds.includes(i.id));
    return groupIngredientsBySection(cookingIngredients);
  }, [recipe.ingredients, flexIds]);
  const stepIndexBySection = useMemo(() => sectionStepIndex(sections, steps), [sections, steps]);

  const initial = useMemo(() => loadCookingState(sessionKey), [sessionKey]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial.checked));
  const [activeStep, setActiveStep] = useState<number | null>(initial.step);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [sidebarScope, setSidebarScope] = useState<"step" | "all">("all");
  // Per-section manual expand/collapse, overriding whatever the scope's own
  // default would be. Sticky across scope changes and step navigation — once
  // you've opened or closed a category yourself, it stays that way until you
  // tap it again.
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});
  const [timers, setTimers] = useState<CookTimer[]>(() => loadTimers(sessionKey));
  const [now, setNow] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const focusContentRef = useRef<HTMLDivElement | null>(null);
  const stepTextRef = useRef<HTMLParagraphElement | null>(null);
  const [stepFontSize, setStepFontSize] = useState(40);

  // The phone focus-mode layout is structurally different, not just a
  // reflow — < 820px gets its own component entirely rather than trying to
  // make one markup tree serve both.
  // Lazy-initialized from window directly (not a default-false-then-correct
  // useEffect) — this component only ever mounts client-side, well after
  // hydration, in response to a click, so there's no SSR mismatch risk, and
  // computing it eagerly avoids a one-frame flash of the wrong layout.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 819px)").matches);
  useEffect(() => {
    // State is already initialized from the same query above; only the
    // change listener is needed here.
    const mq = window.matchMedia("(max-width: 819px)");
    function onChange(e: MediaQueryListEvent) {
      setIsPhone(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    saveCookingState(sessionKey, { checked: Array.from(checked), step: activeStep });
  }, [checked, activeStep, sessionKey]);

  useEffect(() => {
    saveTimers(sessionKey, timers);
  }, [timers, sessionKey]);

  useEffect(() => {
    if (activeStep === null) return;
    const step = steps[activeStep];
    if (!step || step.categories.length === 0) return;
    const match = sections.find((s) => s.title && step.categories.includes(s.title.toUpperCase()));
    if (match) {
      sectionRefs.current[match.key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStep, steps, sections]);

  // Instead of letting a long step scroll, shrink its text until it fits the
  // available space — measure at the largest size, then step the font size
  // down until the content no longer overflows its (non-scrolling) container.
  // Desktop-only (the phone layout uses a simple two-tier size instead).
  useLayoutEffect(() => {
    if (activeStep === null || isPhone) return;
    function fit() {
      const container = focusContentRef.current;
      const textEl = stepTextRef.current;
      if (!container || !textEl) return;
      const maxFont = 40;
      const minFont = 18;
      let size = maxFont;
      textEl.style.fontSize = `${size}px`;
      while (size > minFont && container.scrollHeight > container.clientHeight) {
        size -= 2;
        textEl.style.fontSize = `${size}px`;
      }
      setStepFontSize(size);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [activeStep, steps, isPhone]);

  // Wall-clock (`endsAt`) timers stay correct even if the interval is
  // throttled in a backgrounded tab — this only ticks re-renders, it never
  // does the actual timekeeping. Skipped entirely when nothing is running,
  // so an idle cooking session doesn't re-render every second for no reason.
  useEffect(() => {
    if (!timers.some((t) => t.status === "running")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers]);

  // Persistent alarm: as long as a timer is both `running` and expired, this
  // re-fires once per tick (the 1s interval above) — so it keeps beeping
  // until you either clear it or hit the stop-alarm control, which sets
  // status to "paused" and drops it out of this check.
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ringing = timers.filter((t) => t.status === "running" && timerRemainingMs(t, now) <= 0);
    if (ringing.length > 0) playBeep();
    // A one-shot browser notification per timer — only if permission was
    // already granted some other way; never prompt for it from here.
    ringing.forEach((t) => {
      if (notifiedRef.current.has(t.id)) return;
      notifiedRef.current.add(t.id);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`${t.label} — time's up`, { body: recipe.name, tag: t.id });
        }
      } catch {
        // notifications aren't essential — the visual/audio ringing still shows
      }
    });
    timers.forEach((t) => {
      if (t.status !== "running" || timerRemainingMs(t, now) > 0) notifiedRef.current.delete(t.id);
    });
  }, [timers, now, recipe.name]);

  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock) {
          wakeLockRef.current = await nav.wakeLock.request("screen");
        }
      } catch {
        // unsupported or denied — cooking still works without it
      }
    }
    acquire();
    function onVisibility() {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmingExit(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // `position: fixed` alone doesn't reliably stop the page behind it from
  // scrolling under iOS Safari's touch-driven rubber-banding (most visible
  // as a sliver of the launching page showing through the status bar in
  // standalone/"Add to Home Screen" mode) — pinning the body in place with a
  // negative offset, then restoring the scroll position on close, is the
  // standard fix.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // From step 1, "back" returns to the All-steps overview rather than doing
  // nothing — only the overview itself is a true dead end for Prev. (The
  // phone layout has no overview; it treats a null step as step 0.)
  function goToPrevStep() {
    setSheetOpen(false);
    setActiveStep((s) => {
      if (s === null) return s;
      return s > 0 ? s - 1 : null;
    });
  }

  function goToNextStep() {
    setSheetOpen(false);
    setActiveStep((s) => {
      if (s === null) return 0;
      return s < steps.length - 1 ? s + 1 : s;
    });
  }

  // Swipe left/right between steps (iPad, or any touch device) — works in
  // the "All steps" overview too (swiping there just steps into step 1, same
  // as goToNextStep's own null-handling; swiping back is a no-op since
  // there's nothing before the overview). A large-enough, mostly-horizontal
  // gesture is required so it doesn't fight with vertical scrolling.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleStepTouchStart(e: ReactTouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleStepTouchEnd(e: ReactTouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goToNextStep();
    else goToPrevStep();
  }

  function startTimer(stepIndex: number, label: string, minutes: number) {
    if (!minutes || minutes <= 0) return;
    const durationMs = minutes * 60_000;
    const timer: CookTimer = {
      id: generateId(),
      stepIndex,
      label,
      durationMs,
      endsAt: Date.now() + durationMs,
      remainingMsWhenPaused: durationMs,
      status: "running",
    };
    setTimers((prev) => [...prev, timer]);
  }

  function pauseTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "running"
          ? { ...t, status: "paused", remainingMsWhenPaused: timerRemainingMs(t, Date.now()) }
          : t
      )
    );
  }

  function resumeTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "paused" ? { ...t, status: "running", endsAt: Date.now() + t.remainingMsWhenPaused } : t
      )
    );
  }

  function addMinuteToTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return t.status === "running" ? { ...t, endsAt: t.endsAt + 60_000 } : { ...t, remainingMsWhenPaused: t.remainingMsWhenPaused + 60_000 };
      })
    );
  }

  function clearTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  // A general-purpose timer, not tied to any step — created idle so its
  // duration can be dialled in before it actually starts counting down.
  function addPendingTimer() {
    const timer: CookTimer = {
      id: generateId(),
      stepIndex: null,
      label: "Timer",
      durationMs: 5 * 60_000,
      endsAt: 0,
      remainingMsWhenPaused: 0,
      status: "pending",
    };
    setTimers((prev) => [...prev, timer]);
  }

  function adjustPendingDuration(id: string, deltaMinutes: number) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "pending"
          ? { ...t, durationMs: Math.max(60_000, t.durationMs + deltaMinutes * 60_000) }
          : t
      )
    );
  }

  function setPendingDurationMinutes(id: string, minutes: number) {
    if (!Number.isFinite(minutes)) return;
    setTimers((prev) =>
      prev.map((t) => (t.id === id && t.status === "pending" ? { ...t, durationMs: Math.max(60_000, minutes * 60_000) } : t))
    );
  }

  function startPendingTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "pending" ? { ...t, status: "running", endsAt: Date.now() + t.durationMs } : t
      )
    );
  }

  function confirmExit() {
    try {
      localStorage.removeItem(sessionKey);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(timerStorageKey(sessionKey));
    } catch {
      // ignore
    }
    onClose();
  }

  const activeCategories = activeStep !== null ? steps[activeStep]?.categories ?? [] : [];
  const timerForActiveStep = activeStep !== null ? timers.find((t) => t.stepIndex === activeStep) : undefined;
  const anyTimerRinging = timers.some((t) => t.status === "running" && timerRemainingMs(t, now) <= 0);

  function sectionStatus(section: IngredientSection): SectionStatus {
    if (activeStep === null) return "general";
    const mapped = stepIndexBySection.get(section.key);
    if (mapped === undefined) return "general";
    if (mapped === activeStep) return "current";
    return mapped < activeStep ? "done" : "future";
  }

  // "All ingredients" shows everything expanded by default, same as the "All
  // steps" overview — a section only compresses if you tap it shut, or if
  // you're in "This step" scope, which defaults every non-current section
  // (aside from untracked/"general" ones with no step of their own) closed.
  function defaultCollapsed(section: IngredientSection, status: SectionStatus): boolean {
    if (!section.title) return false;
    if (sidebarScope === "all") return false;
    if (status === "general") return false;
    return status !== "current";
  }

  function isSectionCollapsed(section: IngredientSection, status: SectionStatus): boolean {
    const override = collapseOverrides[section.key];
    return override !== undefined ? override : defaultCollapsed(section, status);
  }

  function toggleSectionCollapse(section: IngredientSection, status: SectionStatus) {
    setCollapseOverrides((prev) => ({ ...prev, [section.key]: !isSectionCollapsed(section, status) }));
  }

  const comingUpSections = useMemo(() => {
    if (activeStep === null) return [];
    return sections
      .map((section) => ({ section, stepIdx: stepIndexBySection.get(section.key) }))
      .filter((x): x is { section: IngredientSection; stepIdx: number } => x.stepIdx !== undefined && x.stepIdx > activeStep)
      .sort((a, b) => a.stepIdx - b.stepIdx);
  }, [sections, stepIndexBySection, activeStep]);

  // Flat list of ingredients belonging to the active step (or with no step
  // of their own) — the phone layout's "For this step" chip row.
  const currentStepItems = useMemo(() => {
    const items: Ingredient[] = [];
    sections.forEach((section) => {
      const status = sectionStatus(section);
      if (status === "current" || status === "general") items.push(...section.items);
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, activeStep, stepIndexBySection]);

  function renderIngredientRow(ing: Ingredient) {
    const isChecked = checked.has(ing.id);
    return (
      <button
        key={ing.id}
        onClick={() => toggleChecked(ing.id)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[10px] border text-left ${
          isChecked ? "bg-[var(--cook-row)] border-transparent" : "bg-[var(--cook-step-bg)] border-[var(--cook-step-border)]"
        }`}
      >
        <span
          className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-none ${
            isChecked ? "bg-[var(--cook-green)] text-white text-[10px] font-bold" : "border-[1.5px] border-black/30"
          }`}
        >
          {isChecked && "✓"}
        </span>
        <span className={`flex-1 text-sm font-semibold ${isChecked ? "line-through text-black/40" : "text-[var(--cook-ink)]"}`}>
          {ing.name}
        </span>
        <span className={`text-sm ${isChecked ? "text-black/35" : "text-black/50"}`}>
          {scaleQuantityDisplay(ing.quantity, servingMultiplier)} {ing.unit}
        </span>
      </button>
    );
  }

  const layoutProps: CookingLayoutProps = {
    recipe,
    steps,
    sections,
    stepIndexBySection,
    checked,
    toggleChecked,
    activeStep,
    setActiveStep,
    sidebarScope,
    setSidebarScope,
    sectionStatus,
    isSectionCollapsed,
    toggleSectionCollapse,
    comingUpSections,
    sectionRefs,
    timers,
    now,
    anyTimerRinging,
    pauseTimer,
    resumeTimer,
    addMinuteToTimer,
    clearTimer,
    addPendingTimer,
    adjustPendingDuration,
    setPendingDurationMinutes,
    startPendingTimer,
    timerForActiveStep,
    activeCategories,
    startTimer,
    defaultTimerLabel,
    StartTimerControl,
    goToPrevStep,
    goToNextStep,
    handleStepTouchStart,
    handleStepTouchEnd,
    renderIngredientRow,
    focusContentRef,
    stepTextRef,
    stepFontSize,
    setConfirmingExit,
    formatClock,
    timerRemainingMs,
    currentStepItems,
    sheetOpen,
    setSheetOpen,
  };

  return (
    <div className={`cook-mode fixed inset-0 z-50 flex flex-col overscroll-none ${isPhone ? "bg-[#103023]" : "bg-[var(--cook-canvas)]"}`}>
      {isPhone ? <CookingModePhone {...layoutProps} /> : <CookingModeDesktop {...layoutProps} />}

      {confirmingExit && (
        <ConfirmModal
          message={
            timers.length > 0
              ? "Exit cooking mode? Your checklist progress and running timers will be cleared."
              : "Exit cooking mode? Your checklist progress will be cleared."
          }
          confirmLabel="Exit"
          onCancel={() => setConfirmingExit(false)}
          onConfirm={confirmExit}
        />
      )}
    </div>
  );
}
