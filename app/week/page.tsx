import LarderApp from "@/components/LarderApp";
import { getAppData } from "@/lib/server/get-app-data";

// See app/page.tsx for why this is required.
export const dynamic = "force-dynamic";

// Opens straight to "This week" — the link to paste into the weekly Trello
// card so Kristine lands on what she's making and prepping.
export default async function WeekPage() {
  const data = await getAppData();
  return <LarderApp {...data} initialView="week" />;
}
