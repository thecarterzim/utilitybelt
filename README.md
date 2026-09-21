# The Larder

A recipe book, weekly prep planner, and shopping list for one household.
Next.js (App Router) + Supabase. One shared site password, no accounts.

## Origins

The Larder is a fork of [utilitybelt](https://github.com/JosiahSMoore/utilitybelt)
by Josiah Moore, trimmed down for how this household actually cooks. The fork
lives at [thecarterzim/utilitybelt](https://github.com/thecarterzim/utilitybelt).

## What it does

### Recipe book

Recipes with sectioned ingredient lists, instructions, servings, and an optional
source link. Every recipe has a Copy link button for its `/recipe/<id>` URL.

### Add a recipe

Paste a link (Instagram reels and posts, or any recipe website), upload a
screenshot, or paste text. Claude reads it, turns it into the app's import
format, and matches each ingredient against the ingredient library so you can
review the draft before saving. Recipes can also be written by hand.

### This week

Instead of a calendar, the week is five buckets:

- Kristine makes
- Kristine preps
- Other dinners
- Lunches
- Leighton snacks

The shopping list builds from whatever is in them. **Start new week** clears
the buckets and any recipe-derived shopping list items, but keeps items you
added by hand. The `/week` URL is meant to be pasted into a Trello card.

### Prep day

Each recipe can carry its own "prep ahead" steps. The week screen collects
them into a prep-day section, so the hand-off is one page.

### Shopping list

Built from the week's recipes, combined by ingredient, with quick-add for
anything else. It has its own URL at `/list` for the phone in the store.

### Ingredient library

A shared list of ingredients the import matches against. Its only setting is
*pantry staple*: staples (salt, oil, dried spices) are skipped when the list
is built.

### Cooking Mode

Step-by-step instructions with timers, laid out for a phone on the counter or
a desktop.

### Removed from upstream

The 7-day meal-plan calendar, daily extras, and all calorie/protein/fiber
tracking are gone from the UI (the database columns remain but nothing reads
them). The JSON-import Claude Skill and its ingredients-feed endpoint are also
removed; recipe import now happens inside the app.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema.** For a fresh install, open the SQL editor and run
   `supabase/schema.sql`. If you already have a database from an earlier
   version, apply the files in `supabase/migrations/` instead (the `db-query`
   script below can do that from the terminal).
3. **Set env vars.** Copy `.env.local.example` to `.env.local` and fill in:
   - `SUPABASE_URL` — the Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — a secret key from Project Settings → API
     Keys (or the legacy `service_role` key).
   - `SITE_PASSWORD` — the one password everyone in the household uses.
   - `ANTHROPIC_API_KEY` — needed for "Add a recipe" from a link, screenshot,
     or text.
   - `SUPABASE_ACCESS_TOKEN` (optional) — a personal access token, only used
     by `scripts/db-query.mjs`.
4. **Run it:**
   ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in with the
   site password.

Never commit `.env.local`; it holds the keys.

## Scripts

### Seed recipes

```bash
node scripts/seed-recipes.mjs            # seed everything in scripts/seed/*.json
node scripts/seed-recipes.mjs --dry-run  # print what would be inserted
```

Seeds recipes (and the library ingredients they use) from `scripts/seed/*.json`.
Safe to re-run: a recipe whose name already exists is skipped, and library
ingredients are matched by name. The seed file shape is documented at the top
of the script.

### Run SQL

```bash
node scripts/db-query.mjs "select count(*) from recipes"
node scripts/db-query.mjs --file supabase/migrations/2026-09-20-week-items.sql
```

Runs SQL against the Supabase project through the Management API, using
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_URL` from `.env.local`. Handy for
applying a migration without opening the SQL editor.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add the same environment variables (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SITE_PASSWORD`, `ANTHROPIC_API_KEY`) in the
   Vercel project settings, making sure each is enabled for the **Production**
   environment, not just Preview/Development.
3. Deploy.

Vercel rejects a deployment if the commit author's email is not a verified
email on the GitHub account doing the push. Set
`git config user.email <verified-email>` in the repo before the first push;
only the tip commit is checked.

## Architecture notes

- **Data model.** `recipes` (ingredients stored as a `jsonb` array on the row,
  plus `source_url` and `prep_steps`), `week_items` (one row per bucket +
  recipe; the shopping list builds from these), `shopping_list_items`
  (`source` is `recipe` or `manual`; rebuilds replace the former and leave the
  latter alone), and `ingredients` (the library, with `pantry_staple`).
  `meal_plan` and `daily_extras` still exist in the schema but the app no
  longer uses them.
- **Client/server split.** Server Components fetch everything up front. One
  client component, `components/LarderApp.tsx`, holds UI state and calls the
  Server Actions in `app/actions.ts` for every mutation, updating local state
  from the result.
- **Supabase access.** Only server-side code (`lib/supabase/server.ts`) talks
  to Supabase, using the secret key. Every table has row-level security
  enabled with zero policies, which blocks the public keys entirely; the secret
  key bypasses RLS by design and is never sent to the browser. New tables also
  need an explicit `grant all on public.<table> to service_role;` — RLS and
  Postgres grants are separate layers, and the schema file includes this for
  every table.
- **Password gate.** `proxy.ts` (Next.js 16's replacement for `middleware.ts`)
  redirects any request without a valid `site_auth` cookie to `/login`, except
  `/login` and `/api/login` themselves. The cookie is an HMAC of a fixed
  payload keyed by `SITE_PASSWORD` (`lib/site-auth.ts`), `HttpOnly`, with a
  10-year expiry. There are no sessions to revoke; changing `SITE_PASSWORD`
  signs everyone out at once because old cookies were signed with the old
  value.
- **Recipe import.** `app/api/import/parse/route.ts` accepts a URL, pasted
  text, or up to six images. A URL goes through
  `lib/server/fetch-recipe-source.ts`: Instagram captions are read from the
  page's `og:` meta tags; other sites use their JSON-LD `Recipe` block when
  they have one, otherwise the HTML is stripped to readable text. The text
  and/or images then go to `lib/server/parse-recipe.ts`, which asks Claude for
  a structured-output draft (validated by a Zod schema) and matches
  ingredients against the library. Sites that block server-side fetching, or
  Instagram posts whose recipe is gated behind "comment RECIPE", come back
  with `needsScreenshot` and the UI asks for a screenshot instead. The route
  sits behind the same password gate as every page, so the session cookie is
  the only auth.
