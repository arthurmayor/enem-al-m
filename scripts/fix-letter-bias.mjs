#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LABELS = ["A", "B", "C", "D", "E"];

async function main() {
  // Fetch all questions
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

  // Calculate current distribution
  const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let total = 0;
  for (const q of questions) {
    const c = (q.options || []).find(o => o.is_correct);
    if (c?.label) { dist[c.label.toUpperCase()]++; total++; }
  }

  console.log(`Total de questões: ${questions.length}`);
  console.log("Distribuição atual:");
  console.log("  " + LABELS.map(l => `${l}: ${total > 0 ? (dist[l] / total * 100).toFixed(1) : "0.0"}%`).join(" | "));

  // Check if distribution is already balanced (all letters between 15-25%)
  const allBalanced = total > 0 && LABELS.every(l => {
    const pct = dist[l] / total * 100;
    return pct >= 15 && pct <= 25;
  });

  if (allBalanced) {
    console.log("\nDistribuição já equilibrada, nenhuma alteração necessária.");
    return;
  }

  // Check if any letter is above 30% — only redistribute if so
  const maxPct = Math.max(...LABELS.map(l => dist[l] / total * 100));
  if (maxPct <= 30) {
    console.log(`\nNenhuma letra acima de 30% (máx: ${maxPct.toFixed(1)}%). Nenhuma alteração necessária.`);
    return;
  }

  console.log(`\nLetra com maior viés: ${maxPct.toFixed(1)}% — redistribuindo...`);

  // Filter valid questions (5 options, exactly 1 correct)
  const validQuestions = questions.filter(q => {
    const opts = q.options || [];
    const correct = opts.filter(o => o.is_correct === true);
    return opts.length === 5 && correct.length === 1;
  });

  // Shuffle the question order so the round-robin assignment is random
  const shuffled = [...validQuestions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  console.log(`Redistribuindo ${shuffled.length} questões válidas...`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const q = shuffled[i];
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
    const distAfter = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let totalAfter = 0;
    for (const q of after) {
      const c = (q.options || []).find(o => o.is_correct);
      if (c?.label) { distAfter[c.label.toUpperCase()]++; totalAfter++; }
    }
    console.log("\nDistribuição DEPOIS:");
    console.log("  " + LABELS.map(l => `${l}: ${totalAfter > 0 ? (distAfter[l] / totalAfter * 100).toFixed(1) : "0.0"}%`).join(" | "));
  }
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
