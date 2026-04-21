-- Cache segmenter output on the job row so each phase-2 stage can run
-- in its own edge-function invocation (60s wall-time each) and pick up
-- where the previous stage left off.
ALTER TABLE public.extraction_jobs
  ADD COLUMN IF NOT EXISTS segmenter_blocks_json JSONB;
