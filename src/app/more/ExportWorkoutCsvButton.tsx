"use client";

import { useState } from "react";

function parseFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return "set-logs.csv";

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return "set-logs.csv";
}

export default function ExportWorkoutCsvButton() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    if (exporting) return;

    setExporting(true);
    setError(null);

    try {
      const res = await fetch("/api/export/set-logs", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not export workout CSV right now.");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const fileName = parseFilename(res.headers.get("content-disposition"));
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Could not export workout CSV right now.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void onExport()}
        disabled={exporting}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 p-4 text-left text-sm text-gray-100 active:opacity-80 disabled:opacity-60"
      >
        {exporting ? "Exporting Workout CSV..." : "Export Workout CSV"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
