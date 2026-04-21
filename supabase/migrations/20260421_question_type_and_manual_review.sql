-- ============================================================
-- Add question_type + needs_manual_review to the served questions
-- table (question_raw already has question_type; needs the flag).
-- Idempotent.
-- ============================================================

ALTER TABLE public.question_raw
  ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'multiple_choice_single',
  ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.question_raw.needs_manual_review IS
  'True when the validator tagged the row as image-options or otherwise '
  'requires a human to later fill in content that the extractor cannot '
  'read from the PDF alone.';

COMMENT ON COLUMN public.questions.needs_manual_review IS
  'Carried over from question_raw. Consumers can choose to show these '
  'questions with a "needs review" badge or exclude them from simulations.';

CREATE INDEX IF NOT EXISTS idx_questions_needs_manual_review
  ON public.questions(needs_manual_review)
  WHERE needs_manual_review = TRUE;
