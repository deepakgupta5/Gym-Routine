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
      setError("Invalid passcode.");
      return;
    }

    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit}>
      <label style={{ display: "block", marginBottom: 8 }}>
        Passcode
      </label>
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 12 }}
        autoFocus
      />
      {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? "Unlocking..." : "Unlock"}
      </button>
    </form>
  );
}
