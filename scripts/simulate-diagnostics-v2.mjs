#!/usr/bin/env node
/**
 * Simulador de Diagnósticos v3 — Análise de Sensibilidade com blend 0.95 e sigma corrigido
 * 100% offline — sem Supabase. Fórmulas EXATAS do DiagnosticTest.tsx corrigido.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Elo Functions (EXACT copy from DiagnosticTest.tsx CORRIGIDO) ────────────

function eloExpected(studentElo, questionElo) {
  return 1 / (1 + Math.pow(10, (questionElo - studentElo) / 400));
}
function eloUpdate(rating, expected, actual, k) {
  return rating + k * (actual - expected);
}
function getKFactor(numAttempts, totalQuestionsForSubject) {
  const baseK = numAttempts < 10 ? 32 : numAttempts < 30 ? 16 : 8;
  if (totalQuestionsForSubject <= 3) return Math.round(baseK * 1.5);
  return baseK;
}
function expectedAccuracy(studentElo, meanDiff, sdDiff) {
  const grid = [-2.0, -1.5, -1.0, -0.5, -0.25, 0, 0.25, 0.5, 1.0, 1.5, 2.0];
  const weights = [0.02, 0.05, 0.10, 0.15, 0.18, 0.18, 0.15, 0.10, 0.05, 0.02, 0.00];
  let totalP = 0;
  for (let i = 0; i < grid.length; i++) {
    const qDiff = meanDiff + grid[i] * sdDiff;
    totalP += (1 / (1 + Math.pow(10, (qDiff - studentElo) / 400))) * weights[i];
  }
  return totalP;
}

// CORRIGIDO v2: blend acerto direto + Elo
function estimateScore(proficiencies, subjectDist, totalDiagnosticQuestions, totalDiagnosticCorrect, totalSimulados = 0, totalQuestionsEver = 0) {
  // === ACERTO DIRETO ===
  const rawAccuracyRate = totalDiagnosticQuestions > 0 ? totalDiagnosticCorrect / totalDiagnosticQuestions : 0;
  const directScore = rawAccuracyRate * 90;

  // === ACERTO POR ELO ===
  let eloScore = 0;
  let totalQInDist = 0;
  for (const [subject, dist] of Object.entries(subjectDist)) {
    const elo = proficiencies[subject]?.elo || 1200;
    eloScore += expectedAccuracy(elo, dist.meanDiff, dist.sdDiff) * dist.questions;
    totalQInDist += dist.questions;
  }
  if (totalQInDist !== 90 && totalQInDist > 0) {
    eloScore = (eloScore / totalQInDist) * 90;
  }

  // === BLEND ===
  const dataVolume = (totalQuestionsEver || totalDiagnosticQuestions) + (totalSimulados * 90);
  let directWeight;
  if (totalSimulados === 0 && dataVolume <= 50) directWeight = 0.95;
  else if (dataVolume <= 50) directWeight = 0.70;
  else if (dataVolume <= 200) directWeight = 0.50;
  else if (dataVolume <= 500) directWeight = 0.25;
  else directWeight = 0.10;

  let score = directScore * directWeight + eloScore * (1 - directWeight);

  // === Sanity checks ===
  if (score > 90) score = 90;
  if (score < 0) score = 0;
  const maxReasonableScore = rawAccuracyRate * 90 * 1.2;
  if (score > maxReasonableScore && rawAccuracyRate > 0) score = maxReasonableScore;

  return Math.round(score * 10) / 10;
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

// CORRIGIDO: safeCutoffSd capped at 5
function calculatePassProbability(score, cutoffMean, cutoffSd, questionsAnswered, simulados, subjectsCovered) {
  const safeCutoffSd = Math.min(cutoffSd, 5);
  const infoScore = (questionsAnswered / 100) + (simulados * 3) + (subjectsCovered * 0.5);
  const sigmaStudent = Math.max(7, 16 / Math.sqrt(Math.max(0.1, infoScore)));
  const muDiff = score - cutoffMean;
  const sigmaDiff = Math.sqrt(sigmaStudent ** 2 + safeCutoffSd ** 2);
  const raw = normalCDF(muDiff / sigmaDiff);
  return Math.max(0.01, Math.min(0.98, raw));
}

function getProbabilityBand(prob) {
  if (prob < 0.03) return { band: "< 3%", label: "Inicio da jornada" };
  if (prob < 0.10) return { band: "3-10%", label: "Distante da meta" };
  if (prob < 0.25) return { band: "10-25%", label: "Em construcao" };
  if (prob < 0.40) return { band: "25-40%", label: "Potencial" };
  if (prob < 0.55) return { band: "40-55%", label: "Competitivo" };
  if (prob < 0.70) return { band: "55-70%", label: "Forte candidato" };
  return { band: "> 70%", label: "Excelente posicao" };
}
function getLevel(elo) {
  if (elo >= 1500) return "Avancado";
  if (elo >= 1350) return "Bom";
  if (elo >= 1200) return "Intermediario";
  if (elo >= 1050) return "Baixo";
  return "Muito baixo";
}

// ─── Data ────────────────────────────────────────────────────────────────────

const DEFAULT_FUVEST_DISTRIBUTION = {
  "Portugues": { questions: 15, meanDiff: 1150, sdDiff: 250 },
  "Matematica": { questions: 12, meanDiff: 1300, sdDiff: 300 },
  "Historia": { questions: 12, meanDiff: 1200, sdDiff: 250 },
  "Geografia": { questions: 10, meanDiff: 1200, sdDiff: 250 },
  "Biologia": { questions: 10, meanDiff: 1200, sdDiff: 280 },
  "Fisica": { questions: 10, meanDiff: 1300, sdDiff: 300 },
  "Quimica": { questions: 8, meanDiff: 1250, sdDiff: 280 },
  "Ingles": { questions: 5, meanDiff: 1050, sdDiff: 200 },
  "Filosofia": { questions: 5, meanDiff: 1200, sdDiff: 250 },
  "Artes": { questions: 3, meanDiff: 1100, sdDiff: 200 },
};

const COURSES = [
  { slug: "administracao", name: "Administracao", cutoff_mean: 55, cutoff_sd: 2.0 },
  { slug: "direito", name: "Direito", cutoff_mean: 66, cutoff_sd: 2.0 },
  { slug: "medicina", name: "Medicina", cutoff_mean: 80, cutoff_sd: 2.0 },
];

const FALLBACK_SUBJECTS = ["Portugues", "Matematica", "Historia", "Geografia", "Biologia", "Fisica", "Quimica", "Ingles", "Filosofia"];
const DIFFICULTY_ELOS = [900, 1050, 1200, 1400, 1600];
const TOTAL_QUESTIONS = 30;

function generateFallbackQuestions() {
  const questions = [];
  for (let i = 0; i < 30; i++) {
    const subject = FALLBACK_SUBJECTS[i % FALLBACK_SUBJECTS.length];
    const diffIdx = Math.min(4, Math.floor(i / 6));
    questions.push({ id: `fallback-${i}`, subject, difficulty_elo: DIFFICULTY_ELOS[diffIdx] });
  }
  return questions;
}

const SUBJECT_ORDER = [...FALLBACK_SUBJECTS];
function interleaveQuestions(questions, total) {
  const bySubject = {};
  for (const q of questions) { if (!bySubject[q.subject]) bySubject[q.subject] = []; bySubject[q.subject].push(q); }
  for (const subj of Object.keys(bySubject)) bySubject[subj].sort(() => Math.random() - 0.5);
  const result = [], indices = {};
  for (const s of Object.keys(bySubject)) indices[s] = 0;
  let round = 0;
  while (result.length < total) {
    let added = false;
    for (const subj of SUBJECT_ORDER) {
      if (result.length >= total) break;
      const pool = bySubject[subj]; if (!pool) continue;
      const idx = indices[subj] ?? 0;
      if (idx < pool.length) { result.push(pool[idx]); indices[subj] = idx + 1; added = true; }
    }
    for (const subj of Object.keys(bySubject)) {
      if (result.length >= total || SUBJECT_ORDER.includes(subj)) continue;
      const pool = bySubject[subj]; const idx = indices[subj] ?? 0;
      if (idx < pool.length) { result.push(pool[idx]); indices[subj] = idx + 1; added = true; }
    }
    round++; if (!added || round > 100) break;
  }
  return result.slice(0, total);
}

// ─── Simulation Engine ───────────────────────────────────────────────────────

function runOneDiagnostic(questions, course) {
  const examConfig = { subject_distribution: DEFAULT_FUVEST_DISTRIBUTION, cutoff_mean: course.cutoff_mean, cutoff_sd: course.cutoff_sd };
  const proficiencies = {};
  let totalCorrect = 0;

  // Pre-compute subject counts
  const subjectCounts = {};
  for (const q of questions) subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;

  return (answerFn) => {
    // Reset
    for (const k of Object.keys(proficiencies)) delete proficiencies[k];
    totalCorrect = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const isCorrect = answerFn(q, i, questions.length);
      if (!proficiencies[q.subject]) proficiencies[q.subject] = { elo: 1200, correct: 0, total: 0 };
      const subj = proficiencies[q.subject];
      const exp = eloExpected(subj.elo, q.difficulty_elo);
      const k = getKFactor(subj.total, subjectCounts[q.subject]);
      subj.elo = eloUpdate(subj.elo, exp, isCorrect ? 1 : 0, k);
      subj.total += 1;
      if (isCorrect) { subj.correct += 1; totalCorrect += 1; }
    }

    const score = estimateScore(proficiencies, examConfig.subject_distribution, TOTAL_QUESTIONS, totalCorrect, 0, TOTAL_QUESTIONS);
    const subjectsCovered = Object.keys(proficiencies).length;
    const probability = calculatePassProbability(score, examConfig.cutoff_mean, examConfig.cutoff_sd, TOTAL_QUESTIONS, 0, subjectsCovered);
    const probBand = getProbabilityBand(probability);
    const profRounded = {};
    for (const [s, p] of Object.entries(proficiencies)) {
      profRounded[s] = { elo: Math.round(p.elo), correct: p.correct, total: p.total, pct: Math.round((p.correct / p.total) * 100), level: getLevel(p.elo) };
    }
    return {
      totalCorrect, pctCorrect: Math.round((totalCorrect / questions.length) * 100),
      estimatedScore: score, cutoffMean: examConfig.cutoff_mean, cutoffSd: examConfig.cutoff_sd,
      gap: Math.round((score - examConfig.cutoff_mean) * 10) / 10,
      probability: Math.round(probability * 10000) / 100,
      probabilityBand: probBand.band, probabilityLabel: probBand.label,
      subjectsCovered, proficiencies: profRounded,
    };
  };
}

// ─── Strategies ──────────────────────────────────────────────────────────────

const exatas = ["Matematica", "Fisica", "Quimica"];
const humanas = ["Portugues", "Historia", "Geografia", "Filosofia"];

function buildStrategies() {
  const s = [];

  // Fixed accuracy (11) — will run per course = 33
  for (let pct = 0; pct <= 100; pct += 10) {
    s.push({ name: `fixed_${pct}pct`, desc: `Acerta exatamente ${pct}%`, cat: "fixed_accuracy", param: pct,
      fn: (_q, i, tot) => i < Math.round(tot * pct / 100) });
  }

  // Realistic profiles (5 types x 4 trials = 20)
  const profiles = [
    { name: "pessimo", desc: "Aluno pessimo ~17%", pFn: () => Math.random() < 0.17 },
    { name: "fraco", desc: "Aluno fraco ~30%, forte humanas", pFn: (q) => humanas.includes(q.subject) ? Math.random() < 0.45 : Math.random() < 0.15 },
    { name: "mediano", desc: "Aluno mediano ~47%", pFn: () => Math.random() < 0.47 },
    { name: "bom", desc: "Aluno bom ~67%, fraco em 2 materias", pFn: (q) => (q.subject === "Fisica" || q.subject === "Quimica") ? Math.random() < 0.3 : Math.random() < 0.75 },
    { name: "excelente", desc: "Aluno excelente ~87%", pFn: () => Math.random() < 0.87 },
  ];
  for (const p of profiles) {
    for (let t = 1; t <= 4; t++) {
      s.push({ name: `${p.name}_t${t}`, desc: `${p.desc} (trial ${t})`, cat: "realistic_profile", param: p.name, fn: p.pFn });
    }
  }

  // Edge cases (15)
  for (let t = 1; t <= 5; t++) {
    s.push({ name: `chute_puro_t${t}`, desc: `Chute puro ~20% (trial ${t})`, cat: "edge_guess", param: "guess", fn: () => Math.random() < 0.2 });
  }
  s.push({ name: "so_portugues", desc: "100% Portugues, 0% resto", cat: "edge_subject", param: "port",
    fn: (q) => q.subject === "Portugues" });
  s.push({ name: "so_matematica", desc: "100% Matematica, 0% resto", cat: "edge_subject", param: "mat",
    fn: (q) => q.subject === "Matematica" });
  s.push({ name: "acerta_faceis", desc: "Acerta se difficulty_elo < 1200", cat: "edge_diff", param: 1200,
    fn: (q) => q.difficulty_elo < 1200 });
  s.push({ name: "acerta_dificeis", desc: "Acerta dificeis (>1300), erra faceis", cat: "edge_diff", param: "inverse",
    fn: (q) => q.difficulty_elo > 1300 ? Math.random() < 0.85 : q.difficulty_elo < 1100 ? Math.random() < 0.15 : Math.random() < 0.5 });
  s.push({ name: "fadiga", desc: "Comeca 90% termina 20%", cat: "edge_temporal", param: "fatigue",
    fn: (_q, i, tot) => Math.random() < (0.9 - 0.7 * (i / (tot - 1))) });
  s.push({ name: "aquecimento", desc: "Comeca 20% termina 90%", cat: "edge_temporal", param: "warmup",
    fn: (_q, i, tot) => Math.random() < (0.2 + 0.7 * (i / (tot - 1))) });
  s.push({ name: "alternado", desc: "Acerta/erra intercalado 50%", cat: "edge_pattern", param: "alt",
    fn: (_q, i) => i % 2 === 0 });

  // Elo realistic (10)
  for (const trueElo of [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800]) {
    s.push({ name: `elo_${trueElo}`, desc: `Aluno Elo real ${trueElo}`, cat: "elo_realistic", param: trueElo,
      fn: (q) => Math.random() < eloExpected(trueElo, q.difficulty_elo) });
  }

  // Monotonicity meta-test (12) — fixed deterministic
  for (let step = 0; step < 12; step++) {
    const pct = Math.round((step / 11) * 100);
    s.push({ name: `mono_${String(pct).padStart(3, "0")}pct`, desc: `Monotonicidade ${pct}%`, cat: "monotonicity", param: pct,
      fn: (_q, i, tot) => i < Math.round(tot * pct / 100) });
  }

  return s;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Simulador de Diagnosticos v3 — blend 0.95 + sigma corrigido\n");

  const baseQuestions = generateFallbackQuestions();
  const strategies = buildStrategies();
  const distTotal = Object.values(DEFAULT_FUVEST_DISTRIBUTION).reduce((s, d) => s + d.questions, 0);
  console.log(`Questoes: 30 fallback | subject_distribution soma: ${distTotal}`);
  console.log(`Estrategias: ${strategies.length} | Cursos: ${COURSES.length}`);
  console.log(`Total simulacoes: ${strategies.length * COURSES.length}\n`);

  const allResults = [];
  let simId = 0;

  for (const course of COURSES) {
    console.log(`\n--- ${course.name} (cutoff: ${course.cutoff_mean}) ---`);
    const questions = interleaveQuestions([...baseQuestions], TOTAL_QUESTIONS);
    const runner = runOneDiagnostic(questions, course);

    for (const strat of strategies) {
      simId++;
      const r = runner(strat.fn);

      // Flag logic — course-aware: BUG threshold scales with cutoff difficulty
      // For Medicina (cutoff 80/90=89%), 70-80% accuracy SHOULD have low probability
      const cutoffPct = course.cutoff_mean / 90;  // e.g., 0.89 for Medicina
      const bugThresholdAccuracy = Math.round(cutoffPct * 100) - 5;  // need near-cutoff to flag
      let flag = "OK";
      if (r.probability > 50 && r.pctCorrect < 30) flag = "BUG";
      else if (r.probability < 10 && r.pctCorrect > bugThresholdAccuracy) flag = "BUG";
      else {
        // Check Elo anomalies
        for (const [, prof] of Object.entries(r.proficiencies)) {
          if (prof.correct === 0 && prof.elo > 1150) { flag = "SUSPEITO"; break; }
        }
        // Check score vs linear projection
        const linearExpected = (r.pctCorrect / 100) * 90;
        if (Math.abs(r.estimatedScore - linearExpected) > linearExpected * 0.2 + 5) {
          if (flag === "OK") flag = "SUSPEITO";
        }
      }

      allResults.push({
        sim_id: simId, course: course.slug, course_name: course.name,
        cutoff_mean: course.cutoff_mean, cutoff_sd: course.cutoff_sd,
        strategy: strat.name, description: strat.desc, category: strat.cat, param: strat.param,
        flag, ...r,
      });

      const probBar = "#".repeat(Math.round(r.probability / 5)).padEnd(20, ".");
      const flagStr = flag === "OK" ? "  " : flag === "BUG" ? "!!" : "? ";
      console.log(
        `${flagStr} [${String(simId).padStart(3)}] ${strat.name.padEnd(24)} ${String(r.pctCorrect).padStart(3)}% -> Score:${String(r.estimatedScore).padStart(5)} Gap:${(r.gap >= 0 ? "+" : "") + String(r.gap).padStart(5)} Prob:${String(r.probability).padStart(5)}% ${probBar} ${r.probabilityBand}`
      );
    }
  }

  // ─── Monotonicity check ──────────────────────────────────────────────────
  console.log("\n=== MONOTONICITY CHECK ===");
  let totalViolations = 0;
  for (const course of COURSES) {
    const monoResults = allResults
      .filter(r => r.course === course.slug && r.category === "monotonicity")
      .sort((a, b) => a.pctCorrect - b.pctCorrect);
    let violations = 0;
    for (let i = 1; i < monoResults.length; i++) {
      if (monoResults[i].probability < monoResults[i - 1].probability) {
        violations++;
        console.log(`  VIOLATION [${course.name}]: ${monoResults[i].pctCorrect}% acerto -> ${monoResults[i].probability}% prob < ${monoResults[i - 1].pctCorrect}% -> ${monoResults[i - 1].probability}%`);
      }
    }
    if (violations === 0) console.log(`  ${course.name}: OK — monotonicity holds`);
    totalViolations += violations;
  }

  // ─── Success criteria check ──────────────────────────────────────────────
  console.log("\n=== SUCCESS CRITERIA ===");
  const checks = [];
  function checkCriteria(label, courseSl, pctCorrect, minProb, maxProb) {
    const match = allResults.find(r => r.course === courseSl && r.category === "fixed_accuracy" && r.param === pctCorrect);
    if (!match) { checks.push({ label, pass: false, actual: "NOT FOUND" }); return; }
    const pass = match.probability >= minProb && match.probability <= maxProb;
    checks.push({ label, pass, actual: match.probability, expected: `${minProb}-${maxProb}%` });
    console.log(`  ${pass ? "PASS" : "FAIL"} ${label}: prob=${match.probability}% (expected ${minProb}-${maxProb}%)`);
  }

  checkCriteria("0% acerto -> Direito < 5%", "direito", 0, 0, 5);
  checkCriteria("0% acerto -> Medicina < 5%", "medicina", 0, 0, 5);
  checkCriteria("0% acerto -> Admin < 5%", "administracao", 0, 0, 5);
  checkCriteria("20% acerto -> Direito < 10%", "direito", 20, 0, 10);
  checkCriteria("20% acerto -> Medicina < 5%", "medicina", 20, 0, 5);
  checkCriteria("50% acerto -> Direito < 5%", "direito", 50, 0, 5);
  checkCriteria("50% acerto -> Medicina < 5%", "medicina", 50, 0, 5);
  checkCriteria("70% acerto -> Direito 20-50%", "direito", 70, 20, 50);
  checkCriteria("70% acerto -> Medicina < 5%", "medicina", 70, 0, 5);
  checkCriteria("90% acerto -> Direito > 70%", "direito", 90, 70, 100);
  checkCriteria("90% acerto -> Medicina 40-60%", "medicina", 90, 40, 60);
  checkCriteria("100% acerto -> Direito > 85%", "direito", 100, 85, 100);
  checkCriteria("100% acerto -> Medicina > 85%", "medicina", 100, 85, 100);
  checkCriteria("100% acerto -> Admin > 85%", "administracao", 100, 85, 100);

  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass).length;
  console.log(`\n  Result: ${passed} PASS, ${failed} FAIL out of ${checks.length} criteria`);

  // ─── Summary stats ───────────────────────────────────────────────────────
  const okCount = allResults.filter(r => r.flag === "OK").length;
  const bugCount = allResults.filter(r => r.flag === "BUG").length;
  const suspectCount = allResults.filter(r => r.flag === "SUSPEITO").length;

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total: ${allResults.length} simulacoes`);
  console.log(`  OK: ${okCount} | BUG: ${bugCount} | SUSPEITO: ${suspectCount}`);
  console.log(`  Monotonicity violations: ${totalViolations}`);

  // ─── CSV ─────────────────────────────────────────────────────────────────
  const allSubjects = [...new Set(allResults.flatMap(r => Object.keys(r.proficiencies)))].sort();
  const csvH = ["sim_id","course","cutoff_mean","cutoff_sd","strategy","description","category","param","flag",
    "total_correct","pct_correct","estimated_score","gap","probability_pct","probability_band",
    ...allSubjects.flatMap(s => [`${s}_elo`, `${s}_pct`])];
  const csvRows = allResults.map(r => {
    const sc = allSubjects.flatMap(s => { const p = r.proficiencies[s]; return p ? [p.elo, p.pct] : ["", ""]; });
    return [r.sim_id, r.course, r.cutoffMean, r.cutoffSd, r.strategy, `"${r.description}"`, r.category, r.param, r.flag,
      r.totalCorrect, r.pctCorrect, r.estimatedScore, r.gap, r.probability, `"${r.probabilityBand}"`, ...sc].join(",");
  });
  writeFileSync(resolve(__dirname, "sensitivity-results-v2.csv"), [csvH.join(","), ...csvRows].join("\n"));

  // ─── JSON ────────────────────────────────────────────────────────────────
  writeFileSync(resolve(__dirname, "sensitivity-results-v2.json"), JSON.stringify({
    metadata: { generated_at: new Date().toISOString(), version: "v2", total_simulations: allResults.length,
      subject_distribution: DEFAULT_FUVEST_DISTRIBUTION, dist_total: distTotal, courses: COURSES, questions: "fallback_30" },
    results: allResults.map(r => ({ ...r, proficiencies: r.proficiencies })),
    summary: { ok: okCount, bug: bugCount, suspect: suspectCount, monotonicity_violations: totalViolations,
      success_criteria: checks },
    comparison_v1: { v1_all_98pct: true, v2_range: `${Math.min(...allResults.map(r => r.probability))}% - ${Math.max(...allResults.map(r => r.probability))}%` },
  }, null, 2));

  // ─── Markdown Report ─────────────────────────────────────────────────────
  let md = `# Analise de Sensibilidade v2 — pos-correcao de escala\n\n`;
  md += `**Data:** ${new Date().toISOString().split("T")[0]}\n`;
  md += `**Simulacoes:** ${allResults.length}\n`;
  md += `**Subject distribution soma:** ${distTotal} questoes\n\n`;
  md += `## Comparacao com v1\n\n`;
  md += `| Metrica | v1 (bugada) | v2 (corrigida) |\n|---|---|---|\n`;
  md += `| Range probabilidade | 98% - 98% | ${Math.min(...allResults.map(r => r.probability))}% - ${Math.max(...allResults.map(r => r.probability))}% |\n`;
  md += `| 0% acerto | 98% prob | ${allResults.find(r => r.course === "direito" && r.param === 0 && r.category === "fixed_accuracy")?.probability}% prob |\n`;
  md += `| 100% acerto | 98% prob | ${allResults.find(r => r.course === "direito" && r.param === 100 && r.category === "fixed_accuracy")?.probability}% prob |\n`;
  md += `| Diferencia resultados? | NAO | SIM |\n\n`;
  md += `## Resumo: ${okCount} OK, ${bugCount} BUG, ${suspectCount} SUSPEITO de ${allResults.length}\n\n`;
  md += `## Criterios de sucesso: ${passed} PASS, ${failed} FAIL\n\n`;
  for (const c of checks) md += `- ${c.pass ? "PASS" : "**FAIL**"} ${c.label}: actual=${c.actual}%, expected=${c.expected}\n`;
  md += `\n## Monotonicidade: ${totalViolations} violacoes\n\n`;

  // Per-course tables
  for (const course of COURSES) {
    md += `\n### ${course.name} (cutoff ${course.cutoff_mean})\n\n`;
    md += `| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |\n|---|---|---|---|---|---|---|\n`;
    const courseResults = allResults.filter(r => r.course === course.slug).sort((a, b) => a.pctCorrect - b.pctCorrect);
    for (const r of courseResults) {
      md += `| ${r.strategy} | ${r.pctCorrect}% | ${r.estimatedScore} | ${r.gap >= 0 ? "+" : ""}${r.gap} | ${r.probability}% | ${r.probabilityBand} | ${r.flag} |\n`;
    }
  }

  writeFileSync(resolve(__dirname, "SENSITIVITY-ANALYSIS-V2.md"), md);

  console.log(`\nFiles saved:`);
  console.log(`  scripts/sensitivity-results-v2.json`);
  console.log(`  scripts/sensitivity-results-v2.csv`);
  console.log(`  scripts/SENSITIVITY-ANALYSIS-V2.md`);
}

main();
