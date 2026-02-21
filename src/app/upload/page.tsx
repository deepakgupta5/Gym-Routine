"use client";

import { useState, useRef } from "react";

type UploadResult = {
  ok: boolean;
  rows_upserted?: number;
  warnings?: string[];
  error?: string;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/body-stats/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ ok: true, rows_upserted: data.rows_upserted, warnings: data.warnings });
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        const msg =
          data.error === "no_rows"
            ? "No valid rows found in the file. Check format."
            : data.error === "file_too_large"
              ? "File exceeds 5 MB limit."
              : data.error === "file_required"
                ? "Please select an .xlsx file."
                : `Upload failed: ${data.error || "unknown error"}`;
        setResult({ ok: false, error: msg });
      }
    } catch {
      setResult({ ok: false, error: "Network error. Please try again." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Upload Body Stats</h1>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <p className="text-sm text-gray-300">
          Upload an Excel file (.xlsx) with your daily body stats. The file should have columns:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-400">
          <li>
            <span className="text-gray-200">Date</span> (required) — YYYY-MM-DD or DD/MM/YYYY
          </li>
          <li>
            <span className="text-gray-200">Weight_lb</span> (required) — body weight in pounds
          </li>
          <li>
            <span className="text-gray-200">Bodyfat_pct</span> (optional) — body fat percentage
          </li>
          <li>
            <span className="text-gray-200">Upper_pct</span> / <span className="text-gray-200">Lower_pct</span> (optional) — muscle split percentages
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm text-gray-300 active:opacity-80">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            {file ? file.name : "Choose .xlsx file"}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {result && result.ok && (
          <div className="mt-4 rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-sm text-green-200">
            Successfully uploaded {result.rows_upserted} day{result.rows_upserted !== 1 ? "s" : ""} of body stats.
            {result.warnings && result.warnings.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-amber-300">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result && !result.ok && (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {result.error}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-500">
        Max file size: 5 MB. Duplicate dates will be updated with new values.
        Data is used for adaptive training adjustments (weight trend, body composition tracking).
      </div>
    </main>
  );
}
