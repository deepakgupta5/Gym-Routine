export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="mb-4 h-8 w-36 animate-pulse rounded bg-gray-700" />

      <div className="grid gap-4">
        {/* Next workout skeleton */}
        <div className="animate-pulse rounded-xl border border-gray-700 bg-gray-800 p-4">
          <div className="h-3 w-24 rounded bg-gray-700" />
          <div className="mt-2 h-6 w-40 rounded bg-gray-700" />
          <div className="mt-1 h-4 w-32 rounded bg-gray-700" />
        </div>

        {/* Week summary skeleton */}
        <div className="animate-pulse rounded-xl border border-gray-700 bg-gray-800 p-4">
          <div className="h-4 w-28 rounded bg-gray-700" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg bg-gray-900 p-3">
                <div className="h-3 w-16 rounded bg-gray-700" />
                <div className="mt-2 h-6 w-12 rounded bg-gray-700" />
              </div>
            ))}
          </div>
        </div>

        {/* Sparkline skeletons */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-700 bg-gray-900 p-3">
              <div className="h-4 w-40 rounded bg-gray-700" />
              <div className="mt-2 h-[60px] rounded bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
