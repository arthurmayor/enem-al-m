#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LABELS = ["A", "B", "C", "D", "E"];

// ─── BUG 3+4: Deactivate known bad questions ───
const BAD_QUESTION_IDS = [
  "e9eea8af", // alternativas duplicadas
  "1d070b4e", // alternativas duplicadas
  "936a5e7d", // alternativas duplicadas
  "7ab98c95", // enunciado muito curto
];

async function deactivateBadQuestions() {
  console.log("Desativando questões com problemas conhecidos...");
  for (const prefix of BAD_QUESTION_IDS) {
    // Match by prefix since we only have the first 8 chars
    const { data: matches } = await supabase
      .from("diagnostic_questions")
      .select("id")
      .like("id", `${prefix}%`);

    if (matches && matches.length > 0) {
      for (const m of matches) {
        const { error } = await supabase
          .from("diagnostic_questions")
          .update({ is_active: false })
          .eq("id", m.id);
        if (error) console.error(`  Erro desativando ${prefix}: ${error.message}`);
        else console.log(`  Desativada: ${m.id.substring(0, 8)}...`);
      }
    }

    // Also check in questions table
    const { data: qMatches } = await supabase
      .from("questions")
      .select("id")
      .like("id", `${prefix}%`);

    if (qMatches && qMatches.length > 0) {
      for (const m of qMatches) {
        const { error } = await supabase
          .from("questions")
          .update({ is_active: false })
          .eq("id", m.id);
        if (error) console.error(`  Erro desativando ${prefix} (questions): ${error.message}`);
        else console.log(`  Desativada (questions): ${m.id.substring(0, 8)}...`);
      }
    }
  }
  console.log();
}

// ─── BUG 5: Uniform distribution — shuffle ALL questions ───
async function main() {
  // Step 1: Deactivate bad questions
  await deactivateBadQuestions();

  // Step 2: Fetch all questions
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, options");

  if (error) {
    console.error("Erro ao buscar questões:", error.message || error);
    if (String(error.message).includes("fetch failed")) {
      console.error("\n⚠️  Sem acesso à rede. Rode localmente com:\n  node scripts/fix-letter-bias.mjs\n");
    }
    process.exit(1);
  }

  // Show current distribution
  const distBefore = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let totalBefore = 0;
  for (const q of questions) {
    const c = (q.options || []).find(o => o.is_correct);
    if (c?.label) { distBefore[c.label.toUpperCase()]++; totalBefore++; }
  }
  console.log(`Total de questões: ${questions.length}`);
  console.log("Distribuição ANTES:");
  console.log("  " + LABELS.map(l => `${l}: ${totalBefore > 0 ? (distBefore[l] / totalBefore * 100).toFixed(1) : "0.0"}%`).join(" | "));

  // Step 3: Assign each question a target letter for the correct answer
  // to achieve ~20% per letter. Round-robin assignment ensures uniform distribution.
  const validQuestions = questions.filter(q => {
    const opts = q.options || [];
    const correct = opts.filter(o => o.is_correct === true);
    return opts.length === 5 && correct.length === 1;
  });

  // Shuffle the question order so the round-robin assignment is random
  const shuffledQuestions = [...validQuestions];
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
  }

  console.log(`\nRedistribuindo ${shuffledQuestions.length} questões válidas...`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < shuffledQuestions.length; i++) {
    const q = shuffledQuestions[i];
    const targetLabel = LABELS[i % 5]; // round-robin: A, B, C, D, E, A, B, ...

    const opts = q.options.map(o => ({ text: o.text, is_correct: o.is_correct }));
    const correctIdx = opts.findIndex(o => o.is_correct);
    const targetIdx = LABELS.indexOf(targetLabel);

    // Swap correct answer into the target position
    [opts[correctIdx], opts[targetIdx]] = [opts[targetIdx], opts[correctIdx]];

    // Shuffle the remaining (non-target) positions to randomize wrong answers
    const otherIdxs = LABELS.map((_, idx) => idx).filter(idx => idx !== targetIdx);
    for (let k = otherIdxs.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      const a = otherIdxs[k], b = otherIdxs[j];
      [opts[a], opts[b]] = [opts[b], opts[a]];
    }

    // Re-assign labels
    const newOptions = opts.map((o, idx) => ({
      label: LABELS[idx],
      text: o.text,
      is_correct: o.is_correct,
    }));

    const { error: updateErr } = await supabase
      .from("questions")
      .update({ options: newOptions })
      .eq("id", q.id);

    if (updateErr) {
      console.error(`  Erro questão ${q.id.substring(0, 8)}: ${updateErr.message}`);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`\n✅ Atualizadas: ${updated} | Erros: ${errors}`);

  // Verify new distribution
  const { data: after } = await supabase.from("questions").select("options");
  if (after) {
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let total = 0;
    for (const q of after) {
      const c = (q.options || []).find(o => o.is_correct);
      if (c?.label) { dist[c.label.toUpperCase()]++; total++; }
    }
    console.log("\nDistribuição DEPOIS:");
    console.log("  " + LABELS.map(l => `${l}: ${total > 0 ? (dist[l] / total * 100).toFixed(1) : "0.0"}%`).join(" | "));
  }
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
