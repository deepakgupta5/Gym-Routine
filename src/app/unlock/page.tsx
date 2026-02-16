import { Suspense } from "react";
import UnlockForm from "./unlockForm";

export default function UnlockPage() {
  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 16px" }}>
      <h1>Unlock</h1>
      <p>Enter your passcode to continue.</p>
      <Suspense fallback={<div />}>
        <UnlockForm />
      </Suspense>
    </div>
  );
}

