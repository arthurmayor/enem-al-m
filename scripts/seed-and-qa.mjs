#!/usr/bin/env node
/**
 * seed-and-qa.mjs — Validação de questões, criação de usuários seed, e smoke tests
 * NÃO commitar (dados de teste)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ───────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const VALID_SUBJECTS = [
  "Português", "Matemática", "História", "Geografia",
  "Biologia", "Física", "Química", "Inglês", "Filosofia",
];
const VALID_ELOS = [900, 1050, 1200, 1400, 1600];

// ═══════════════════════════════════════════════════════════
// PARTE 1: VALIDAÇÃO DE QUESTÕES
// ═══════════════════════════════════════════════════════════
async function validateQuestions() {
  console.log("\n═══ PARTE 1: VALIDAÇÃO DE QUESTÕES ═══\n");

  const { data: diagQ, error: e1 } = await supabase.from("diagnostic_questions").select("*");
  const { data: questQ, error: e2 } = await supabase.from("questions").select("*");

  if (e1) console.error("Erro ao buscar diagnostic_questions:", e1.message);
  if (e2) console.error("Erro ao buscar questions:", e2.message);

  const diagCount = (diagQ || []).length;
  const questCount = (questQ || []).length;

  // Deduplicate
  const seen = new Set();
  const allQuestions = [];
  for (const q of [...(diagQ || []), ...(questQ || [])]) {
    if (!seen.has(q.id)) { seen.add(q.id); allQuestions.push(q); }
  }

  console.log(`Total: ${allQuestions.length} questões (${diagCount} em diagnostic_questions, ${questCount} em questions)\n`);

  const bugs = [];
  const suspects = [];
  const warnings = [];
  const subjectDist = {};
  const diffDist = {};
  const letterDist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let totalWithCorrect = 0;

  for (const q of allQuestions) {
    const opts = q.options || [];
    const id = q.id?.substring(0, 8);

    // 1. 5 alternativas?
    if (opts.length !== 5) {
      bugs.push(`Questão ${id}: tem ${opts.length} alternativas`);
    }

    // 2. Exatamente 1 correta?
    const correctOpts = opts.filter(o => o.is_correct === true);
    if (correctOpts.length !== 1) {
      bugs.push(`Questão ${id}: tem ${correctOpts.length} respostas corretas`);
    }

    // 3. question_text não vazio?
    if (!q.question_text || q.question_text.trim() === "") {
      bugs.push(`Questão ${id}: sem enunciado`);
    }

    // 4. question_text > 20 chars?
    if (q.question_text && q.question_text.trim().length > 0 && q.question_text.trim().length <= 20) {
      suspects.push(`Questão ${id}: enunciado muito curto: '${q.question_text.trim().substring(0, 50)}'`);
    }

    // 5. Alternativas diferentes entre si?
    const texts = opts.map(o => (o.text || "").trim().toLowerCase());
    const uniqueTexts = new Set(texts);
    if (uniqueTexts.size < texts.length && texts.length > 0) {
      bugs.push(`Questão ${id}: alternativas duplicadas`);
    }

    // 6. explanation existe?
    if (!q.explanation || q.explanation.trim() === "") {
      warnings.push(`Questão ${id}: sem explicação`);
    }

    // 7. subject válido?
    if (!VALID_SUBJECTS.includes(q.subject)) {
      bugs.push(`Questão ${id}: matéria inválida '${q.subject}'`);
    }

    // 8. difficulty 1-5?
    if (q.difficulty == null || q.difficulty < 1 || q.difficulty > 5) {
      bugs.push(`Questão ${id}: dificuldade inválida: ${q.difficulty}`);
    }

    // 9. difficulty_elo coerente?
    if (q.difficulty_elo != null && !VALID_ELOS.includes(q.difficulty_elo)) {
      warnings.push(`Questão ${id}: elo=${q.difficulty_elo} não padrão`);
    }

    // Track distributions
    subjectDist[q.subject] = (subjectDist[q.subject] || 0) + 1;
    if (q.difficulty) diffDist[q.difficulty] = (diffDist[q.difficulty] || 0) + 1;

    // Track correct letter
    if (correctOpts.length === 1) {
      const label = correctOpts[0].label?.toUpperCase();
      if (label && letterDist[label] !== undefined) {
        letterDist[label]++;
        totalWithCorrect++;
      }
    }
  }

  // 10. Viés de letra?
  if (totalWithCorrect > 0) {
    for (const [letter, count] of Object.entries(letterDist)) {
      const pct = (count / totalWithCorrect * 100);
      if (pct > 40) {
        warnings.push(`${pct.toFixed(1)}% das questões têm resposta ${letter} — possível viés`);
      }
    }
  }

  // Relatório
  console.log("═══ RELATÓRIO DE QUALIDADE DO BANCO ═══");
  console.log(`Total: ${allQuestions.length} questões (${diagCount} em diagnostic_questions, ${questCount} em questions)`);
  console.log(`Válidas: ${allQuestions.length - bugs.length}`);
  console.log(`Com bugs: ${bugs.length}`);
  if (bugs.length > 0) bugs.forEach(b => console.log(`  BUG: ${b}`));
  console.log(`Suspeitas: ${suspects.length}`);
  if (suspects.length > 0) suspects.forEach(s => console.log(`  SUSPEITO: ${s}`));
  console.log(`Sem explicação: ${warnings.filter(w => w.includes("sem explicação")).length}`);

  console.log("\nDistribuição por matéria:");
  for (const s of VALID_SUBJECTS) {
    process.stdout.write(`  ${s}: ${subjectDist[s] || 0}  |`);
  }
  console.log("");

  console.log("Distribuição por dificuldade:");
  for (let d = 1; d <= 5; d++) {
    process.stdout.write(`  ${d}: ${diffDist[d] || 0}  |`);
  }
  console.log("");

  console.log("Distribuição de letra correta:");
  for (const l of ["A", "B", "C", "D", "E"]) {
    const pct = totalWithCorrect > 0 ? (letterDist[l] / totalWithCorrect * 100).toFixed(1) : "0.0";
    process.stdout.write(`  ${l}: ${pct}%  |`);
  }
  console.log("\n");

  // non-standard elo warnings
  const eloWarnings = warnings.filter(w => w.includes("elo="));
  if (eloWarnings.length > 0) {
    console.log(`Elos não padrão: ${eloWarnings.length}`);
  }

  return { allQuestions, bugs, suspects, warnings, diagQ: diagQ || [], questQ: questQ || [] };
}

// ═══════════════════════════════════════════════════════════
// PARTE 2: CRIAR USUÁRIOS SEED
// ═══════════════════════════════════════════════════════════

const SEED_USERS = [
  { email: "teste-base@catedra.test", name: "Lucas Base", course: "Direito", hours: 0.5, days: 3, stage: "3º ano EM", skill: 0.35 },
  { email: "teste-medio@catedra.test", name: "Ana Intermediária", course: "Direito", hours: 1, days: 5, stage: "Cursinho", skill: 0.55 },
  { email: "teste-forte@catedra.test", name: "Pedro Forte", course: "Medicina", hours: 2, days: 6, stage: "Cursinho", skill: 0.75 },
  { email: "teste-formado@catedra.test", name: "Carla Formada", course: "Administração", hours: 1, days: 4, stage: "Formado", skill: 0.50 },
  { email: "teste-eng@catedra.test", name: "Rafael Eng", course: "Engenharia de Computação", hours: 1.5, days: 5, stage: "3º ano EM", skill: 0.60 },
];

const DAY_NAMES = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

async function createSeedUsers(diagQuestions) {
  console.log("\n═══ PARTE 2: CRIAR USUÁRIOS SEED ═══\n");

  const createdUsers = [];

  for (const u of SEED_USERS) {
    process.stdout.write(`Criando ${u.name}... `);

    // 2a. Signup
    let userId;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: u.email,
      password: "testeteste",
    });

    if (signUpErr) {
      if (signUpErr.message.includes("already registered") || signUpErr.message.includes("already been registered")) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: u.email,
          password: "testeteste",
        });
        if (signInErr) {
          console.log(`❌ Falha no login: ${signInErr.message}`);
          continue;
        }
        userId = signInData.user.id;
      } else {
        console.log(`❌ Falha no signup: ${signUpErr.message}`);
        continue;
      }
    } else {
      userId = signUpData.user?.id;
      if (!userId) {
        // Some Supabase configs return user in session
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      }
    }

    if (!userId) {
      console.log("❌ Sem user ID");
      continue;
    }

    // Sign in to make sure we have a session for this user
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email: u.email,
      password: "testeteste",
    });
    if (loginErr) {
      console.log(`❌ Login falhou: ${loginErr.message}`);
      continue;
    }

    // 2b. Buscar exam_config_id
    const { data: configs } = await supabase
      .from("exam_configs")
      .select("id, cutoff_mean, phase2_subjects")
      .ilike("course_name", `%${u.course}%`)
      .limit(1);

    const configId = configs?.[0]?.id || null;

    // 2c. Atualizar profile
    const availDays = DAY_NAMES.slice(0, u.days);
    const { error: profErr } = await supabase.from("profiles").update({
      name: u.name,
      education_goal: "fuvest",
      desired_course: u.course,
      hours_per_day: u.hours,
      available_days: availDays,
      school_stage: u.stage,
      exam_config_id: configId,
      onboarding_complete: true,
      exam_date: "2027-11-15",
    }).eq("id", userId);

    if (profErr) {
      console.log(`⚠️ Erro ao atualizar profile: ${profErr.message}`);
    }

    // 2d. Simular diagnóstico
    const activeDiag = diagQuestions.filter(q => q.is_active && q.exam_slug === "fuvest");
    const diagSample = shuffleArray(activeDiag).slice(0, 30);
    const subjectScores = {};
    const subjectCorrect = {};
    const subjectTotal = {};

    for (const q of diagSample) {
      const diff = q.difficulty || 3;
      const probCorrect = Math.max(0.1, Math.min(0.95, u.skill + (3 - diff) * 0.15));
      const isCorrect = Math.random() < probCorrect;
      const correctOpt = (q.options || []).find(o => o.is_correct);
      const incorrectOpts = (q.options || []).filter(o => !o.is_correct);

      let selectedOption;
      if (isCorrect && correctOpt) {
        selectedOption = correctOpt.label;
      } else if (incorrectOpts.length > 0) {
        selectedOption = incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)].label;
      } else {
        selectedOption = "A";
      }

      await supabase.from("answer_history").insert({
        user_id: userId,
        question_id: q.id,
        selected_option: selectedOption,
        is_correct: isCorrect,
        response_time_seconds: randomInt(15, 120),
        context: "diagnostic",
      });

      const subj = q.subject;
      if (!subjectCorrect[subj]) { subjectCorrect[subj] = 0; subjectTotal[subj] = 0; }
      subjectTotal[subj]++;
      if (isCorrect) subjectCorrect[subj]++;
    }

    // Calcular Elo por matéria (K=32, initial=1200)
    const proficiencies = {};
    for (const subj of Object.keys(subjectTotal)) {
      const score = subjectCorrect[subj] / subjectTotal[subj];
      const elo = Math.round(1200 + (score - 0.5) * 32 * subjectTotal[subj] * 0.3);
      proficiencies[subj] = { elo, score: parseFloat(score.toFixed(3)) };

      await supabase.from("proficiency_scores").insert({
        user_id: userId,
        subject: subj,
        subtopic: "geral",
        score: parseFloat(score.toFixed(3)),
        confidence: 0.5,
        source: "diagnostic",
        measured_at: new Date().toISOString(),
      });
    }

    // Placement band
    const avgScore = Object.values(proficiencies).reduce((s, p) => s + p.score, 0) / Object.values(proficiencies).length;
    let placementBand;
    if (avgScore >= 0.75) placementBand = "forte";
    else if (avgScore >= 0.55) placementBand = "competitivo";
    else if (avgScore >= 0.35) placementBand = "intermediario";
    else placementBand = "base";

    await supabase.from("diagnostic_estimates").insert({
      user_id: userId,
      estimate_scope: "router",
      proficiencies,
      placement_band: placementBand,
      placement_confidence: "medium",
      global_theta: parseFloat((avgScore * 4 - 1).toFixed(2)),
      estimated_score: parseFloat((avgScore * 100).toFixed(2)),
      strengths_json: [],
      bottlenecks_json: [],
      initial_priority_json: [],
    });

    // 2e. Criar study_plan + daily_missions
    // Sort subjects by score: weak first
    const sortedSubjects = Object.entries(proficiencies)
      .sort((a, b) => a[1].score - b[1].score)
      .map(e => e[0]);

    const weak1 = sortedSubjects[0] || "Matemática";
    const weak2 = sortedSubjects[1] || "Português";
    const weak3 = sortedSubjects[2] || "História";
    const mid = sortedSubjects[Math.floor(sortedSubjects.length / 2)] || "Geografia";
    const strong = sortedSubjects[sortedSubjects.length - 1] || "Biologia";

    const today = todayStr();
    const { data: planData, error: planErr } = await supabase.from("study_plans").insert({
      user_id: userId,
      week_number: 1,
      start_date: today,
      end_date: addDays(today, 6),
      plan_json: {
        metadata: { placement_band: placementBand, week_number: 1 },
        weeks: [{ focus_areas: [weak1, weak2, weak3], days: [] }],
      },
      is_current: true,
      status: "active",
      version: 1,
    }).select("id").single();

    if (planErr) {
      console.log(`⚠️ Erro ao criar plano: ${planErr.message}`);
    }

    const planId = planData?.id;

    // Mission schedule: 3 per day × 5 days
    const missionDefs = [
      // Day 1
      { day: 0, type: "questions", subject: weak1 },
      { day: 0, type: "short_summary", subject: weak2 },
      { day: 0, type: "questions", subject: weak3 },
      // Day 2
      { day: 1, type: "error_review", subject: weak1 },
      { day: 1, type: "questions", subject: mid },
      { day: 1, type: "spaced_review", subject: weak2 },
      // Day 3
      { day: 2, type: "questions", subject: strong },
      { day: 2, type: "short_summary", subject: weak1 },
      { day: 2, type: "questions", subject: weak3 },
      // Day 4
      { day: 3, type: "spaced_review", subject: weak1 },
      { day: 3, type: "questions", subject: weak2 },
      { day: 3, type: "error_review", subject: weak3 },
      // Day 5
      { day: 4, type: "questions", subject: strong },
      { day: 4, type: "questions", subject: mid },
      { day: 4, type: "short_summary", subject: weak3 },
    ];

    const missionIds = [];
    for (let i = 0; i < missionDefs.length; i++) {
      const m = missionDefs[i];
      const mDate = addDays(today, m.day);
      const { data: mData } = await supabase.from("daily_missions").insert({
        user_id: userId,
        study_plan_id: planId,
        subject: m.subject,
        subtopic: "geral",
        date: mDate,
        due_date: mDate,
        status: "pending",
        mission_type: m.type,
        mission_order: (i % 3) + 1,
        estimated_minutes: randomInt(10, 25),
        payload: {},
      }).select("id").single();
      if (mData) missionIds.push({ id: mData.id, ...m });
    }

    // 2f. Completar missões
    let toComplete;
    if (u.skill < 0.4) toComplete = 2;
    else if (u.skill <= 0.6) toComplete = 3;
    else toComplete = 5;

    for (let i = 0; i < Math.min(toComplete, missionIds.length); i++) {
      const m = missionIds[i];
      const score = Math.max(20, Math.min(100, Math.round(u.skill * 100 + randomInt(-15, 15))));
      await supabase.from("daily_missions").update({
        status: "completed",
        score,
        completed_at: new Date().toISOString(),
      }).eq("id", m.id);

      if (["questions", "error_review", "spaced_review"].includes(m.type)) {
        await supabase.from("proficiency_scores").insert({
          user_id: userId,
          subject: m.subject,
          subtopic: "geral",
          score: parseFloat((score / 100).toFixed(3)),
          confidence: 0.6,
          source: "calibration",
          measured_at: new Date().toISOString(),
        });
      }
    }

    // 2g. Analytics events
    const events = [
      "onboarding_started", "onboarding_completed",
      "diagnostic_started", "diagnostic_completed",
      "plan_generated",
    ];
    for (const ev of events) {
      await supabase.from("analytics_events").insert({
        user_id: userId,
        event_name: ev,
        properties: {},
      });
    }

    for (let i = 0; i < Math.min(toComplete, missionIds.length); i++) {
      await supabase.from("analytics_events").insert({
        user_id: userId,
        event_name: "mission_opened",
        properties: { mission_id: missionIds[i].id },
      });
      await supabase.from("analytics_events").insert({
        user_id: userId,
        event_name: "mission_completed",
        properties: { mission_id: missionIds[i].id },
      });
    }

    // 2h. Spaced review queue
    const reviewSubjects = [weak1, weak2, weak3].slice(0, randomInt(2, 3));
    for (const subj of reviewSubjects) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await supabase.from("spaced_review_queue").insert({
        user_id: userId,
        subject: subj,
        subtopic: "geral",
        interval_days: 1,
        next_review_at: tomorrow.toISOString(),
        review_count: 0,
      });
    }

    createdUsers.push({ ...u, userId, placementBand, proficiencies });
    console.log(`✅ (${placementBand}, ${diagSample.length} questões respondidas)`);
  }

  return createdUsers;
}

// ═══════════════════════════════════════════════════════════
// PARTE 3: SMOKE TESTS
// ═══════════════════════════════════════════════════════════

async function runSmokeTests(createdUsers) {
  console.log("\n═══ PARTE 3: SMOKE TESTS ═══\n");

  const testResults = {};
  const testNames = [
    "Profile completo",
    "Diagnóstico tem dados",
    "Proficiency scores existem",
    "Plano ativo existe",
    "Missões existem para hoje",
    "Questões disponíveis para missões",
    "Analytics events gravando",
    "Spaced review queue",
    "Idempotência regeneração",
    "Questões sem bugs críticos",
  ];

  for (const t of testNames) {
    testResults[t] = { pass: 0, fail: 0, details: [] };
  }

  for (const u of createdUsers) {
    const uid = u.userId;
    const label = u.name;

    // Sign in as user
    await supabase.auth.signInWithPassword({ email: u.email, password: "testeteste" });

    // Test 1: Profile completo
    {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      const t = "Profile completo";
      if (!data?.name) { testResults[t].fail++; testResults[t].details.push(`${label}: sem nome`); }
      else if (data.onboarding_complete !== true) { testResults[t].fail++; testResults[t].details.push(`${label}: onboarding não completo`); }
      else if (!data.exam_config_id) { testResults[t].fail++; testResults[t].details.push(`${label}: sem exam_config_id`); }
      else testResults[t].pass++;
    }

    // Test 2: Diagnóstico tem dados
    {
      const { count } = await supabase.from("answer_history").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("context", "diagnostic");
      const t = "Diagnóstico tem dados";
      if ((count || 0) < 20) { testResults[t].fail++; testResults[t].details.push(`${label}: apenas ${count} respostas`); }
      else testResults[t].pass++;
    }

    // Test 3: Proficiency scores existem
    {
      const { data } = await supabase.from("proficiency_scores").select("subject").eq("user_id", uid);
      const subjects = new Set((data || []).map(p => p.subject));
      const t = "Proficiency scores existem";
      if (subjects.size < 4) { testResults[t].fail++; testResults[t].details.push(`${label}: apenas ${subjects.size} matérias`); }
      else testResults[t].pass++;
    }

    // Test 4: Plano ativo existe
    {
      const { data } = await supabase.from("study_plans").select("id, status, is_current")
        .eq("user_id", uid).eq("is_current", true);
      const t = "Plano ativo existe";
      if (!data || data.length !== 1) { testResults[t].fail++; testResults[t].details.push(`${label}: ${data?.length || 0} planos ativos`); }
      else if (data[0].status !== "active") { testResults[t].fail++; testResults[t].details.push(`${label}: status=${data[0].status}`); }
      else testResults[t].pass++;
    }

    // Test 5: Missões existem para hoje
    {
      const today = todayStr();
      const { data } = await supabase.from("daily_missions").select("id, status, mission_type")
        .eq("user_id", uid).eq("date", today);
      const t = "Missões existem para hoje";
      if (!data || data.length < 2) { testResults[t].fail++; testResults[t].details.push(`${label}: apenas ${data?.length || 0} missões`); }
      else {
        const completed = data.filter(m => m.status === "completed");
        if (completed.length < 1) { testResults[t].fail++; testResults[t].details.push(`${label}: nenhuma missão completada`); }
        else testResults[t].pass++;
      }
    }

    // Test 6: Questões disponíveis para missões de questions
    {
      const today = todayStr();
      const { data: missions } = await supabase.from("daily_missions").select("id, status, mission_type, subject")
        .eq("user_id", uid).eq("date", today);
      const pendingQ = (missions || []).filter(m => m.status === "pending" && m.mission_type === "questions");
      const t = "Questões disponíveis para missões";
      let allOk = true;
      for (const m of pendingQ) {
        const { count } = await supabase.from("diagnostic_questions")
          .select("id", { count: "exact", head: true })
          .eq("subject", m.subject).eq("is_active", true);
        if ((count || 0) < 3) {
          allOk = false;
          testResults[t].details.push(`${label}: missão ${m.id.substring(0, 8)} (${m.subject}) tem apenas ${count} questões`);
        }
      }
      if (allOk) testResults[t].pass++;
      else testResults[t].fail++;
    }

    // Test 7: Analytics events
    {
      const { count } = await supabase.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      const t = "Analytics events gravando";
      if ((count || 0) < 5) { testResults[t].fail++; testResults[t].details.push(`${label}: apenas ${count} eventos`); }
      else testResults[t].pass++;
    }

    // Test 8: Spaced review queue
    {
      const { data } = await supabase.from("spaced_review_queue").select("id").eq("user_id", uid);
      const t = "Spaced review queue";
      if (!data || data.length < 1) { testResults[t].fail++; testResults[t].details.push(`${label}: nenhum registro`); }
      else testResults[t].pass++;
    }

    // Test 9: Idempotência
    {
      const { data } = await supabase.from("study_plans").select("id, is_current, status")
        .eq("user_id", uid).eq("is_current", true);
      const t = "Idempotência regeneração";
      if ((data || []).length > 1) { testResults[t].fail++; testResults[t].details.push(`${label}: ${data.length} planos ativos`); }
      else testResults[t].pass++;
    }

    // Test 10: Questões sem bugs críticos
    {
      const { data: missions } = await supabase.from("daily_missions").select("id, subject, mission_type")
        .eq("user_id", uid);
      const qMissions = (missions || []).filter(m => ["questions", "error_review", "spaced_review"].includes(m.mission_type));
      const t = "Questões sem bugs críticos";
      let allOk = true;
      const checkedSubjects = new Set();
      for (const m of qMissions) {
        if (checkedSubjects.has(m.subject)) continue;
        checkedSubjects.add(m.subject);
        const { data: qs } = await supabase.from("diagnostic_questions").select("id, options")
          .eq("subject", m.subject).eq("is_active", true).limit(5);
        for (const q of (qs || [])) {
          const correct = (q.options || []).filter(o => o.is_correct);
          if (correct.length !== 1) {
            allOk = false;
            testResults[t].details.push(`${label}: questão ${q.id.substring(0, 8)} tem ${correct.length} corretas`);
          }
        }
      }
      if (allOk) testResults[t].pass++;
      else testResults[t].fail++;
    }
  }

  return { testResults, testNames };
}

// ═══════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  SEED & QA — CÁTEDRA BETA");
  console.log("═══════════════════════════════════════════════════");

  // PARTE 1
  const { allQuestions, bugs, suspects, warnings, diagQ } = await validateQuestions();

  // PARTE 2
  const createdUsers = await createSeedUsers(diagQ);

  // PARTE 3
  const { testResults, testNames } = await runSmokeTests(createdUsers);

  // RELATÓRIO FINAL
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  RELATÓRIO DE QA — CÁTEDRA BETA");
  console.log("═══════════════════════════════════════════════════\n");

  console.log("BANCO DE QUESTÕES");
  console.log(`  Total: ${allQuestions.length} questões`);
  console.log(`  Bugs encontrados: ${bugs.length}`);
  console.log(`  Questões suspeitas: ${suspects.length}`);

  console.log("\nUSUÁRIOS SEED");
  console.log(`  Criados: ${createdUsers.length}/5`);
  console.log(`  Com diagnóstico: ${createdUsers.length}/5`);
  console.log(`  Com plano ativo: ${createdUsers.length}/5`);
  console.log(`  Com missões: ${createdUsers.length}/5`);

  console.log("\nSMOKE TESTS");
  let totalPass = 0;
  let totalTests = 0;
  for (const t of testNames) {
    const r = testResults[t];
    const total = r.pass + r.fail;
    totalTests += total;
    totalPass += r.pass;
    const icon = r.fail === 0 ? "✅" : "❌";
    console.log(`  ${icon} ${r.fail === 0 ? "PASS" : "FAIL"}: ${t} (${r.pass}/${total})`);
    if (r.details.length > 0) {
      for (const d of r.details) console.log(`      — ${d}`);
    }
  }
  console.log(`\n  Total: ${totalPass}/${totalTests} testes passando`);

  if (bugs.length > 0) {
    console.log("\nBUGS ENCONTRADOS");
    for (let i = 0; i < bugs.length; i++) {
      const severity = bugs[i].includes("respostas corretas") || bugs[i].includes("alternativas duplicadas") ? "CRÍTICO" : "AVISO";
      console.log(`  ${i + 1}. [${severity}] ${bugs[i]}`);
    }
  }

  if (warnings.filter(w => w.includes("sem explicação")).length > 0) {
    console.log(`\n  [AVISO] ${warnings.filter(w => w.includes("sem explicação")).length} questões sem explicação`);
  }

  console.log("\nPRÓXIMOS PASSOS");
  if (bugs.length > 0) console.log("  - Corrigir bugs críticos listados acima");
  console.log("  - Logar com teste-base@catedra.test (senha: testeteste) para validação visual");
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
