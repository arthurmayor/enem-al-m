-- ============================================================
-- Migration: Split extract-exam pipeline into two phases
-- ------------------------------------------------------------
-- The extraction pipeline is split into two Edge Functions so
-- each phase fits within the 60s Edge Function timeout:
--   1) extract-exam          → pre_parser + profiler
--   2) extract-exam-process  → segmenter + assembler + gabarito
-- Phase 1 persists the intermediate state on extraction_jobs so
-- phase 2 can resume from the same job row.
-- Idempotent.
-- ============================================================

ALTER TABLE public.extraction_jobs
  ADD COLUMN IF NOT EXISTS pre_parser_pages JSONB,
  ADD COLUMN IF NOT EXISTS profile_json JSONB,
  ADD COLUMN IF NOT EXISTS prova_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS gabarito_storage_path TEXT;

COMMENT ON COLUMN public.extraction_jobs.pre_parser_pages IS
  'Array of {page_number, text} produced by the pre_parser stage. '
  'Consumed by extract-exam-process during the segmenter stage.';

COMMENT ON COLUMN public.extraction_jobs.profile_json IS
  'ProfileResult produced by the profiler stage. Also copied to exams.profile_json '
  'on success; duplicated here so extract-exam-process can read it without joining.';
