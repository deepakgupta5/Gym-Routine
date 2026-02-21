"use client";

import { useEffect, useState } from "react";

type Shift = {
  session_type: string;
  from_date: string;
  to_date: string;
};

type SkipPreviewModalProps = {
  isOpen: boolean;
  isoDate: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
};

function formatShortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
  return `${weekday} ${day} ${month}`;
}

const PREVIEW_LIMIT = 3;

export default function SkipPreviewModal({
  isOpen,
  isoDate,
  onConfirm,
  onCancel,
  isConfirming,
}: SkipPreviewModalProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/plan/insert-rest-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rest_date: isoDate, dry_run: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.dry_run) {
          setShifts(data.shifts ?? []);
          setDroppedCount(data.dropped_count ?? 0);
        } else {
          setError("Could not preview schedule changes.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isoDate]);

  if (!isOpen) return null;

  const visibleShifts = shifts.slice(0, PREVIEW_LIMIT);
  const hiddenCount = shifts.length - PREVIEW_LIMIT;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="flex w-full max-w-lg flex-col rounded-t-2xl border-t border-gray-700 bg-gray-800 p-5 pb-8">
        <h3 className="text-lg font-semibold text-gray-100">Skip This Day?</h3>

        {loading && <p className="mt-3 text-sm text-gray-400">Loading preview...</p>}

        {error && (
          <p className="mt-3 text-sm text-red-300">{error}</p>
        )}

        {!loading && !error && (
          <div className="mt-3">
            {shifts.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions will be shifted.</p>
            ) : (
              <>
                {/* Summary line */}
                <p className="mb-2 text-sm text-gray-300">
                  All <span className="font-semibold text-gray-100">{shifts.length}</span> remaining
                  sessions will shift forward by 1 day.
                </p>

                {/* Show first few examples */}
                <div className="grid gap-1.5">
                  {visibleShifts.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-gray-200">{s.session_type}</span>
                      <span className="text-gray-400">{formatShortDate(s.from_date)}</span>
                      <span className="text-gray-500">&rarr;</span>
                      <span className="text-gray-300">{formatShortDate(s.to_date)}</span>
                    </div>
                  ))}
                </div>

                {hiddenCount > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    ... and {hiddenCount} more session{hiddenCount > 1 ? "s" : ""}
                  </p>
                )}
              </>
            )}

            {droppedCount > 0 && (
              <div className="mt-3 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
                {droppedCount} session{droppedCount > 1 ? "s" : ""} at end of block will be dropped.
              </div>
            )}
          </div>
        )}

        {/* Buttons always visible */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="min-h-[44px] flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 text-sm font-medium text-gray-200 active:opacity-80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming || loading}
            className="min-h-[44px] flex-1 rounded-lg border border-red-700 bg-red-900/50 px-4 text-sm font-medium text-red-100 active:opacity-80 disabled:opacity-60"
          >
            {isConfirming ? "Skipping..." : "Confirm Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
