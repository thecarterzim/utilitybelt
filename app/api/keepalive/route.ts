import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Supabase's free tier pauses a project after about a week with no
// database activity, which makes the whole app look like it lost its data
// until someone restores it from the dashboard. A Vercel cron (see
// vercel.json) hits this once a day to run one trivial query so the project
// never goes idle. Vercel sends `Authorization: Bearer <CRON_SECRET>` on
// cron invocations; anything without that header is turned away, and the
// route is a no-op if CRON_SECRET isn't set at all.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("recipes")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recipes: count, at: new Date().toISOString() });
}
