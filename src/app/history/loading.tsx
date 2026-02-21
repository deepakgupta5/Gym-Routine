export default function HistoryLoading() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="mb-4 h-8 w-28 animate-pulse rounded bg-gray-700" />

      <div className="grid gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-700 bg-gray-800 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="h-5 w-36 rounded bg-gray-700" />
                <div className="mt-2 h-3 w-24 rounded bg-gray-700" />
              </div>
              <div className="text-right">
                <div className="h-4 w-14 rounded bg-gray-700" />
                <div className="mt-1 h-3 w-16 rounded bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
