#!/usr/bin/env node
/**
 * Question bank coverage report for Cátedra.
 *
 * Checks both diagnostic_questions and questions tables.
 * Run: node scripts/coverage-report.mjs
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/coverage-report.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ALL_SUBJECTS = [
  "Português", "Matemática", "História", "Geografia",
  "Biologia", "Física", "Química", "Inglês", "Filosofia",
];

// Minimum thresholds
const MIN_TOTAL = 20;
const MIN_PER_DIFFICULTY = 3;
const MIN_SUBTOPICS = 5;

async function fetchQuestions() {
  // Fetch from both tables
  const [{ data: dq, error: dqErr }, { data: q, error: qErr }] = await Promise.all([
    supabase.from("diagnostic_questions").select("id, subject, subtopic, difficulty").eq("is_active", true),
    supabase.from("questions").select("id, subject, subtopic, difficulty"),
  ]);

  if (dqErr) console.warn("Warning: diagnostic_questions fetch error:", dqErr.message);
  if (qErr) console.warn("Warning: questions fetch error:", qErr.message);

  // Deduplicate by ID
  const seen = new Set();
  const all = [];
  for (const row of [...(dq || []), ...(q || [])]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      all.push(row);
    }
  }
  return all;
}

function analyze(questions) {
  const results = [];
  let hasFailure = false;

  for (const subject of ALL_SUBJECTS) {
    const subjectQs = questions.filter((q) => q.subject === subject);
    const total = subjectQs.length;

    // Count by difficulty (1-5)
    const byDiff = {};
    for (let d = 1; d <= 5; d++) byDiff[d] = 0;
    for (const q of subjectQs) {
      const d = Math.max(1, Math.min(5, q.difficulty || 3));
      byDiff[d]++;
    }

    // Count distinct subtopics
    const subtopics = new Set(subjectQs.map((q) => q.subtopic).filter(Boolean));
    const subtopicCount = subtopics.size;

    // Check thresholds
    const issues = [];
    if (total < MIN_TOTAL) issues.push(`total ${total} < ${MIN_TOTAL}`);
    for (let d = 1; d <= 5; d++) {
      if (byDiff[d] < MIN_PER_DIFFICULTY) issues.push(`diff${d}: ${byDiff[d]} < ${MIN_PER_DIFFICULTY}`);
    }
    if (subtopicCount < MIN_SUBTOPICS) issues.push(`subtopics ${subtopicCount} < ${MIN_SUBTOPICS}`);

    const status = issues.length === 0 ? "OK" : "FALTA";
    if (issues.length > 0) hasFailure = true;

    const diffStr = Object.entries(byDiff).map(([d, c]) => `${d}:${c}`).join(" ");

    results.push({ subject, total, diffStr, subtopicCount, status, issues });
  }

  return { results, hasFailure };
}

function printTable(results) {
  const pad = (s, n) => String(s).padEnd(n);
  const header = `| ${pad("Matéria", 14)} | ${pad("Total", 6)} | ${pad("Por Dificuldade", 20)} | ${pad("Subtópicos", 11)} | ${pad("Status", 10)} |`;
  const sep = `|${"-".repeat(16)}|${"-".repeat(8)}|${"-".repeat(22)}|${"-".repeat(13)}|${"-".repeat(12)}|`;

  console.log("");
  console.log("=== Cátedra — Question Bank Coverage Report ===");
  console.log("");
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of results) {
    const statusIcon = r.status === "OK" ? "✅ OK" : "⚠️  FALTA";
    console.log(`| ${pad(r.subject, 14)} | ${pad(r.total, 6)} | ${pad(r.diffStr, 20)} | ${pad(r.subtopicCount, 11)} | ${pad(statusIcon, 10)} |`);
  }
  console.log(sep);
  console.log("");

  // Print details for failing subjects
  const failing = results.filter((r) => r.status === "FALTA");
  if (failing.length > 0) {
    console.log("Issues:");
    for (const r of failing) {
      console.log(`  ${r.subject}: ${r.issues.join(", ")}`);
    }
    console.log("");
  }
}

async function main() {
  const questions = await fetchQuestions();
  console.log(`Total questions in bank: ${questions.length}`);

  const { results, hasFailure } = analyze(questions);
  printTable(results);

  if (hasFailure) {
    console.log("❌ Some subjects below minimum thresholds.");
    process.exit(1);
  } else {
    console.log("✅ All subjects meet minimum coverage thresholds.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
