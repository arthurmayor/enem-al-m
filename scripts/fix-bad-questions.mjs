#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = ["diagnostic_questions", "questions"];

async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("id, question_text, options, is_active").range(offset, offset + 999);
    if (error) { console.error(`Erro lendo ${table}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function hasDuplicateOptions(options) {
  if (!options || options.length === 0) return false;
  const texts = options.map(o => (o.text || "").trim().toLowerCase());
  return new Set(texts).size < texts.length;
}

function hasShortPrompt(questionText) {
  return !questionText || questionText.trim().length < 25;
}

async function main() {
  console.log("═══ FIX BAD QUESTIONS ═══\n");

  let totalDeactivated = 0;

  for (const table of TABLES) {
    console.log(`Verificando ${table}...`);
    const rows = await fetchAll(table);
    console.log(`  Total: ${rows.length} questões`);

    const toDeactivate = [];

    for (const q of rows) {
      const sid = q.id?.substring(0, 8);
      const reasons = [];

      if (hasDuplicateOptions(q.options)) {
        reasons.push("alternativas duplicadas");
      }
      if (hasShortPrompt(q.question_text)) {
        reasons.push(`enunciado curto (${(q.question_text || "").trim().length} chars)`);
      }

      if (reasons.length > 0) {
        toDeactivate.push({ id: q.id, sid, reasons, wasActive: q.is_active !== false });
      }
    }

    if (toDeactivate.length === 0) {
      console.log("  Nenhuma questão com problemas.\n");
      continue;
    }

    console.log(`  Encontradas: ${toDeactivate.length} questões com problemas`);

    let deactivated = 0;
    let alreadyInactive = 0;

    for (const q of toDeactivate) {
      if (!q.wasActive) {
        alreadyInactive++;
        console.log(`  ${q.sid}... já inativa (${q.reasons.join(", ")})`);
        continue;
      }

      const { error } = await supabase
        .from(table)
        .update({ is_active: false })
        .eq("id", q.id);

      if (error) {
        console.error(`  ${q.sid}... ERRO: ${error.message}`);
      } else {
        deactivated++;
        console.log(`  ${q.sid}... desativada (${q.reasons.join(", ")})`);
      }
    }

    totalDeactivated += deactivated;
    console.log(`  Desativadas: ${deactivated} | Já inativas: ${alreadyInactive}\n`);
  }

  console.log(`Total desativadas nesta execução: ${totalDeactivated}`);
  console.log("\n═════════════════════════\n");
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
