-- ============================================================
-- Migration: fase1 + fase2 schema
-- Documenta as alterações de schema já aplicadas no banco de
-- produção. Idempotente (IF NOT EXISTS / IF NOT EXISTS).
-- Deve rodar ANTES de 20260320_fix_exam_configs_fuvest.sql.
-- ============================================================

-- ============================================================
-- 1) PROFILES: novos campos de onboarding
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_stage TEXT,
  ADD COLUMN IF NOT EXISTS school_type TEXT,
  ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS available_days TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_shift TEXT,
  ADD COLUMN IF NOT EXISTS routine_is_unstable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_mock_experience TEXT,
  ADD COLUMN IF NOT EXISTS current_biggest_difficulty TEXT,
  ADD COLUMN IF NOT EXISTS self_declared_blocks JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.self_declared_blocks IS
  'Ex.: {"linguagens":"medio","humanas":"forte","natureza":"fraco","matematica":"fraco"}';

-- ============================================================
-- 2) SESSÕES DIAGNÓSTICAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diagnostic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_config_id UUID NOT NULL REFERENCES public.exam_configs(id) ON DELETE RESTRICT,
  session_type TEXT NOT NULL CHECK (session_type IN ('router','deep','calibration')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_items_presented INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  placement_band TEXT,
  placement_confidence TEXT,
  router_path JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_user_created
  ON public.diagnostic_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_type_status
  ON public.diagnostic_sessions(session_type, status);

-- ============================================================
-- 3) RESPOSTAS POR ITEM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diagnostic_item_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('router','calibration','deep')),
  sequence_no INTEGER NOT NULL,
  route_slot TEXT,
  subject TEXT NOT NULL,
  subtopic TEXT,
  selected_option TEXT,
  correct_option TEXT,
  is_correct BOOLEAN NOT NULL,
  response_time_seconds INTEGER,
  difficulty_presented INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_item_responses_session
  ON public.diagnostic_item_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_item_responses_user_question
  ON public.diagnostic_item_responses(user_id, question_id);

-- ============================================================
-- 4) ESTIMATIVAS / SAÍDAS DO DIAGNÓSTICO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diagnostic_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  estimate_scope TEXT NOT NULL CHECK (estimate_scope IN ('router','deep','recalibration')),
  estimated_score NUMERIC(6,2),
  placement_band TEXT,
  placement_confidence TEXT,
  global_theta NUMERIC(8,2),
  proficiencies JSONB DEFAULT '{}'::jsonb,
  strengths_json JSONB DEFAULT '[]'::jsonb,
  bottlenecks_json JSONB DEFAULT '[]'::jsonb,
  initial_priority_json JSONB DEFAULT '[]'::jsonb,
  explanation_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_estimates_user_created
  ON public.diagnostic_estimates(user_id, created_at DESC);

-- ============================================================
-- 5) ANALYTICS MÍNIMO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  session_id UUID REFERENCES public.diagnostic_sessions(id) ON DELETE SET NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON public.analytics_events(user_id, created_at DESC);

-- ============================================================
-- 6) ALTERS EM study_plans e daily_missions
-- ============================================================
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS source_session_id UUID REFERENCES public.diagnostic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'ai' CHECK (generation_mode IN ('ai','fallback')),
  ADD COLUMN IF NOT EXISTS plan_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','archived','superseded'));

ALTER TABLE public.daily_missions
  ADD COLUMN IF NOT EXISTS mission_type TEXT,
  ADD COLUMN IF NOT EXISTS mission_order INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calibration_eligible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fallback_generated BOOLEAN DEFAULT FALSE;

-- Nota: o script original referenciava plan_id, mas a coluna canônica é
-- study_plan_id (ver core-contract.md). O index abaixo usa study_plan_id.
CREATE INDEX IF NOT EXISTS idx_daily_missions_user_due_date
  ON public.daily_missions(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_daily_missions_plan_status
  ON public.daily_missions(study_plan_id, status);

-- ============================================================
-- 7) RLS
-- ============================================================
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_item_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own diagnostic_sessions') THEN
    CREATE POLICY "Users can read own diagnostic_sessions" ON public.diagnostic_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own diagnostic_sessions') THEN
    CREATE POLICY "Users can insert own diagnostic_sessions" ON public.diagnostic_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own diagnostic_sessions') THEN
    CREATE POLICY "Users can update own diagnostic_sessions" ON public.diagnostic_sessions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own item responses') THEN
    CREATE POLICY "Users can read own item responses" ON public.diagnostic_item_responses FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own item responses') THEN
    CREATE POLICY "Users can insert own item responses" ON public.diagnostic_item_responses FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own diagnostic_estimates') THEN
    CREATE POLICY "Users can read own diagnostic_estimates" ON public.diagnostic_estimates FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own diagnostic_estimates') THEN
    CREATE POLICY "Users can insert own diagnostic_estimates" ON public.diagnostic_estimates FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own analytics_events') THEN
    CREATE POLICY "Users can insert own analytics_events" ON public.analytics_events FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own analytics_events') THEN
    CREATE POLICY "Users can read own analytics_events" ON public.analytics_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
