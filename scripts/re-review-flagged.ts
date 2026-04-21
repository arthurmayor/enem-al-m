/**
 * Fase B — Re-reviewer cirúrgico.
 *
 * Re-roda APENAS o reviewer (Sonnet) sobre question_raw rows cujas issues
 * bloqueantes podem ter ficado obsoletas depois da Fase A (propagação
 * de shared_context / poda de conector). Escopo:
 *
 *   - status ∈ { approved, flagged }
 *   - tem pelo menos UMA issue NÃO-resolvida em issue_type ∈ {
 *       gabarito_invalido, alternativas_incorretas, alternativa_faltante,
 *       contaminacao, texto_truncado (crit/high), alternativa_vazia
 *     }
 *   - NÃO pula shared_context_ausente: depois de A3 a SC está preenchida
 *     e o reviewer pode reclamar de novo, mas se ainda existirem, serão
 *     re-classificadas ou resolvidas individualmente.
 *
 * Ação por questão revisada:
 *   - Marca TODAS as issues unresolved existentes como resolved com
 *     resolution="superseded by re-reviewer (Fase B)".
 *   - Insere as novas issues retornadas.
 *   - status = approved se não há issue bloqueante NOVA, senão flagged.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/re-review-flagged.ts <exam_id> [<exam_id> ...]
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const MODEL_SONNET = "claude-sonnet-4-20250514";
const REVIEWER_BATCH_SIZE = 12;
const REVIEWER_MAX_TOKENS = 16384;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      let msg = err instanceof Error ? err.message : String(err);
      let c: unknown = err;
      while (c && typeof c === "object" && "cause" in c) {
        c = (c as { cause?: unknown }).cause;
        if (c instanceof Error) msg += ` | ${c.message}`;
      }
      if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
    }
  }
  throw lastErr;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: supabaseFetch as typeof fetch },
});

async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;
    if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|timeout/i.test(error.message)) {
      throw new Error(`${label}: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
  }
  throw new Error(`${label}: exceeded retries`);
}
async function mustRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const r = await withRetry(label, fn);
  if (r === null) throw new Error(`${label}: data null`);
  return r;
}

const BLOCKING_ISSUE_TYPES = new Set([
  "gabarito_invalido",
  "alternativas_incorretas",
  "alternativa_faltante",
  "alternativa_vazia",
  "contaminacao",
  "texto_truncado",
  "shared_context_ausente",
]);

const REV_SYSTEM = `Compare as questões montadas com o texto original da prova.
Para cada questão, verifique:
1. O stem não contém texto de questão vizinha (contaminação)
2. As alternativas pertencem à questão correta
3. shared_context está nas questões corretas
4. Nenhum texto foi reescrito ou parafraseado
5. O gabarito é coerente com as alternativas
Se encontrar problemas, liste-os.
Se a questão está OK, marque approved=true e issues=[].

ATENÇÃO question_type='multiple_choice_image_options': as alternativas
são IMAGENS (gráficos, figuras). É ESPERADO que o texto das alternativas
esteja em branco ou seja trivial (ex.: "A)"). NÃO reporte
alternativa_vazia, alternativas_incorretas nem texto_truncado para
alternativas desse tipo de questão.

ATENÇÃO: shared_context pode ter sido preenchido automaticamente em uma
etapa anterior (propagação de "TEXTO PARA AS QUESTÕES X A Y"). Se ele
existe e é consistente com o stem, NÃO reporte shared_context_ausente.

Chame a tool submit_review com um item por questão recebida.
issue_type válidos: contaminacao, alternativa_faltante, alternativa_vazia,
alternativas_incorretas, gabarito_invalido, shared_context_ausente, texto_truncado.
severity válidos: low, medium, high, critical.
corrections: null se não há correções.`;

const REVIEW_ISSUE_TYPES = [
  "contaminacao",
  "alternativa_faltante",
  "alternativa_vazia",
  "alternativas_incorretas",
  "gabarito_invalido",
  "shared_context_ausente",
  "texto_truncado",
];

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          approved: { type: "boolean" },
          corrections: { type: ["object", "null"] },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue_type: { type: "string", enum: REVIEW_ISSUE_TYPES },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                description: { type: "string" },
              },
              required: ["issue_type", "severity", "description"],
            },
          },
        },
        required: ["numero", "approved", "issues"],
      },
    },
  },
  required: ["reviews"],
};

interface ReviewIssue { issue_type: string; severity: string; description: string }
interface ReviewItem { numero: number; approved: boolean; issues: ReviewIssue[] }
interface QuestionForReview {
  id: string;
  numero: number;
  stem: string;
  options: unknown;
  correct_answer: string | null;
  shared_context: string | null;
  question_type: string | null;
}

async function reviewBatch(batch: QuestionForReview[]): Promise<ReviewItem[]> {
  const payload = batch.map((q) => ({
    numero: q.numero,
    question_type: q.question_type ?? "multiple_choice_single",
    stem: q.stem,
    options: q.options,
    correct_answer: q.correct_answer,
    shared_context: q.shared_context,
  }));
  const res = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: REVIEWER_MAX_TOKENS,
    system: REV_SYSTEM,
    tools: [
      {
        name: "submit_review",
        description: "Submit reviews for a batch of questions.",
        input_schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
      },
    ],
    tool_choice: { type: "tool", name: "submit_review" },
    messages: [{ role: "user", content: `Revise as seguintes questões:\n${JSON.stringify(payload)}` }],
  });
  const block = res.content.find((b) => b.type === "tool_use" && b.name === "submit_review");
  if (!block || block.type !== "tool_use") {
    throw new Error(`submit_review ausente (stop=${res.stop_reason})`);
  }
  const inp = block.input as { reviews?: ReviewItem[] };
  return inp.reviews ?? [];
}

async function processExam(examId: string): Promise<void> {
  console.log(`\n=== Re-reviewer — exam ${examId} ===`);

  // 1. Load exam's raws + their unresolved issues.
  const raws = await mustRetry<QuestionForReview[]>(
    "raws",
    () => supabase
      .from("question_raw")
      .select("id,numero,stem,options,correct_answer,shared_context,question_type,status")
      .eq("exam_id", examId)
      .in("status", ["approved", "flagged"])
      .order("numero", { ascending: true }),
  );
  if (raws.length === 0) {
    console.log("  (nothing to review)");
    return;
  }

  const rawIds = raws.map((r) => r.id);
  const CHUNK = 60;
  const issues: Array<{ id: string; question_raw_id: string; issue_type: string; severity: string }> = [];
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const part = await mustRetry<typeof issues>(
      `issues ${i}`,
      () => supabase
        .from("question_issues")
        .select("id,question_raw_id,issue_type,severity")
        .eq("resolved", false)
        .in("question_raw_id", slice),
    );
    issues.push(...part);
  }

  // 2. Pick questions with at least one BLOCKING unresolved issue.
  const hasBlocker = new Set<string>();
  for (const i of issues) {
    if (
      BLOCKING_ISSUE_TYPES.has(i.issue_type) &&
      (i.severity === "high" || i.severity === "critical" ||
        ["gabarito_invalido", "contaminacao", "alternativas_incorretas"].includes(i.issue_type))
    ) {
      hasBlocker.add(i.question_raw_id);
    }
  }
  const targets = raws.filter((r) => hasBlocker.has(r.id));
  console.log(`  questões alvo: ${targets.length} (raws=${raws.length}, issues unresolved=${issues.length})`);
  if (targets.length === 0) return;

  // Issue groups per question (for later resolution).
  const issuesByRaw = new Map<string, Array<{ id: string }>>();
  for (const i of issues) {
    if (!hasBlocker.has(i.question_raw_id)) continue;
    const list = issuesByRaw.get(i.question_raw_id) ?? [];
    list.push({ id: i.id });
    issuesByRaw.set(i.question_raw_id, list);
  }

  // 3. Review in batches.
  const batches: QuestionForReview[][] = [];
  for (let i = 0; i < targets.length; i += REVIEWER_BATCH_SIZE) {
    batches.push(targets.slice(i, i + REVIEWER_BATCH_SIZE));
  }
  const batchesStarted = Date.now();
  const allReviews = (
    await Promise.all(
      batches.map(async (batch, i) => {
        const t0 = Date.now();
        let reviews: ReviewItem[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            reviews = await reviewBatch(batch);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`  [REVIEWER] batch ${i + 1} attempt ${attempt + 1} failed: ${msg}`);
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  [REVIEWER] batch ${i + 1}/${batches.length} → ${reviews.length} reviews (${sec}s)`);
        return reviews;
      }),
    )
  ).flat();
  console.log(`  [REVIEWER] ${allReviews.length} total reviews (${((Date.now() - batchesStarted) / 1000).toFixed(1)}s)`);

  // 4. For each reviewed question: resolve OLD issues, insert NEW, update status.
  const byNumero = new Map<number, QuestionForReview>();
  for (const q of targets) byNumero.set(q.numero, q);

  let nowApproved = 0;
  let stillFlagged = 0;
  const newIssueRows: Record<string, unknown>[] = [];
  const oldIssueIdsToResolve: string[] = [];
  const statusUpdates: Array<{ id: string; status: string }> = [];

  for (const r of allReviews) {
    const q = byNumero.get(r.numero);
    if (!q) continue;

    const issues = r.issues ?? [];
    const hasBlockingIssue = issues.some(
      (i) =>
        i.severity === "high" ||
        i.severity === "critical" ||
        ["contaminacao", "alternativas_incorretas", "gabarito_invalido"].includes(i.issue_type),
    );
    const nextStatus = r.approved && !hasBlockingIssue ? "approved" : "flagged";
    if (nextStatus === "approved") nowApproved++; else stillFlagged++;

    const oldIssues = issuesByRaw.get(q.id) ?? [];
    for (const oi of oldIssues) oldIssueIdsToResolve.push(oi.id);

    for (const issue of issues) {
      newIssueRows.push({
        question_raw_id: q.id,
        issue_type: issue.issue_type,
        severity: issue.severity,
        description: issue.description,
        agent: "reviewer",
      });
    }
    statusUpdates.push({ id: q.id, status: nextStatus });
  }

  // 4a. Resolve old issues.
  for (let i = 0; i < oldIssueIdsToResolve.length; i += CHUNK) {
    const slice = oldIssueIdsToResolve.slice(i, i + CHUNK);
    await withRetry<unknown>(
      `resolve old ${i}`,
      () => supabase
        .from("question_issues")
        .update({ resolved: true, resolution: "superseded by re-reviewer (Fase B)" })
        .in("id", slice) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>,
    );
  }
  // 4b. Insert new issues.
  if (newIssueRows.length) {
    for (let i = 0; i < newIssueRows.length; i += CHUNK) {
      const slice = newIssueRows.slice(i, i + CHUNK);
      await withRetry<unknown>(
        `insert new ${i}`,
        () => supabase.from("question_issues").insert(slice) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>,
      );
    }
  }
  // 4c. Update statuses.
  for (const u of statusUpdates) {
    await withRetry<unknown>(
      `status ${u.id}`,
      () => supabase.from("question_raw").update({ status: u.status }).eq("id", u.id) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>,
    );
  }

  console.log(
    `  done: ${nowApproved} now approved, ${stillFlagged} still flagged, ` +
      `${oldIssueIdsToResolve.length} old issues resolved, ${newIssueRows.length} new issues inserted`,
  );
}

async function main() {
  const examIds = process.argv.slice(2);
  if (examIds.length === 0) {
    console.error("Uso: npx tsx scripts/re-review-flagged.ts <exam_id> [<exam_id> ...]");
    process.exit(1);
  }
  for (const id of examIds) {
    await processExam(id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
