-- Sprint 6: Add error_type column for basic error taxonomy
ALTER TABLE public.answer_history
  ADD COLUMN IF NOT EXISTS error_type TEXT;

COMMENT ON COLUMN public.answer_history.error_type IS 'Basic error classification: distracao, conceitual, nao_classificado';
