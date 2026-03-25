import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Clock, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/trackEvent";
import {
  eloExpected, eloUpdate, getKFactor, expectedAccuracy,
  estimateScore, calculatePassProbability, getProbabilityBand, getLevel,
  type Proficiency, type SubjectDistEntry,
} from "@/lib/scoring";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuestionOption {
  label: string;
  text: string;
  is_correct: boolean;
}

interface Question {
  id: string;
  subject: string;
  subtopic: string;
  difficulty: number;
  difficulty_elo: number;
  question_text: string;
  options: QuestionOption[];
  explanation: string;
}

interface ExamConfig {
  id: string;
  exam_slug: string;
  exam_name: string;
  course_slug: string;
  course_name: string;
  campus: string;
  cutoff_mean: number;
  cutoff_sd: number;
  total_questions: number;
  phase2_subjects: string[];
  competition_ratio: number;
  subject_distribution: Record<string, SubjectDistEntry>;
  is_active: boolean;
}

// ─── Router mode functions ──────────────────────────────────────────────────

interface RouterResult {
  placementBand: "base" | "intermediario" | "competitivo" | "forte";
  placementConfidence: "low" | "medium";
  strengths: string[];
  bottlenecks: string[];
  initialPriority: Array<{ subject: string; weight: number }>;
  routerNote: string;
}

function getBlockForSubject(subject: string): string | null {
  if (["Português", "Inglês"].includes(subject)) return "linguagens";
  if (["História", "Geografia", "Filosofia"].includes(subject)) return "humanas";
  if (["Biologia", "Física", "Química"].includes(subject)) return "natureza";
  if (subject === "Matemática") return "matematica";
  return null;
}

const BLOCK_MAP: Record<string, string[]> = {
  linguagens: ["Português", "Inglês"],
  matematica: ["Matemática"],
  humanas: ["História", "Geografia", "Filosofia"],
  natureza: ["Biologia", "Física", "Química"],
};

function selectRouterQuestions(
  allQuestions: Question[],
  examConfig: ExamConfig,
  selfDeclaredBlocks: Record<string, string>,
): Question[] {
  const selected: Question[] = [];
  const usedIds = new Set<string>();
  const usedSubjects = new Set<string>();

  // BLOCO A: 1 questão por bloco universal
  for (const [block, subjects] of Object.entries(BLOCK_MAP)) {
    const selfLevel = selfDeclaredBlocks[block];
    let targetDifficulty: number;
    if (selfLevel === "fraco") targetDifficulty = 2;
    else if (selfLevel === "forte") targetDifficulty = 4;
    else targetDifficulty = 3;

    const candidates = allQuestions
      .filter((q) => subjects.includes(q.subject) && !usedIds.has(q.id))
      .sort(
        (a, b) =>
          Math.abs(a.difficulty - targetDifficulty) -
          Math.abs(b.difficulty - targetDifficulty),
      );

    if (candidates.length > 0) {
      const top = candidates.slice(0, Math.min(3, candidates.length));
      const pick = top[Math.floor(Math.random() * top.length)];
      selected.push(pick);
      usedIds.add(pick.id);
      usedSubjects.add(pick.subject);
    }
  }

  // BLOCO B: 4 questões orientadas por curso (phase2_subjects)
  const phase2 = examConfig.phase2_subjects || [];
  const phase2Remaining = phase2.filter((s) => !usedSubjects.has(s));
  for (const subject of phase2Remaining) {
    if (selected.length >= 8) break;
    const candidates = allQuestions.filter(
      (q) => q.subject === subject && !usedIds.has(q.id),
    );
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push(pick);
      usedIds.add(pick.id);
      usedSubjects.add(pick.subject);
    }
  }

  // Completar até 8 com matérias ainda não cobertas
  const allSubjects = [
    "Português", "Matemática", "História", "Geografia",
    "Biologia", "Física", "Química", "Inglês", "Filosofia",
  ];
  const uncovered = allSubjects.filter((s) => !usedSubjects.has(s));
  for (const subject of uncovered) {
    if (selected.length >= 8) break;
    const candidates = allQuestions.filter(
      (q) => q.subject === subject && !usedIds.has(q.id),
    );
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push(pick);
      usedIds.add(pick.id);
      usedSubjects.add(pick.subject);
    }
  }

  return selected;
}

function shouldAddTiebreaker(answers: boolean[], currentCount: number): boolean {
  if (currentCount < 8) return false;
  if (currentCount >= 10) return false;
  const allCorrect = answers.every((a) => a);
  const allWrong = answers.every((a) => !a);
  return allCorrect || allWrong;
}

function calculateRouterResult(
  answers: Array<{ subject: string; isCorrect: boolean; difficultyElo: number }>,
  examConfig: ExamConfig,
  selfDeclaredBlocks: Record<string, string>,
): RouterResult {
  const totalCorrect = answers.filter((a) => a.isCorrect).length;
  const totalQuestions = answers.length;
  const rate = totalCorrect / totalQuestions;

  const correctAnswers = answers.filter((a) => a.isCorrect);
  const correctDiffAvg =
    correctAnswers.length > 0
      ? correctAnswers.reduce((s, a) => s + a.difficultyElo, 0) / correctAnswers.length
      : 900;

  let band: "base" | "intermediario" | "competitivo" | "forte";
  if (rate < 0.3 || (rate < 0.4 && correctDiffAvg < 1100)) {
    band = "base";
  } else if (rate < 0.55 || (rate < 0.65 && correctDiffAvg < 1200)) {
    band = "intermediario";
  } else if (rate < 0.75 || (rate < 0.85 && correctDiffAvg < 1350)) {
    band = "competitivo";
  } else {
    band = "forte";
  }

  const bySubject: Record<string, { correct: number; total: number }> = {};
  for (const a of answers) {
    if (!bySubject[a.subject]) bySubject[a.subject] = { correct: 0, total: 0 };
    bySubject[a.subject].total++;
    if (a.isCorrect) bySubject[a.subject].correct++;
  }

  const subjectRates = Object.entries(bySubject)
    .map(([s, d]) => ({ subject: s, rate: d.correct / d.total }))
    .sort((a, b) => b.rate - a.rate);

  const strengths = subjectRates.slice(0, 2).map((s) => s.subject);
  const bottlenecks = subjectRates.slice(-2).map((s) => s.subject);

  const phase2Set = new Set(examConfig.phase2_subjects || []);
  const priority = subjectRates
    .map((s) => {
      let weight = 1.0 - s.rate;
      if (phase2Set.has(s.subject)) weight *= 1.35;
      const block = getBlockForSubject(s.subject);
      if (block && selfDeclaredBlocks[block] === "fraco") weight *= 1.2;
      return { subject: s.subject, weight: Math.round(weight * 100) / 100 };
    })
    .sort((a, b) => b.weight - a.weight);

  return {
    placementBand: band,
    placementConfidence: totalQuestions >= 9 ? "medium" : "low",
    strengths,
    bottlenecks,
    initialPriority: priority,
    routerNote: "Estimativa inicial. Vamos calibrar nas próximas sessões.",
  };
}

// ─── Adaptive question selection ─────────────────────────────────────────────

interface QuestionPool {
  [subject: string]: {
    [difficultyBucket: string]: Question[]; // "easy" (900-1050), "medium" (1200), "hard" (1400-1600)
  };
}

function buildQuestionPool(questions: Question[]): QuestionPool {
  const pool: QuestionPool = {};
  for (const q of questions) {
    if (!pool[q.subject]) pool[q.subject] = { easy: [], medium: [], hard: [] };
    let bucket: string;
    if (q.difficulty_elo <= 1050) bucket = "easy";
    else if (q.difficulty_elo <= 1300) bucket = "medium";
    else bucket = "hard";
    pool[q.subject][bucket].push(q);
  }
  return pool;
}

function selectNextQuestion(
  pool: QuestionPool,
  subject: string,
  currentElo: number,
  answeredIds: Set<string>
): Question | null {
  // Determine target bucket based on current Elo
  let targetBucket: string;
  if (currentElo < 1100) targetBucket = "easy";
  else if (currentElo < 1350) targetBucket = "medium";
  else targetBucket = "hard";

  // Find unanswered question in target bucket
  const candidates = pool[subject]?.[targetBucket]?.filter(q => !answeredIds.has(q.id)) || [];

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback: search any bucket
  for (const bucket of ["medium", "easy", "hard"]) {
    const fallback = pool[subject]?.[bucket]?.filter(q => !answeredIds.has(q.id)) || [];
    if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return null;
}

// ─── Interleave subjects (breadth-first) ─────────────────────────────────────

const SUBJECT_ORDER = [
  "Português", "Matemática", "História", "Geografia",
  "Biologia", "Física", "Química", "Inglês", "Filosofia",
];

function interleaveQuestions(questions: Question[], total: number): Question[] {
  const bySubject: Record<string, Question[]> = {};
  for (const q of questions) {
    if (!bySubject[q.subject]) bySubject[q.subject] = [];
    bySubject[q.subject].push(q);
  }
  // Shuffle within each subject for variety
  for (const subj of Object.keys(bySubject)) {
    bySubject[subj].sort(() => Math.random() - 0.5);
  }
  const result: Question[] = [];
  const indices: Record<string, number> = {};
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
    // Also pick from subjects not in SUBJECT_ORDER
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

// ─── Default Fuvest distribution (soma = 90) ────────────────────────────────

const DEFAULT_FUVEST_DISTRIBUTION: Record<string, SubjectDistEntry> = {
  "Português": { questions: 15, meanDiff: 1150, sdDiff: 250 },
  "Matemática": { questions: 12, meanDiff: 1300, sdDiff: 300 },
  "História": { questions: 12, meanDiff: 1200, sdDiff: 250 },
  "Geografia": { questions: 10, meanDiff: 1200, sdDiff: 250 },
  "Biologia": { questions: 10, meanDiff: 1200, sdDiff: 280 },
  "Física": { questions: 10, meanDiff: 1300, sdDiff: 300 },
  "Química": { questions: 8, meanDiff: 1250, sdDiff: 280 },
  "Inglês": { questions: 5, meanDiff: 1050, sdDiff: 200 },
  "Filosofia": { questions: 5, meanDiff: 1200, sdDiff: 250 },
  "Artes": { questions: 3, meanDiff: 1100, sdDiff: 200 },
};

// ─── Difficulty indicators ───────────────────────────────────────────────────

const DIFFICULTY_ELOS = [900, 1050, 1200, 1400, 1600];

// ─── Component ───────────────────────────────────────────────────────────────

const TOTAL_QUESTIONS = 30;

const DiagnosticTest = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [insufficientQuestions, setInsufficientQuestions] = useState(false);

  // Elo tracking per subject
  const proficienciesRef = useRef<Record<string, Proficiency>>({});
  const totalCorrectRef = useRef(0);
  const rawAnswersRef = useRef<Array<{ question_id: string; subject: string; selected: string; is_correct: boolean; response_time: number; difficulty_elo: number }>>([]);

  // Adaptive mode
  const questionPoolRef = useRef<QuestionPool>({});
  const isAdaptiveRef = useRef(false);
  const answeredIdsRef = useRef<Set<string>>(new Set());

  // Mode detection (router = 8-10 questions, deep = 30 questions)
  const mode = (new URLSearchParams(window.location.search).get("mode") || "router") as "router" | "deep";

  // Router-specific refs
  const selfDeclaredBlocksRef = useRef<Record<string, string>>({});
  const routerSessionIdRef = useRef<string | null>(null);
  const routerTiebreakerPoolRef = useRef<Question[]>([]);
  const [routerTotalQuestions, setRouterTotalQuestions] = useState(8);

  useEffect(() => {
    const interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // 1. Get profile → exam_config_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("exam_config_id, self_declared_blocks")
        .eq("id", user.id)
        .single();

      if (!profile?.exam_config_id) {
        console.error("No exam_config_id on profile");
        navigate("/onboarding");
        return;
      }

      // 2. Get exam_config
      const { data: config, error: configError } = await supabase
        .from("exam_configs")
        .select("*")
        .eq("id", profile.exam_config_id)
        .single();

      if (configError || !config) {
        console.error("Error loading exam config:", configError);
        navigate("/onboarding");
        return;
      }

      const examConf = config as ExamConfig;
      setExamConfig(examConf);

      // 3. Get diagnostic questions
      const { data: dbQuestions } = await supabase
        .from("diagnostic_questions")
        .select("*")
        .eq("exam_slug", examConf.exam_slug)
        .eq("is_active", true);

      // Map DB questions to internal format
      const mappedQuestions: Question[] =
        dbQuestions && dbQuestions.length >= (mode === "router" ? 8 : 20)
          ? dbQuestions.map((q) => ({
              id: q.id,
              subject: q.subject,
              subtopic: q.subtopic,
              difficulty: q.difficulty,
              difficulty_elo: q.difficulty_elo || 1200,
              question_text: q.question_text,
              options: q.options as QuestionOption[],
              explanation: q.explanation,
            }))
          : [];

      let finalQuestions: Question[];

      if (mode === "router") {
        // ─── Router mode: 8 questions + up to 2 tiebreakers ───
        const sdb = (profile as Record<string, unknown>).self_declared_blocks as Record<string, string> || {};
        selfDeclaredBlocksRef.current = sdb;

        if (mappedQuestions.length >= 8) {
          const routerQs = selectRouterQuestions(mappedQuestions, examConf, sdb);
          const usedIds = new Set(routerQs.map((q) => q.id));
          routerTiebreakerPoolRef.current = mappedQuestions.filter((q) => !usedIds.has(q.id));
          finalQuestions = routerQs;
        } else {
          setInsufficientQuestions(true);
          setLoading(false);
          trackEvent("diagnostic_insufficient_questions", {
            exam_slug: examConf.exam_slug,
            available: mappedQuestions.length,
            mode: "router",
          }, user.id);
          return;
        }
        isAdaptiveRef.current = false;

        // Create diagnostic_session
        try {
          const { data: session } = await supabase
            .from("diagnostic_sessions")
            .insert({
              user_id: user.id,
              exam_config_id: examConf.id,
              session_type: "router",
              status: "in_progress",
            })
            .select("id")
            .single();
          if (session) routerSessionIdRef.current = session.id;
        } catch (err) {
          console.warn("Could not create diagnostic_session:", err);
        }

      } else {
        // ─── Deep mode: 30 questions with Elo adaptive ─────────
        if (mappedQuestions.length >= 20) {
          const isAdaptive = mappedQuestions.length >= 90;

          if (isAdaptive) {
            const pool = buildQuestionPool(mappedQuestions);
            finalQuestions = interleaveQuestions(mappedQuestions, TOTAL_QUESTIONS);
            questionPoolRef.current = pool;
            isAdaptiveRef.current = true;
          } else {
            finalQuestions = interleaveQuestions(mappedQuestions, TOTAL_QUESTIONS);
            isAdaptiveRef.current = false;
          }
        } else {
          setInsufficientQuestions(true);
          setLoading(false);
          trackEvent("diagnostic_insufficient_questions", {
            exam_slug: examConf.exam_slug,
            available: mappedQuestions.length,
            mode: "deep",
          }, user.id);
          return;
        }
      }

      setQuestions(finalQuestions);
      setLoading(false);
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
      trackEvent("diagnostic_started", { mode, questions: finalQuestions.length }, user.id);
    };
    load();
  }, [user, navigate]);

  const currentQuestion = questions[currentIndex];
  const currentSubject = currentQuestion?.subject || "";
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleAnswer = useCallback(
    async (optionLabel: string) => {
      if (selectedOption) return;
      setSelectedOption(optionLabel);

      const q = currentQuestion;
      const correct = q.options.find((o) => o.label === optionLabel)?.is_correct || false;
      const responseTime = Math.floor((Date.now() - questionStartTime) / 1000);

      // Update Elo for this subject
      const prof = proficienciesRef.current;
      if (!prof[q.subject]) {
        prof[q.subject] = { elo: 1200, correct: 0, total: 0 };
      }
      const subj = prof[q.subject];
      const expected = eloExpected(subj.elo, q.difficulty_elo);
      const actual = correct ? 1 : 0;
      // Count how many questions this subject has in the full diagnostic
      const totalQuestionsForSubject = questions.filter((qq) => qq.subject === q.subject).length;
      const k = getKFactor(subj.total, totalQuestionsForSubject);
      subj.elo = eloUpdate(subj.elo, expected, actual, k);
      subj.total += 1;
      if (correct) {
        subj.correct += 1;
        totalCorrectRef.current += 1;
      }

      // Track answered question for adaptive mode
      answeredIdsRef.current.add(q.id);

      // Track raw answer for history
      rawAnswersRef.current.push({
        question_id: q.id,
        subject: q.subject,
        selected: optionLabel,
        is_correct: correct,
        response_time: responseTime,
        difficulty_elo: q.difficulty_elo,
      });

      // Save to answer_history
      if (user) {
        await supabase.from("answer_history").insert({
          user_id: user.id,
          question_id: q.id,
          selected_option: optionLabel,
          is_correct: correct,
          response_time_seconds: responseTime,
          context: "diagnostic",
        });
      }

      // Save to diagnostic_item_responses (router mode)
      if (mode === "router" && user && routerSessionIdRef.current) {
        try {
          await supabase.from("diagnostic_item_responses").insert({
            session_id: routerSessionIdRef.current,
            user_id: user.id,
            question_id: q.id,
            layer: "router",
            sequence_no: currentIndex + 1,
            subject: q.subject,
            subtopic: q.subtopic || null,
            selected_option: optionLabel,
            correct_option: q.options.find((o) => o.is_correct)?.label || null,
            is_correct: correct,
            response_time_seconds: responseTime,
            difficulty_presented: q.difficulty_elo,
          });
        } catch (err) {
          console.warn("Could not save diagnostic_item_response:", err);
        }
      }

      // Next question after delay
      setTimeout(() => {
        if (mode === "router") {
          // ─── Router stopping logic ───
          const answeredCount = rawAnswersRef.current.length;
          const allResults = rawAnswersRef.current.map((a) => a.is_correct);

          if (answeredCount < 8) {
            // Still in mandatory questions
            setCurrentIndex((i) => i + 1);
            setSelectedOption(null);
            setQuestionStartTime(Date.now());
          } else if (answeredCount >= 10) {
            // Maximum absolute
            finishRouter();
          } else if (shouldAddTiebreaker(allResults, answeredCount)) {
            // Extreme pattern — add tiebreaker question
            const pool = routerTiebreakerPoolRef.current;
            if (pool.length > 0) {
              const pick = pool[Math.floor(Math.random() * pool.length)];
              routerTiebreakerPoolRef.current = pool.filter((qq) => qq.id !== pick.id);
              setQuestions((prev) => [...prev, pick]);
              setRouterTotalQuestions(answeredCount + 1);
              setCurrentIndex((i) => i + 1);
              setSelectedOption(null);
              setQuestionStartTime(Date.now());
            } else {
              finishRouter(); // No more tiebreaker questions available
            }
          } else {
            // Mixed pattern after 8+ questions — done
            finishRouter();
          }
        } else {
          // ─── Deep mode: existing logic ───
          if (currentIndex < TOTAL_QUESTIONS - 1) {
            if (isAdaptiveRef.current) {
              const nextIdx = currentIndex + 1;
              const nextSubject = SUBJECT_ORDER[nextIdx % SUBJECT_ORDER.length];
              const currentElo = proficienciesRef.current[nextSubject]?.elo || 1200;
              const adaptiveNext = selectNextQuestion(
                questionPoolRef.current,
                nextSubject,
                currentElo,
                answeredIdsRef.current,
              );
              if (adaptiveNext) {
                setQuestions((prev) => {
                  const updated = [...prev];
                  updated[nextIdx] = adaptiveNext;
                  return updated;
                });
              }
            }
            setCurrentIndex((i) => i + 1);
            setSelectedOption(null);
            setQuestionStartTime(Date.now());
          } else {
            finishDiagnostic();
          }
        }
      }, 1200);
    },
    [selectedOption, currentQuestion, currentIndex, questionStartTime, user, questions]
  );

  // ─── Router finalization ──────────────────────────────────────────────────
  const finishRouter = async () => {
    if (!user || !examConfig) return;

    const answers = rawAnswersRef.current.map((a) => ({
      subject: a.subject,
      isCorrect: a.is_correct,
      difficultyElo: a.difficulty_elo,
    }));
    const routerResult = calculateRouterResult(answers, examConfig, selfDeclaredBlocksRef.current);
    const totalCorrect = rawAnswersRef.current.filter((a) => a.is_correct).length;
    const totalQuestions = rawAnswersRef.current.length;

    // Update diagnostic_sessions → completed
    if (routerSessionIdRef.current) {
      try {
        await supabase
          .from("diagnostic_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            total_items_presented: totalQuestions,
            total_correct: totalCorrect,
            placement_band: routerResult.placementBand,
            placement_confidence: routerResult.placementConfidence,
          })
          .eq("id", routerSessionIdRef.current);
      } catch (err) {
        console.warn("Could not update diagnostic_session:", err);
      }
    }

    // Save diagnostic_estimates
    if (routerSessionIdRef.current) {
      try {
        await supabase.from("diagnostic_estimates").insert({
          user_id: user.id,
          session_id: routerSessionIdRef.current,
          estimate_scope: "router",
          placement_band: routerResult.placementBand,
          placement_confidence: routerResult.placementConfidence,
          strengths_json: routerResult.strengths,
          bottlenecks_json: routerResult.bottlenecks,
          initial_priority_json: routerResult.initialPriority,
        });
      } catch (err) {
        console.warn("Could not save diagnostic_estimates:", err);
      }
    }

    // Save proficiency_scores (low confidence from router)
    const prof = proficienciesRef.current;
    try {
      await supabase
        .from("proficiency_scores")
        .delete()
        .eq("user_id", user.id)
        .eq("source", "diagnostic");

      const rows = Object.entries(prof).map(([subject, p]) => ({
        user_id: user.id,
        subject,
        subtopic: subject,
        score: Math.min(1, Math.max(0, (p.elo - 600) / 1200)),
        confidence: Math.min(1, p.total / 10),
        source: "diagnostic",
        measured_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        await supabase.from("proficiency_scores").insert(rows);
      }
    } catch (err) {
      console.warn("Could not save proficiency_scores:", err);
    }

    trackEvent("diagnostic_completed", {
      mode: "router",
      totalCorrect,
      totalQuestions,
      placementBand: routerResult.placementBand,
    }, user.id);

    navigate("/diagnostic/results", {
      state: {
        mode: "router",
        routerResult,
        totalCorrect,
        totalQuestions,
        examConfig,
        answers: rawAnswersRef.current,
      },
    });
  };

  // ─── Deep finalization ──────────────────────────────────────────────────
  const finishDiagnostic = async () => {
    if (!user || !examConfig) return;

    const prof = proficienciesRef.current;

    // CORREÇÃO 4: Fallback para DEFAULT_FUVEST_DISTRIBUTION se subject_distribution inválida
    let subjectDist = examConfig.subject_distribution;
    if (!subjectDist || Object.keys(subjectDist).length === 0) {
      console.warn("subject_distribution vazia ou nula, usando DEFAULT_FUVEST_DISTRIBUTION");
      subjectDist = DEFAULT_FUVEST_DISTRIBUTION;
    }

    // Compute estimated score (blend: acerto direto + Elo)
    const totalCorrect = Object.values(prof).reduce((s, v) => s + v.correct, 0);
    const totalQuestionsAnswered = Object.values(prof).reduce((s, v) => s + v.total, 0);
    const score = estimateScore(
      prof,
      subjectDist,
      totalQuestionsAnswered,  // 30 (diagnóstico)
      totalCorrect,            // ex: 15
      0,                       // 0 simulados (é o diagnóstico)
      totalQuestionsAnswered,  // total de questões já respondidas
    );
    const cutoffMean = examConfig.cutoff_mean;
    const cutoffSd = examConfig.cutoff_sd;
    const gap = Math.round((score - cutoffMean) * 10) / 10;

    // Compute probability
    const subjectsCovered = Object.keys(prof).length;
    const probability = calculatePassProbability(score, cutoffMean, cutoffSd, TOTAL_QUESTIONS, 0, subjectsCovered);
    const probBand = getProbabilityBand(probability);

    // Priority areas: all subjects, sorted by adjusted Elo (phase2 subjects get -100 penalty)
    const phase2Subjects = examConfig.phase2_subjects || [];
    const priorities = Object.entries(prof)
      .map(([subject, p]) => {
        const isPhase2 = phase2Subjects.includes(subject);
        const adjustedElo = isPhase2 ? p.elo - 100 : p.elo;
        return {
          subject,
          elo: Math.round(p.elo),
          adjustedElo,
          isPhase2,
          priority: isPhase2 ? "Essencial (2ª fase)" : "Importante (1ª fase)",
          level: getLevel(p.elo),
        };
      })
      .sort((a, b) => a.adjustedElo - b.adjustedElo);

    // Save diagnostic_results history
    try {
      await supabase.from("diagnostic_results").insert({
        user_id: user.id,
        exam_config_id: examConfig.id,
        estimated_score: score,
        cutoff_used: cutoffMean,
        gap,
        probability,
        probability_band: probBand.band,
        probability_label: probBand.label,
        total_correct: totalCorrectRef.current,
        total_questions: TOTAL_QUESTIONS,
        proficiencies: prof,
        priority_areas: priorities,
        raw_answers: rawAnswersRef.current,
      });
    } catch (err) {
      console.warn("Could not save diagnostic_results (table may not exist yet):", err);
    }

    // Save proficiency scores
    await supabase
      .from("proficiency_scores")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "diagnostic");

    const rows = Object.entries(prof).map(([subject, p]) => ({
      user_id: user.id,
      subject,
      subtopic: subject,
      score: Math.min(1, Math.max(0, (p.elo - 600) / 1200)),
      confidence: Math.min(1, p.total / 10),
      source: "diagnostic",
      measured_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase.from("proficiency_scores").insert(rows);
    }

    // Build proficiencies map for results page
    const proficienciesForResults: Record<string, { elo: number; correct: number; total: number; level: ReturnType<typeof getLevel> }> = {};
    for (const [subject, p] of Object.entries(prof)) {
      proficienciesForResults[subject] = {
        elo: Math.round(p.elo),
        correct: p.correct,
        total: p.total,
        level: getLevel(p.elo),
      };
    }

    // Confidence level based on data volume
    const dataVolume = totalQuestionsAnswered;
    const directWeight = dataVolume <= 50 ? 0.75 : dataVolume <= 200 ? 0.50 : dataVolume <= 500 ? 0.25 : 0.10;
    const confidenceLabel = directWeight > 0.5 ? "baixa" : directWeight >= 0.25 ? "média" : "alta";
    const accuracyPct = Math.round((totalCorrect / Math.max(1, totalQuestionsAnswered)) * 100);

    trackEvent("diagnostic_completed", {
      mode: "deep",
      totalCorrect: totalCorrectRef.current,
      totalQuestions: TOTAL_QUESTIONS,
      estimatedScore: score,
      cutoffMean,
      gap,
      probability: Math.round(probability * 100),
      probabilityBand: probBand.band,
      course: examConfig.course_slug,
      exam: examConfig.exam_slug,
      subjectsCovered,
      accuracyPct,
    }, user.id);

    navigate("/diagnostic/results", {
      state: {
        proficiencies: proficienciesForResults,
        estimatedScore: score,
        cutoff: cutoffMean,
        gap,
        probability,
        probBand,
        priorities,
        totalCorrect: totalCorrectRef.current,
        totalQuestions: TOTAL_QUESTIONS,
        examConfig,
        blendInfo: {
          directWeight,
          confidenceLabel,
          accuracyPct,
        },
      },
    });
  };

  if (insufficientQuestions) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Banco de questões em preparação</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Estamos finalizando as questões do diagnóstico. Tente novamente em breve.
        </p>
        <Link to="/dashboard" className="mt-6 px-6 py-3 bg-foreground text-white rounded-xl font-medium">
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  if (loading || !currentQuestion) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-foreground">
              Questão {currentIndex + 1} de {mode === "router" ? routerTotalQuestions : TOTAL_QUESTIONS}
            </span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/5 text-primary">
              {currentSubject}
            </span>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatTime(elapsedTime)}
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-muted rounded-full -mt-1 mb-1">
            <div
              className="h-1 bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex + 1) / (mode === "router" ? routerTotalQuestions : TOTAL_QUESTIONS)) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <p className="text-lg font-semibold text-foreground leading-relaxed">{currentQuestion.question_text}</p>

          <div className="mt-8 space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.label;
              const showResult = selectedOption !== null;
              const isCorrect = option.is_correct;

              let optionClasses =
                "w-full p-4 rounded-xl text-left transition-all duration-200 flex items-start gap-3 ";
              if (showResult) {
                if (isCorrect)
                  optionClasses += "bg-success/10 shadow-[inset_0_0_0_2px_hsl(var(--success))]";
                else if (isSelected && !isCorrect)
                  optionClasses += "bg-destructive/10 shadow-[inset_0_0_0_2px_hsl(var(--destructive))]";
                else optionClasses += "bg-background opacity-50";
              } else {
                optionClasses += "bg-white border border-gray-200 hover:border-gray-400 hover:shadow-md cursor-pointer";
              }

              return (
                <button
                  key={option.label}
                  onClick={() => handleAnswer(option.label)}
                  disabled={!!selectedOption}
                  className={optionClasses}
                >
                  <span
                    className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold ${
                      showResult && isCorrect
                        ? "bg-success text-success-foreground"
                        : showResult && isSelected
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="text-sm text-foreground pt-1">{option.text}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation after answering */}
          {selectedOption && currentQuestion.explanation && (
            <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
              <p className="text-xs text-muted-foreground">{currentQuestion.explanation}</p>
            </div>
          )}

          {/* Elo difficulty indicator */}
          <div className="mt-6 flex items-center justify-center gap-1">
            {DIFFICULTY_ELOS.map((d) => (
              <div
                key={d}
                className={`h-1.5 w-6 rounded-full transition-all ${
                  d <= currentQuestion.difficulty_elo ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
            <span className="ml-2 text-[10px] text-muted-foreground">Dificuldade</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DiagnosticTest;
