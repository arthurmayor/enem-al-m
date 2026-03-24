#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E"
);

const LABELS = ["A", "B", "C", "D", "E"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  // Fetch all questions
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, options, correct_answer");

  if (error) {
    console.error("Erro ao buscar questões:", error.message || error);
    if (String(error.message).includes("fetch failed")) {
      console.error("\n⚠️  Sem acesso à rede. Rode localmente com:\n  node scripts/fix-letter-bias.mjs\n");
    }
    process.exit(1);
  }

  // Filter questions where correct answer is B
  const biased = questions.filter(q => {
    const correct = (q.options || []).find(o => o.is_correct === true);
    return correct && correct.label?.toUpperCase() === "B";
  });

  console.log(`Total de questões: ${questions.length}`);
  console.log(`Questões com resposta correta = B: ${biased.length}`);

  if (biased.length === 0) {
    console.log("Nenhuma questão para corrigir.");
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const q of biased) {
    // Extract option texts and is_correct, then shuffle
    const optionData = q.options.map(o => ({ text: o.text, is_correct: o.is_correct }));
    const shuffled = shuffle(optionData);

    // Re-assign labels A-E
    const newOptions = shuffled.map((o, i) => ({
      label: LABELS[i],
      text: o.text,
      is_correct: o.is_correct,
    }));

    // Find new correct answer label
    const newCorrect = newOptions.find(o => o.is_correct)?.label;

    const { error: updateErr } = await supabase
      .from("questions")
      .update({ options: newOptions, correct_answer: newCorrect })
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
    console.log("\nNova distribuição de letra correta:");
    console.log("  " + LABELS.map(l => `${l}: ${(dist[l] / total * 100).toFixed(1)}%`).join(" | "));
  }
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
