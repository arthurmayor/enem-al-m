# tools/extraction/

End-to-end pipeline that turns a vestibular PDF + gabarito into clean,
student-ready rows in `questions` / `question_occurrences`.

Everything here is stand-alone tooling: it is **not** imported by the Next.js
app under `src/`, nor shipped in any Supabase Edge Function that we deploy
today. The edge functions under `edge-functions/` are the original HTTP
wrappers (kept for reference only) — the production path runs the Node
variants below from a developer machine.

## Quick start — process one prova

```bash
export SUPABASE_SERVICE_ROLE_KEY=...
export ANTHROPIC_API_KEY=...

npx tsx tools/extraction/process-exam.ts \
  --banca Fuvest --ano 2026 --fase 1 --versao V1 \
  --prova    exam-files/fuvest-2026-fase1-V1-prova.pdf \
  --gabarito exam-files/fuvest-2026-fase1-gabarito.pdf
```

`--prova` / `--gabarito` are **storage paths** inside the `exam-files`
bucket (the PDFs must already be uploaded).

### Batch mode

```bash
# Inline JSON array
npx tsx tools/extraction/process-exam.ts --batch '[
  {"banca":"Unicamp","ano":2025,"fase":"1","versao":"V",
   "prova":"exam-files/unicamp-2025-fase1.pdf",
   "gabarito":"exam-files/unicamp-2025-fase1-gabarito.pdf"}
]'

# From a JSON file
npx tsx tools/extraction/process-exam.ts --batch-file provas.json
```

`process-exam.ts` orchestrates everything:
1. upsert `exams(banca, ano, fase, versao)`
2. seed an `extraction_jobs` row pointing at the PDFs
3. spawn the 11-agent pipeline (`extract-exam-local.ts`)
4. if any `question_raw` remains `flagged`, auto-recover
   (`recover-shared-context.ts` → `re-review-flagged.ts` → `run-inserter-only.ts`)
5. print a per-prova coverage summary

Set `SKIP_AUTO_RECOVERY=1` to disable step 4 (diagnostic runs only).

## Required env vars

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | write access to `exams`, `extraction_jobs`, `question_raw`, `questions`, etc. |
| `ANTHROPIC_API_KEY`         | forwarded to every spawned child — the pipeline calls Sonnet/Haiku for profiling, assembly, review, enrichment |
| `SUPABASE_URL` (optional)   | defaults to the project URL hardcoded in each script |
| `SUPABASE_ACCESS_TOKEN` (optional) | forwarded if set; some diag scripts use it |

## Scripts

### Orchestration

| Script | What it does |
|---|---|
| `process-exam.ts` | Universal runner (single or batch). **Start here.** |
| `run-batch.ts`    | Legacy batch runner (pre-`process-exam`). Still works; no auto-recovery. |
| `extract-exam-local.ts` | The 2600-line 11-agent pipeline. Invoked as a subprocess by the two above — not meant to be called directly unless you already know the `exam_id`. |

### Recovery / surgical fixes

| Script | Use when |
|---|---|
| `recover-shared-context.ts <exam_id>` | reviewer flagged `shared_context_ausente` on rows whose context text is actually present in the segmenter output but was never propagated. |
| `re-review-flagged.ts <exam_id>` | after recovery / manual edits, re-run the Sonnet reviewer on rows whose blocking issues may have become stale. |
| `run-inserter-only.ts <exam_id>` | last step: promote `approved` rows to `questions` + `question_occurrences`. Safe to re-run. |
| `run-enricher-only.ts <exam_id>` | re-run the enricher (skills/difficulty/explanations) without redoing extraction. |
| `repair-options.ts <exam_id> <n1,n2,...>` | rebuild garbled alternatives on specific question numbers. |
| `re-extract-range.ts <exam_id> <n1-n2>` | surgical re-extract of a numero range. |

### Fixes authored during the 90/90 Fuvest sweep

Kept as a library of proven moves. Each is scoped (env vars + hard-coded
target UUIDs), so read the header before reusing.

- `fix-step-1-dedup-occ.ts` — clear stale `question_occurrences` so the inserter can re-run cleanly.
- `fix-step-2-flip-approved.ts` — bump `status` from `flagged` to `approved` when all blocking issues are resolved.
- `fix-step-3-recover-sc-aggressive.ts` — fuzzy second-pass recovery for shared-context edge cases.
- `fix-step-4-haiku-sc.ts` — Haiku-assisted shared-context pick for rows that pure heuristics couldn't place.
- `fix-step-7-annul.ts` — mark banca-annulled questions (`is_annulled=true`, resolve `gabarito_invalido`) so the inserter accepts `correct_answer='*'`.
- `fix-step-final-manual-review.ts` — set `needs_manual_review=true` on the last unrecoverable rows (image-only questions, malformed options, low-confidence).
- `fix-step-mislabel.ts` — surgical relabel when stored `questions.source` no longer matches its content (label-swap bug).
- `cleanup-cross-prova-contamination.ts` — clear `question_raw` rows that leaked into the wrong prova.

### Diagnostics

Read-only scripts that dump current state. Safe to run any time.

- `check-state.ts` — per-prova counts of `raw / approved / flagged / enriched / questions`. **Run this after every pipeline invocation.**
- `diag-approved-not-inserted.ts`, `diag-deduped-missing.ts` — find `approved` rows without a matching occurrence.
- `diag-dedup-collision.ts` — detect `content_hash` collisions.
- `diag-missing.ts`, `diag-missing-v2.ts` — list `numero`s present in the gabarito but not inserted.
- `diag-cross-prova-contamination.ts`, `diag-counts.ts`, `diag-verify.ts`, `diag-gabarito-2022.ts`, `diag-occ-2022.ts`, `diag-q31-2023.ts`, `diag-q31-q39-full.ts`, `diag-mr-count.ts`, `super-diag.ts` — ad-hoc dumps kept as examples.
- `get-exam-ids.ts` — list `exam_id`s by banca/year.

## Edge Functions (archived)

`edge-functions/` holds the HTTP entry points for `extract-exam` /
`extract-exam-process` plus their shared agents. They pre-date the local
pipeline in `extract-exam-local.ts`, which is now the canonical path.
Keep them for reference; don't redeploy without bringing back the same
fixes that landed in the local runner (running-header strip, shared-context
propagation, option-label normalization, assembler retry, …).

## Typical workflow

1. Upload `prova.pdf` and `gabarito.pdf` to the `exam-files` Supabase
   bucket. Use predictable names — `{banca}-{ano}-fase{fase}-{versao}-prova.pdf`
   and `{banca}-{ano}-fase{fase}-gabarito.pdf`.
2. Run `process-exam.ts` with the right flags. Expect 10–15 min per prova
   of 90 questions.
3. When it finishes, run `check-state.ts` (edit the `provas` array if needed).
   A fully recovered prova shows `questions == expected`, `flagged == 0`.
4. If `flagged > 0`, inspect `question_issues` for that exam and pick the
   smallest applicable fix script above. Then re-run
   `run-inserter-only.ts <exam_id>`.

See **WORKFLOW.md** for a step-by-step guide aimed at non-programmers.
