-- ============================================================
-- Migration: Dashboard v4 — get_dashboard_metrics RPC
-- Retorna um JSON com as métricas estáticas do dashboard
-- derivadas das tabelas existentes (profiles, daily_missions,
-- study_plans, answer_history, exam_results, exam_configs).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result JSON;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object();
  END IF;

  SELECT json_build_object(
    'user_id', p.id,
    'name', p.name,
    'current_streak', COALESCE(p.current_streak, 0),
    'total_xp', COALESCE(p.total_xp, 0),
    'exam_name', ec.exam_name,
    'course_name', ec.course_name,
    'exam_date', p.exam_date,
    'days_until_exam', CASE
      WHEN p.exam_date IS NULL THEN NULL
      ELSE GREATEST(0, (p.exam_date - CURRENT_DATE))
    END,

    -- Missões hoje
    'missions_today_total', (
      SELECT COUNT(*) FROM public.daily_missions dm
      INNER JOIN public.study_plans sp ON sp.id = dm.study_plan_id
      WHERE dm.user_id = uid AND dm.date = CURRENT_DATE
        AND COALESCE(sp.status, 'active') != 'superseded'
        AND COALESCE(dm.status, 'pending') != 'superseded'
    ),
    'missions_today_completed', (
      SELECT COUNT(*) FROM public.daily_missions dm
      INNER JOIN public.study_plans sp ON sp.id = dm.study_plan_id
      WHERE dm.user_id = uid AND dm.date = CURRENT_DATE
        AND dm.status = 'completed'
        AND COALESCE(sp.status, 'active') != 'superseded'
    ),

    -- Tarefas totais (planos ativos até hoje)
    'total_missions_generated', (
      SELECT COUNT(*) FROM public.daily_missions dm
      INNER JOIN public.study_plans sp ON sp.id = dm.study_plan_id
      WHERE dm.user_id = uid AND dm.date <= CURRENT_DATE
        AND COALESCE(sp.status, 'active') != 'superseded'
        AND COALESCE(dm.status, 'pending') != 'superseded'
    ),
    'total_missions_completed', (
      SELECT COUNT(*) FROM public.daily_missions dm
      INNER JOIN public.study_plans sp ON sp.id = dm.study_plan_id
      WHERE dm.user_id = uid AND dm.date <= CURRENT_DATE
        AND dm.status = 'completed'
        AND COALESCE(sp.status, 'active') != 'superseded'
    ),

    -- Questões totais
    'total_questions', (
      SELECT COUNT(*) FROM public.answer_history WHERE user_id = uid
    ),
    'total_correct', (
      SELECT COUNT(*) FROM public.answer_history
      WHERE user_id = uid AND is_correct = TRUE
    ),

    -- Simulados
    'total_exams', (
      SELECT COUNT(*) FROM public.exam_results WHERE user_id = uid
    ),
    'best_exam_score', (
      SELECT MAX(score_percent) FROM public.exam_results WHERE user_id = uid
    ),
    'last_exam_score', (
      SELECT score_percent FROM public.exam_results
      WHERE user_id = uid
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    )
  ) INTO result
  FROM public.profiles p
  LEFT JOIN public.exam_configs ec ON ec.id = p.exam_config_id
  WHERE p.id = uid;

  RETURN COALESCE(result, json_build_object());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
