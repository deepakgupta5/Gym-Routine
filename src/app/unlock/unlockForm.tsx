"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockForm() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get("next") || "/today";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });

    setLoading(false);

    if (!res.ok) {
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as
          | { retry_after_seconds?: number }
          | null;
        const retry = body?.retry_after_seconds;
        setError(
          retry
            ? `Too many attempts. Try again in ${retry} seconds.`
            : "Too many attempts. Try again shortly."
        );
        return;
      }

      setError("Invalid passcode.");
      return;
    }

    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <label className="text-sm text-gray-300">Passcode</label>
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100"
        autoFocus
      />
      {error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
      >
        {loading ? "Unlocking..." : "Unlock"}
      </button>
    </form>
  );
}
