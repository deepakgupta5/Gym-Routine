-- 0019_rolling_scheduler.sql
-- Adds full exercise metadata, new exercises, and rolling-scheduler tables.

-- ─── Exercise library expansion ───────────────────────────────────────────────
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS display_id              text,
  ADD COLUMN IF NOT EXISTS category                text,
  ADD COLUMN IF NOT EXISTS fatigue_score           smallint NOT NULL DEFAULT 3
    CONSTRAINT exercises_fatigue_score_range CHECK (fatigue_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS complexity_score        smallint NOT NULL DEFAULT 3
    CONSTRAINT exercises_complexity_score_range CHECK (complexity_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS leg_dominant            boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suitable_slots          text[]   NOT NULL DEFAULT ARRAY['primary','secondary','accessory'],
  ADD COLUMN IF NOT EXISTS emphasis_tags           text[]   NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS primary_muscle_groups   jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS secondary_muscle_groups jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_enabled              boolean  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alt_3_exercise_id       int      NULL REFERENCES public.exercises(exercise_id);

-- ─── Update existing 25 exercises with full metadata ─────────────────────────
UPDATE public.exercises SET display_id='SQ03',category='squat_pattern',fatigue_score=4,complexity_score=2,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['squat'],
  primary_muscle_groups='["quads","glutes"]',secondary_muscle_groups='["hamstrings"]'
WHERE exercise_id=1; -- Hack Squat

UPDATE public.exercises SET display_id='SQ02',category='squat_pattern',fatigue_score=5,complexity_score=5,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['squat'],
  primary_muscle_groups='["quads"]',secondary_muscle_groups='["glutes","core","upper_back"]'
WHERE exercise_id=2; -- Front Squat

UPDATE public.exercises SET display_id='UL01',category='unilateral_lower_body',fatigue_score=4,complexity_score=4,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['squat'],
  primary_muscle_groups='["quads","glutes"]',secondary_muscle_groups='["hamstrings","core"]'
WHERE exercise_id=3; -- Bulgarian Split Squat

UPDATE public.exercises SET display_id='SQ04',category='squat_pattern',fatigue_score=4,complexity_score=2,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['squat'],
  primary_muscle_groups='["quads","glutes"]',secondary_muscle_groups='["hamstrings"]'
WHERE exercise_id=4; -- Leg Press

UPDATE public.exercises SET display_id='HN01',category='hinge_pattern',fatigue_score=4,complexity_score=4,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['hinge'],
  primary_muscle_groups='["hamstrings","glutes"]',secondary_muscle_groups='["upper_back","core"]'
WHERE exercise_id=5; -- Romanian Deadlift

UPDATE public.exercises SET display_id='HN03',category='hinge_pattern',fatigue_score=4,complexity_score=3,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['hinge'],
  primary_muscle_groups='["glutes"]',secondary_muscle_groups='["hamstrings","core"]'
WHERE exercise_id=6; -- Barbell Hip Thrust

UPDATE public.exercises SET display_id='HN02',category='hinge_pattern',fatigue_score=5,complexity_score=4,
  leg_dominant=true,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['hinge'],
  primary_muscle_groups='["glutes","hamstrings","quads"]',secondary_muscle_groups='["upper_back","core"]'
WHERE exercise_id=7; -- Barbell Deadlift

UPDATE public.exercises SET display_id='HG01',category='hamstrings_glutes_accessory',fatigue_score=2,complexity_score=1,
  leg_dominant=true,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY['hinge'],
  primary_muscle_groups='["hamstrings"]',secondary_muscle_groups='["calves"]'
WHERE exercise_id=8; -- Seated Leg Curl

UPDATE public.exercises SET display_id='HP01',category='horizontal_push',fatigue_score=4,complexity_score=3,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['push'],
  primary_muscle_groups='["chest"]',secondary_muscle_groups='["shoulders","triceps"]'
WHERE exercise_id=9; -- Flat Dumbbell Press

UPDATE public.exercises SET display_id='HP02',category='horizontal_push',fatigue_score=4,complexity_score=3,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['push'],
  primary_muscle_groups='["chest","shoulders"]',secondary_muscle_groups='["triceps"]'
WHERE exercise_id=10; -- Incline Dumbbell Press

UPDATE public.exercises SET display_id='HP03',category='horizontal_push',fatigue_score=3,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['push'],
  primary_muscle_groups='["chest"]',secondary_muscle_groups='["shoulders","triceps"]'
WHERE exercise_id=11; -- Chest Press Machine

UPDATE public.exercises SET display_id='HR-BB',category='horizontal_pull',fatigue_score=4,complexity_score=3,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['pull'],
  primary_muscle_groups='["upper_back","lats"]',secondary_muscle_groups='["biceps"]'
WHERE exercise_id=12; -- Barbell Row

UPDATE public.exercises SET display_id='HR02',category='horizontal_pull',fatigue_score=3,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['pull'],
  primary_muscle_groups='["upper_back","lats"]',secondary_muscle_groups='["biceps"]'
WHERE exercise_id=13; -- Seated Cable Row

UPDATE public.exercises SET display_id='HR01',category='horizontal_pull',fatigue_score=3,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['pull'],
  primary_muscle_groups='["upper_back","lats"]',secondary_muscle_groups='["biceps","shoulders"]'
WHERE exercise_id=14; -- Chest-Supported Machine Row

UPDATE public.exercises SET display_id='VP01',category='vertical_push',fatigue_score=3,complexity_score=3,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['push'],
  primary_muscle_groups='["shoulders"]',secondary_muscle_groups='["triceps","upper_back"]'
WHERE exercise_id=15; -- Dumbbell Shoulder Press

UPDATE public.exercises SET display_id='VP02',category='vertical_push',fatigue_score=3,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['push'],
  primary_muscle_groups='["shoulders"]',secondary_muscle_groups='["triceps"]'
WHERE exercise_id=16; -- Machine Shoulder Press

UPDATE public.exercises SET display_id='VT03',category='vertical_pull',fatigue_score=3,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['pull'],
  primary_muscle_groups='["lats"]',secondary_muscle_groups='["upper_back","biceps"]'
WHERE exercise_id=17; -- Lat Pulldown

UPDATE public.exercises SET display_id='VT02',category='vertical_pull',fatigue_score=3,complexity_score=3,
  leg_dominant=false,suitable_slots=ARRAY['primary','secondary'],emphasis_tags=ARRAY['pull'],
  primary_muscle_groups='["lats","upper_back"]',secondary_muscle_groups='["biceps","core"]'
WHERE exercise_id=18; -- Assisted Pull-Up

UPDATE public.exercises SET display_id='AR01',category='arms',fatigue_score=2,complexity_score=1,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["biceps"]',secondary_muscle_groups='[]'
WHERE exercise_id=19; -- Barbell Curl

UPDATE public.exercises SET display_id='AR-SK',category='arms',fatigue_score=2,complexity_score=2,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["triceps"]',secondary_muscle_groups='[]'
WHERE exercise_id=20; -- Skull Crushers

UPDATE public.exercises SET display_id='AR03',category='arms',fatigue_score=2,complexity_score=1,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["triceps"]',secondary_muscle_groups='["shoulders"]'
WHERE exercise_id=21; -- Rope Pushdown

UPDATE public.exercises SET display_id='SI01',category='shoulder_accessory',fatigue_score=2,complexity_score=1,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["shoulders"]',secondary_muscle_groups='[]'
WHERE exercise_id=22; -- Dumbbell Lateral Raise

UPDATE public.exercises SET display_id='SI02',category='shoulder_accessory',fatigue_score=2,complexity_score=1,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["shoulders","upper_back"]',secondary_muscle_groups='[]'
WHERE exercise_id=23; -- Rear Delt Fly Machine

UPDATE public.exercises SET display_id='CALF',category='calves_accessory',fatigue_score=2,complexity_score=1,
  leg_dominant=true,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["calves"]',secondary_muscle_groups='[]'
WHERE exercise_id=24; -- Standing Calf Raise

UPDATE public.exercises SET display_id='CO01',category='core',fatigue_score=2,complexity_score=1,
  leg_dominant=false,suitable_slots=ARRAY['accessory'],emphasis_tags=ARRAY[]::text[],
  primary_muscle_groups='["core"]',secondary_muscle_groups='[]'
WHERE exercise_id=25; -- Cable Crunch

-- ─── New exercises from PRD (IDs 26–48) ──────────────────────────────────────
INSERT INTO public.exercises
  (exercise_id,name,movement_pattern,default_targeted_primary_muscle,
   default_targeted_secondary_muscle,equipment_type,load_increment,load_increment_lb,
   display_id,category,fatigue_score,complexity_score,leg_dominant,
   suitable_slots,emphasis_tags,primary_muscle_groups,secondary_muscle_groups,
   alt_1_exercise_id,alt_2_exercise_id)
VALUES
  (26,'Back Squat','squat','quads','glutes, hamstrings, core','barbell','5 lb',5,
   'SQ01','squat_pattern',5,5,true,ARRAY['primary','secondary'],ARRAY['squat'],
   '["quads","glutes"]','["hamstrings","core"]',2,1),

  (27,'45 Degree Back Extension','hinge','glutes','hamstrings, erectors','machine','10 lb',10,
   'HN04','hinge_pattern',2,2,true,ARRAY['secondary','accessory'],ARRAY['hinge'],
   '["glutes","hamstrings"]','["core"]',6,NULL),

  (28,'Pull-Up','vertical pull','lats','upper back, biceps, core','bodyweight','0 lb',0,
   'VT01','vertical_pull',4,4,false,ARRAY['primary','secondary'],ARRAY['pull'],
   '["lats","upper_back"]','["biceps","core"]',18,17),

  (29,'Reverse Lunge','unilateral squat','quads','glutes, hamstrings, core','dumbbell','5 lb',5,
   'UL02','unilateral_lower_body',3,3,true,ARRAY['secondary'],ARRAY['squat'],
   '["quads","glutes"]','["hamstrings","core"]',3,NULL),

  (30,'Step-Up','unilateral squat','quads','glutes, hamstrings','dumbbell','5 lb',5,
   'UL03','unilateral_lower_body',3,3,true,ARRAY['secondary','accessory'],ARRAY['squat'],
   '["quads","glutes"]','["hamstrings","core"]',29,3),

  (31,'Cable Fly','horizontal adduction','chest','shoulders','cable','5 lb',5,
   'CI01','chest_accessory',2,1,false,ARRAY['accessory'],ARRAY['push'],
   '["chest"]','["shoulders"]',NULL,NULL),

  (32,'Pec Deck','horizontal adduction','chest','shoulders','machine','10 lb',10,
   'CI02','chest_accessory',2,1,false,ARRAY['accessory'],ARRAY['push'],
   '["chest"]','["shoulders"]',31,NULL),

  (33,'Landmine Press','angled push','shoulders','upper chest, triceps, core','barbell','10 lb',10,
   'VP03','vertical_push',2,2,false,ARRAY['secondary','accessory'],ARRAY['push'],
   '["shoulders","chest"]','["triceps","core"]',16,15),

  (34,'One Arm Dumbbell Row','horizontal pull','lats','upper back, biceps, core','dumbbell','5 lb',5,
   'HR03','horizontal_pull',3,3,false,ARRAY['primary','secondary'],ARRAY['pull'],
   '["lats","upper_back"]','["biceps","core"]',14,13),

  (35,'Face Pull','scapular retraction','upper back','rear delts, shoulders','cable','5 lb',5,
   'BA01','back_accessory',2,1,false,ARRAY['accessory'],ARRAY['pull'],
   '["upper_back","shoulders"]','["biceps"]',23,NULL),

  (36,'Straight Arm Pulldown','shoulder extension','lats','triceps, core','cable','5 lb',5,
   'BA02','back_accessory',2,1,false,ARRAY['accessory'],ARRAY['pull'],
   '["lats"]','["triceps"]',17,NULL),

  (37,'Leg Extension','knee extension','quads',NULL,'machine','10 lb',10,
   'QI01','quads_accessory',2,1,true,ARRAY['accessory'],ARRAY['squat'],
   '["quads"]','[]',NULL,NULL),

  (38,'Heel Elevated Goblet Squat','squat','quads','glutes, core','dumbbell','5 lb',5,
   'QI02','quads_accessory',3,2,true,ARRAY['secondary','accessory'],ARRAY['squat'],
   '["quads"]','["glutes","core"]',37,4),

  (39,'Lying Leg Curl','knee flexion','hamstrings','calves','machine','5 lb',5,
   'HG02','hamstrings_glutes_accessory',2,1,true,ARRAY['accessory'],ARRAY['hinge'],
   '["hamstrings"]','["calves"]',8,NULL),

  (40,'Cable Pull-Through','hinge','glutes','hamstrings, core','cable','10 lb',10,
   'HG03','hamstrings_glutes_accessory',2,2,true,ARRAY['accessory'],ARRAY['hinge'],
   '["glutes","hamstrings"]','["core"]',6,27),

  (41,'Hammer Curl','elbow flexion','biceps','brachialis, forearms','dumbbell','5 lb',5,
   'AR02','arms',2,1,false,ARRAY['accessory'],ARRAY[]::text[],
   '["biceps"]','["forearms"]',19,NULL),

  (42,'Overhead Cable Triceps Extension','elbow extension','triceps','core','cable','5 lb',5,
   'AR04','arms',2,2,false,ARRAY['accessory'],ARRAY[]::text[],
   '["triceps"]','["core"]',21,NULL),

  (43,'Hanging Knee Raise','trunk flexion','core','hip flexors, lats','bodyweight','0 lb',0,
   'CO02','core',2,2,false,ARRAY['accessory'],ARRAY[]::text[],
   '["core"]','["lats"]',25,NULL),

  (44,'Pallof Press','anti-rotation','core','shoulders','cable','5 lb',5,
   'CO03','core',1,1,false,ARRAY['accessory'],ARRAY[]::text[],
   '["core"]','["shoulders"]',25,43),

  (45,'Incline Treadmill Walk','steady state','conditioning','calves','treadmill','0 lb',0,
   'CD01','cardio',2,1,false,ARRAY['accessory'],ARRAY[]::text[],
   '["conditioning"]','[]',NULL,NULL),

  (46,'Air Bike Intervals','intervals','conditioning','quads, shoulders','bike','0 lb',0,
   'CD02','cardio',3,2,false,ARRAY['accessory'],ARRAY[]::text[],
   '["conditioning"]','[]',45,NULL),

  (47,'Elliptical Steady State','steady state','conditioning','quads, glutes','elliptical','0 lb',0,
   'CD03','cardio',2,1,false,ARRAY['accessory'],ARRAY[]::text[],
   '["conditioning"]','[]',45,46),

  (48,'Rower Intervals','intervals','conditioning','upper back, quads','rower','0 lb',0,
   'CD04','cardio',3,2,false,ARRAY['accessory'],ARRAY[]::text[],
   '["conditioning"]','[]',47,46)

ON CONFLICT (exercise_id) DO NOTHING;

-- ─── planned_workouts — rolling scheduler output ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.planned_workouts (
  workout_id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      uuid        NOT NULL REFERENCES public.user_profile(user_id) ON DELETE CASCADE,
  generated_at                 timestamptz NOT NULL DEFAULT now(),
  planned_for_date             date        NOT NULL,
  emphasis                     text        NOT NULL CHECK (emphasis IN ('push','pull','squat','hinge','mixed')),
  leg_dominant                 boolean     NOT NULL DEFAULT false,
  resistance_exercises         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cardio_recommendation        jsonb,
  estimated_resistance_minutes smallint    NOT NULL DEFAULT 0,
  estimated_total_minutes      smallint    NOT NULL DEFAULT 0,
  expires_at                   timestamptz NOT NULL,
  status                       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','expired')),
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_date
  ON public.planned_workouts (user_id, planned_for_date DESC);

-- ─── muscle_exposures — per-session fatigue tracking ─────────────────────────
CREATE TABLE IF NOT EXISTS public.muscle_exposures (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES public.user_profile(user_id) ON DELETE CASCADE,
  exercise_id          int         NOT NULL REFERENCES public.exercises(exercise_id),
  completed_at         timestamptz NOT NULL,
  muscle_group         text        NOT NULL,
  directness           text        NOT NULL CHECK (directness IN ('direct','indirect')),
  slot_type            text        NOT NULL CHECK (slot_type IN ('primary','secondary','accessory')),
  load_score           numeric(6,3) NOT NULL DEFAULT 0,
  hard_ready_at        timestamptz,
  soft_ready_at        timestamptz,
  source_fatigue_score smallint,
  source_was_compound  boolean,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_muscle_exposures_user_muscle
  ON public.muscle_exposures (user_id, muscle_group, completed_at DESC);
