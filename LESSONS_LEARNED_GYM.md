<!-- DOC-STATUS: LOG; SYNCED: L32 / 2026-07-30 -->
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

---

## Session: 2026-06-10 (W1-W7 gap closure)

### L17 -- Non-ASCII characters block commit hooks even in comments [UNIVERSAL]

**Problem:** Hook C19 blocks U+2500 (box-drawing dash), U+00A7 (section sign), U+25B2/25BC (triangle arrows), and other non-ASCII codepoints in any file touched by a commit. Comments using decorative dashes (e.g., `// --- section ---` written with U+2500 instead of U+002D) triggered the block mid-edit.

**Fix:** Use ASCII alternatives everywhere. For horizontal rules in comments: `---` (U+002D x3). For section symbols in doc prose: write "Section" in full.

**Pattern:** Before adding any comment with decorative characters, verify all characters are plain ASCII (U+0020-U+007E). If copy-pasting from another document or IDE auto-completion, run `grep -P '[^\x00-\x7F]'` on the file before committing.

[UNIVERSAL]

---

### L18 -- Test volume map must be "satisfied" for pure rotation tests [UNIVERSAL]

**Problem:** When `selectDayType` was updated to accept `weeklyVolume: Map<string, number>`, existing pure-rotation tests broke because passing `new Map()` (empty) set ALL muscles to 0 sets -- a massive deficit on every muscle. This triggered the Wednesday override gate (dayOfWeek >= 3 was true for the test date), causing every pure-rotation test to return a deficit-driven day type rather than the expected rotation result.

**Fix:** Created `satisfiedVolume` fixture with all muscles at their exact minimums. Pure rotation tests use `satisfiedVolume`; override tests use `volumeWith(overrides)` to target specific deficits.

**Pattern:** When adding volume/state parameters to a selection function, pre-existing tests must be updated with a "neutral" fixture that does not activate any new branch. Empty maps and zero values are almost never neutral for functions that check "is X below threshold."

[UNIVERSAL]

---

### L19 -- N+1 UPDATE loops in per-row processing -> single VALUES CTE [UNIVERSAL]

**Problem:** `POST /api/logs/set` iterated over `topRows` and fired one `UPDATE plan_exercises ... WHERE exercise_id = $X` per row. For a typical set log with 3 exercises, this is 3 sequential queries inside a transaction. Under load (or future multi-exercise batch logging), this becomes O(n) writes.

**Fix:** Collected all `(nextLoad, blockId, afterWeek, exerciseId)` tuples into a Map (deduplicating by `(blockId, exerciseId)`), then issued a single `WITH upd AS (VALUES ...) UPDATE plan_exercises FROM upd WHERE ...`.

**Pattern:** Any loop of the form `for (const row of rows) { await client.query("UPDATE ...", [row.x]) }` inside a transaction is an N+1 write. Replace with a VALUES CTE. Dedup by the natural key first; last writer wins is usually the correct semantics (same as the original sequential loop).

[UNIVERSAL]

---

### L20 -- Bare fetch calls leave loading state stuck on network rejection [UNIVERSAL]

**Problem:** In settings page, `patchExercise`, `saveOverride`, and `toggleDeload` each set a loading state flag before calling `await fetch(...)`, then reset it after. If the network rejected the request (offline, DNS failure), the `fetch` promise threw before any cleanup ran. The loading state was never reset: buttons remained disabled until page reload.

**Same pattern in nutrition clients:** `NutritionHistoryClient.loadHistory` and `NutritionTrendsClient.loadTrends` had bare `fetch` calls; rejection was swallowed by `void fn()`, spinner never cleared.

**Fix:** Wrap every `fetch` call in `try { res = await fetch(...) } catch { resetLoadingState(); setError("No connection..."); return; }`.

**Pattern:** EVERY state-setting async function that calls `fetch` must have a try/catch that resets the loading state on network failure. The pattern `setSaving(true); await fetch(...)` without try/catch is a bug waiting for the user to go offline. The session logger (`useSessionLoggerController.ts`) already did this correctly -- audit all other client components to match.

[UNIVERSAL]

---

### L21 -- Dead constant entries create false confidence in enforcement coverage [UNIVERSAL]

**Problem:** `core: 6` in `WEEKLY_MIN_SETS` implied the scheduler enforced a minimum of 6 core sets/week. It did not: the override loop in `selectDayType` only acts on muscles that have entries in `MUSCLE_TO_DAY_TYPES`. Core had no mapping, so the entry was silently ignored.

**Fix:** Removed `core` from `WEEKLY_MIN_SETS`. Added a comment explaining why core is omitted.

**Pattern:** Constants that define enforcement thresholds (minimums, limits, windows) must only contain entries that are actually enforced by the code consuming them. An unenforced constant entry is actively misleading -- it suggests coverage that does not exist. When adding a threshold constant, immediately write the code that reads it, or do not add the constant.

[UNIVERSAL]

---

### Universal lessons from this session

1. Non-ASCII characters (box-drawing, section sign, arrows) block commit hooks -- use ASCII-only comments. Verify with `grep -P '[^\x00-\x7F]'` before committing. (L17)
2. Test fixtures for refactored multi-arg functions must include a "neutral" state that does not activate new branches. Empty/zero maps are almost never neutral. (L18)
3. N+1 UPDATE loops inside transactions -> VALUES CTE; dedup by natural key, last writer wins. (L19)
4. Every `await fetch()` preceded by `setLoading(true)` or similar must be wrapped in try/catch that resets state on network error. Bare fetch = stuck UI on offline. (L20)
5. Constants that define enforcement thresholds must only contain entries actually consumed by code. Dead entries imply coverage that does not exist. (L21)

---

## Session: 2026-06-25

### L22 -- Adding a new set type requires auditing all downstream index computations [CAMPAIGN-SPECIFIC]

**Problem:** Warmup sets (W13) were added to `useSessionLoggerController.ts` without updating the set-index computation in `addSet`. `setIndex = logsByExercise.get(exerciseId).length + 1` counted ALL logs including warmup. `v2SetType(ex, setIndex)` checks `setIndex === 1` to identify the top set. After logging 1 warmup, the first working set got `setIndex = 2`, was classified as "backoff," and no `top_set_history` entry was written. Backoff load prefill (gated on the same `setIndex === 1` condition) also never fired. The feature appeared to work (sets were saved) but progression tracking was silently broken.

**Fix:** Introduced `workingSetIndex = allLogsForEx.filter(l => !l.is_warmup).length + 1` for v2 set-type classification and backoff prefill. Raw `setIndex` (all sets) retained for the `set_index` DB column.

**Pattern:** When adding any new set variant (warmup, feeder, reload), grep the entire session controller for every computation that counts or indexes logs. Any counter that assumes homogeneous sets must be split into a filtered (working-only) counter and a raw (all-sets) counter, applied in the right place. A feature that saves data is not sufficient validation -- confirm that downstream classification also handles the new variant.

[CAMPAIGN-SPECIFIC]

---

### L23 -- Static tracking catalogs drift silently when dynamic selectors expand [UNIVERSAL]

**Problem:** `UPPER_PUSH_PRIMARY_ROTATION = [9, 10, 11]` (horizontal push / chest) was the hardcoded catalog for the Primary Lifts dashboard sparkline. The v2 scheduler uses `allowed_day_types` and `suitable_slots` to pick exercises; shoulder press exercises (IDs 15, 16) were valid primary candidates for push_upper sessions. The two systems were built separately and never compared: the scheduler expanded, the catalog did not. All shoulder press top sets were silently invisible on the dashboard. The user had to manually notice stale "Current" dates to surface the bug.

**Fix:** Added IDs 15 and 16 to `UPPER_PUSH_PRIMARY_ROTATION`; updated `primary_lift_map.UPPER_PUSH = 16` in DB directly.

**Pattern:** Any static list that "mirrors" what a dynamic system can select is a dual-maintenance point. Every time the dynamic system gains new candidates (new exercises, new day-type assignments, new suitable_slots), the static list must be updated too -- or the consumer silently stops covering the new cases. To prevent this: (1) at review time for any change to exercise `allowed_day_types` or `suitable_slots`, explicitly check whether any static rotation catalog must be updated; (2) consider replacing static catalogs with queries that derive the trackable set from the same exercise attributes the scheduler uses, so the two stay in sync automatically.

[UNIVERSAL]

---

### Universal lessons from this session

1. When adding a new set variant (warmup, feeder, reload), every downstream index computation must be split into filtered (working-only) vs. raw (all-sets) as appropriate. "Saves correctly" is not sufficient validation. (L22)
2. Static tracking catalogs that "mirror" a dynamic selector's candidate set are dual-maintenance points. Every expansion of the dynamic selector requires an explicit audit of every dependent catalog. Replace static mirrors with derived queries where feasible. (L23)

---

## Session: 2026-06-30

### L24 -- When one static catalog has drifted, audit ALL catalogs of the same type in the same session [UNIVERSAL]

**Problem:** INC-017 found that `UPPER_PULL_PRIMARY_ROTATION` and `LOWER_SQUAT_PRIMARY_ROTATION` were missing exercises the dynamic scheduler could assign as primary -- the same drift pattern as INC-014/L23. The INC-014 fix corrected only `UPPER_PUSH_PRIMARY_ROTATION` without auditing the other three catalogs. The same systematic audit done for INC-014 would have caught all four gaps at once; instead a second incident was needed.

**Fix:** Audited all four rotation catalogs (UPPER_PUSH, UPPER_PULL, LOWER_SQUAT, LOWER_HINGE) against `allowed_day_types` + `suitable_slots` for every exercise. Found gaps in UPPER_PULL and LOWER_SQUAT; LOWER_HINGE was already clean.

**Pattern:** When you find one instance of systematic drift (a static list behind a dynamic system), immediately sweep ALL instances of that pattern in the same codebase before closing the incident. A fix that corrects one instance while leaving siblings unchecked pays the investigation cost twice and leaves the user exposed to the same symptom pattern until the next session.

[UNIVERSAL]

---

### L25 -- Scheduler diversity windows must be shorter than the no-same-day-type recurrence interval [UNIVERSAL]

**Problem:** INC-018. `loadLastEquipmentByMuscle()` used a 14-day rolling window to enforce week-over-week equipment rotation. At 4 sessions/week, the hinge_lower day type recurs every ~9 calendar days. Both barbell-hamstrings exercises (RDL + Deadlift) were excluded for 14 days after any hinge session. Because non-hamstrings exercises (Hip Thrust, calf raise) kept the filtered candidate pool non-empty, the soft-exclusion fallback never fired, and both exercises were invisible for longer than the full hinge cycle.

**Fix:** Reduced window from 14 to 7 days. The recurrence interval (~9 days) now exceeds the exclusion window (7 days), so exercises are available again by the time the same day type arrives.

**Pattern:** Any rolling exclusion window (no-repeat, equipment rotation, recent-exercise filter) must satisfy: `window < same_day_type_recurrence_interval`. Calculate the recurrence interval from: sessions_per_week / rotation_length. Soft-exclusion fallbacks only help if the filtered pool is truly empty; a diverse pool that contains exercises from OTHER muscle groups keeps the pool non-empty and prevents the fallback from firing, turning a "soft" exclusion into a hard one.

[UNIVERSAL]

---

### Universal lessons from this session

1. When one catalog of a given type drifts, immediately sweep all catalogs of that type in the same session before closing the fix. (L24)
2. Rolling exclusion windows (no-repeat, equipment rotation) must be shorter than the same-day-type recurrence interval; otherwise soft-exclusion fallbacks may be defeated by non-target-muscle exercises keeping the pool non-empty. (L25)

---

## Session: 2026-07-01

### L26 -- supabase/seed.sql is NOT run by migrations; CI pipelines that only apply migrations will be missing seed data [UNIVERSAL]

**Problem:** INC-019. Integration tests queried exercises 1-25 (to verify migration 0035's suitable_slots patch) but got 0 rows. Exercises 1-25 live in `supabase/seed.sql`, not in any migration. The CI workflow applied all 35 migrations but never seed.sql. Migration 0035 silently updated 0 rows (no error on UPDATE with no matching rows), and the tests failed with "expected 2 but got 0".

**Fix:** In `ci.yml`, inject `psql ... -f supabase/seed.sql` immediately after migration 0001 (which creates the schema) and before migration 0019 (which adds columns and UPDATEs the seeded rows). This mirrors Supabase's managed-cloud apply order: schema migrations run first, then seed data, so later migrations that ALTER or UPDATE seed rows work correctly.

**Pattern:** Whenever writing integration tests against row-level data (specific IDs, expected counts, specific values), verify whether those rows come from migrations or from seed.sql. If seed.sql, the CI pipeline must apply it -- and in the correct order: AFTER the schema is created (0001) but BEFORE any migration that ALTERs columns on or UPDATEs those rows. A silent UPDATE on a non-existent row will always return 0 rows with no error, making the root cause invisible from the test output alone.

[UNIVERSAL]

---

### Universal lessons from this session

1. `supabase/seed.sql` is separate from migrations; CI pipelines must explicitly apply it in order (after schema creation, before column-addition or UPDATE migrations). Silent UPDATEs on missing rows are the tell. (L26)

---

## Session: 2026-07-08

### L27 -- pg returns NUMERIC columns as strings; TypeScript annotations do not coerce runtime values [UNIVERSAL]

**Problem:** INC-020. `pg` (node-postgres) returns PostgreSQL `NUMERIC` columns as JavaScript strings, not numbers. TypeScript type annotations (`load_increment_lb: number` in `V2ExerciseRow`) satisfy the compiler but have no runtime effect -- the actual value at runtime is `"5"` (string). In `computeLoad()`, `exercise.load_increment_lb || 5` evaluates to `"5"` (truthy string), not `5` (number). Then `prevLoad + increment = 20 + "5" = "205"` via JS string concatenation -- not arithmetic. `roundToIncrement("205", "5")` auto-coerces for division (`Math.round(41) * 5 = 205`), making the bug invisible at the rounding step.

Diagnostic clue: the rationale text `"205 lb, up 5 lb (20 lb x 15 last time)"` embeds `prevLoad=20` and `increment=5` inline. If those values are correct but `topSetLoad` is wrong, the arithmetic itself is the suspect, not the DB data.

Other `load_increment_lb` consumers in the codebase (`integration.ts:523`, `logs/set/route.ts:445`, `set/[id]/route.ts:277`) already called `Number()` explicitly -- only the v2 scheduler paths were missing it.

**Fix:**
- `v2/load.ts:51`: `const increment = Number(exercise.load_increment_lb) || 5;`
- `v2/index.ts:286`: `const inc = Number(ex.exercise.load_increment_lb) || 5;`

`||` (not `??`) is correct after `Number()`: `Number(null)` = 0 (falsy -> fallback 5), `Number(undefined)` = NaN (falsy -> fallback 5), `Number("5")` = 5 (truthy).

**Pattern:** For every pg query result, wrap NUMERIC/DECIMAL column reads in `Number()` before any arithmetic, regardless of TypeScript annotations. SMALLINT/INTEGER columns come back as JS numbers; NUMERIC/DECIMAL do not -- this is a pg library design decision, not a bug. A safe convention: annotate pg row types as `number | string` for numeric-typed columns, forcing explicit coercion at every use site. Alternatively, use a pg type parser override to coerce NUMERIC globally (but this is a global setting with wide blast radius).

[UNIVERSAL]

---

### Universal lessons from this session

1. `pg` returns PostgreSQL `NUMERIC`/`DECIMAL` columns as JS strings at runtime despite TypeScript `number` annotations. Wrap in `Number()` before arithmetic at every use site; or annotate as `number | string` to force the coercion. `prevLoad + "5"` = `"205"` is a silent corruption. (L27)

---

## Session: 2026-07-15

### L28 -- Deliberate spec deviations must be written back into the PRD at the point of decision, not left only in code comments [UNIVERSAL]

**Problem:** PRD v2.0 review found three deliberate engineering decisions that diverged from the spec -- no-repeat window (2 days vs. PRD's 7), deload session threshold (8 vs. PRD's 6), equipment rotation window (7 days vs. PRD's 14) -- each with detailed code-level comments and DECISION_LOG entries explaining the rationale. None of the three were reflected in the PRD. Additionally, the PRD's "Not yet shipped" section listed 7 items, all of which had actually shipped (some on the same date the PRD was last revised). Result: a reader of the PRD would have a materially wrong picture of how the scheduler works and what features exist.

**Root cause:** The workflow treated DECISION_LOG + code comments as sufficient governance for spec deviations. The PRD was treated as a static design artifact rather than a living spec. Each fix session updated the code, the decision log, the incident log, and the tracker -- but not the PRD.

**Fix pattern:**
- When an engineering decision deliberately diverges from the PRD (changed constant, relaxed constraint, adjusted threshold), add a "Rev N (YYYY-MM-DD): changed X to Y because Z" note to the relevant PRD section in the same commit.
- When an item from the PRD's "Not yet shipped" table is completed, move it to the "Shipped" table in the PRD commit that ships it.
- A PRD that accurately describes the live system is infinitely more useful than one that describes what was planned.

[UNIVERSAL]

---

### L29 -- UI override / bypass paths silently skip the same constraints the normal code path enforces [UNIVERSAL]

**Problem:** The `forcedDayType` parameter in `ensureWorkoutPlanForDateV2` (used when the user presses "Change day type" in the UI) correctly bypasses the deload auto-trigger -- that is intentional. But it also silently bypasses the no-repeat rule, which PRD Section 4.2 explicitly says should still apply to forced overrides ("honor it unless it violates 3.2"). The bypass is implemented as a single `if (forcedDayType) { dayType = forcedDayType; return; }` branch that exits before any constraint checks run.

**Pattern:** Override / bypass / admin / force-regen code paths routinely skip validation that the normal path enforces. This is common because the override path is written after the normal path, the developer adds the minimum to make the override work, and the spec's constraints on overrides are often buried in fine print.

**Fix pattern:** For every bypass path, write a comment enumerating which normal-path constraints it bypasses (intentional) vs. which it should still enforce (unintentional gap). The distinction between "skipped intentionally" and "skipped by omission" is rarely visible without this annotation.

In the specific case: after setting `dayType = forcedDayType`, the code should still load `recentExerciseIds` and log a warning if the forced type matches the most-recent session type. A soft check that doesn't block the user but flags the violation is sufficient.

[UNIVERSAL]

---

### Universal lessons from this session

1. Deliberate spec deviations must be written back into the PRD at the point of decision. Code comments + DECISION_LOG alone leave the PRD as a misleading artifact that describes a system that no longer exists. (L28)
2. UI override / bypass paths silently drop the normal path's constraints. Annotate each bypass with which constraints are intentionally skipped vs. which are gaps, in the same commit. (L29)

---

## Session: 2026-07-23

### L30 -- Deficit-override day type selector needs N-session lookback, not 1-session [UNIVERSAL]

**Problem:** INC-022. `selectDayType()` excluded only the immediately-previous day type from override candidates (`LIMIT 1` lookback). The large-deficit exception fires regardless of day of week when any muscle is >50% below its 7-day minimum. After push_upper -> pull_upper, chest/shoulders are still below minimum (1 push session in 7 days is not enough). On the next scheduling call, only pull_upper was blocked; push_upper (07-20) was not excluded. push_upper won the override again -> three consecutive upper body days.

**Root cause formula:** `lookback_depth = 1` means only the immediately-previous type is excluded. With a large-deficit gate, every type that is NOT the immediate predecessor is a valid override candidate even if it appeared 2 sessions ago. The result is a 2-session cycling pattern: A -> B -> A -> B ... until volume is satisfied.

**Fix:** Changed `LIMIT 1` to `LIMIT 2` in `loadRecentV2DayTypes` (with `.reverse()` to keep chronological order and `[length-1]` = most recent for all callers). `selectDayType` now filters override candidates against `new Set(recentV2DayTypes)` (the last 2 performed types). With push_upper and pull_upper both excluded, no deficit candidate remains and the selector falls back to `pureRotation(pull_upper)` -> `squat_lower`.

**Why 2 and not more:** With a 5-day rotation (5 distinct day types), excluding the last 2 leaves 3 types as possible override candidates. Excluding more would make it harder for deficit-driven overrides to fire when genuinely needed (e.g., after a week of skipping legs). 2 is the minimum that breaks the A -> B -> A cycling pattern.

**Pattern:** Any selection function that excludes "recently seen" items to prevent repeats must exclude enough history to break the shortest possible cycle. For a binary exclusion set (N=1): only direct repeats are blocked; alternating cycles pass through. For N=2: direct and 2-step cycles are blocked. The minimum lookback depth = the length of the shortest undesirable repetition cycle you want to prevent.

[UNIVERSAL]

---

### Universal lessons from this session

1. Deficit-override selectors that exclude only the immediately-previous item still permit 2-step cycling (A -> B -> A). Increase lookback depth to at least 2 to block alternating repeats. The minimum lookback = length of the shortest cycle you want to prevent. (L30)

---

## Session: 2026-07-30

### L31 -- Load validation floor must be >= 0 (not > 0) for fields where zero is a valid domain value [UNIVERSAL]

**Problem:** INC-023-A. `load <= 0` guard in route.ts, [id]/route.ts, and useSessionLoggerController.ts blocked bodyweight exercises (Pull-Up, etc.) with 0 added lb from being logged. Sets not saved -> `v_last_top_set_per_exercise` returned NULL -> scheduler treated exercises as new every session.

**Root cause:** The `> 0` floor was intended to reject nonsensical zero-weight submissions. But bodyweight exercises legitimately have load = 0 (0 added lb). No exception for `uses_bodyweight` was made. Client and server both applied the same too-strict floor. The prefill guard `next_target_load > 0` also prevented showing "0" as the default, leaving an empty field that prompted the user to enter something -- anything they entered would be wrong for bodyweight.

**Fix:** Changed `load <= 0` to `load < 0` everywhere (allow 0, block negative). Changed prefill guard to `>= 0`. Applied at all 4 client checks and both API route checks.

**Pattern:** Before adding a validation floor (`> X`) to a numeric field, verify that no legitimate domain value equals X. For lift loads: 0 is invalid for weighted exercises but valid for bodyweight ("0 added lb" is meaningful). The correct invariant is `load >= 0`, not `load > 0`. This generalizes to any field where "none / empty / zero amount" is a real data point -- bodyweight exercises, rest days, 0-calorie meals, free-tier with 0 items.

[UNIVERSAL]

---

### L32 -- View predicates must express logical intent, not structural layout [UNIVERSAL]

**Problem:** INC-023-B. `v_last_top_set_per_exercise` used `set_index = 1` as a proxy for "first working set," but `set_index` is the raw position in set_logs for that exercise+session (counting warmups). After a warmup is logged (set_index=1, is_warmup=true, set_type='straight'), the first working set lands at set_index=2 and is invisible to the view. The warmup row was returned instead and its (lighter) load drove progression targets for the next session.

**Root cause:** `set_index = 1` was a structural shortcut. It worked before warmup logging existed. When W13 (migration 0034) added `is_warmup` and the Log Warmup button, the shortcut broke silently -- no view update was paired with the feature. The logical field (`is_warmup`) was already on the table; the view just never used it.

**Fix:** Migration 0036 -- replaced `WHERE set_index = 1` with `WHERE is_warmup = false` in the view and in the supporting partial index. Unperformed sessions purged to force regeneration with correct data.

**Pattern:** When a query uses a structural proxy (positional index, array[0], column offset) to approximate a logical condition, replace it with the actual semantic field. If the field doesn't exist yet, add it. Proxies fail silently when layout changes (e.g., a new feature inserts a row before the expected position). Review all view predicates whenever a feature adds a new row type to a table.

**Related:** L13 (set_index was also involved in INC-013: workingSetIndex splits warmup from working sets in the controller). INC-023-B is the view-level echo of that same missing separation.

[UNIVERSAL]

---

### Universal lessons from this session

1. Validation floors that reject zero (`> 0`) must explicitly exempt domain cases where zero is valid (bodyweight exercises). Check every `> 0` guard against the field's legal value set. (L31)
2. View predicates should encode logical intent (`is_warmup = false`) not structural proxies (`set_index = 1`). Proxies break silently when row ordering changes. Use the semantic field. (L32)
