"use client";

import { useMemo, useState } from "react";

type RecipeItemDraft = {
  id: string;
  item_name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

function asNonNegativeNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function emptyItem(id: number): RecipeItemDraft {
  return {
    id: `draft-${id}`,
    item_name: "",
    quantity: "1",
    unit: "serving",
    calories: "0",
    protein_g: "0",
    carbs_g: "0",
    fat_g: "0",
  };
}

export default function RecipeBuilder() {
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [items, setItems] = useState<RecipeItemDraft[]>([emptyItem(1)]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.calories += asNonNegativeNumber(item.calories);
        acc.protein_g += asNonNegativeNumber(item.protein_g);
        acc.carbs_g += asNonNegativeNumber(item.carbs_g);
        acc.fat_g += asNonNegativeNumber(item.fat_g);
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [items]);

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h2 className="mb-3 text-lg font-semibold text-gray-100">Recipe Builder</h2>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          type="number"
          min={1}
          placeholder="Servings"
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
      </div>

      <div className="mt-3 space-y-2">
        {items.map((item, idx) => (
          <div key={item.id} className="rounded-md border border-gray-700 bg-gray-800/60 p-2">
            <div className="mb-2 text-xs text-gray-400">Ingredient {idx + 1}</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                value={item.item_name}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], item_name: e.target.value };
                  setItems(next);
                }}
                placeholder="Item"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.quantity}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], quantity: e.target.value };
                  setItems(next);
                }}
                placeholder="Qty"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.unit}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], unit: e.target.value };
                  setItems(next);
                }}
                placeholder="Unit"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.calories}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], calories: e.target.value };
                  setItems(next);
                }}
                type="number"
                placeholder="Calories"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.protein_g}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], protein_g: e.target.value };
                  setItems(next);
                }}
                type="number"
                placeholder="Protein"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.carbs_g}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], carbs_g: e.target.value };
                  setItems(next);
                }}
                type="number"
                placeholder="Carbs"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <input
                value={item.fat_g}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], fat_g: e.target.value };
                  setItems(next);
                }}
                type="number"
                placeholder="Fat"
                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
              />
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
                className="rounded-md border border-red-700 bg-red-600 px-2 py-1 text-sm text-white disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyItem(prev.length + 1)])}
          className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          Add Ingredient
        </button>
        <button
          type="button"
          className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white"
        >
          Save Recipe (UI stub)
        </button>
      </div>

      <div className="mt-3 rounded-md border border-gray-700 bg-gray-800 p-3 text-sm text-gray-200">
        <div className="font-medium">{name.trim() || "Untitled recipe"} · {Math.max(1, Math.round(asNonNegativeNumber(servings) || 1))} servings</div>
        <div className="text-xs text-gray-400">
          {Math.round(totals.calories)} kcal, {Math.round(totals.protein_g)}g P, {Math.round(totals.carbs_g)}g C, {Math.round(totals.fat_g)}g F
        </div>
      </div>
    </section>
  );
}
