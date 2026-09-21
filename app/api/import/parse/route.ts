import { NextResponse } from "next/server";
import { fetchRecipeSource } from "@/lib/server/fetch-recipe-source";
import { parseRecipe } from "@/lib/server/parse-recipe";
import type { ParseImage } from "@/lib/server/parse-recipe";
import { createAdminClient } from "@/lib/supabase/server";
import type { LibraryIngredient } from "@/lib/types";

// POST { url?: string, text?: string, images?: [{ mediaType, data }] }
//   -> { payload: RecipeImportPayload, notes: string, source: {...} }
//   -> { error: string, needsScreenshot?: true }
//
// Sits behind the site-wide password gate like every other page (proxy.ts),
// so the browser's session cookie is the only auth. A URL is fetched
// server-side first; text and photos go straight to the parser.

export const maxDuration = 120;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function loadLibrary(): Promise<LibraryIngredient[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ingredients").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    pantryStaple: Boolean(row.pantry_staple),
  }));
}

export async function POST(request: Request) {
  let body: { url?: unknown; text?: unknown; images?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const pastedText = typeof body.text === "string" ? body.text.trim() : "";
  const images: ParseImage[] = Array.isArray(body.images)
    ? body.images
        .filter(
          (i): i is ParseImage =>
            !!i && typeof i === "object" && IMAGE_TYPES.has((i as ParseImage).mediaType) && typeof (i as ParseImage).data === "string"
        )
        .slice(0, 6)
    : [];

  if (!url && !pastedText && images.length === 0) {
    return NextResponse.json({ error: "Give me a link, some text, or a photo." }, { status: 400 });
  }

  try {
    let text = pastedText;
    let sourceKind: "instagram" | "web" | "text" | "photo" = images.length > 0 && !text ? "photo" : "text";
    let sourceUrl: string | null = null;
    let sourceInfo: Record<string, unknown> = {};

    if (url) {
      let fetched;
      try {
        fetched = await fetchRecipeSource(url);
      } catch (err) {
        // Some sites block non-browser requests outright (403, timeouts).
        // That's a dead end for the link, not for the recipe — offer the
        // screenshot route instead of a bare failure.
        const reason = err instanceof Error ? err.message : "Couldn't fetch that link.";
        return NextResponse.json(
          {
            error: `${reason} Take a screenshot of the recipe (or copy the text) and add it here instead.`,
            needsScreenshot: true,
          },
          { status: 422 }
        );
      }
      sourceUrl = fetched.url;
      sourceInfo = { kind: fetched.kind, title: fetched.title, chars: fetched.text.length };
      if (fetched.blockedReason && !pastedText && images.length === 0) {
        return NextResponse.json(
          {
            error: `${fetched.blockedReason} Take a screenshot of the recipe (or copy the text) and add it here instead.`,
            needsScreenshot: true,
            source: sourceInfo,
          },
          { status: 422 }
        );
      }
      if (!fetched.blockedReason) {
        text = pastedText ? `${fetched.text}\n\n---\nAdditional pasted text:\n${pastedText}` : fetched.text;
        sourceKind = fetched.kind;
      }
    }

    const library = await loadLibrary();
    const result = await parseRecipe({ text, images, sourceUrl, sourceKind }, library);
    return NextResponse.json({ ...result, source: sourceInfo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
