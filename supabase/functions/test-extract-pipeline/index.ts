import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "exam-files";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST com multipart/form-data." }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes" }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Falha ao ler multipart/form-data: ${msg}` }, 400);
  }

  const prova = form.get("prova");
  const gabarito = form.get("gabarito");
  const bancaRaw = String(form.get("banca") ?? "").trim();
  const anoRaw = String(form.get("ano") ?? "").trim();
  const fase = (String(form.get("fase") ?? "").trim() || "1");
  const versao = (String(form.get("versao") ?? "").trim() || "V1");

  if (!(prova instanceof File)) {
    return jsonResponse({ error: "Campo 'prova' (PDF) é obrigatório" }, 400);
  }
  if (!bancaRaw) {
    return jsonResponse({ error: "Campo 'banca' é obrigatório" }, 400);
  }
  const ano = Number.parseInt(anoRaw, 10);
  if (!Number.isFinite(ano)) {
    return jsonResponse({ error: "Campo 'ano' deve ser um inteiro" }, 400);
  }

  const bancaSlug = slugify(bancaRaw);
  const faseSlug = slugify(fase) || "1";
  const versaoForFile = versao.replace(/[^A-Za-z0-9]+/g, "");
  const baseName = `${bancaSlug}-${ano}-fase${faseSlug}-${versaoForFile}`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ───── 1. Upsert exam row ─────
  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .upsert(
      { banca: bancaRaw, ano, fase, versao },
      { onConflict: "banca,ano,fase,versao" },
    )
    .select("id")
    .single();

  if (examErr || !exam) {
    return jsonResponse(
      { error: `Falha no upsert de exams: ${examErr?.message ?? "unknown"}` },
      500,
    );
  }
  const examId = exam.id as string;

  // ───── 2. Upload prova (and gabarito when provided) ─────
  const uploaded: Record<string, string> = {};
  const uploads: Array<{ field: "prova" | "gabarito"; file: File; suffix: string }> = [
    { field: "prova", file: prova, suffix: "prova" },
  ];
  if (gabarito instanceof File) {
    uploads.push({ field: "gabarito", file: gabarito, suffix: "gabarito" });
  }

  for (const u of uploads) {
    const fileName = `${baseName}-${u.suffix}.pdf`;
    const bytes = new Uint8Array(await u.file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(fileName, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      return jsonResponse(
        { error: `Falha ao fazer upload de ${u.field}: ${upErr.message}` },
        500,
      );
    }
    uploaded[u.field] = `${BUCKET}/${fileName}`;
  }

  // ───── 3. Invoke extract-exam ─────
  const extractUrl = `${SUPABASE_URL}/functions/v1/extract-exam`;
  const extractRes = await fetch(extractUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      exam_id: examId,
      prova_storage_path: uploaded.prova,
      gabarito_storage_path: uploaded.gabarito,
    }),
  });

  const extractText = await extractRes.text();
  let extractData: unknown;
  try {
    extractData = JSON.parse(extractText);
  } catch {
    extractData = { raw: extractText };
  }

  return jsonResponse(
    {
      exam_id: examId,
      uploaded,
      extract_status: extractRes.status,
      extract: extractData,
    },
    extractRes.ok ? 200 : extractRes.status,
  );
});
