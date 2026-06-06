# LESSONS_LEARNED_GYM.md

---

## Session: 2026-06-06

### L1 -- Accessory repeat bug: score ties cause slot monopoly [UNIVERSAL]

**Problem:** Cable Crunch (#25), Hanging Knee Raise (#43), Pallof Press (#44) all had `user_preference_score=2` from migration 0026. With exactly 3 high-score core exercises and 3 accessory slots, they filled every session identically.

**Root cause:** No-repeat filter only applied to primary/secondary roles. Accessories were unprotected.

**Fix:** Extended no-repeat filter to ALL roles in `src/lib/scheduler/v2/select.ts` and `src/lib/scheduler/v2/index.ts`.

**Pattern:** When a small set of candidates has uniformly high scores and the no-repeat rule doesn't apply, the same candidates win every time. Score boosts + small candidate pools = repeat monopoly. Fix: no-repeat must apply to every slot type, or candidate pool must be large enough that score variation matters.

[UNIVERSAL]

---

### L2 -- suitable_slots missing = wrong exercise in wrong slot [UNIVERSAL]

**Problem:** Exercises 26-44 were added in migration 0020 without explicit `suitable_slots`. Default was `['primary','secondary','accessory']`. This caused Back Squat (#26) to appear as an accessory and leg isolation moves to appear as primaries.

**Fix:** Migration 0028 corrected suitable_slots for all affected exercises.

**Pattern:** Any new exercise batch insert must explicitly set `suitable_slots`, `allowed_day_types`, and `role`. Defaulting to "all slots" causes compound movements to appear in wrong positions. Add a DB check constraint or seed-time assertion.

[UNIVERSAL]

---

### L3 -- Netlify ignore = exit 0 silently skips all future deploys [UNIVERSAL]

**Problem:** `ignore = "exit 0"` in `netlify.toml [build]` caused every commit after the first to show "Canceled build due to no content change." Deployments silently stopped working.

**Fix:** Removed the `ignore` line in commit `0138169`.

**Pattern:** `ignore` scripts returning 0 tell Netlify "nothing changed, skip this deploy." This is a footgun when set globally. Never use `ignore = "exit 0"` as a blanket deploy skip -- use it only for specific branch patterns.

[UNIVERSAL]

---

### L4 -- netlify.toml overrides UI build settings [UNIVERSAL]

**Context:** User accidentally set gym site build settings to meal planner values (`echo 'no build step'` / `public`) in the new Netlify account UI.

**Finding:** When `netlify.toml` is present at repo root, it always overrides UI build settings. The gym app deployed correctly because `netlify.toml` had `npm run build` / `.next`.

**Pattern:** Always commit `netlify.toml`. Never rely on UI-only build settings. UI settings serve only as fallback when no `netlify.toml` exists.

[UNIVERSAL]

---

### L5 -- React state update must use functional form when preserving fields [UNIVERSAL]

**Problem:** `setSessionMinutes({ cardio: String(cardio) })` replaced the entire state object, dropping the `cardioType` field. TypeScript caught this at build time.

**Fix:** `setSessionMinutes((prev) => ({ ...prev, cardio: String(cardio) }))`.

**Pattern:** When state object has multiple fields and you're only updating one, always use the functional update form `setState(prev => ({ ...prev, field: value }))`. Object replacement form drops all other fields.

[UNIVERSAL]

---

### L6 -- DB mock count must match actual route call count [UNIVERSAL]

**Problem:** `planSessionMinutes.test.ts` was mocking 3 DB calls but the route made 4 (BEGIN, UPDATE, SELECT remaining unskipped, COMMIT). Test returned 500 instead of 200.

**Fix:** Added 4th mock for the SELECT remaining query.

**Pattern:** When a route's DB call count changes (e.g., adding a conditional SELECT), update ALL relevant tests. Enumerate DB calls in a comment at the top of test files to make this auditable: `// DB calls: 1=BEGIN, 2=UPDATE, 3=SELECT_remaining, 4=COMMIT`.

[UNIVERSAL]

---

### L7 -- Body composition: protein gap causes muscle loss [CAMPAIGN-SPECIFIC]

**Context:** User at 80kg, 24.5% BF, losing 2.5x more muscle than fat since Feb 2026.

**Root cause:** Protein intake ~133g/day vs 160g target. 27g daily shortfall.

**Fix:** Add 200g Greek yoghurt or 1 extra scoop whey to close the gap.

**Pattern:** Caloric deficit without adequate protein causes muscle catabolism. Monitor lean mass, not just total weight. If lean mass is falling, protein is the first lever before adjusting training volume.

[CAMPAIGN-SPECIFIC]

---

### Universal lessons from this session

1. No-repeat rules must cover every slot type -- partial application causes monopoly repeats.
2. Batch exercise inserts need explicit slot/role assignments -- defaulting to "all" breaks selection logic.
3. `netlify.toml` always wins over UI settings -- commit it, rely on it.
4. React state functional update form is mandatory when preserving sibling fields.
5. Test DB mock count must exactly match route DB call count -- add a comment enumerating calls.
