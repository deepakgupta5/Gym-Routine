"use client";

import { useEffect } from "react";

export default function BackForwardRefresh() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", onPageShow);

    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type === "back_forward") {
      window.location.reload();
    }

    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
