#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E"
);

const VALID_SUBJECTS = ["Português","Matemática","História","Geografia","Biologia","Física","Química","Inglês","Filosofia"];
const VALID_ELOS = [900, 1050, 1200, 1400, 1600];

async function main() {
  // Debug: test connectivity and table access
  console.log("Testando acesso às tabelas...");
  const { data: debugDiag, error: debugE1 } = await supabase.from("diagnostic_questions").select("id").limit(5);
  const { data: debugQuest, error: debugE2 } = await supabase.from("questions").select("id").limit(5);
  console.log(`  diagnostic_questions: ${debugE1 ? "ERRO: " + debugE1.message : (debugDiag || []).length + " amostra(s)"}`);
  console.log(`  questions: ${debugE2 ? "ERRO: " + debugE2.message : (debugQuest || []).length + " amostra(s)"}`);

  if ((debugE1 && String(debugE1.message).includes("fetch failed")) || (debugE2 && String(debugE2.message).includes("fetch failed"))) {
    console.error("\n⚠️  Sem acesso à rede. Rode localmente com:\n  node scripts/qa-parte1-questoes.mjs\n");
    process.exit(1);
  }

  // Fetch all questions from both tables (paginate to avoid 1000-row default limit)
  let diagQ = [];
  let questQ = [];
  let e1 = null, e2 = null;

  // Paginate diagnostic_questions
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from("diagnostic_questions").select("*").range(offset, offset + 999);
    if (error) { e1 = error; break; }
    if (!data || data.length === 0) break;
    diagQ.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Paginate questions
  offset = 0;
  while (true) {
    const { data, error } = await supabase.from("questions").select("*").range(offset, offset + 999);
    if (error) { e2 = error; break; }
    if (!data || data.length === 0) break;
    questQ.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (e1) { console.error("Erro diagnostic_questions:", e1.message || e1); }
  if (e2) { console.error("Erro questions:", e2.message || e2); }

  const diagCount = diagQ.length;
  const questCount = questQ.length;

  // Deduplicate by id
  const seen = new Set();
  const all = [];
  for (const q of [...(diagQ || []), ...(questQ || [])]) {
    if (!seen.has(q.id)) { seen.add(q.id); all.push(q); }
  }

  const bugs = [];
  const suspects = [];
  const noExplanation = [];
  const subjectDist = {};
  const diffDist = {};
  const letterDist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let totalWithCorrect = 0;

  for (const q of all) {
    const sid = q.id?.substring(0, 8);
    const opts = q.options || [];

    // 1. 5 alternativas
    if (opts.length !== 5) bugs.push(`Questão ${sid}: tem ${opts.length} alternativas`);

    // 2. Exatamente 1 correta
    const correct = opts.filter(o => o.is_correct === true);
    if (correct.length !== 1) bugs.push(`Questão ${sid}: tem ${correct.length} respostas corretas`);

    // 3. question_text
    const txt = (q.question_text || "").trim();
    if (!txt) bugs.push(`Questão ${sid}: sem enunciado`);
    else if (txt.length <= 20) suspects.push(`Questão ${sid}: enunciado muito curto (${txt.length} chars): '${txt.substring(0, 50)}'`);

    // 4. Alternativas diferentes
    const texts = opts.map(o => (o.text || "").trim().toLowerCase());
    if (texts.length > 0 && new Set(texts).size < texts.length) bugs.push(`Questão ${sid}: alternativas duplicadas`);

    // 5. subject válido
    if (!VALID_SUBJECTS.includes(q.subject)) bugs.push(`Questão ${sid}: matéria inválida '${q.subject}'`);

    // 6. difficulty 1-5
    if (q.difficulty == null || q.difficulty < 1 || q.difficulty > 5) bugs.push(`Questão ${sid}: dificuldade inválida: ${q.difficulty}`);

    // 7. difficulty_elo
    if (q.difficulty_elo != null && !VALID_ELOS.includes(q.difficulty_elo)) suspects.push(`Questão ${sid}: elo=${q.difficulty_elo} não padrão`);

    // 8. explanation
    if (!q.explanation || q.explanation.trim() === "") noExplanation.push(sid);

    // Distributions
    subjectDist[q.subject] = (subjectDist[q.subject] || 0) + 1;
    if (q.difficulty) diffDist[q.difficulty] = (diffDist[q.difficulty] || 0) + 1;

    if (correct.length === 1) {
      const lbl = correct[0].label?.toUpperCase();
      if (lbl && letterDist[lbl] !== undefined) { letterDist[lbl]++; totalWithCorrect++; }
    }
  }

  // 9. Viés de letra
  const letterWarnings = [];
  if (totalWithCorrect > 0) {
    for (const [letter, count] of Object.entries(letterDist)) {
      const pct = count / totalWithCorrect * 100;
      if (pct > 40) letterWarnings.push(`${pct.toFixed(1)}% das questões têm resposta ${letter} — possível viés`);
    }
  }

  // ─── Relatório ───
  console.log("\n═══ RELATÓRIO DE QUALIDADE DO BANCO ═══\n");
  console.log(`Total: ${all.length} questões (${diagCount} em diagnostic_questions, ${questCount} em questions)`);
  console.log(`Válidas: ${all.length - bugs.length} | Com bugs: ${bugs.length} | Suspeitas: ${suspects.length} | Sem explicação: ${noExplanation.length}`);

  console.log("\nDistribuição por matéria:");
  console.log("  " + VALID_SUBJECTS.map(s => `${s}: ${subjectDist[s] || 0}`).join(" | "));

  console.log("\nDistribuição por dificuldade:");
  console.log("  " + [1,2,3,4,5].map(d => `${d}: ${diffDist[d] || 0}`).join(" | "));

  console.log("\nDistribuição de letra correta:");
  console.log("  " + ["A","B","C","D","E"].map(l => `${l}: ${totalWithCorrect > 0 ? (letterDist[l]/totalWithCorrect*100).toFixed(1) : "0.0"}%`).join(" | "));

  if (letterWarnings.length > 0) {
    console.log("\nAvisos de viés:");
    letterWarnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  if (bugs.length > 0) {
    console.log(`\nBugs encontrados (${bugs.length}):`);
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  }

  if (suspects.length > 0) {
    console.log(`\nSuspeitas (${suspects.length}):`);
    suspects.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }

  if (noExplanation.length > 0) {
    console.log(`\nSem explicação (${noExplanation.length}): ${noExplanation.join(", ")}`);
  }

  console.log("\n═══════════════════════════════════════\n");
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
