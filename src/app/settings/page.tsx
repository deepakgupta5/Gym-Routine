export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Settings</h1>

      <div className="grid gap-3">
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-200">Nutrition Targets</h2>
          <p className="text-sm text-gray-400">Target editing will be added in Sprint 4.</p>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-200">Preferences</h2>
          <p className="text-sm text-gray-400">Additional app preferences will be added in a future sprint.</p>
        </section>
      </div>
    </main>
  );
}
