# Sprint 5 Security Verification Report

Date: 2026-02-24
Environment: Render production (`https://gym-routine-sv28.onrender.com`) + Supabase production

## 1) Live Render Smoke (nutrition + dashboard)

Passed endpoint checks:
- `GET /` -> `307`
- `GET /api/admin/health` -> `200`
- `POST /api/plan/init` -> `200`
- `GET /api/plan/today` -> `200`
- `POST /api/nutrition/log` (manual) -> `200`
- `GET /api/nutrition/today` -> `200`
- `GET /api/nutrition/week` -> `200` (`days=7`)
- `GET /api/nutrition/history` -> `200`
- `GET /api/nutrition/insights` -> `200`
- `PUT /api/nutrition/log/:id` -> `200`
- `DELETE /api/nutrition/log/:id` -> `200`
- `GET /api/dashboard` -> `200` with `nutrition_summary` present

## 2) RLS Verification (Supabase DB)

All 8 nutrition tables have RLS enabled (`relrowsecurity=true`):
- `nutrition_profile`
- `nutrition_goals_daily`
- `meal_logs`
- `meal_items`
- `daily_nutrition_rollups`
- `nutrition_insights`
- `nutrition_plans`
- `nutrition_plan_meals`

Policy counts:
- 4 policies present per nutrition table.

## 3) Photo Non-Persistence Verification

Schema checks:
- No nutrition-table columns containing `photo`, `image`, `blob`, or `base64`.

Data checks:
- `meal_logs` rows with `input_mode in ('photo','text_photo')`: `0`
- Base64/data-image pattern matches in `meal_logs`: `0`
- Base64/data-image pattern matches in `meal_items`: `0`

Code checks:
- `src/app/api/nutrition/log-photo/route.ts` does not log request body/image payload.
- `src/lib/nutrition/photoParse.ts` keeps base64 image in local scope only and returns parsed items only.

Runtime check:
- `POST /api/nutrition/log-photo` returned `503 openai_unavailable` (expected in current deploy config).
- DB photo-mode count remained unchanged before/after request (`0 -> 0`).

## 4) OPENAI Missing-Key Manual Fallback

Live check results:
- `POST /api/nutrition/log` with `save_mode='ai_parse'` -> `422 parse_failed_manual_required`
- `POST /api/nutrition/log` with `save_mode='manual'` -> `200 ok=true`

Conclusion:
- Missing-key fallback behavior is correct: AI parse blocked, manual logging still fully functional.
