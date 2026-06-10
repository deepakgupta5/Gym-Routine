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

### L8 -- Fallback scoring must retain recency context to prevent repeat monopoly [UNIVERSAL]

**Problem:** The fallback in `selectExercisesForSession` fires when the strict 7-day no-repeat pool is empty. It reopened the full exercise pool but called `scoreCandidates()` without passing `recentExerciseIds`. Core exercises with `user_preference_score=2` (score=40) always beat other accessories (score=10) in the fallback, so the same 3 core exercises won every session with a small pool.

**Fix:** Added optional `recentExerciseIds` parameter to `scoreCandidates()` and `scoreOne()`. Penalty of -200 applied to recently-used exercises. Max positive score is 150 (100+40+10), so any fresh exercise always outscores a penalised one. `recentExerciseIds` now passed in both normal and fallback code paths.

**Pattern:** Fallback paths must be as defensively scored as normal paths. A fallback that opens a wider pool but scores without recency context will always produce the same winner among high-scored candidates. "Open the pool" and "deprioritise recently-used" are two independent axes -- both must be applied.

[UNIVERSAL]

---

### L9 -- PostgreSQL views are SECURITY DEFINER by default -- bypass RLS [UNIVERSAL]

**Problem:** `v_weekly_muscle_volume` and `v_last_top_set_per_exercise` created in migration 0020 without explicit security mode. PostgreSQL defaults views to SECURITY DEFINER (run as view owner). This bypasses row-level security: any authenticated user querying the view sees ALL rows, not just their own.

**Fix:** Migration 0029 recreates both views with `WITH (security_invoker = on)` so the view runs as the querying user and RLS applies normally.

**Pattern:** In Supabase (PostgreSQL 15+), always create views with `WITH (security_invoker = on)` when the underlying tables have RLS enabled. This is a one-line addition and should be part of every view creation template. Supabase security advisor flags omissions as CRITICAL.

[UNIVERSAL]

---

### L10 -- Purge scope must include today, not just future dates [UNIVERSAL]

**Problem:** Migration 0028 deleted unperformed sessions for `date > CURRENT_DATE` (strictly future). Today's session (`date = CURRENT_DATE`) was left intact even if it was generated before the exercise-repeat fix. The scheduler's `totalExerciseCount > 0` guard prevented regeneration, so stale exercises persisted.

**Fix:** Migration 0029 adds a complementary delete for `date = CURRENT_DATE` with the same safe conditions (no logged sets, not performed).

**Pattern:** When purging stale data to force regeneration, check whether "today" is in scope. `date > today` and `date >= today` differ by exactly one day and the wrong choice leaves today's stale record untouched. Use `date >= CURRENT_DATE` when the intent is "today and all future dates."

[UNIVERSAL]

---

---

### L11 -- No-repeat window must be shorter than the rotation period [UNIVERSAL]

**Problem:** 7-day exclusion window + 5-day rotation = the previous same-type session (5 days ago) is always inside the window. ALL exercises for that day type are in `recentIds`. The internal fallback (keep full pool when filter empties it) fires every session. With every candidate penalised uniformly, the penalty is irrelevant -- relative ordering is preserved and high-preference-score exercises win identically.

**Root cause formula:** `no_repeat_window >= rotation_period` => pool always exhausted => fallback always fires => penalty has no discriminating power.

**Fix:** Window reduced from 7 days to 2 days in `loadRecentPrimaryExerciseIds`. Only yesterday + day-before excluded. Same-type exercises from N days ago (N > window) are fresh. The strict filter finds candidates; fallback rarely fires.

**Rule:** `no_repeat_window` must be `< rotation_period - 1`. For a 5-day rotation: max window = 4 days (exercises from the previous same-type session are fresh). 2 days is the conservative choice -- maximises variety while keeping "no same-as-yesterday" intact.

[UNIVERSAL]

---

### Universal lessons from this session

1. No-repeat rules must cover every slot type -- partial application causes monopoly repeats.
2. Batch exercise inserts need explicit slot/role assignments -- defaulting to "all" breaks selection logic.
3. `netlify.toml` always wins over UI settings -- commit it, rely on it.
4. React state functional update form is mandatory when preserving sibling fields.
5. Test DB mock count must exactly match route DB call count -- add a comment enumerating calls.
6. Fallback scoring paths must pass the same recency context as normal paths -- open pool + score penalty are independent.
7. PostgreSQL views bypass RLS by default -- always add `WITH (security_invoker = on)` on Supabase.
8. Purge migrations must explicitly check whether today's date is in scope, not just strictly future dates.
9. No-repeat window must be shorter than the rotation period; otherwise the pool is always exhausted and scoring penalties are useless (L11).
10. SQL ORDER BY direction determines which end of LIMIT is kept -- ASC LIMIT N gives the N oldest rows, DESC LIMIT N gives the N newest. A query meant to find the "most recent" must use DESC. Always state the intent in a comment next to ORDER BY. (L12, INC-012) [UNIVERSAL]

---

## Session: 2026-06-10

### L13 -- Netlify DNS zone can be orphaned while Cloudflare holds actual NS records [UNIVERSAL]

**Problem:** Netlify showed "Pending DNS verification" even after domain was detached from old site. Root cause: the Netlify DNS zone for `autonomybridge.com` existed on `deepak-gupta5` but the domain registrar nameservers were pointing to Cloudflare (`asa.ns.cloudflare.com`, `vicente.ns.cloudflare.com`). The Netlify DNS zone was completely unused -- DNS traffic never hit it.

**Discovery:** `dig NS autonomybridge.com +short` revealed Cloudflare NS records, not Netlify's (`p02.nsone.net`). The Netlify zone had 0 records.

**Fix:** Deleted the orphaned Netlify DNS zone via API. DNS control stays in Cloudflare.

**Pattern:** Always `dig NS <domain>` before assuming DNS is Netlify-managed. A Netlify DNS zone existing in the UI does not mean the domain is pointed at it. The registrar nameservers are the ground truth.

[UNIVERSAL]

---

### L14 -- Cloudflare Full (strict) + Netlify requires provisioning cert before re-enabling proxy [UNIVERSAL]

**Problem:** Netlify SSL "DNS verification failed" with Cloudflare proxy active. Cloudflare Full (strict) mode verifies that the origin cert hostname matches the custom domain. With proxy active, Netlify sees Cloudflare's IPs instead of its own and can't provision the Let's Encrypt cert.

**Fix sequence:**
1. Turn Cloudflare records to DNS-only (gray cloud) -- domain resolves to `75.2.60.5` (Netlify's load balancer).
2. Netlify "Retry DNS verification" -- sees `75.2.60.5`, provisions cert for `autonomybridge.com`.
3. Re-enable Cloudflare proxy (orange cloud) -- Full (strict) now valid since cert covers the custom domain.

**Pattern:** When using Cloudflare proxy + Netlify custom domain + Full (strict) SSL, always provision the Netlify cert first via a temporary gray-cloud window. Do not re-enable the proxy until Netlify shows "Certificate active."

[UNIVERSAL]

---

### L15 -- Netlify cross-account site migration requires DNS zone deletion, not just domain detach [CAMPAIGN-SPECIFIC]

**Problem:** After detaching `www.autonomybridge.com` from the old site, adding the domain to the new site still failed with "already managed by Netlify DNS on another team." The domain was freed from the site but the DNS zone ownership remained on the old account.

**Fix:** Deleted the DNS zone (`DELETE /api/v1/dns_zones/<zone_id>`) from the old account. This released the domain fully, allowing the new account to claim it.

**Pattern:** Netlify domain ownership has two layers: (1) the site-level custom_domain field, (2) the account-level DNS zone. A domain detach only removes layer 1. To fully free a domain for another account, also delete the DNS zone if one exists.

[CAMPAIGN-SPECIFIC]

---

### L16 -- .netlify/state.json must be updated after site migration [UNIVERSAL]

**Problem:** After migrating gym app to new Netlify site, `.netlify/state.json` still held the old site ID (`36697ac0-bfea-4e2d-a2f4-6b43703b6dbb`). CLI commands (`netlify env:list`, `netlify deploy`, `netlify logs`) would operate on the deleted/wrong site.

**Fix:** Updated `siteId` in `.netlify/state.json` to the new site ID (`f16ac1c7-3a1b-4e22-a39f-bc4855f18360`). Verified with `netlify status` showing correct Admin URL and project ID.

**Pattern:** `.netlify/state.json` is gitignored and holds the local project-to-site link. Any time a Netlify site is recreated or migrated, this file must be manually updated. It does not update automatically when you re-authenticate.

[UNIVERSAL]

---

### Universal lessons from this session

1. `dig NS <domain>` is the ground truth for DNS control -- a Netlify DNS zone in the UI doesn't mean the domain points to it. (L13)
2. Cloudflare Full (strict) + Netlify: always provision Netlify cert via gray-cloud window before re-enabling proxy. (L14)
3. Netlify domain detach != DNS zone deletion -- must delete zone separately to fully release domain for another account. (L15)
4. `.netlify/state.json` holds the local project-to-site link and must be manually updated after site migration. (L16)
