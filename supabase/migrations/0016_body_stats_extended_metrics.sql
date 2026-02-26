-- Capture full body-stats upload metrics (including BMI/BMR and segment values).
alter table public.body_stats_daily
  add column if not exists skeletal_mass numeric null,
  add column if not exists bodyfat_lb numeric null,
  add column if not exists bmi numeric null,
  add column if not exists lean_body_mass_lb numeric null,
  add column if not exists bmr_kcal numeric null,
  add column if not exists smi_kg_m2 numeric null,
  add column if not exists left_arm_lb numeric null,
  add column if not exists right_arm_lb numeric null,
  add column if not exists trunk_lb numeric null,
  add column if not exists left_leg_lb numeric null,
  add column if not exists right_leg_lb numeric null,
  add column if not exists left_arm_ratio numeric null,
  add column if not exists right_arm_ratio numeric null,
  add column if not exists trunk_ratio numeric null,
  add column if not exists left_leg_ratio numeric null,
  add column if not exists right_leg_ratio numeric null;
