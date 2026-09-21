// Turns a URL into plain text the recipe parser can read. Two paths:
//
// - Instagram: the page is a JS app, but the <meta> tags carry the post's
//   caption (og:title / og:description). From a home network that works for
//   public reels; from a datacenter it often doesn't. When the caption is
//   missing or clearly gated ("comment RECIPE"), we say so and the client
//   falls back to asking for a screenshot.
// - Everything else: prefer the page's JSON-LD Recipe block (most recipe
//   sites ship one — it's the cleanest possible source), else strip the HTML
//   down to readable text.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

export type FetchedSource = {
  url: string;
  kind: "instagram" | "web";
  title: string | null;
  text: string;
  // Set when the source clearly doesn't contain the recipe itself — the
  // caller should ask for a screenshot or pasted text instead.
  blockedReason?: string;
};

export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

type JsonLdNode = Record<string, unknown>;

function findRecipeNode(node: unknown): JsonLdNode | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipeNode(n);
      if (found) return found;
    }
    return null;
  }
  const obj = node as JsonLdNode;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("Recipe")) return obj;
  if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  return null;
}

function instructionText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionText);
  if (typeof value === "object") {
    const obj = value as JsonLdNode;
    if (obj["@type"] === "HowToSection") {
      const name = typeof obj.name === "string" ? obj.name : "";
      const items = instructionText(obj.itemListElement);
      return name ? [`[${name}]`, ...items] : items;
    }
    if (typeof obj.text === "string") return [obj.text];
    if (typeof obj.name === "string") return [obj.name];
  }
  return [];
}

// Renders a JSON-LD Recipe as plain text — the parser reads text, not
// schema.org, and this keeps one code path for every source.
function recipeNodeToText(node: JsonLdNode): string {
  const lines: string[] = [];
  if (typeof node.name === "string") lines.push(`Recipe: ${node.name}`);
  if (typeof node.description === "string") lines.push(node.description);
  const servings = Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield;
  if (servings) lines.push(`Yield: ${String(servings)}`);
  const ingredients = Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [];
  if (ingredients.length > 0) {
    lines.push("", "Ingredients:");
    for (const ing of ingredients) lines.push(`- ${decodeEntities(String(ing))}`);
  }
  const steps = instructionText(node.recipeInstructions);
  if (steps.length > 0) {
    lines.push("", "Instructions:");
    steps.forEach((s, i) => lines.push(`${i + 1}. ${decodeEntities(s)}`));
  }
  return lines.join("\n");
}

function extractJsonLdRecipe(html: string): JsonLdNode | null {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const found = findRecipeNode(JSON.parse(m[1]));
      if (found) return found;
    } catch {
      // malformed block — keep looking
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRecipeSource(rawUrl: string): Promise<FetchedSource> {
  const url = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http(s) links are supported.");

  const html = await fetchHtml(url);

  if (isInstagramUrl(url)) {
    // og:title holds "Author on Instagram: \"<caption>\"" — the caption is
    // the whole recipe for most cooking reels. og:description is the same
    // caption with a likes/comments prefix; use whichever is longer.
    const candidates = [
      metaContent(html, "property", "og:title"),
      metaContent(html, "property", "og:description"),
      metaContent(html, "name", "description"),
    ].filter((s): s is string => Boolean(s));
    const caption = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
    const text = caption.replace(/^[^:]{0,120}?:\s*"/, "").replace(/"\s*\.?\s*$/, "").trim();
    const author = caption.match(/^(.*?) on Instagram:/)?.[1]?.trim() ?? null;

    const gated = /comment\s+["“]?\s*\w+\s*["”]?\s+(and|&)\s+i['’]ll\s+(send|dm)/i.test(text)
      && !/ingredients?\s*[:\n]/i.test(text);
    const result: FetchedSource = { url, kind: "instagram", title: author, text };
    if (!text || text.length < 80) {
      result.blockedReason = "Instagram didn't return the caption for this post.";
    } else if (gated) {
      result.blockedReason = "This post keeps the recipe behind a comment, so the caption doesn't contain it.";
    }
    return result;
  }

  const title = metaContent(html, "property", "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const recipeNode = extractJsonLdRecipe(html);
  const text = recipeNode ? recipeNodeToText(recipeNode) : htmlToText(html).slice(0, MAX_TEXT_CHARS);
  const result: FetchedSource = { url, kind: "web", title: title ? decodeEntities(title) : null, text };
  if (text.length < 80) result.blockedReason = "The page didn't contain any readable text.";
  return result;
}
