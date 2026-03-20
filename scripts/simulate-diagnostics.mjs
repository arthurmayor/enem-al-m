#!/usr/bin/env node
/**
 * Simulador de Diagnósticos — Análise de Sensibilidade
 *
 * Reproduz EXATAMENTE as fórmulas do DiagnosticTest.tsx
 * e roda 75 simulações com diferentes padrões de resposta.
 *
 * Output: scripts/sensitivity-results.json + scripts/sensitivity-results.csv
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Elo Functions (EXACT copy from DiagnosticTest.tsx) ──────────────────────

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

function estimateScore(proficiencies, subjectDist) {
  let score = 0;
  for (const [subject, dist] of Object.entries(subjectDist)) {
    const elo = proficiencies[subject]?.elo || 1200;
    score += expectedAccuracy(elo, dist.meanDiff, dist.sdDiff) * dist.questions;
  }
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

function calculatePassProbability(score, cutoffMean, cutoffSd, questionsAnswered, simulados, subjectsCovered) {
  const infoScore = (questionsAnswered / 100) + (simulados * 3) + (subjectsCovered * 0.5);
  const sigmaStudent = Math.max(3, 8 / Math.sqrt(Math.max(0.1, infoScore)));
  const muDiff = score - cutoffMean;
  const sigmaDiff = Math.sqrt(sigmaStudent ** 2 + cutoffSd ** 2);
  const raw = normalCDF(muDiff / sigmaDiff);
  return Math.max(0.01, Math.min(0.98, raw));
}

function getProbabilityBand(prob) {
  if (prob < 0.03) return { band: "< 3%", label: "Início da jornada" };
  if (prob < 0.10) return { band: "3–10%", label: "Distante da meta" };
  if (prob < 0.25) return { band: "10–25%", label: "Em construção" };
  if (prob < 0.40) return { band: "25–40%", label: "Potencial" };
  if (prob < 0.55) return { band: "40–55%", label: "Competitivo" };
  if (prob < 0.70) return { band: "55–70%", label: "Forte candidato" };
  return { band: "> 70%", label: "Excelente posição" };
}

function getLevel(elo) {
  if (elo >= 1500) return "Avançado";
  if (elo >= 1350) return "Bom";
  if (elo >= 1200) return "Intermediário";
  if (elo >= 1050) return "Baixo";
  return "Muito baixo";
}

// ─── Interleave (same as DiagnosticTest.tsx) ─────────────────────────────────

const SUBJECT_ORDER = [
  "Português", "Matemática", "História", "Geografia",
  "Biologia", "Física", "Química", "Inglês", "Filosofia",
];

function interleaveQuestions(questions, total) {
  const bySubject = {};
  for (const q of questions) {
    if (!bySubject[q.subject]) bySubject[q.subject] = [];
    bySubject[q.subject].push(q);
  }
  for (const subj of Object.keys(bySubject)) {
    bySubject[subj].sort(() => Math.random() - 0.5);
  }
  const result = [];
  const indices = {};
  for (const s of Object.keys(bySubject)) indices[s] = 0;
  let round = 0;
  while (result.length < total) {
    let added = false;
    for (const subj of SUBJECT_ORDER) {
      if (result.length >= total) break;
      const pool = bySubject[subj];
      if (!pool) continue;
      const idx = indices[subj] ?? 0;
      if (idx < pool.length) {
        result.push(pool[idx]);
        indices[subj] = idx + 1;
        added = true;
      }
    }
    for (const subj of Object.keys(bySubject)) {
      if (result.length >= total) break;
      if (SUBJECT_ORDER.includes(subj)) continue;
      const pool = bySubject[subj];
      const idx = indices[subj] ?? 0;
      if (idx < pool.length) {
        result.push(pool[idx]);
        indices[subj] = idx + 1;
        added = true;
      }
    }
    round++;
    if (!added || round > 100) break;
  }
  return result.slice(0, total);
}

// ─── Fallback questions ──────────────────────────────────────────────────────

const FALLBACK_SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];
const DIFFICULTY_ELOS = [900, 1050, 1200, 1400, 1600];

function generateFallbackQuestions(examSlug) {
  const questions = [];
  for (let i = 0; i < 30; i++) {
    const subject = FALLBACK_SUBJECTS[i % FALLBACK_SUBJECTS.length];
    const diffIdx = Math.min(4, Math.floor(i / 6));
    const diffElo = DIFFICULTY_ELOS[diffIdx];
    const correctIdx = i % 5;
    questions.push({
      id: `fallback-${i}`,
      subject,
      subtopic: "Tópico Geral",
      difficulty: diffIdx + 1,
      difficulty_elo: diffElo,
      options: Array.from({ length: 5 }, (_, j) => ({
        label: String.fromCharCode(65 + j),
        is_correct: j === correctIdx,
      })),
    });
  }
  return questions;
}

// ─── Simulation Engine ───────────────────────────────────────────────────────

const TOTAL_QUESTIONS = 30;

function runOneDiagnostic(questions, examConfig, answerStrategy) {
  const proficiencies = {};
  let totalCorrect = 0;
  const rawAnswers = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const isCorrect = answerStrategy(q, i, questions.length);

    if (!proficiencies[q.subject]) {
      proficiencies[q.subject] = { elo: 1200, correct: 0, total: 0 };
    }
    const subj = proficiencies[q.subject];
    const expected = eloExpected(subj.elo, q.difficulty_elo);
    const actual = isCorrect ? 1 : 0;
    const totalQuestionsForSubject = questions.filter(qq => qq.subject === q.subject).length;
    const k = getKFactor(subj.total, totalQuestionsForSubject);
    subj.elo = eloUpdate(subj.elo, expected, actual, k);
    subj.total += 1;
    if (isCorrect) {
      subj.correct += 1;
      totalCorrect += 1;
    }

    rawAnswers.push({
      question_id: q.id,
      subject: q.subject,
      difficulty_elo: q.difficulty_elo,
      is_correct: isCorrect,
      elo_after: Math.round(subj.elo),
      k_used: k,
    });
  }

  const subjectDist = examConfig.subject_distribution || {};
  const score = estimateScore(proficiencies, subjectDist);
  const cutoffMean = examConfig.cutoff_mean;
  const cutoffSd = examConfig.cutoff_sd;
  const gap = Math.round((score - cutoffMean) * 10) / 10;
  const subjectsCovered = Object.keys(proficiencies).length;
  const probability = calculatePassProbability(score, cutoffMean, cutoffSd, TOTAL_QUESTIONS, 0, subjectsCovered);
  const probBand = getProbabilityBand(probability);

  const priorities = Object.entries(proficiencies)
    .filter(([, p]) => p.elo < 1200)
    .sort((a, b) => a[1].elo - b[1].elo)
    .map(([subject, p]) => ({ subject, elo: Math.round(p.elo), level: getLevel(p.elo) }));

  const profRounded = {};
  for (const [subj, p] of Object.entries(proficiencies)) {
    profRounded[subj] = {
      elo: Math.round(p.elo),
      correct: p.correct,
      total: p.total,
      level: getLevel(p.elo),
      pct: Math.round((p.correct / p.total) * 100),
    };
  }

  return {
    totalCorrect,
    totalQuestions: questions.length,
    pctCorrect: Math.round((totalCorrect / questions.length) * 100),
    estimatedScore: score,
    cutoffMean,
    cutoffSd,
    gap,
    probability: Math.round(probability * 10000) / 100, // as percentage
    probabilityBand: probBand.band,
    probabilityLabel: probBand.label,
    subjectsCovered,
    proficiencies: profRounded,
    priorities,
    rawAnswers,
  };
}

// ─── Answer Strategies ───────────────────────────────────────────────────────

function makeStrategies() {
  const strategies = [];

  // 1. Fixed accuracy rates: 0%, 10%, 20%, ..., 100%
  for (let pct = 0; pct <= 100; pct += 10) {
    strategies.push({
      name: `fixed_${pct}pct`,
      description: `Acerta exatamente ${pct}% (sequencial)`,
      category: "fixed_accuracy",
      param: pct,
      fn: (q, i, total) => i < Math.round(total * pct / 100),
    });
  }

  // 2. Random accuracy rates: 20%, 40%, 50%, 60%, 80% (probabilistic)
  for (const pct of [20, 35, 50, 65, 80]) {
    for (let trial = 1; trial <= 3; trial++) {
      strategies.push({
        name: `random_${pct}pct_t${trial}`,
        description: `Random com ~${pct}% de acerto (trial ${trial})`,
        category: "random_accuracy",
        param: pct,
        fn: () => Math.random() < pct / 100,
      });
    }
  }

  // 3. Difficulty-based: acerta fáceis, erra difíceis
  for (const threshold of [950, 1100, 1200, 1350, 1500]) {
    strategies.push({
      name: `diff_below_${threshold}`,
      description: `Acerta se difficulty_elo < ${threshold}`,
      category: "difficulty_threshold",
      param: threshold,
      fn: (q) => q.difficulty_elo < threshold,
    });
  }

  // 4. Subject-biased: forte em exatas, fraco em humanas (e vice-versa)
  const exatas = ["Matemática", "Física", "Química"];
  const humanas = ["Português", "História", "Geografia", "Filosofia"];
  const biologicas = ["Biologia"];

  strategies.push({
    name: "forte_exatas_fraco_humanas",
    description: "90% em exatas, 20% em humanas, 50% bio",
    category: "subject_bias",
    param: "exatas>humanas",
    fn: (q) => {
      if (exatas.includes(q.subject)) return Math.random() < 0.9;
      if (humanas.includes(q.subject)) return Math.random() < 0.2;
      if (biologicas.includes(q.subject)) return Math.random() < 0.5;
      return Math.random() < 0.5;
    },
  });

  strategies.push({
    name: "forte_humanas_fraco_exatas",
    description: "90% em humanas, 20% em exatas, 50% bio",
    category: "subject_bias",
    param: "humanas>exatas",
    fn: (q) => {
      if (humanas.includes(q.subject)) return Math.random() < 0.9;
      if (exatas.includes(q.subject)) return Math.random() < 0.2;
      if (biologicas.includes(q.subject)) return Math.random() < 0.5;
      return Math.random() < 0.5;
    },
  });

  strategies.push({
    name: "so_portugues",
    description: "95% em Português, 10% no resto",
    category: "subject_bias",
    param: "português_only",
    fn: (q) => q.subject === "Português" ? Math.random() < 0.95 : Math.random() < 0.1,
  });

  strategies.push({
    name: "so_matematica",
    description: "95% em Matemática, 10% no resto",
    category: "subject_bias",
    param: "matemática_only",
    fn: (q) => q.subject === "Matemática" ? Math.random() < 0.95 : Math.random() < 0.1,
  });

  // 5. Inverse: erra fáceis, acerta difíceis (padrão anômalo)
  strategies.push({
    name: "inverse_difficulty",
    description: "Acerta difíceis (>1300), erra fáceis (<1100)",
    category: "anomaly",
    param: "inverse",
    fn: (q) => {
      if (q.difficulty_elo > 1300) return Math.random() < 0.85;
      if (q.difficulty_elo < 1100) return Math.random() < 0.15;
      return Math.random() < 0.5;
    },
  });

  // 6. Starts strong, fades (fatigue)
  strategies.push({
    name: "fatigue_effect",
    description: "Começa 90%, termina 20% (fadiga)",
    category: "temporal",
    param: "fatigue",
    fn: (q, i, total) => Math.random() < (0.9 - 0.7 * (i / (total - 1))),
  });

  // 7. Starts weak, improves (warmup)
  strategies.push({
    name: "warmup_effect",
    description: "Começa 20%, termina 90% (aquecimento)",
    category: "temporal",
    param: "warmup",
    fn: (q, i, total) => Math.random() < (0.2 + 0.7 * (i / (total - 1))),
  });

  // 8. Alternating: acerta/erra intercalado
  strategies.push({
    name: "alternating",
    description: "Acerta/erra intercalado (50% exato)",
    category: "pattern",
    param: "alternate",
    fn: (q, i) => i % 2 === 0,
  });

  // 9. Guessing (chute puro ~20% para 5 alternativas)
  for (let trial = 1; trial <= 3; trial++) {
    strategies.push({
      name: `pure_guess_t${trial}`,
      description: `Chute puro ~20% (trial ${trial})`,
      category: "baseline",
      param: "guess",
      fn: () => Math.random() < 0.2,
    });
  }

  // 10. Near-perfect with occasional miss
  strategies.push({
    name: "near_perfect_95",
    description: "95% de acerto geral",
    category: "high_performer",
    param: 95,
    fn: () => Math.random() < 0.95,
  });

  strategies.push({
    name: "near_perfect_85",
    description: "85% de acerto geral",
    category: "high_performer",
    param: 85,
    fn: () => Math.random() < 0.85,
  });

  // 11. Elo-realistic: probability based on student Elo vs question Elo
  for (const trueElo of [800, 1000, 1200, 1400, 1600]) {
    strategies.push({
      name: `elo_realistic_${trueElo}`,
      description: `Aluno com Elo real ${trueElo} (probabilístico)`,
      category: "elo_realistic",
      param: trueElo,
      fn: (q) => Math.random() < eloExpected(trueElo, q.difficulty_elo),
    });
  }

  return strategies;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Buscando dados do Supabase...\n");

  // Fetch all exam configs
  const { data: configs, error: configErr } = await supabase
    .from("exam_configs")
    .select("*")
    .eq("is_active", true)
    .limit(1);

  if (configErr || !configs?.length) {
    console.error("❌ Erro ao buscar exam_configs:", configErr);
    console.log("Usando config fallback...");
  }

  const examConfig = configs?.[0] || {
    id: "fallback",
    exam_slug: "enem",
    exam_name: "ENEM",
    cutoff_mean: 65,
    cutoff_sd: 8,
    total_questions: 180,
    subject_distribution: {
      "Português": { questions: 40, meanDiff: 1150, sdDiff: 200 },
      "Matemática": { questions: 45, meanDiff: 1200, sdDiff: 250 },
      "História": { questions: 15, meanDiff: 1100, sdDiff: 180 },
      "Geografia": { questions: 15, meanDiff: 1100, sdDiff: 180 },
      "Biologia": { questions: 15, meanDiff: 1150, sdDiff: 200 },
      "Física": { questions: 15, meanDiff: 1250, sdDiff: 220 },
      "Química": { questions: 15, meanDiff: 1200, sdDiff: 210 },
      "Inglês": { questions: 5, meanDiff: 1050, sdDiff: 150 },
      "Filosofia": { questions: 15, meanDiff: 1050, sdDiff: 170 },
    },
    competition_ratio: 5,
  };

  console.log(`📋 Exam config: ${examConfig.exam_name} (cutoff: ${examConfig.cutoff_mean} ± ${examConfig.cutoff_sd})`);
  console.log(`   Subject distribution: ${Object.keys(examConfig.subject_distribution || {}).length} matérias\n`);

  // Fetch diagnostic questions
  const { data: dbQuestions } = await supabase
    .from("diagnostic_questions")
    .select("*")
    .eq("exam_slug", examConfig.exam_slug)
    .eq("is_active", true);

  let baseQuestions;
  let usingFallback = false;
  if (dbQuestions && dbQuestions.length >= 20) {
    baseQuestions = dbQuestions.map(q => ({
      id: q.id,
      subject: q.subject,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      difficulty_elo: q.difficulty_elo || 1200,
      options: q.options,
    }));
    console.log(`✅ ${baseQuestions.length} questões reais carregadas do banco`);
  } else {
    baseQuestions = generateFallbackQuestions(examConfig.exam_slug);
    usingFallback = true;
    console.log(`⚠️  Usando ${baseQuestions.length} questões fallback (banco tem ${dbQuestions?.length || 0})`);
  }

  // Question stats
  const subjectCounts = {};
  const eloBuckets = { "< 1000": 0, "1000-1200": 0, "1200-1400": 0, "> 1400": 0 };
  for (const q of baseQuestions) {
    subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
    if (q.difficulty_elo < 1000) eloBuckets["< 1000"]++;
    else if (q.difficulty_elo < 1200) eloBuckets["1000-1200"]++;
    else if (q.difficulty_elo < 1400) eloBuckets["1200-1400"]++;
    else eloBuckets["> 1400"]++;
  }
  console.log("   Questões por matéria:", JSON.stringify(subjectCounts));
  console.log("   Distribuição Elo:", JSON.stringify(eloBuckets));

  // Run simulations
  const strategies = makeStrategies();
  console.log(`\n🚀 Rodando ${strategies.length} simulações...\n`);

  const results = [];
  for (let i = 0; i < strategies.length; i++) {
    const strat = strategies[i];
    // Interleave fresh each run (randomizes order within subjects)
    const questions = interleaveQuestions([...baseQuestions], TOTAL_QUESTIONS);
    const result = runOneDiagnostic(questions, examConfig, strat.fn);

    results.push({
      simulation_id: i + 1,
      strategy_name: strat.name,
      strategy_description: strat.description,
      strategy_category: strat.category,
      strategy_param: strat.param,
      using_fallback: usingFallback,
      ...result,
    });

    const bar = "█".repeat(Math.round(result.probability / 5)) + "░".repeat(20 - Math.round(result.probability / 5));
    console.log(
      `  [${String(i + 1).padStart(2)}] ${strat.name.padEnd(32)} | ` +
      `${String(result.pctCorrect).padStart(3)}% acerto | ` +
      `Score: ${String(result.estimatedScore).padStart(5)} | ` +
      `Gap: ${(result.gap >= 0 ? "+" : "") + String(result.gap).padStart(5)} | ` +
      `Prob: ${String(result.probability).padStart(5)}% ${bar} | ` +
      `${result.probabilityBand}`
    );
  }

  // ─── Generate CSV ──────────────────────────────────────────────────────────
  const allSubjects = [...new Set(results.flatMap(r => Object.keys(r.proficiencies)))].sort();

  const csvHeaders = [
    "sim_id", "strategy", "description", "category", "param", "fallback",
    "total_correct", "total_questions", "pct_correct",
    "estimated_score", "cutoff_mean", "cutoff_sd", "gap",
    "probability_pct", "probability_band", "probability_label",
    "subjects_covered", "priority_count",
    ...allSubjects.flatMap(s => [`${s}_elo`, `${s}_correct`, `${s}_total`, `${s}_pct`, `${s}_level`]),
  ];

  const csvRows = results.map(r => {
    const subjectCols = allSubjects.flatMap(s => {
      const p = r.proficiencies[s];
      return p ? [p.elo, p.correct, p.total, p.pct, p.level] : ["", "", "", "", ""];
    });
    return [
      r.simulation_id, r.strategy_name, `"${r.strategy_description}"`, r.strategy_category, r.strategy_param, r.using_fallback,
      r.totalCorrect, r.totalQuestions, r.pctCorrect,
      r.estimatedScore, r.cutoffMean, r.cutoffSd, r.gap,
      r.probability, r.probabilityBand, `"${r.probabilityLabel}"`,
      r.subjectsCovered, r.priorities.length,
      ...subjectCols,
    ].join(",");
  });

  const csv = [csvHeaders.join(","), ...csvRows].join("\n");

  // ─── Save files ────────────────────────────────────────────────────────────
  const jsonPath = resolve(__dirname, "sensitivity-results.json");
  const csvPath = resolve(__dirname, "sensitivity-results.csv");

  writeFileSync(jsonPath, JSON.stringify({
    metadata: {
      generated_at: new Date().toISOString(),
      total_simulations: results.length,
      exam_config: {
        name: examConfig.exam_name,
        cutoff_mean: examConfig.cutoff_mean,
        cutoff_sd: examConfig.cutoff_sd,
        subject_distribution: examConfig.subject_distribution,
      },
      questions_source: usingFallback ? "fallback" : "database",
      questions_count: baseQuestions.length,
      questions_per_diagnostic: TOTAL_QUESTIONS,
      subject_counts: subjectCounts,
      elo_distribution: eloBuckets,
    },
    results: results.map(r => ({
      ...r,
      // Remove rawAnswers from JSON to keep it manageable
      rawAnswers: undefined,
    })),
    raw_answers_sample: results.slice(0, 5).map(r => ({
      strategy: r.strategy_name,
      answers: r.rawAnswers,
    })),
    // Summary statistics
    summary: {
      by_category: Object.entries(
        results.reduce((acc, r) => {
          if (!acc[r.strategy_category]) acc[r.strategy_category] = [];
          acc[r.strategy_category].push(r);
          return acc;
        }, {})
      ).map(([cat, runs]) => ({
        category: cat,
        count: runs.length,
        avg_correct_pct: Math.round(runs.reduce((s, r) => s + r.pctCorrect, 0) / runs.length),
        avg_probability: Math.round(runs.reduce((s, r) => s + r.probability, 0) / runs.length * 100) / 100,
        min_probability: Math.min(...runs.map(r => r.probability)),
        max_probability: Math.max(...runs.map(r => r.probability)),
        avg_score: Math.round(runs.reduce((s, r) => s + r.estimatedScore, 0) / runs.length * 10) / 10,
        avg_gap: Math.round(runs.reduce((s, r) => s + r.gap, 0) / runs.length * 10) / 10,
      })),
      correlations: {
        note: "Compare pct_correct vs probability to check monotonicity",
        data: results
          .sort((a, b) => a.pctCorrect - b.pctCorrect)
          .map(r => ({ strategy: r.strategy_name, pct_correct: r.pctCorrect, probability: r.probability, score: r.estimatedScore, gap: r.gap })),
      },
      // Flag potential anomalies
      anomalies: results.filter(r => {
        // High accuracy but low probability, or vice versa
        const highAccLowProb = r.pctCorrect > 70 && r.probability < 25;
        const lowAccHighProb = r.pctCorrect < 30 && r.probability > 40;
        return highAccLowProb || lowAccHighProb;
      }).map(r => ({
        strategy: r.strategy_name,
        flag: r.pctCorrect > 70 ? "HIGH_ACC_LOW_PROB" : "LOW_ACC_HIGH_PROB",
        pct_correct: r.pctCorrect,
        probability: r.probability,
        score: r.estimatedScore,
      })),
    },
  }, null, 2));

  writeFileSync(csvPath, csv);

  console.log(`\n✅ Resultados salvos:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   CSV:  ${csvPath}`);

  // Print summary
  console.log("\n" + "═".repeat(80));
  console.log("📊 RESUMO DA ANÁLISE DE SENSIBILIDADE");
  console.log("═".repeat(80));

  const sorted = [...results].sort((a, b) => a.pctCorrect - b.pctCorrect);
  console.log("\n📈 Relação acerto% → probabilidade% (monotonicidade):");
  console.log("   Acerto%  │  Score  │   Gap   │  Prob%  │  Banda");
  console.log("   ─────────┼─────────┼─────────┼─────────┼──────────────────");
  for (const r of sorted) {
    console.log(
      `   ${String(r.pctCorrect).padStart(5)}%  │ ${String(r.estimatedScore).padStart(6)} │ ${(r.gap >= 0 ? "+" : "") + String(r.gap).padStart(5)}  │ ${String(r.probability).padStart(5)}%  │ ${r.probabilityBand} ${r.probabilityLabel}`
    );
  }

  // Check for monotonicity violations
  let violations = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].probability < sorted[i - 1].probability && sorted[i].pctCorrect > sorted[i - 1].pctCorrect) {
      violations++;
      if (violations <= 5) {
        console.log(`   ⚠️  VIOLAÇÃO: ${sorted[i].strategy_name} (${sorted[i].pctCorrect}% acerto → ${sorted[i].probability}% prob) < ${sorted[i - 1].strategy_name} (${sorted[i - 1].pctCorrect}% → ${sorted[i - 1].probability}%)`);
      }
    }
  }
  if (violations > 0) {
    console.log(`\n   ⚠️  ${violations} violações de monotonicidade detectadas!`);
  } else {
    console.log("\n   ✅ Sem violações de monotonicidade (acerto → probabilidade é consistente)");
  }

  console.log("\n" + "═".repeat(80));
}

main().catch(console.error);
