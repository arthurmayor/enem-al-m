#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E"
);

const USERS = [
  { email: "teste-base@catedra.test", name: "Lucas Base", course: "Direito", hours: 0.5, days: 3, stage: "3º ano EM", skill: 0.35 },
  { email: "teste-medio@catedra.test", name: "Ana Intermediária", course: "Direito", hours: 1, days: 5, stage: "Cursinho", skill: 0.55 },
  { email: "teste-forte@catedra.test", name: "Pedro Forte", course: "Medicina", hours: 2, days: 6, stage: "Cursinho", skill: 0.75 },
  { email: "teste-formado@catedra.test", name: "Carla Formada", course: "Administração", hours: 1, days: 4, stage: "Formado", skill: 0.50 },
  { email: "teste-eng@catedra.test", name: "Rafael Eng", course: "Eng. Computação", hours: 1.5, days: 5, stage: "3º ano EM", skill: 0.60 },
];

const ALL_DAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];
const MISSION_TYPES = ["questions", "short_summary", "error_review", "spaced_review"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

async function getOrCreateUser(email) {
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password: "testeteste" });
  if (signUpErr) {
    if (signUpErr.message?.includes("already registered") || signUpErr.message?.includes("already been registered")) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: "testeteste" });
      if (signInErr) throw new Error(`SignIn failed for ${email}: ${signInErr.message}`);
      return signInData.user;
    }
    throw new Error(`SignUp failed for ${email}: ${signUpErr.message}`);
  }
  return signUpData.user;
}

async function getExamConfig(courseName) {
  const { data } = await supabase
    .from("exam_configs")
    .select("id, cutoff_mean, phase2_subjects")
    .ilike("course_name", `%${courseName}%`)
    .limit(1);
  return data?.[0] || null;
}

async function seedUser(u) {
  process.stdout.write(`Criando ${u.name}... `);

  // a) Auth
  const user = await getOrCreateUser(u.email);
  const userId = user.id;

  // b) Exam config
  const config = await getExamConfig(u.course);
  const configId = config?.id || null;

  // c) Profile
  await supabase.from("profiles").update({
    name: u.name,
    education_goal: "fuvest",
    desired_course: u.course,
    hours_per_day: u.hours,
    available_days: ALL_DAYS.slice(0, u.days),
    school_stage: u.stage,
    exam_config_id: configId,
    onboarding_complete: true,
    exam_date: "2027-11-15",
  }).eq("id", userId);

  // d) Diagnostic simulation
  const { data: diagQuestions } = await supabase
    .from("diagnostic_questions")
    .select("id, subject, difficulty, options")
    .eq("is_active", true)
    .limit(30);

  const questions = diagQuestions || [];
  const answerRows = [];
  const eloBySubject = {};

  for (const q of questions) {
    const prob = clamp(u.skill + (3 - q.difficulty) * 0.15, 0.1, 0.95);
    const isCorrect = Math.random() < prob;
    const correctOpt = q.options.find(o => o.is_correct);
    const wrongOpts = q.options.filter(o => !o.is_correct);
    const selected = isCorrect ? correctOpt?.label : wrongOpts[randInt(0, wrongOpts.length - 1)]?.label;

    answerRows.push({
      user_id: userId,
      question_id: q.id,
      selected_option: selected || "A",
      is_correct: isCorrect,
      response_time_seconds: randInt(15, 90),
      context: "diagnostic",
    });

    // Elo calculation
    if (!eloBySubject[q.subject]) eloBySubject[q.subject] = { elo: 1200, count: 0 };
    const e = eloBySubject[q.subject];
    const diffElo = [0, 900, 1050, 1200, 1400, 1600][q.difficulty] || 1200;
    const expected = 1 / (1 + Math.pow(10, (diffElo - e.elo) / 400));
    e.elo += 32 * ((isCorrect ? 1 : 0) - expected);
    e.count++;
  }

  if (answerRows.length > 0) {
    await supabase.from("answer_history").insert(answerRows);
  }

  // Proficiency scores
  const profRows = Object.entries(eloBySubject).map(([subject, { elo }]) => ({
    user_id: userId,
    subject,
    subtopic: "geral",
    score: clamp((elo - 600) / 1200, 0, 1),
    source: "diagnostic",
    measured_at: new Date().toISOString(),
  }));
  if (profRows.length > 0) {
    await supabase.from("proficiency_scores").insert(profRows);
  }

  // Diagnostic estimates
  const sortedSubjects = Object.entries(eloBySubject).sort((a, b) => a[1].elo - b[1].elo);
  const weakest = sortedSubjects.slice(0, 3).map(([s]) => s);
  const strongest = sortedSubjects.slice(-2).map(([s]) => s);
  const avgElo = Object.values(eloBySubject).reduce((s, e) => s + e.elo, 0) / Math.max(1, Object.keys(eloBySubject).length);
  const placementBand = avgElo < 1050 ? "beginner" : avgElo < 1300 ? "intermediate" : "advanced";

  const proficiencies = {};
  for (const [subj, { elo }] of Object.entries(eloBySubject)) {
    proficiencies[subj] = { elo: Math.round(elo), score: clamp((elo - 600) / 1200, 0, 1) };
  }

  await supabase.from("diagnostic_estimates").insert({
    user_id: userId,
    estimate_scope: "router",
    estimated_score: clamp(u.skill * 100, 0, 100),
    placement_band: placementBand,
    placement_confidence: "medium",
    global_theta: avgElo,
    proficiencies,
    strengths_json: strongest,
    bottlenecks_json: weakest,
    initial_priority_json: weakest.map((s, i) => ({ subject: s, priority: i + 1 })),
    explanation_json: { summary: `Diagnóstico simulado para ${u.name}` },
  });

  // e) Study plan + 15 daily missions
  const today = new Date();
  const { data: planData } = await supabase.from("study_plans").insert({
    user_id: userId,
    week_number: 1,
    is_current: true,
    status: "active",
    start_date: today.toISOString().split("T")[0],
    end_date: new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0],
    plan_json: { generated: true, focus_subjects: weakest },
    summary: { total_missions: 15, focus: weakest },
  }).select("id").single();

  const planId = planData?.id;
  const missionRows = [];
  const focusSubjects = [...weakest, ...shuffle(SUBJECTS).filter(s => !weakest.includes(s))];

  for (let day = 0; day < 5; day++) {
    const missionDate = new Date(today.getTime() + day * 86400000);
    for (let m = 0; m < 3; m++) {
      const subj = focusSubjects[(day * 3 + m) % focusSubjects.length];
      missionRows.push({
        user_id: userId,
        study_plan_id: planId,
        subject: subj,
        subtopic: "geral",
        date: missionDate.toISOString().split("T")[0],
        due_date: missionDate.toISOString().split("T")[0],
        mission_type: MISSION_TYPES[(day * 3 + m) % MISSION_TYPES.length],
        mission_order: m + 1,
        status: "pending",
        estimated_minutes: randInt(10, 25),
        payload: {},
      });
    }
  }

  const { data: insertedMissions } = await supabase.from("daily_missions").insert(missionRows).select("id, subject, mission_type");
  const missions = insertedMissions || [];

  // f) Complete some missions based on skill
  const toComplete = u.skill < 0.4 ? 2 : u.skill <= 0.6 ? 3 : 5;
  const completedMissions = missions.slice(0, toComplete);

  for (const mission of completedMissions) {
    const score = clamp(Math.round(u.skill * 100 + rand(-15, 15)), 20, 100);
    await supabase.from("daily_missions").update({
      status: "completed",
      score,
      completed_at: new Date().toISOString(),
    }).eq("id", mission.id);
  }

  // g) Analytics events
  const events = [
    { user_id: userId, event_name: "onboarding_started", properties: {} },
    { user_id: userId, event_name: "onboarding_completed", properties: {} },
    { user_id: userId, event_name: "diagnostic_started", properties: {} },
    { user_id: userId, event_name: "diagnostic_completed", properties: { total_questions: questions.length } },
    { user_id: userId, event_name: "plan_generated", properties: { plan_id: planId } },
  ];
  for (const mission of completedMissions) {
    events.push({ user_id: userId, event_name: "mission_opened", properties: { mission_id: mission.id, type: mission.mission_type } });
    events.push({ user_id: userId, event_name: "mission_completed", properties: { mission_id: mission.id, type: mission.mission_type } });
  }
  await supabase.from("analytics_events").insert(events);

  // h) Spaced review queue
  const reviewSubjects = weakest.slice(0, randInt(2, 3));
  const tomorrow = new Date(today.getTime() + 86400000);
  const reviewRows = reviewSubjects.map(subj => ({
    user_id: userId,
    subject: subj,
    subtopic: "geral",
    interval_days: 1,
    next_review_at: tomorrow.toISOString(),
    review_count: 0,
    last_performance: clamp(u.skill - 0.1, 0, 1),
  }));
  if (reviewRows.length > 0) {
    await supabase.from("spaced_review_queue").insert(reviewRows);
  }

  console.log("✅");
}

async function main() {
  let success = 0;
  for (const u of USERS) {
    try {
      await seedUser(u);
      success++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }
  console.log(`\n${success}/${USERS.length} usuários seed criados com sucesso`);

  // Sign out after seeding
  await supabase.auth.signOut();
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
