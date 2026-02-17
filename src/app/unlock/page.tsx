import { Suspense } from "react";
import UnlockForm from "./unlockForm";

export default function UnlockPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-5">
      <section className="w-full rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h1 className="text-2xl font-semibold text-gray-100">Unlock</h1>
        <p className="mt-2 text-sm text-gray-400">Enter your passcode to continue.</p>
        <Suspense fallback={<div className="mt-4 text-sm text-gray-500">Loading...</div>}>
          <UnlockForm />
        </Suspense>
      </section>
    </main>
  );
}
