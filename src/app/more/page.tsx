import Link from "next/link";

export const dynamic = "force-dynamic";

export default function MorePage() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">More</h1>

      <div className="grid gap-3">
        <Link
          href="/history"
          className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-100 active:opacity-80"
        >
          Workout History
        </Link>

        <Link
          href="/upload"
          className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-100 active:opacity-80"
        >
          Upload Body Stats
        </Link>

        <Link
          href="/settings"
          className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-100 active:opacity-80"
        >
          Settings
        </Link>
      </div>
    </main>
  );
}
