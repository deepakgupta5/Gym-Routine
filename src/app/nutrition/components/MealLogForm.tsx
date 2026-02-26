"use client";

import { useRef } from "react";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type EntryMode = "ai" | "photo";

export type PreviewItem = {
  item_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  vitamin_d_mcg: number;
  vitamin_c_mg: number;
  potassium_mg: number;
  source: "ai" | "manual";
  confidence: number | null;
  is_user_edited: boolean;
  sort_order: number;
};

type MealLogFormProps = {
  mealType: MealType;
  onMealTypeChange: (t: MealType) => void;
  rawInput: string;
  onRawInputChange: (v: string) => void;
  entryMode: EntryMode;
  onEntryModeChange: (m: EntryMode) => void;
  aiPreviewItems: PreviewItem[];
  onUpdatePreviewItem: (index: number, key: keyof PreviewItem, value: string | number) => void;
  onAddPreviewItem: () => void;
  onRemovePreviewItem: (index: number) => void;
  onSaveWithAi: () => void;
  onSaveFromPhoto: (file: File) => void;
  onSaveReviewedAiMeal: () => void;
  savingAi: boolean;
  savingPhoto: boolean;
  savingReviewedAi: boolean;
  formError: string | null;
  formSuccess: string | null;
  aiInputError: string | null;
  onClearMessages: () => void;
  photoFile: File | null;
  onPhotoFileChange: (f: File | null) => void;
};

function asNonNegativeNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function MealLogForm({
  mealType, onMealTypeChange, rawInput, onRawInputChange,
  entryMode, onEntryModeChange, aiPreviewItems, onUpdatePreviewItem,
  onAddPreviewItem, onRemovePreviewItem, onSaveWithAi, onSaveFromPhoto,
  onSaveReviewedAiMeal, savingAi, savingPhoto, savingReviewedAi,
  formError, formSuccess, aiInputError, onClearMessages,
  photoFile, onPhotoFileChange,
}: MealLogFormProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h2 className="mb-3 text-lg font-semibold text-gray-100">Log Meal</h2>

      {formError && (
        <div className="mb-3 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {formError}
        </div>
      )}
      {formSuccess && (
        <div className="mb-3 rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {formSuccess}
        </div>
      )}

      <div className="mb-3">
        <select
          value={mealType}
          onChange={(e) => { onMealTypeChange(e.target.value as MealType); onClearMessages(); }}
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="snack">Snack</option>
          <option value="dinner">Dinner</option>
        </select>
      </div>

      <div className="mb-3">
        <textarea
          value={rawInput}
          onChange={(e) => { onRawInputChange(e.target.value); onClearMessages(); }}
          placeholder='Describe your meal (example: "Cheese sandwich and milk coffee")'
          className="min-h-24 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
        />
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => { onEntryModeChange("ai"); onClearMessages(); onSaveWithAi(); }}
          disabled={savingAi}
          className={`rounded-md border px-3 py-2 text-sm ${entryMode === "ai" ? "border-blue-700 bg-blue-600 text-white" : "border-gray-600 bg-gray-800 text-gray-100"} disabled:opacity-50`}
        >
          {savingAi ? "Parsing..." : "Text"}
        </button>
        <button
          type="button"
          onClick={() => {
            onClearMessages();
            if (entryMode !== "photo") {
              onEntryModeChange("photo");
              window.setTimeout(() => uploadInputRef.current?.click(), 0);
              return;
            }
            if (photoFile) { onSaveFromPhoto(photoFile); return; }
            uploadInputRef.current?.click();
          }}
          disabled={savingPhoto}
          className={`rounded-md border px-3 py-2 text-sm ${entryMode === "photo" ? "border-blue-700 bg-blue-600 text-white" : "border-gray-600 bg-gray-800 text-gray-100"} disabled:opacity-50`}
        >
          {savingPhoto ? "Saving..." : "Photo"}
        </button>
      </div>

      {entryMode === "ai" && (
        <div className="rounded-md border border-gray-700 bg-gray-800/60 p-3">
          {aiInputError && <div className="mt-2 text-xs text-amber-300">{aiInputError}</div>}

          {aiPreviewItems.length > 0 && (
            <div className="mt-4 rounded-md border border-gray-700 bg-gray-900 p-3">
              <div className="mb-2 text-sm font-medium text-gray-100">Review Parsed Items</div>
              <div className="space-y-3">
                {aiPreviewItems.map((item, idx) => (
                  <div key={`${item.item_name}-${idx}`} className="rounded-md border border-gray-700 bg-gray-800 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-300">
                        Item {idx + 1}: {item.item_name || "Unnamed item"} ({item.source})
                      </span>
                      <button type="button" onClick={() => onRemovePreviewItem(idx)}
                        className="rounded border border-red-700 bg-red-600 px-2 py-1 text-[11px] text-white">
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["item_name","quantity","unit","calories","protein_g","carbs_g","fat_g",
                         "fiber_g","sugar_g","sodium_mg","iron_mg","calcium_mg","vitamin_d_mcg",
                         "vitamin_c_mg","potassium_mg"] as const).map((field) => (
                        <label key={field} className="grid gap-1 text-xs text-gray-400">
                          <span>{field.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</span>
                          <input
                            value={item[field] as string | number}
                            onChange={(e) => onUpdatePreviewItem(idx, field,
                              field === "item_name" || field === "unit" ? e.target.value : asNonNegativeNumber(e.target.value)
                            )}
                            type={field === "item_name" || field === "unit" ? "text" : "number"}
                            className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={onAddPreviewItem}
                  className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
                  Add Item
                </button>
                <button type="button" onClick={onSaveReviewedAiMeal} disabled={savingReviewedAi}
                  className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                  {savingReviewedAi ? "Saving..." : "Save Reviewed Meal"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {entryMode === "photo" && (
        <div className="rounded-md border border-gray-700 bg-gray-800/60 p-3">
          <div className="flex flex-wrap gap-2">
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { onPhotoFileChange(e.target.files?.[0] ?? null); onClearMessages(); }} />
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="rounded-md border border-indigo-700 bg-indigo-600 px-3 py-2 text-sm text-white">
              Take Photo
            </button>
            <input ref={uploadInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { onPhotoFileChange(e.target.files?.[0] ?? null); onClearMessages(); }} />
            <button type="button" onClick={() => uploadInputRef.current?.click()}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100">
              Upload Photo
            </button>
            <button type="button" onClick={() => photoFile && onSaveFromPhoto(photoFile)}
              disabled={!photoFile || savingPhoto}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
              {savingPhoto ? "Saving..." : "Save Photo Meal"}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {photoFile ? `Selected: ${photoFile.name}` : "No photo selected"}
          </div>
        </div>
      )}
    </div>
  );
}
