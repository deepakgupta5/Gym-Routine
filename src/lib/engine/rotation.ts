import {
  LOWER_HINGE_PRIMARY_ROTATION,
  LOWER_SQUAT_PRIMARY_ROTATION,
  UPPER_PULL_PRIMARY_ROTATION,
  UPPER_PUSH_PRIMARY_ROTATION,
} from "@/lib/engine/constants";

export type PrimaryCatalogKey =
  | "UPPER_PUSH"
  | "UPPER_PULL"
  | "LOWER_SQUAT"
  | "LOWER_HINGE";

export const PRIMARY_CATALOGS: Record<PrimaryCatalogKey, number[]> = {
  UPPER_PUSH: UPPER_PUSH_PRIMARY_ROTATION,
  UPPER_PULL: UPPER_PULL_PRIMARY_ROTATION,
  LOWER_SQUAT: LOWER_SQUAT_PRIMARY_ROTATION,
  LOWER_HINGE: LOWER_HINGE_PRIMARY_ROTATION,
};

export function normalizePrimaryLiftMap(input: unknown): Record<PrimaryCatalogKey, number> {
  const map: Record<PrimaryCatalogKey, number> = {
    UPPER_PUSH: PRIMARY_CATALOGS.UPPER_PUSH[0],
    UPPER_PULL: PRIMARY_CATALOGS.UPPER_PULL[0],
    LOWER_SQUAT: PRIMARY_CATALOGS.LOWER_SQUAT[0],
    LOWER_HINGE: PRIMARY_CATALOGS.LOWER_HINGE[0],
  };

  if (!input || typeof input !== "object") return map;

  (Object.keys(map) as PrimaryCatalogKey[]).forEach((key) => {
    const value = Number((input as Record<string, unknown>)[key]);
    if (!Number.isFinite(value)) return;
    if (PRIMARY_CATALOGS[key].includes(value)) {
      map[key] = value;
    }
  });

  return map;
}

export function getCatalogIndexMap(
  map: Record<PrimaryCatalogKey, number>
): Record<PrimaryCatalogKey, number> {
  const out: Record<PrimaryCatalogKey, number> = {
    UPPER_PUSH: 0,
    UPPER_PULL: 0,
    LOWER_SQUAT: 0,
    LOWER_HINGE: 0,
  };

  (Object.keys(out) as PrimaryCatalogKey[]).forEach((key) => {
    const idx = PRIMARY_CATALOGS[key].indexOf(map[key]);
    out[key] = idx >= 0 ? idx : 0;
  });

  return out;
}

export function rotatePrimaryLiftMap(
  map: Record<PrimaryCatalogKey, number>
): Record<PrimaryCatalogKey, number> {
  const next: Record<PrimaryCatalogKey, number> = { ...map };

  (Object.keys(next) as PrimaryCatalogKey[]).forEach((key) => {
    const catalog = PRIMARY_CATALOGS[key];
    const idx = catalog.indexOf(map[key]);
    const nextIdx = idx >= 0 ? (idx + 1) % catalog.length : 0;
    next[key] = catalog[nextIdx];
  });

  return next;
}
