insert into exercises (
  exercise_id, name, movement_pattern, default_targeted_primary_muscle,
  default_targeted_secondary_muscle, equipment_type, load_increment, load_increment_lb,
  load_semantic, alt_1_exercise_id, alt_2_exercise_id
) values
  (1,  'Hack Squat (Quad Bias)',          'Squat',            'Quads',      null, 'machine',  '5 lb', 5, 'normal', null, null),
  (2,  'Front Squat',                     'Squat',            'Quads',      null, 'barbell',  '5 lb', 5, 'normal', 1,    3),
  (3,  'Bulgarian Split Squat (Quad Bias)','Squat',           'Quads',      null, 'dumbbell', '5 lb', 5, 'normal', null, 4),
  (4,  'Leg Press (Neutral)',             'Squat',            'Quads',      null, 'machine',  '5 lb', 5, 'normal', 1,    null),

  (5,  'Romanian Deadlift (RDL)',         'Hinge',            'Hamstrings', null, 'barbell',  '5 lb', 5, 'normal', null, 8),
  (6,  'Glute Drive / Hip Thrust',        'Hinge',            'Glutes',     null, 'machine',  '5 lb', 5, 'normal', null, null),
  (7,  'Barbell Deadlift',                'Hinge',            'Hamstrings', null, 'barbell',  '5 lb', 5, 'normal', 5,    null),
  (8,  'Seated Leg Curl',                 'Hinge',            'Hamstrings', null, 'machine',  '5 lb', 5, 'normal', null, null),

  (9,  'Flat Dumbbell Press',             'Horizontal Push',  'Chest',      null, 'dumbbell', '5 lb', 5, 'normal', null, 11),
  (10, 'Incline Dumbbell Press',          'Horizontal Push',  'Chest',      null, 'dumbbell', '5 lb', 5, 'normal', null, null),
  (11, 'Chest Press Machine',             'Horizontal Push',  'Chest',      null, 'machine',  '5 lb', 5, 'normal', 9,    null),

  (12, 'Barbell Row',                     'Horizontal Pull',  'Back',       null, 'barbell',  '5 lb', 5, 'normal', 14,   null),
  (13, 'Seated Cable Row',                'Horizontal Pull',  'Back',       null, 'cable',    '5 lb', 5, 'normal', null, 12),
  (14, 'Chest-Supported Machine Row',     'Horizontal Pull',  'Back',       null, 'machine',  '5 lb', 5, 'normal', null, 13),

  (15, 'Dumbbell Shoulder Press',         'Vertical Push',    'Shoulders',  null, 'dumbbell', '5 lb', 5, 'normal', 16,   null),
  (16, 'Machine Shoulder Press',          'Vertical Push',    'Shoulders',  null, 'machine',  '5 lb', 5, 'normal', 15,   null),

  (17, 'Lat Pulldown',                    'Vertical Pull',    'Back',       null, 'cable',    '5 lb', 5, 'normal', 18,   null),
  (18, 'Assisted Pull-Up',                'Vertical Pull',    'Back',       null, 'machine',  '5 lb assistance change', 5, 'assistance', 17, null),

  (19, 'Barbell Curl',                    'Isolation',        'Biceps',     null, 'barbell',  '5 lb', 5, 'normal', null, null),
  (20, 'Skull Crushers',                  'Isolation',        'Triceps',    null, 'barbell',  '5 lb', 5, 'normal', 21,   null),
  (21, 'Rope Pushdown',                   'Isolation',        'Triceps',    null, 'cable',    '5 lb', 5, 'normal', 20,   null),

  (22, 'Dumbbell Lateral Raise',          'Isolation',        'Shoulders',  null, 'dumbbell', '5 lb', 5, 'normal', null, null),
  (23, 'Rear Delt Fly (Machine)',         'Isolation',        'Shoulders',  null, 'machine',  '5 lb', 5, 'normal', null, null),

  (24, 'Standing Calf Raise',             'Isolation',        'Calves',     null, 'machine',  '5 lb', 5, 'normal', null, null),
  (25, 'Cable Crunch',                    'Isolation',        'Core',       null, 'cable',    '5 lb', 5, 'normal', null, null)
;
