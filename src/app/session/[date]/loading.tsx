export default function SessionLoading() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="animate-pulse rounded-xl border border-gray-700 bg-gray-800 p-4">
        <div className="h-7 w-56 rounded bg-gray-700" />
        <div className="mt-3 h-2 w-full rounded bg-gray-700" />
        <div className="mt-4 h-11 w-72 rounded bg-gray-900" />
      </div>

      <div className="mt-4 grid gap-4">
        {[1, 2, 3].map((id) => (
          <div key={id} className="animate-pulse rounded-xl border border-gray-700 bg-gray-800 p-4">
            <div className="h-4 w-20 rounded bg-gray-700" />
            <div className="mt-2 h-6 w-48 rounded bg-gray-700" />
            <div className="mt-2 h-4 w-64 rounded bg-gray-700" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-11 rounded bg-gray-900" />
              <div className="h-11 rounded bg-gray-900" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
