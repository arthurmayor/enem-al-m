#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LABELS = ["A", "B", "C", "D", "E"];

function shuffleGuaranteeMove(options, oldCorrectLabel) {
  // Shuffle until the correct answer lands on a DIFFERENT label
  const items = options.map(o => ({ text: o.text, is_correct: o.is_correct }));
  for (let attempt = 0; attempt < 50; attempt++) {
    // Fisher-Yates shuffle
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Check if the correct answer moved to a different position
    const newCorrectIdx = shuffled.findIndex(o => o.is_correct);
    const newLabel = LABELS[newCorrectIdx];
    if (newLabel !== oldCorrectLabel) {
      return shuffled.map((o, i) => ({ label: LABELS[i], text: o.text, is_correct: o.is_correct }));
    }
  }
  // Fallback: manually swap correct with a random wrong position
  const shuffled = [...items];
  const correctIdx = shuffled.findIndex(o => o.is_correct);
  const otherIdxs = LABELS.map((_, i) => i).filter(i => i !== correctIdx);
  const swapIdx = otherIdxs[Math.floor(Math.random() * otherIdxs.length)];
  [shuffled[correctIdx], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[correctIdx]];
  return shuffled.map((o, i) => ({ label: LABELS[i], text: o.text, is_correct: o.is_correct }));
}

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

  // Show current distribution
  const distBefore = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let totalBefore = 0;
  for (const q of questions) {
    const c = (q.options || []).find(o => o.is_correct);
    if (c?.label) { distBefore[c.label.toUpperCase()]++; totalBefore++; }
  }
  console.log("Distribuição ANTES:");
  console.log("  " + LABELS.map(l => `${l}: ${totalBefore > 0 ? (distBefore[l] / totalBefore * 100).toFixed(1) : "0.0"}%`).join(" | "));

  // Find the most common letter
  const maxLetter = Object.entries(distBefore).sort((a, b) => b[1] - a[1])[0];
  const threshold = totalBefore / 5; // 20% is ideal
  const excess = Math.floor(maxLetter[1] - threshold);

  // Filter questions where correct answer is the over-represented letter
  const biased = questions.filter(q => {
    const correct = (q.options || []).find(o => o.is_correct === true);
    return correct && correct.label?.toUpperCase() === maxLetter[0];
  });

  console.log(`\nLetra mais comum: ${maxLetter[0]} (${maxLetter[1]} questões, ${(maxLetter[1] / totalBefore * 100).toFixed(1)}%)`);
  console.log(`Excesso sobre 20%: ~${excess} questões`);
  console.log(`Total a redistribuir: ${biased.length} questões com resposta ${maxLetter[0]}`);

  if (biased.length === 0) {
    console.log("Nenhuma questão para corrigir.");
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const q of biased) {
    const correctOpt = q.options.find(o => o.is_correct === true);
    const oldLabel = correctOpt?.label?.toUpperCase();
    if (!oldLabel) continue;

    const newOptions = shuffleGuaranteeMove(q.options, oldLabel);

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
