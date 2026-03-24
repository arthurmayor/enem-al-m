#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EMAILS = [
  "teste-base@catedra.test",
  "teste-medio@catedra.test",
  "teste-forte@catedra.test",
  "teste-formado@catedra.test",
  "teste-eng@catedra.test",
];

const today = new Date().toISOString().split("T")[0];

async function loginUser(email) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: "testeteste" });
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
  return data.user;
}

async function runTests(user, email) {
  const userId = user.id;
  const results = [];

  // Test 1: Profile completo
  {
    const { data: profile } = await supabase.from("profiles").select("name, onboarding_complete, exam_config_id").eq("id", userId).single();
    const pass = !!(profile?.name && profile?.onboarding_complete === true && profile?.exam_config_id);
    const details = [];
    if (!profile?.name) details.push("sem name");
    if (!profile?.onboarding_complete) details.push("onboarding_complete=false");
    if (!profile?.exam_config_id) details.push("sem exam_config_id");
    results.push({ name: "Profile completo", pass, detail: pass ? "" : details.join(", ") });
  }

  // Test 2: Diagnóstico tem dados
  {
    const { data: answers } = await supabase.from("answer_history").select("id").eq("user_id", userId).eq("context", "diagnostic");
    const count = (answers || []).length;
    const pass = count >= 20;
    results.push({ name: "Diagnóstico tem dados", pass, detail: `${count} respostas${pass ? "" : " (mínimo 20)"}` });
  }

  // Test 3: Proficiency scores existem
  {
    const { data: profs } = await supabase.from("proficiency_scores").select("subject").eq("user_id", userId);
    const subjects = new Set((profs || []).map(p => p.subject));
    const pass = subjects.size >= 4;
    results.push({ name: "Proficiency scores existem", pass, detail: `${subjects.size} matérias${pass ? "" : " (mínimo 4)"}` });
  }

  // Test 4: Plano ativo existe
  {
    const { data: plans } = await supabase.from("study_plans").select("id").eq("user_id", userId).eq("is_current", true).eq("status", "active");
    const count = (plans || []).length;
    const pass = count === 1;
    results.push({ name: "Plano ativo existe", pass, detail: `${count} plano(s) ativo(s)${pass ? "" : " (esperado 1)"}` });
  }

  // Test 5: Missões existem para hoje
  {
    const { data: missions } = await supabase.from("daily_missions").select("id, status").eq("user_id", userId).eq("date", today);
    const total = (missions || []).length;
    const completed = (missions || []).filter(m => m.status === "completed").length;
    const pass = total >= 2 && completed >= 1;
    const details = [];
    if (total < 2) details.push(`${total} missões (mínimo 2)`);
    if (completed < 1) details.push(`${completed} completadas (mínimo 1)`);
    results.push({ name: "Missões existem para hoje", pass, detail: pass ? `${total} missões, ${completed} completadas` : details.join(", ") });
  }

  // Test 6: Questões disponíveis para missões
  {
    const { data: pendingMissions } = await supabase.from("daily_missions").select("id, subject, mission_type").eq("user_id", userId).eq("status", "pending");
    const questionMissions = (pendingMissions || []).filter(m => m.mission_type === "questions");
    let pass = true;
    const failDetails = [];
    for (const m of questionMissions) {
      const { data: qs } = await supabase.from("diagnostic_questions").select("id").eq("subject", m.subject).eq("is_active", true).limit(3);
      if ((qs || []).length < 3) {
        pass = false;
        failDetails.push(`${m.subject}: ${(qs || []).length} questões`);
      }
    }
    results.push({ name: "Questões disponíveis para missões", pass, detail: pass ? `${questionMissions.length} missões verificadas` : failDetails.join(", ") });
  }

  // Test 7: Analytics events gravando
  {
    const { data: events } = await supabase.from("analytics_events").select("id").eq("user_id", userId);
    const count = (events || []).length;
    const pass = count >= 5;
    results.push({ name: "Analytics events gravando", pass, detail: `${count} eventos${pass ? "" : " (mínimo 5)"}` });
  }

  // Test 8: Spaced review queue
  {
    const { data: reviews } = await supabase.from("spaced_review_queue").select("id").eq("user_id", userId);
    const count = (reviews || []).length;
    const pass = count >= 1;
    results.push({ name: "Spaced review queue", pass, detail: `${count} registro(s)${pass ? "" : " (mínimo 1)"}` });
  }

  // Test 9: Idempotência
  {
    const { data: plans } = await supabase.from("study_plans").select("id").eq("user_id", userId).eq("is_current", true);
    const count = (plans || []).length;
    const pass = count <= 1;
    results.push({ name: "Idempotência", pass, detail: `${count} plano(s) is_current=true${pass ? "" : " (máximo 1)"}` });
  }

  // Test 10: Sem planos duplicados (global, but reported per user)
  {
    const { data: plans } = await supabase.from("study_plans").select("id").eq("user_id", userId).eq("is_current", true);
    const count = (plans || []).length;
    const pass = count <= 1;
    results.push({ name: "Sem planos duplicados", pass, detail: `${count} plano(s) is_current=true` });
  }

  return results;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  RELATÓRIO DE QA — CÁTEDRA BETA");
  console.log("═══════════════════════════════════════════════════\n");

  const allResults = {};
  let totalPass = 0;
  let totalFail = 0;
  const bugs = [];

  console.log("SMOKE TESTS (por usuário)\n");

  for (const email of EMAILS) {
    let user;
    try {
      user = await loginUser(email);
    } catch (err) {
      console.log(`  ${email}:`);
      console.log(`    ❌ Login falhou: ${err.message}\n`);
      totalFail += 10;
      bugs.push(`${email}: login falhou — ${err.message}`);
      continue;
    }

    const name = email.replace("@catedra.test", "").replace("teste-", "");
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
    const displayName = profile?.name || name;

    const results = await runTests(user, email);
    allResults[displayName] = results;

    console.log(`  ${displayName}:`);
    for (const r of results) {
      const icon = r.pass ? "✅" : "❌";
      const detail = r.detail ? ` (${r.detail})` : "";
      console.log(`    ${icon} ${r.name}${detail}`);
      if (r.pass) totalPass++;
      else {
        totalFail++;
        bugs.push(`${displayName}: ${r.name} — ${r.detail}`);
      }
    }
    console.log();
  }

  const totalTests = totalPass + totalFail;

  console.log("RESUMO");
  console.log(`  ✅ PASS: ${totalPass}/${totalTests} total`);
  console.log(`  ❌ FAIL: ${totalFail} testes`);

  if (bugs.length > 0) {
    console.log("\nBUGS ENCONTRADOS");
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  }

  const ready = totalFail === 0;
  console.log(`\nSTATUS: ${ready ? "✅ PRONTO PARA BETA" : "❌ NÃO PRONTO"}`);
  console.log("\n═══════════════════════════════════════════════════\n");

  await supabase.auth.signOut();
}

main().catch(err => { console.error("Erro fatal:", err); process.exit(1); });
