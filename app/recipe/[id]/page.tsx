import LarderApp from "@/components/LarderApp";
import { getAppData } from "@/lib/server/get-app-data";

// See app/page.tsx for why this is required.
export const dynamic = "force-dynamic";

// A shareable link to one recipe (the "Copy link" button on a recipe page).
// Falls back to Home if the id doesn't match anything.
export default async function RecipePage(props: PageProps<"/recipe/[id]">) {
  const { id } = await props.params;
  const data = await getAppData();
  return <LarderApp {...data} initialRecipeId={id} />;
}
