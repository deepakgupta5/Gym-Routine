"use client";

export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="rounded-xl border border-red-800 bg-red-950/40 p-4">
        <h1 className="text-xl font-semibold text-red-200">Session failed to load</h1>
        <p className="mt-2 text-sm text-red-300">{error.message || "Unexpected error"}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 min-h-[44px] rounded-lg border border-red-700 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 active:opacity-80"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
