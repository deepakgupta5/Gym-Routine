import RecipeBuilder from "@/app/nutrition/components/RecipeBuilder";
import RecipeLogQuickAction from "@/app/nutrition/components/RecipeLogQuickAction";

export const dynamic = "force-dynamic";

export default function NutritionRecipesPage() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Recipe Mode</h1>
      <div className="grid gap-4">
        <RecipeBuilder />
        <RecipeLogQuickAction />
      </div>
    </main>
  );
}
