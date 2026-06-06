# INCIDENT_LOG_GYM.md

---

## INC-004 -- Same accessory exercises repeating every session (2026-05-30)

**Severity:** P2 (UX broken; no data loss)
**Detected:** User reported same 3 accessories every session
**Resolved:** Commit `2291878`, 2026-05-30

**Root cause:**
1. Migration 0026 gave Cable Crunch (#25), Hanging Knee Raise (#43), Pallof Press (#44) `user_preference_score=2`.
2. No-repeat filter only excluded primary/secondary roles.
3. With exactly 3 high-score accessories and 3 accessory slots, same 3 filled every session.

**Fix:**
- Extended no-repeat filter in `select.ts` to all roles.
- Updated `loadRecentPrimaryExerciseIds` query in `index.ts` to remove `pe.role` filter.

**Prevention:** See L1 in LESSONS_LEARNED_GYM.md.

---

## INC-005 -- Same leg exercises repeating every day (2026-06-05)

**Severity:** P2 (UX broken; no data loss)
**Detected:** User reported same leg exercises repeating across consecutive sessions
**Resolved:** Migration 0028, 2026-06-05

**Root cause (two-part):**
1. Exercises 26-44 had default `suitable_slots=['primary','secondary','accessory']`, causing Back Squat to appear as accessory.
2. Existing pre-generated future sessions were created before the no-repeat fix and were not regenerated (scheduler skips sessions with `totalExerciseCount > 0`).

**Fix:**
- Migration 0028 Part A: corrected `suitable_slots` for exercises 26-44.
- Migration 0028 Part B: deleted all unperformed future sessions with no logged sets, forcing regeneration on next access.

**Prevention:** See L2 in LESSONS_LEARNED_GYM.md.

---

## INC-006 -- CI failing: test mock count mismatch (2026-06-04)

**Severity:** P1 (CI broken; blocks all deploys)
**Detected:** CI failure on commit `421bafc`
**Resolved:** Commit `69bee02`, 2026-06-04

**Root cause:** `planSessionMinutes.test.ts` mocked 3 DB calls. After adding a SELECT for remaining unskipped exercises in the route handler (to set `performed_at` correctly), the route made 4 calls. Test saw no mock for the 4th call and returned 500.

**Fix:** Added 4th mock `mockResolvedValueOnce({ rows: [{ remaining: "2" }] })`.

**Prevention:** See L6 in LESSONS_LEARNED_GYM.md.

---

## INC-007 -- TypeScript build error: state update drops cardioType (2026-06-04)

**Severity:** P1 (build broken)
**Detected:** CI failure on commit `69bee02`
**Resolved:** Commit `5617958`, 2026-06-04

**Root cause:** `setSessionMinutes({ cardio: String(cardio) })` in `useSessionLoggerController.ts` line 332 replaced the full state object. TypeScript error: property `cardioType` missing from object literal.

**Fix:** Changed to functional update: `setSessionMinutes((prev) => ({ ...prev, cardio: String(cardio) }))`.

---

## INC-008 -- Netlify deploys silently skipping (2026-06-02 to 2026-06-06)

**Severity:** P2 (new commits not deploying)
**Detected:** Commits `e9c70b84` and `2291878c` showed "Canceled build due to no content change"
**Resolved:** Commit `0138169`, 2026-06-06

**Root cause:** `ignore = "exit 0"` in `netlify.toml [build]` told Netlify to skip every build after the first.

**Fix:** Removed the `ignore` line from `netlify.toml`.

---

## INC-001 to INC-003 (pre-2026-05-30)

Pre-dating this tracker. See `docs/release-signoff-2026-02-24.md` for v1.1 sprint hardening issues.
