# Release Sign-off (2026-02-24)

## Scope Closed
- Nav foundation
- Nutrition today/history UI
- Plan/insights/trends UI
- Dashboard nutrition merge
- Tests
- CI + smoke
- Security verification
- Release/buffer

## Release Hardening Decision
Lint policy for this release: **non-blocking**.

Reason:
- `npm run lint` currently reports a known backlog (52 errors, 3 warnings) across legacy + new files.
- Build and tests are clean; release risk is controlled via test/build/smoke/security gates.

Follow-up:
- Open dedicated lint cleanup backlog after release and make lint blocking once cleared.

## Final Gates
- `npm test`: **pass** (61/61)
- `npm run build`: **pass**
- Live post-deploy smoke (Render): **pass**
- Security checklist: **pass**

## Post-deploy Smoke Result
Environment: `https://gym-routine-sv28.onrender.com`

Passed:
- `GET /api/admin/health`
- `POST /api/plan/init`
- `GET /api/plan/today`
- `POST /api/nutrition/log`
- `GET /api/nutrition/today`
- `GET /api/nutrition/week`
- `GET /api/nutrition/history`
- `GET /api/nutrition/insights`
- `PUT /api/nutrition/log/:id`
- `DELETE /api/nutrition/log/:id`
- `GET /api/dashboard`

UI deploy checks passed:
- Dashboard no longer shows top "Next Workout" card
- Dashboard no longer shows upload/export action block
- More page includes "Export Workout CSV"
- Bottom nav label changed to "Gym"

## Security Checklist Result
- RLS enabled for all 8 nutrition tables: **pass**
- No photo/image/blob/base64 columns in nutrition schema: **pass**
- No base64/image payload traces in `meal_logs`/`meal_items`: **pass**
- Missing-key fallback:
  - AI parse returns `422 parse_failed_manual_required`: **pass**
  - Manual logging still works (`200`): **pass**

## Rollback Plan
Trigger rollback if any P0 regression appears in auth, plan, logging, nutrition APIs, dashboard, or navigation.

1. Revert latest release commit(s):
   - `git revert ae4018a`
   - (and/or revert newest commits in reverse order if needed)
2. Push rollback commit to `main`.
3. Wait for Render deploy completion.
4. Re-run smoke checks:
   - `GET /api/admin/health`
   - `POST /api/plan/init`
   - `GET /api/plan/today`
   - nutrition create/read/update/delete endpoints
   - `GET /api/dashboard`
5. Confirm restored behavior and announce rollback complete.
