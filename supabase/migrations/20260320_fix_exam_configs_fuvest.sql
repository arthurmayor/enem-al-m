-- ============================================================================
-- CORREÇÃO 1: Corrigir exam_configs da Fuvest
-- Bug: subject_distribution somava != 90, cutoff_sd estava 8 (deveria ser 2)
-- ============================================================================

-- Atualizar subject_distribution, cutoff_sd e total_questions para TODOS os registros Fuvest
UPDATE exam_configs
SET
  subject_distribution = '{
    "Português": {"questions": 15, "meanDiff": 1150, "sdDiff": 250},
    "Matemática": {"questions": 12, "meanDiff": 1300, "sdDiff": 300},
    "História": {"questions": 12, "meanDiff": 1200, "sdDiff": 250},
    "Geografia": {"questions": 10, "meanDiff": 1200, "sdDiff": 250},
    "Biologia": {"questions": 10, "meanDiff": 1200, "sdDiff": 280},
    "Física": {"questions": 10, "meanDiff": 1300, "sdDiff": 300},
    "Química": {"questions": 8, "meanDiff": 1250, "sdDiff": 280},
    "Inglês": {"questions": 5, "meanDiff": 1050, "sdDiff": 200},
    "Filosofia": {"questions": 5, "meanDiff": 1200, "sdDiff": 250},
    "Artes": {"questions": 3, "meanDiff": 1100, "sdDiff": 200}
  }'::jsonb,
  cutoff_sd = 2.0,
  total_questions = 90
WHERE exam_slug = 'fuvest';

-- Corrigir notas de corte por curso
UPDATE exam_configs SET cutoff_mean = 66 WHERE exam_slug = 'fuvest' AND course_slug = 'direito';
UPDATE exam_configs SET cutoff_mean = 80 WHERE exam_slug = 'fuvest' AND course_slug = 'medicina';
UPDATE exam_configs SET cutoff_mean = 62 WHERE exam_slug = 'fuvest' AND course_slug = 'engenharia-civil';
UPDATE exam_configs SET cutoff_mean = 69 WHERE exam_slug = 'fuvest' AND course_slug = 'psicologia';
UPDATE exam_configs SET cutoff_mean = 55 WHERE exam_slug = 'fuvest' AND course_slug = 'administracao';
UPDATE exam_configs SET cutoff_mean = 71 WHERE exam_slug = 'fuvest' AND course_slug = 'engenharia-computacao';

-- Verificar resultado
SELECT
  id, exam_slug, course_slug, cutoff_mean, cutoff_sd, total_questions,
  (SELECT SUM((value->>'questions')::int) FROM jsonb_each(subject_distribution)) as total_questions_sum
FROM exam_configs
WHERE exam_slug = 'fuvest';
