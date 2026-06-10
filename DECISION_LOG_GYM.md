# DECISION_LOG_GYM.md

---

## D001 -- No-repeat window applies to ALL roles (2026-05-30)

**Decision:** Extend the 7-day no-repeat filter from primary/secondary only to all roles including accessories.

**Rationale:** Accessories with high `user_preference_score` monopolize slots when the filter doesn't apply to them. User experience: same workout every session. The cost (slightly more complex query) is trivial vs. the UX benefit.

**Alternatives considered:**
- Keep filter on primary/secondary only, increase accessory candidate pool by adding more exercises. Rejected: exercises must be correct for the user's equipment, not just added for variety.
- Cap `user_preference_score` at 1 instead of 2. Rejected: doesn't fix structural issue with small pools.

**Status:** LOCKED. Implemented in commit `2291878`.

---

## D002 -- suitable_slots: compound movements must not appear as accessories (2026-06-05)

**Decision:** Exercises added via bulk insert must have explicit `suitable_slots` assignments. Back Squat = `['primary','secondary']` only. Isolation moves = `['accessory']` only.

**Rationale:** Default `['primary','secondary','accessory']` allows any exercise in any slot. Compound movements as accessories are inappropriate (too fatiguing, wrong stimulus for the slot). Isolation moves as primaries are inappropriate (insufficient load for progressive overload).

**Alternatives considered:**
- Leave default and rely on scoring to deprioritize wrong-slot picks. Rejected: scoring doesn't prevent wrong-slot picks, only de-ranks them.

**Status:** LOCKED. Corrected via migration 0028.

---

## D003 -- Netlify over Render/Vercel for gym app (2026-06-06)

**Decision:** Deploy gym app on Netlify (`deepakgupta5` account) as primary. Vercel secondary (still deployed, kept as backup for now).

**Rationale:** Netlify free tier sufficient for single-user app. `@netlify/plugin-nextjs` handles Next.js 15 App Router correctly. Render was the original backend host (now removed per the session that shut down the keep-alive workflow).

**Old account (`deepak-gupta5`):** DECOMMISSIONED 2026-06-10 -- 0 sites remaining.

**Final site inventory on `deepakgupta5`:**
- `exerciseplanning` (gym app, site ID f16ac1c7) -- `exerciseplanning.netlify.app`
- `meal-planner-deepak` -- `meal-planner-deepak.netlify.app`
- `autonomybridgenetlify` -- `www.autonomybridge.com` (Cloudflare + Let's Encrypt via Netlify)

**Status:** LOCKED. Migration complete 2026-06-10. See D010.

---

## D004 -- CardioEditor moved to bottom of session page (2026-06-04)

**Decision:** CardioEditor renders below the exercise grid in a separate section, not inside SessionHeader.

**Rationale:** SessionHeader was becoming too complex with cardio props. Cardio is a session completion step, not a session status indicator. Separating it into its own section clarifies the flow: log exercises -> log cardio -> session complete.

**Impact:** SessionHeader no longer receives any cardio props. `UPPER_DAY_TYPES` set added for cardio display logic.

**Status:** LOCKED. Implemented in commit `421bafc`.

---

## D005 -- Protein target 160g/day regardless of training/rest day (2026-04-18)

**Decision:** Protein target is 160g on both training and rest days. Calories vary (2200 training / 2050 rest) but protein does not.

**Rationale:** Muscle protein synthesis requires consistent daily protein intake. Reducing protein on rest days is a common mistake that accelerates muscle loss during a cut.

**Current gap (2026-06-06):** User consuming ~133g/day. Fix: add 200g Greek yoghurt or 1 extra scoop whey.

**Status:** LOCKED.

---

## D007 -- Recency penalty (-200) in scorer deprioritises recently-used exercises in fallback (2026-06-06)

**Decision:** Add a -200 score penalty to recently-used exercises in `scoreOne()`, passed through both normal and fallback `scoreCandidates()` calls in `selectExercisesForSession`.

**Rationale:** The fallback fires when the strict 7-day no-repeat pool is exhausted for a slot. Without a penalty, exercises with high `user_preference_score` (core exercises: +40 each) always win the fallback, producing the same session every day when the pool is small. The -200 penalty ensures that ANY fresh exercise (max score: +150) outscores a recently-used one (max score: 150-200 = -50). This preserves the intent of the preference score (prefer these when fresh) without allowing it to monopolise when stale.

**Penalty magnitude:** -200 chosen because max positive score is 150 (equipment 100 + preference 40 + seed 10). -200 is comfortably below -150, guaranteeing a fresh exercise always wins.

**Alternatives considered:**
- Zero out `user_preference_score` for core exercises. Rejected: they should still appear frequently -- just not every single day.
- Add more exercises to the pool. Rejected: exercises must be equipment-appropriate; adding arbitrary exercises degrades plan quality.
- Separate fallback pool with fixed 3-day window. Rejected: requires a second DB query; the penalty approach achieves the same result in-process.

**Status:** LOCKED. Implemented in commit `28a3d40`.

---

## D008 -- Views must use security_invoker = on on Supabase (2026-06-06)

**Decision:** All views on tables with RLS enabled must be created with `WITH (security_invoker = on)`. Existing views without this option must be migrated.

**Rationale:** PostgreSQL views default to SECURITY DEFINER (run as view owner), which bypasses RLS. On a single-user app the practical risk is low, but Supabase flags it as CRITICAL and it is a correctness violation -- the view should never expose rows outside the querying user's RLS scope.

**Scope:** `v_weekly_muscle_volume` and `v_last_top_set_per_exercise` fixed in migration 0029. All future view creation must include `WITH (security_invoker = on)`.

**Status:** LOCKED.

---

## D009 -- No-repeat window reduced from 7 days to 2 days (2026-06-08)

**Decision:** Reduce `loadRecentPrimaryExerciseIds` interval from `interval '7 days'` to `interval '2 days'`.

**Rationale:** With a 5-day rotation the previous same-type session is 5 days ago -- inside a 7-day window. ALL exercises for that day type end up in `recentIds`. The strict no-repeat filter empties the pool; `candidatesForSlot`'s internal fallback restores the full pool; with every candidate penalised -200 uniformly, relative ordering is unchanged and core exercises (preference +40) still win. The -200 penalty fix from D007 is therefore ineffective unless the pool actually contains a mix of fresh and recently-used exercises. With a 2-day window, day-type-specific accessories from 5 days ago are outside the window and always available as fresh candidates -- the strict filter passes them and the fallback rarely fires.

**Tradeoff accepted:** The same exercise may appear across two push_upper sessions 5 days apart. This is acceptable for a 5-day rotation -- the user experiences variety day-to-day, and the same push day exercises every 5 days is comparable to any fixed strength program.

**Rule generalised (L11):** `no_repeat_window < rotation_period - 1`. For any fixed rotation of N days, window must be at most N-2 days.

**Alternatives considered:**
- Graduated penalty based on days-since-last-use. Rejected: requires a second DB query and more complex scoring; 2-day window achieves the same result more simply.
- Keep 7-day window, add more exercises to each day type. Rejected: exercises must match user equipment; arbitrary additions degrade plan quality.

**Status:** LOCKED. Implemented in commit `6a7cdf5`. Migration 0030 purges stale sessions.

---

## D010 -- Netlify account consolidation: deepak-gupta5 decommissioned (2026-06-10)

**Decision:** Migrate all three sites (gym app, meal planner, autonomybridge) to `deepakgupta5` account and decommission `deepak-gupta5`.

**Rationale:** `deepak-gupta5` (deepak@autonomybridge.com) had separate login credentials from `deepakgupta5` (deepakgupta5@gmail.com, GitHub OAuth). Consolidating to one account eliminates split-auth friction and ensures `netlify` CLI always operates on the correct account.

**Migration steps executed:**
1. Detached `www.autonomybridge.com` from old site via API PATCH.
2. Deleted orphaned Netlify DNS zone (was unused -- actual DNS is Cloudflare with `asa.ns.cloudflare.com`/`vicente.ns.cloudflare.com`).
3. Created `autonomybridgenetlify` site on `deepakgupta5` from same GitHub repo (`deepakgupta5/autonomy-bridge-web`).
4. Temporarily set Cloudflare A + CNAME records to DNS-only (gray cloud) so Netlify could provision Let's Encrypt cert for `autonomybridge.com`.
5. Re-enabled Cloudflare proxy (orange cloud) -- Full (strict) SSL mode now valid since Netlify cert covers the custom domain.
6. Confirmed `meal-planner-deepak` and `exerciseplanning` already on `deepakgupta5`; renamed mealplanweekly -> meal-planner-deepak.
7. Re-ran `netlify login` on CLI to authenticate `deepakgupta5@gmail.com`.
8. Updated `.netlify/state.json` in gym app from old site ID (36697ac0) to `f16ac1c7-3a1b-4e22-a39f-bc4855f18360`.

**Status:** LOCKED.

---

## D006 -- 5-day rotation fixed: push_upper, squat_lower, pull_upper, hinge_lower, full_body (2026-04-18)

**Decision:** Fixed 5-day rotation. No adaptive day selection based on muscle exposure (PRD 4.2 rule 1 not implemented).

**Rationale:** Adaptive selection (pick day type by most under-exposed muscle group) requires `v_weekly_muscle_volume` view and muscle tracking that is not yet built. Fixed rotation is simpler and sufficient for now.

**Status:** ACTIVE. Adaptive selection is a future enhancement (PRD Section 4.2).
