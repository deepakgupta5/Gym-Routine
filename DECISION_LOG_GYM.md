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

**Old account (`deepak-gupta5`):** Deprecated. Delete old sites once new account confirmed stable.

**Status:** ACTIVE. Pending: env vars on new account, delete old sites.

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

## D006 -- 5-day rotation fixed: push_upper, squat_lower, pull_upper, hinge_lower, full_body (2026-04-18)

**Decision:** Fixed 5-day rotation. No adaptive day selection based on muscle exposure (PRD 4.2 rule 1 not implemented).

**Rationale:** Adaptive selection (pick day type by most under-exposed muscle group) requires `v_weekly_muscle_volume` view and muscle tracking that is not yet built. Fixed rotation is simpler and sufficient for now.

**Status:** ACTIVE. Adaptive selection is a future enhancement (PRD Section 4.2).
