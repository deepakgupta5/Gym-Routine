"use client";

export default function NutritionTodayError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Nutrition</h1>
      <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        <div className="mb-3">{error.message || "Failed to load nutrition page."}</div>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-red-700 bg-red-600 px-3 py-2 text-xs text-white"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
