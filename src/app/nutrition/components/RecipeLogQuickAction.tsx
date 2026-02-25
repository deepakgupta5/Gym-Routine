"use client";

import { useState } from "react";

export default function RecipeLogQuickAction() {
  const [recipeName, setRecipeName] = useState("");
  const [servings, setServings] = useState("1");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h2 className="mb-3 text-lg font-semibold text-gray-100">Quick Log Recipe</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={recipeName}
          onChange={(e) => setRecipeName(e.target.value)}
          placeholder="Recipe name"
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          type="number"
          min={0.25}
          step={0.25}
          placeholder="Servings"
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (!recipeName.trim()) {
            setMessage("Recipe name is required.");
            return;
          }
          setMessage(`Prepared quick log for ${recipeName.trim()} (${servings || "1"} servings).`);
        }}
        className="mt-3 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white"
      >
        Log Recipe (UI stub)
      </button>
      {message ? <div className="mt-2 text-xs text-gray-300">{message}</div> : null}
    </section>
  );
}
