export default function NutritionTodayLoading() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6" aria-busy="true" aria-live="polite">
      <div className="mb-4 h-8 w-52 animate-pulse rounded bg-gray-800" />

      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
            <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-700" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-700" />
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
        <div className="mb-3 h-6 w-32 animate-pulse rounded bg-gray-800" />
        <div className="h-24 animate-pulse rounded bg-gray-800" />
      </div>
    </main>
  );
}
