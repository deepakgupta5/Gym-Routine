"use client";

import { useEffect } from "react";
import { setupHaptics } from "@/lib/haptics";

export default function HapticsProvider() {
  useEffect(() => {
    setupHaptics();
  }, []);

  return null;
}
