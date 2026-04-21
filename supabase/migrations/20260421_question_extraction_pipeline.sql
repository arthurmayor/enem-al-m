-- ============================================================
-- Migration: Question extraction pipeline
-- ------------------------------------------------------------
-- Schema for the vestibular question extraction pipeline:
--   exams, exam_files, extraction_jobs, question_raw,
--   question_media, question_issues, question_raw_history,
--   question_occurrences, plus additive columns on the
--   pre-existing `questions` table.
-- Idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- 0) Shared trigger function for updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1) EXAMS — metadata of each exam (banca + ano + fase + versao)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banca TEXT NOT NULL,
  ano INTEGER NOT NULL,
  fase TEXT DEFAULT '1',
  versao TEXT DEFAULT 'V1',
  exam_type TEXT DEFAULT 'objetiva',
  language TEXT DEFAULT 'pt-BR',
  source_format TEXT,
  total_questions_detected INTEGER,
  option_label_pattern TEXT DEFAULT 'A-E',
  has_shared_context BOOLEAN DEFAULT FALSE,
  has_note_e_adote BOOLEAN DEFAULT FALSE,
  has_images BOOLEAN DEFAULT FALSE,
  profile_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT exams_banca_ano_fase_versao_unique UNIQUE (banca, ano, fase, versao)
);

-- ============================================================
-- 2) EXAM_FILES — PDFs (and other source files) uploaded per exam
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exam_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  checksum TEXT,
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3) EXTRACTION_JOBS — one row per extraction run of an exam
-- ============================================================
CREATE TABLE IF NOT EXISTS public.extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  current_stage TEXT DEFAULT 'pending',
  total_questions INTEGER DEFAULT 0,
  extracted_questions INTEGER DEFAULT 0,
  approved_questions INTEGER DEFAULT 0,
  flagged_questions INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  stages_log JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS extraction_jobs_set_updated_at ON public.extraction_jobs;
CREATE TRIGGER extraction_jobs_set_updated_at
  BEFORE UPDATE ON public.extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============================================================
-- 4) QUESTION_RAW — raw extracted questions awaiting validation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.extraction_jobs(id),
  numero INTEGER NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice_single',
  shared_context TEXT,
  stem TEXT NOT NULL,
  options JSONB,
  note_e_adote TEXT,
  correct_answer TEXT,
  is_annulled BOOLEAN DEFAULT FALSE,
  source_pages INTEGER[],
  confidence_score DECIMAL(3,2),
  content_hash TEXT,
  normalized_hash TEXT,
  status TEXT DEFAULT 'raw',
  segmenter_blocks JSONB,
  media_map JSONB,
  reviewer_corrections JSONB,
  validator_result JSONB,
  enrichment JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT question_raw_exam_numero_unique UNIQUE (exam_id, numero)
);

DROP TRIGGER IF EXISTS question_raw_set_updated_at ON public.question_raw;
CREATE TRIGGER question_raw_set_updated_at
  BEFORE UPDATE ON public.question_raw
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============================================================
-- 5) QUESTION_MEDIA — figures / tables / formulas attached to questions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_raw_id UUID NOT NULL REFERENCES public.question_raw(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  role TEXT DEFAULT 'enunciado',
  option_label TEXT,
  storage_path TEXT,
  file_name TEXT,
  caption TEXT,
  page INTEGER,
  bbox JSONB,
  width INTEGER,
  height INTEGER,
  file_hash TEXT,
  order_index INTEGER DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6) QUESTION_ISSUES — problems detected by extraction agents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_raw_id UUID NOT NULL REFERENCES public.question_raw(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.extraction_jobs(id),
  issue_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  description TEXT,
  agent TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7) QUESTION_RAW_HISTORY — edit history for raw questions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_raw_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_raw_id UUID NOT NULL REFERENCES public.question_raw(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  previous_stem TEXT,
  previous_options JSONB,
  previous_shared_context TEXT,
  change_description TEXT,
  CONSTRAINT question_raw_history_version_unique UNIQUE (question_raw_id, version)
);

-- ============================================================
-- 8) QUESTIONS — additive columns on the pre-existing table
-- ============================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS shared_context TEXT,
  ADD COLUMN IF NOT EXISTS note_e_adote TEXT,
  ADD COLUMN IF NOT EXISTS media_refs JSONB,
  ADD COLUMN IF NOT EXISTS exam_id UUID,
  ADD COLUMN IF NOT EXISTS raw_question_id UUID,
  ADD COLUMN IF NOT EXISTS source_pages INTEGER[],
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS normalized_hash TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_version INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

COMMENT ON COLUMN public.questions.status IS
  'Lifecycle state for served questions. Rows promoted from question_raw '
  'land here as ''approved''; pre-existing rows default to ''approved'' so '
  'v_questions_ready keeps serving them.';

-- ============================================================
-- 9) QUESTION_OCCURRENCES — duplicate tracking across exams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id),
  raw_question_id UUID REFERENCES public.question_raw(id),
  numero_na_prova INTEGER NOT NULL,
  versao TEXT,
  source TEXT,
  source_pages INTEGER[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT question_occurrences_unique UNIQUE (question_id, exam_id, versao)
);

-- ============================================================
-- 10) Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_question_raw_exam_id
  ON public.question_raw(exam_id);
CREATE INDEX IF NOT EXISTS idx_question_raw_status
  ON public.question_raw(status);
CREATE INDEX IF NOT EXISTS idx_question_raw_content_hash
  ON public.question_raw(content_hash);
CREATE INDEX IF NOT EXISTS idx_question_raw_normalized_hash
  ON public.question_raw(normalized_hash);
CREATE INDEX IF NOT EXISTS idx_question_media_question_raw_id
  ON public.question_media(question_raw_id);
CREATE INDEX IF NOT EXISTS idx_question_issues_question_raw_id
  ON public.question_issues(question_raw_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_exam_id
  ON public.extraction_jobs(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_source
  ON public.questions(source);
CREATE INDEX IF NOT EXISTS idx_questions_content_hash
  ON public.questions(content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_normalized_hash
  ON public.questions(normalized_hash);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id
  ON public.questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_question_occurrences_question_id
  ON public.question_occurrences(question_id);
CREATE INDEX IF NOT EXISTS idx_question_occurrences_exam_id
  ON public.question_occurrences(exam_id);

-- ============================================================
-- 11) v_questions_ready — questions considered ready for serving
-- ------------------------------------------------------------
-- Criteria:
--   - questions.status = 'approved'
--   - confidence_score >= 0.8 (measured on question_raw)
--   - no unresolved issues of severity high/critical OR in the
--     set of blocking issue_types.
-- ============================================================
CREATE OR REPLACE VIEW public.v_questions_ready AS
SELECT q.*
FROM public.questions q
LEFT JOIN public.question_raw qr ON qr.id = q.raw_question_id
WHERE q.status = 'approved'
  AND COALESCE(qr.confidence_score, 0) >= 0.8
  AND NOT EXISTS (
    SELECT 1
    FROM public.question_issues qi
    WHERE qi.question_raw_id = q.raw_question_id
      AND qi.resolved = FALSE
      AND (
        qi.severity IN ('high', 'critical')
        OR qi.issue_type IN (
          'contaminacao',
          'imagem_incorreta',
          'legenda_quebrada',
          'alternativas_incorretas',
          'gabarito_invalido',
          'duplicata_provavel'
        )
      )
  );

-- ============================================================
-- 12) Row Level Security
-- ------------------------------------------------------------
-- Enabled on every new table. Public-read policies are added
-- for `exams` and `extraction_jobs` (read-only for anon/auth
-- clients). All other tables have RLS enabled but no policies,
-- so access requires the service role.
-- ============================================================
ALTER TABLE public.exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_raw       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_media     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_issues    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_raw_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exams_public_read" ON public.exams;
CREATE POLICY "exams_public_read"
  ON public.exams FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "extraction_jobs_public_read" ON public.extraction_jobs;
CREATE POLICY "extraction_jobs_public_read"
  ON public.extraction_jobs FOR SELECT
  USING (true);

-- ============================================================
-- 13) Storage bucket
-- ------------------------------------------------------------
-- Bucket `exam-files` holds the uploaded PDFs referenced by
-- exam_files.storage_path. Create it idempotently; if the role
-- running this migration cannot write to storage.buckets, create
-- it manually via the Supabase Dashboard:
--   Storage → New bucket → name: "exam-files" (private).
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('exam-files', 'exam-files', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage bucket creation: insufficient privileges. '
                 'Create the "exam-files" bucket manually via the Supabase Dashboard.';
END $$;
