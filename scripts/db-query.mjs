#!/usr/bin/env node
// Runs SQL against the Supabase project via the Management API, using the
// SUPABASE_ACCESS_TOKEN (a personal access token) and SUPABASE_URL from
// .env.local. Handy for migrations without opening the SQL editor.
//
//   node scripts/db-query.mjs "select count(*) from recipes"
//   node scripts/db-query.mjs --file supabase/migrations/2026-09-20-recipe-notes.sql

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = (env.SUPABASE_URL || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!token || !ref) throw new Error("Need SUPABASE_ACCESS_TOKEN and SUPABASE_URL in .env.local");

  const args = process.argv.slice(2);
  let query;
  if (args[0] === "--file") {
    query = readFileSync(resolve(root, args[1]), "utf8");
  } else {
    query = args.join(" ");
  }
  if (!query?.trim()) throw new Error("No SQL given");

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
