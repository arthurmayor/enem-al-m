/**
 * Standalone enricher: fills in enrichment for question_raw rows with
 * status='approved' that don't yet have enrichment. Used after an
 * out-of-band fix that moves flagged rows back to approved.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx tools/extraction/run-enricher-only.ts <exam_id>
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR/i.test(msg)) {
        const delay = 500 * Math.pow(2, i);
        console.warn(`[RETRY ${label}] ${msg} — retry in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const MODEL_SONNET = "claude-sonnet-4-20250514";
const BATCH_SIZE = 15;
const MAX_TOKENS = 8192;
const SUBJECTS = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Biologia",
  "Física",
  "Química",
  "Inglês",
  "Filosofia",
  "Sociologia",
  "Artes",
];

const ENR_SYSTEM = `Classifique cada questão por matéria e subtópico.
NÃO altere o texto das questões.
Subjects válidos: ${SUBJECTS.join(", ")}.
Difficulty: 1 (fácil) a 5 (muito difícil).
Chame a tool submit_enrichment com um item por questão recebida.
Campos:
- numero: inteiro igual ao recebido.
- subject: um dos subjects válidos.
- subtopic: string curta (ex.: "geometria espacial", "literatura modernista").
- difficulty: 1..5.
- tags: array de 1-5 palavras-chave.
- competency: descrição curta da competência avaliada.`;

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    enrichments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          subject: { type: "string", enum: SUBJECTS },
          subtopic: { type: "string" },
          difficulty: { type: "integer", minimum: 1, maximum: 5 },
          tags: { type: "array", items: { type: "string" } },
          competency: { type: "string" },
        },
        required: ["numero", "subject", "subtopic", "difficulty"],
      },
    },
  },
  required: ["enrichments"],
};

interface EnrichmentItem {
  numero: number;
  subject: string;
  subtopic: string;
  difficulty: number;
  tags?: string[];
  competency?: string;
}

interface QRow {
  id: string;
  numero: number;
  stem: string;
  options: unknown;
  shared_context: string | null;
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function enrichBatch(batch: QRow[]): Promise<EnrichmentItem[]> {
  const payload = batch.map((q) => ({
    numero: q.numero,
    stem: q.stem,
    options: q.options,
    shared_context: q.shared_context,
  }));
  const res = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: MAX_TOKENS,
    system: ENR_SYSTEM,
    tools: [
      {
        name: "submit_enrichment",
        description: "Submit subject/subtopic classification for a batch of questions.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: ENRICHMENT_SCHEMA as any,
      },
    ],
    tool_choice: { type: "tool", name: "submit_enrichment" },
    messages: [
      { role: "user", content: `Classifique as seguintes questões:\n${JSON.stringify(payload)}` },
    ],
  });
  const block = res.content.find((b) => b.type === "tool_use" && b.name === "submit_enrichment");
  if (!block || block.type !== "tool_use") {
    throw new Error(`submit_enrichment ausente (stop=${res.stop_reason})`);
  }
  const input = block.input as { enrichments?: EnrichmentItem[] };
  return input.enrichments ?? [];
}

async function main(examId: string) {
  const { data, error } = await withRetry(async () => {
    const res = await supabase
      .from("question_raw")
      .select("id, numero, stem, options, shared_context, enrichment")
      .eq("exam_id", examId)
      .eq("status", "approved")
      .order("numero", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return res;
  }, "enricher.load");
  if (error) throw new Error(`load: ${error.message}`);
  const rows = (data ?? []).filter(
    (r) => !r.enrichment || !(r.enrichment as { subject?: string }).subject,
  ) as (QRow & { enrichment: unknown })[];
  if (rows.length === 0) {
    console.log("[ENRICHER] nothing to enrich");
    return;
  }
  console.log(`[ENRICHER] ${rows.length} rows sem enrichment, batch_size=${BATCH_SIZE}`);

  const batches: QRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  const byNumero = new Map<number, QRow>();
  for (const q of rows) byNumero.set(q.numero, q);

  const allEnrichments = (
    await Promise.all(
      batches.map(async (batch, i) => {
        const started = Date.now();
        const enrichments = await enrichBatch(batch);
        const sec = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[ENRICHER] batch ${i + 1}/${batches.length} (${enrichments.length} itens, ${sec}s)`,
        );
        return enrichments;
      }),
    )
  ).flat();

  const bySubject: Record<string, number> = {};
  let persisted = 0;
  for (const e of allEnrichments) {
    const q = byNumero.get(e.numero);
    if (!q) continue;
    await withRetry(async () => {
      const r = await supabase.from("question_raw").update({ enrichment: e }).eq("id", q.id);
      if (r.error) throw new Error(r.error.message);
      return r;
    }, `persist q${e.numero}`);
    bySubject[e.subject] = (bySubject[e.subject] ?? 0) + 1;
    persisted++;
  }

  console.log(`[ENRICHER] persisted=${persisted}`);
  console.log(`[ENRICHER] by_subject=${JSON.stringify(bySubject)}`);
}

const examId = process.argv[2];
if (!examId) {
  console.error("Uso: npx tsx tools/extraction/run-enricher-only.ts <exam_id>");
  process.exit(1);
}
main(examId).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
