-- Add subtopic column to answer_history for real subtopic tracking
-- Sprint 5 hotfix: answer_history was missing subtopic field
ALTER TABLE public.answer_history
  ADD COLUMN IF NOT EXISTS subtopic TEXT DEFAULT 'geral';

-- Backfill existing rows from questions table where possible
UPDATE public.answer_history ah
SET subtopic = COALESCE(
  (SELECT q.subtopic FROM public.questions q WHERE q.id = ah.question_id LIMIT 1),
  (SELECT dq.subtopic FROM public.diagnostic_questions dq WHERE dq.id = ah.question_id LIMIT 1),
  'geral'
)
WHERE ah.subtopic = 'geral' OR ah.subtopic IS NULL;
