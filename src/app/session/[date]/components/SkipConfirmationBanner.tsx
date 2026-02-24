"use client";

import { useEffect, useState } from "react";

type SkipConfirmationBannerProps = {
  isoDate: string;
  initialVisible?: boolean;
};

const SKIP_BANNER_KEY_PREFIX = "skipped_date:";
const FALLBACK_TTL_MS = 30 * 60 * 1000;

function getKey(isoDate: string) {
  return `${SKIP_BANNER_KEY_PREFIX}${isoDate}`;
}

export function persistSkipBanner(isoDate: string) {
  try {
    window.localStorage.setItem(getKey(isoDate), String(Date.now()));
  } catch {
    // Ignore storage failures.
  }
}

export default function SkipConfirmationBanner({
  isoDate,
  initialVisible = false,
}: SkipConfirmationBannerProps) {
  const [visible, setVisible] = useState(initialVisible);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialVisible) {
      persistSkipBanner(isoDate);
      setVisible(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(getKey(isoDate));
      if (!raw) {
        setVisible(false);
        return;
      }

      const ts = Number(raw);
      const fresh = Number.isFinite(ts) && Date.now() - ts <= FALLBACK_TTL_MS;
      setVisible(fresh);
      if (!fresh) {
        window.localStorage.removeItem(getKey(isoDate));
      }
    } catch {
      setVisible(false);
    }
  }, [isoDate, initialVisible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!visible) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-green-800 bg-green-950/40 px-3 py-2 text-sm text-green-200">
      Day skipped. Schedule updated.
    </div>
  );
}
