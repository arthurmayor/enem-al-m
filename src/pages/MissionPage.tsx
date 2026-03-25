import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/trackEvent";
import { MISSION_STATUSES } from "@/lib/constants";

interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Question { id: string; subject: string; subtopic: string; difficulty: number; difficulty_elo?: number; question_text: string; options: { label: string; text: string; is_correct: boolean }[]; explanation: string; }
interface MissionData { id: string; subject: string; subtopic: string; mission_type: string; status: string; payload?: Record<string, unknown>; question_ids?: string[]; score?: number | null; }

const CALIBRATION_TYPES = ["questions", "error_review", "spaced_review"];
const SUMMARY_TYPES = ["short_summary", "resumos"];

const BLOCK_MAP: Record<string, string[]> = {
  "Português": ["Português", "Inglês"],
  "Inglês": ["Português", "Inglês"],
  "História": ["História", "Geografia", "Filosofia"],
  "Geografia": ["História", "Geografia", "Filosofia"],
  "Filosofia": ["História", "Geografia", "Filosofia"],
  "Biologia": ["Biologia", "Física", "Química"],
  "Física": ["Biologia", "Física", "Química"],
  "Química": ["Biologia", "Física", "Química"],
  "Matemática": ["Matemática"],
};

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Elo helpers (reuse DiagnosticTest logic) ────────────────────────────────

function eloExpected(studentElo: number, questionElo: number): number {
  return 1 / (1 + Math.pow(10, (questionElo - studentElo) / 400));
}

function eloUpdate(rating: number, expected: number, actual: number, k: number): number {
  return rating + k * (actual - expected);
}

// ─── Calibração invisível ────────────────────────────────────────────────────

interface AnswerForCalibration {
  subject: string;
  subtopic: string;
  isCorrect: boolean;
  difficultyElo: number;
}

async function runCalibration(userId: string, answers: AnswerForCalibration[]) {
  if (answers.length === 0) return;

  // Agrupar respostas por matéria
  const bySubject: Record<string, AnswerForCalibration[]> = {};
  for (const a of answers) {
    if (!bySubject[a.subject]) bySubject[a.subject] = [];
    bySubject[a.subject].push(a);
  }

  for (const [subject, subjectAnswers] of Object.entries(bySubject)) {
    // Buscar proficiência atual mais recente com source='calibration' ou qualquer
    const { data: existing } = await supabase
      .from("proficiency_scores")
      .select("score, source")
      .eq("user_id", userId)
      .eq("subject", subject)
      .order("measured_at", { ascending: false })
      .limit(1);

    // Converter score (0-1) para Elo: score 0.5 = 1200
    let currentElo = 1200;
    if (existing && existing.length > 0) {
      currentElo = 600 + existing[0].score * 1200; // 0→600, 0.5→1200, 1→1800
    }

    // Atualizar Elo com K=16 para cada resposta
    for (const a of subjectAnswers) {
      const expected = eloExpected(currentElo, a.difficultyElo);
      currentElo = eloUpdate(currentElo, expected, a.isCorrect ? 1 : 0, 16);
    }

    // Converter Elo de volta para score 0-1
    const newScore = Math.max(0, Math.min(1, (currentElo - 600) / 1200));

    // Use real subtopic from answers (first answer's subtopic, or "geral" as fallback)
    const realSubtopic = subjectAnswers[0]?.subtopic || "geral";

    // Inserir novo registro em proficiency_scores
    await supabase.from("proficiency_scores").insert({
      user_id: userId,
      subject,
      subtopic: realSubtopic,
      score: Math.round(newScore * 1000) / 1000,
      confidence: Math.min(1, subjectAnswers.length / 10),
      source: "calibration",
      measured_at: new Date().toISOString(),
    });
  }

  // Inserir registro em diagnostic_estimates
  const proficiencies: Record<string, { elo: number; score: number }> = {};
  for (const [subject, subjectAnswers] of Object.entries(bySubject)) {
    const { data: latest } = await supabase
      .from("proficiency_scores")
      .select("score")
      .eq("user_id", userId)
      .eq("subject", subject)
      .eq("source", "calibration")
      .order("measured_at", { ascending: false })
      .limit(1);
    const s = latest?.[0]?.score ?? 0.5;
    proficiencies[subject] = { elo: 600 + s * 1200, score: s };
  }

  await supabase.from("diagnostic_estimates").insert({
    user_id: userId,
    estimate_scope: "recalibration",
    proficiencies,
    created_at: new Date().toISOString(),
  });

  toast("Plano refinado com base no seu desempenho recente", { duration: 3000 });
}

// ─── Spaced review helpers ───────────────────────────────────────────────────

async function upsertSpacedReview(userId: string, subject: string, subtopic: string) {
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + 1);

  // UPSERT: if user+subject+subtopic exists, just bump next_review_at
  const { data: existing } = await supabase
    .from("spaced_review_queue")
    .select("id, interval_days")
    .eq("user_id", userId)
    .eq("subject", subject)
    .eq("subtopic", subtopic)
    .limit(1)
    .single();

  if (existing) {
    await supabase.from("spaced_review_queue").update({
      next_review_at: nextReview.toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq("id", existing.id);
  } else {
    await supabase.from("spaced_review_queue").insert({
      user_id: userId,
      subject,
      subtopic,
      interval_days: 1,
      next_review_at: nextReview.toISOString(),
      review_count: 0,
      last_performance: null,
    } as any);
  }
}

async function updateSpacedReviewAfterReview(userId: string, subject: string, subtopic: string, performance: number) {
  const { data: existing } = await supabase
    .from("spaced_review_queue")
    .select("id, interval_days, review_count")
    .eq("user_id", userId)
    .eq("subject", subject)
    .eq("subtopic", subtopic)
    .limit(1)
    .single();

  if (!existing) return;

  let newInterval = existing.interval_days || 1;
  if (performance >= 0.8) {
    newInterval = Math.min(14, Math.round(newInterval * 1.5));
  } else if (performance < 0.5) {
    newInterval = 1;
  }
  // 0.5-0.8: keep same interval

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  await supabase.from("spaced_review_queue").update({
    interval_days: newInterval,
    next_review_at: nextReview.toISOString(),
    last_reviewed_at: new Date().toISOString(),
    review_count: (existing.review_count || 0) + 1,
    last_performance: performance,
    updated_at: new Date().toISOString(),
  } as any).eq("id", existing.id);
}

// ─── Fetch questions ─────────────────────────────────────────────────────────

async function fetchMissionQuestions(
  userId: string,
  subject: string,
  subtopic: string,
  examSlug: string = "fuvest",
  limit: number = 8
): Promise<Question[]> {
  const { data: recentAnswers } = await supabase
    .from("answer_history")
    .select("question_id")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString());
  const recentIds = new Set((recentAnswers || []).map(a => a.question_id));

  async function fetchBoth(
    diagFilter: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q,
    questFilter: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q,
    fetchLimit: number
  ): Promise<Question[]> {
    const [diagResult, questResult] = await Promise.all([
      diagFilter(supabase.from("diagnostic_questions").select("*").eq("is_active", true)).limit(fetchLimit),
      questFilter(supabase.from("questions").select("*")).limit(fetchLimit),
    ]);
    const seen = new Set<string>();
    const combined: Question[] = [];
    for (const q of [...(diagResult.data || []), ...(questResult.data || [])] as any[]) {
      if (!seen.has(q.id)) { seen.add(q.id); combined.push(q as Question); }
    }
    return combined;
  }

  const level1 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).eq("subject", subject).ilike("subtopic", `%${subtopic}%`),
    (q) => q.eq("subject", subject).ilike("subtopic", `%${subtopic}%`),
    limit
  );
  if (level1.length >= 5) {
    const fresh = level1.filter(q => !recentIds.has(q.id));
    return shuffleArray(fresh.length >= 3 ? fresh : level1).slice(0, limit);
  }

  const level2 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).eq("subject", subject),
    (q) => q.eq("subject", subject),
    limit * 2
  );
  if (level2.length >= 3) {
    const fresh = level2.filter(q => !recentIds.has(q.id));
    return shuffleArray(fresh.length >= 3 ? fresh : level2).slice(0, limit);
  }

  const blockSubjects = BLOCK_MAP[subject] || [subject];
  const level3 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).in("subject", blockSubjects),
    (q) => q.in("subject", blockSubjects),
    limit * 3
  );
  if (level3.length >= 3) {
    const fresh = level3.filter(q => !recentIds.has(q.id));
    return shuffleArray(fresh.length >= 3 ? fresh : level3).slice(0, limit);
  }

  const level4 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug),
    (q) => q,
    limit * 3
  );
  if (level4.length > 0) {
    const fresh = level4.filter(q => !recentIds.has(q.id));
    return shuffleArray(fresh.length >= 3 ? fresh : level4).slice(0, limit);
  }

  return [];
}

// ─── Fetch questions by IDs (for mission resume) ────────────────────────────

async function fetchQuestionsByIds(ids: string[]): Promise<Question[]> {
  const [{ data: dq }, { data: q }] = await Promise.all([
    supabase.from("diagnostic_questions").select("*").in("id", ids),
    supabase.from("questions").select("*").in("id", ids),
  ]);
  const allQuestions = [...(dq || []), ...(q || [])] as Question[];
  // Preserve original ID order
  const byId = new Map(allQuestions.map(q => [q.id, q]));
  return ids.map(id => byId.get(id)).filter((q): q is Question => q != null);
}

// ─── Component ───────────────────────────────────────────────────────────────

const MissionPage = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mission, setMission] = useState<MissionData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  // Summaries state (Change 3)
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  // ─── Tutor panel state (Sprint 6) ──────────────────────────────
  const [showTutor, setShowTutor] = useState(false);
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const tutorScrollMobileRef = useRef<HTMLDivElement>(null);
  const tutorScrollDesktopRef = useRef<HTMLDivElement>(null);

  // Calibration answers collector (Change 1)
  const calibrationAnswers = useRef<AnswerForCalibration[]>([]);

  // Canonical score ref — avoids stale closure in finishMission
  const scoreRef = useRef({ correct: 0, total: 0 });

  // Track mission_opened (Change 4)
  const openedRef = useRef(false);

  useEffect(() => {
    if (!user || !id) return;
    const loadMission = async () => {
      const { data: missionData } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, payload, question_ids, score")
        .eq("id", id)
        .single();

      if (!missionData) { setLoading(false); return; }

      const status = missionData.status as string;
      const missionType = missionData.mission_type || "";
      const questionIds = (missionData as any).question_ids as string[] | null;

      // ─── COMPLETED: show result, block re-execution ────────────────
      if (status === MISSION_STATUSES.COMPLETED) {
        setMission(missionData as MissionData);
        setCompleted(true);
        setLoading(false);
        return;
      }

      // ─── PENDING → IN_PROGRESS transition ─────────────────────────
      if (status === MISSION_STATUSES.PENDING) {
        await supabase.from("daily_missions")
          .update({ status: MISSION_STATUSES.IN_PROGRESS })
          .eq("id", id);
        missionData.status = MISSION_STATUSES.IN_PROGRESS;
      }

      setMission(missionData as MissionData);

      // Track mission_started
      if (!openedRef.current) {
        openedRef.current = true;
        trackEvent("mission_started", {
          type: missionType,
          subject: missionData.subject,
          mission_id: id,
        }, user.id);
      }

      // ─── Summary missions: check cache or call AI ─────────────────
      if (SUMMARY_TYPES.includes(missionType)) {
        const payload = (missionData.payload || {}) as Record<string, unknown>;
        if (payload.cached_content && typeof payload.cached_content === "string") {
          setSummaryContent(payload.cached_content);
          setLoading(false);
          return;
        }
        setSummaryLoading(true);
        setLoading(false);
        try {
          const { data, error } = await supabase.functions.invoke("ai-tutor", {
            body: {
              message: `Gere um resumo claro e didático sobre "${missionData.subtopic}" da matéria ${missionData.subject}. Use tópicos, exemplos e linguagem acessível para um estudante de vestibular. Máximo 800 palavras.`,
              chatHistory: [],
              userContext: {
                name: "",
                age: null,
                school_year: "",
                education_goal: "",
                current_subject: missionData.subject || "",
                proficiency_level: "intermediário",
                recent_errors: [],
              },
            },
          });
          if (error || !data?.reply) throw new Error("Falha na geração");
          const content = data.reply as string;
          setSummaryContent(content);
          const { error: rpcErr } = await supabase.rpc("jsonb_set_mission_cache", { mission_id: id, content_val: content });
          if (rpcErr) {
            await supabase
              .from("daily_missions")
              .update({ payload: { ...(missionData.payload || {}), cached_content: content } })
              .eq("id", id);
          }
        } catch {
          setSummaryError(true);
        } finally {
          setSummaryLoading(false);
        }
        return;
      }

      // ─── Question-based missions ──────────────────────────────────
      let selectedQuestions: Question[];

      if (status !== MISSION_STATUSES.PENDING && questionIds && questionIds.length > 0) {
        // RESUME: fetch bound questions by ID, preserving order
        selectedQuestions = await fetchQuestionsByIds(questionIds);
      } else {
        // NEW mission (was pending) or legacy mission without question_ids
        const subject = missionData.subject || "";
        const subtopic = missionData.subtopic || "";
        selectedQuestions = await fetchMissionQuestions(user.id, subject, subtopic);

        // Bind question IDs to mission for deterministic resume
        if (selectedQuestions.length > 0) {
          await supabase.from("daily_missions")
            .update({ question_ids: selectedQuestions.map(q => q.id) })
            .eq("id", id);
        }
      }

      setQuestions(selectedQuestions);
      setLoading(false);
      setQuestionStartTime(Date.now());
    };
    loadMission();
  }, [user, id]);

  // Track mission_abandoned on unmount / beforeunload (Change 4)
  useEffect(() => {
    if (!user || !id) return;
    const handleBeforeUnload = () => {
      if (!completed && mission) {
        trackEvent("mission_abandoned", {
          type: mission.mission_type,
          subject: mission.subject,
          mission_id: id,
          questions_answered: score.total,
        }, user.id);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Also track on navigate away (component unmount)
      if (!completed && mission) {
        trackEvent("mission_abandoned", {
          type: mission.mission_type,
          subject: mission.subject,
          mission_id: id,
          questions_answered: score.total,
        }, user.id);
      }
    };
  }, [user, id, completed, mission, score.total]);

  // ─── Tutor: clear chat when question changes ───────────────────
  const prevIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (currentIndex !== prevIndexRef.current) {
      setTutorMessages([]);
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  // ─── Tutor: auto-scroll on new messages ───────────────────────
  useEffect(() => {
    if (tutorScrollMobileRef.current) {
      tutorScrollMobileRef.current.scrollTop = tutorScrollMobileRef.current.scrollHeight;
    }
    if (tutorScrollDesktopRef.current) {
      tutorScrollDesktopRef.current.scrollTop = tutorScrollDesktopRef.current.scrollHeight;
    }
  }, [tutorMessages]);

  // ─── Tutor: telemetry for open/close ──────────────────────────
  const openTutor = useCallback(() => {
    setShowTutor(true);
    if (user) {
      trackEvent("tutor_opened", {
        subject: mission?.subject,
        mission_type: mission?.mission_type,
      }, user.id);
    }
  }, [user, mission]);

  const closeTutor = useCallback(() => {
    setShowTutor(false);
    if (user) {
      trackEvent("tutor_closed", {}, user.id);
    }
  }, [user]);

  // ─── Tutor: send message ──────────────────────────────────────
  const sendTutorMessage = useCallback(async (text: string) => {
    if (!text.trim() || !user) return;
    const userMsg: TutorMessage = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    setTutorMessages(prev => [...prev, userMsg]);
    setTutorInput("");
    setTutorLoading(true);

    trackEvent("tutor_message_sent", {
      subject: currentQuestion?.subject || mission?.subject,
    }, user.id);

    const startTime = Date.now();
    // Show slow-response hint after 15s
    const slowTimer = setTimeout(() => {
      setTutorMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "user") {
          return [...prev, { id: "slow-hint", role: "assistant" as const, content: "O tutor está pensando... Tente novamente em alguns segundos." }];
        }
        return prev;
      });
    }, 15000);

    try {
      const { data, error } = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: text.trim(),
          chatHistory: tutorMessages.map(m => ({ role: m.role, message: m.content })),
          userContext: {
            userId: user.id,
            name: "Estudante",
            current_subject: currentQuestion?.subject || mission?.subject || "Geral",
          },
          questionContext: {
            question_text: currentQuestion?.question_text,
            options: currentQuestion?.options?.map(o => `${o.label}. ${o.text}`),
            subject: currentQuestion?.subject,
            subtopic: currentQuestion?.subtopic,
            selected_answer: selectedOption || null,
            is_question_mode: true,
          },
        },
      });
      clearTimeout(slowTimer);
      const elapsed = Date.now() - startTime;
      trackEvent("tutor_response_time", { elapsed_ms: elapsed }, user.id);

      if (error || !data?.reply) throw new Error("Falha na resposta do tutor");
      // Remove slow-hint if it was shown
      setTutorMessages(prev => prev.filter(m => m.id !== "slow-hint"));
      const assistantMsg: TutorMessage = { id: crypto.randomUUID(), role: "assistant", content: data.reply };
      setTutorMessages(prev => [...prev, assistantMsg]);
    } catch {
      clearTimeout(slowTimer);
      setTutorMessages(prev => prev.filter(m => m.id !== "slow-hint"));
      const errorMsg: TutorMessage = { id: crypto.randomUUID(), role: "assistant", content: "Desculpe, não consegui responder agora. Tente novamente." };
      setTutorMessages(prev => [...prev, errorMsg]);
    } finally {
      setTutorLoading(false);
    }
  }, [user, currentQuestion, mission, selectedOption, tutorMessages]);

  const currentQuestion = questions[currentIndex];

  const handleAnswer = useCallback(async (optionLabel: string) => {
    if (selectedOption || !currentQuestion || !user) return;
    setSelectedOption(optionLabel);
    const correct = currentQuestion.options.find((o) => o.label === optionLabel)?.is_correct || false;
    const responseTime = Math.floor((Date.now() - questionStartTime) / 1000);
    const newCorrect = scoreRef.current.correct + (correct ? 1 : 0);
    const newTotal = scoreRef.current.total + 1;
    scoreRef.current = { correct: newCorrect, total: newTotal };
    setScore({ correct: newCorrect, total: newTotal });

    // Error taxonomy (Sprint 6)
    let errorType: string | null = null;
    if (!correct) {
      if (responseTime < 15) errorType = "distracao";
      else if (responseTime > 60) errorType = "conceitual";
      else errorType = "nao_classificado";
    }

    if (!currentQuestion.id.startsWith("mock")) {
      await supabase.from("answer_history").insert({ user_id: user.id, question_id: currentQuestion.id, selected_option: optionLabel, is_correct: correct, response_time_seconds: responseTime, subtopic: currentQuestion.subtopic || mission?.subtopic || "geral", error_type: errorType, context: "practice" });
    }

    trackEvent("question_answered", {
      mission_id: id,
      question_id: currentQuestion.id,
      subject: currentQuestion.subject,
      is_correct: correct,
      response_time: responseTime,
    }, user.id);

    // Collect for calibration (Change 1)
    if (mission && CALIBRATION_TYPES.includes(mission.mission_type)) {
      calibrationAnswers.current.push({
        subject: currentQuestion.subject,
        subtopic: currentQuestion.subtopic || mission.subtopic || "geral",
        isCorrect: correct,
        difficultyElo: currentQuestion.difficulty_elo || 1200,
      });
    }

    setTimeout(() => {
      if (currentIndex < questions.length - 1) { setCurrentIndex((i) => i + 1); setSelectedOption(null); setQuestionStartTime(Date.now()); }
      else finishMission();
    }, 1200);
  }, [selectedOption, currentQuestion, currentIndex, questionStartTime, user, questions.length, mission]);

  const finishMission = async () => {
    if (!user || !id) return;

    // 1. Canonical score from ref (already includes last answer)
    const finalScore = scoreRef.current.total > 0
      ? Math.round((scoreRef.current.correct / scoreRef.current.total) * 100)
      : 0;

    // 2. Mark completed in UI immediately
    setCompleted(true);

    // 3. Calibration and spaced review (awaited, not fire-and-forget)
    try {
      if (mission && CALIBRATION_TYPES.includes(mission.mission_type) && calibrationAnswers.current.length > 0) {
        await runCalibration(user.id, calibrationAnswers.current);
      }
      if (mission) {
        if (mission.mission_type === "questions") {
          await upsertSpacedReview(user.id, mission.subject, mission.subtopic);
        } else if (mission.mission_type === "spaced_review") {
          await updateSpacedReviewAfterReview(user.id, mission.subject, mission.subtopic, finalScore / 100);
        }
      }
    } catch (err) {
      console.error("Calibration/review error:", err);
    }

    // 4. Atomic conclusion via RPC (updates mission + profile in one transaction)
    const xpEarned = 10 + Math.round(finalScore * 0.5);
    await supabase.rpc("complete_mission_atomic", {
      p_user_id: user.id,
      p_mission_id: id,
      p_score: finalScore,
      p_xp_earned: xpEarned,
    });

    // 5. Track event
    trackEvent("mission_completed", {
      type: mission?.mission_type,
      subject: mission?.subject,
      score: finalScore,
      mission_id: id,
    }, user.id);
  };

  // ─── Complete summary mission ──────────────────────────────────────────────

  const completeSummaryMission = async () => {
    if (!user || !id) return;
    setCompleted(true);

    // Atomic conclusion via RPC (score=100 for summaries, xp=15)
    const xpEarned = 15;
    await supabase.rpc("complete_mission_atomic", {
      p_user_id: user.id,
      p_mission_id: id,
      p_score: 100,
      p_xp_earned: xpEarned,
    });

    trackEvent("mission_completed", { type: mission?.mission_type, subject: mission?.subject, score: 100, mission_id: id }, user.id);
  };

  // ─── Renders ───────────────────────────────────────────────────────────────

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  if (completed) {
    // Use in-memory score if just finished, or stored score if revisiting
    const finalPercent = score.total > 0
      ? Math.round((score.correct / score.total) * 100)
      : (mission?.score ?? 0);
    const isSummary = mission && SUMMARY_TYPES.includes(mission.mission_type);
    const hasScore = score.total > 0 || mission?.score != null;
    const scoreColor = finalPercent >= 70 ? "text-success bg-success/10" : finalPercent >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-fade-in">
          <CheckCircle2 className="h-16 w-16 text-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">Missão Concluída!</h1>
          {!isSummary && hasScore && (<div className={`mt-4 inline-flex items-center justify-center h-20 w-20 rounded-full ${scoreColor} text-2xl font-semibold`}>{finalPercent}%</div>)}
          <p className="text-sm text-muted-foreground mt-4">{mission?.subject} — {mission?.subtopic}</p>
          {!isSummary && score.total > 0 && (<p className="text-sm text-muted-foreground mt-1">{score.correct} de {score.total} corretas</p>)}
          <div className="mt-8 flex gap-3 justify-center">
            <Link to="/dashboard" className="px-6 py-2.5 rounded-full bg-foreground text-white text-sm font-medium hover:bg-foreground/90 transition-all">Voltar ao Dashboard</Link>
            <Link to="/study" className="px-6 py-2.5 rounded-full bg-white border border-gray-200 text-foreground text-sm font-medium hover:shadow-md transition-all">Mais Missões</Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Summary render (Change 3) ─────────────────────────────────────────────

  if (mission && SUMMARY_TYPES.includes(mission.mission_type)) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="flex items-center justify-between h-14">
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
              <span className="text-sm font-semibold text-foreground">Resumo</span>
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-foreground">{mission.subject}</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">{mission.subtopic}</p>

          {summaryLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Gerando resumo...</p>
            </div>
          )}

          {summaryError && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <p className="text-base font-medium text-foreground">Não foi possível gerar o resumo.</p>
              <p className="text-sm text-muted-foreground">Que tal conversar com o Tutor IA sobre esse assunto?</p>
              <Button onClick={() => navigate("/ai-tutor")}>Abrir Tutor IA</Button>
            </div>
          )}

          {summaryContent && (
            <div className="animate-fade-in">
              <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                {summaryContent}
              </div>
              <div className="mt-10 flex justify-center">
                <button
                  onClick={completeSummaryMission}
                  className="px-8 py-3 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-all"
                >
                  Entendi, concluir missão
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── No questions fallback ─────────────────────────────────────────────────

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 px-6 text-center">
          <p className="text-lg font-medium text-foreground">
            Estamos preparando questões para este tópico
          </p>
          <p className="text-sm text-muted-foreground">
            Enquanto isso, que tal conversar com o Tutor IA sobre {mission?.subject || "este assunto"}?
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>
              ← Voltar
            </Button>
            <Button onClick={() => navigate("/ai-tutor")}>
              Abrir Tutor IA
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Questions render ──────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen bg-white transition-all duration-300 ${showTutor ? "lg:mr-[380px]" : ""}`}>
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
            <span className="text-sm font-semibold text-foreground">{currentIndex + 1} de {questions.length}</span>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-foreground">{mission?.subject}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full -mt-1 mb-1"><div className="h-1.5 bg-foreground rounded-full transition-all duration-500" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">{mission?.subtopic}</p>
          <p className="text-lg font-semibold text-foreground leading-relaxed">{currentQuestion.question_text}</p>

          <div className="mt-8 space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.label;
              const showResult = selectedOption !== null;
              const isCorrect = option.is_correct;

              let optionClasses = "w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-start gap-3 ";
              if (showResult) {
                if (isCorrect) optionClasses += "bg-success/10 shadow-[inset_0_0_0_2px_hsl(var(--success))]";
                else if (isSelected && !isCorrect) optionClasses += "bg-destructive/10 shadow-[inset_0_0_0_2px_hsl(var(--destructive))]";
                else optionClasses += "bg-white opacity-50";
              } else {
                optionClasses += "bg-white border border-gray-200 hover:border-gray-400 hover:shadow-md cursor-pointer";
              }

              return (
                <button key={option.label} onClick={() => handleAnswer(option.label)} disabled={!!selectedOption} className={optionClasses}>
                  <span className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-semibold ${
                    showResult && isCorrect ? "bg-success text-success-foreground" :
                    showResult && isSelected ? "bg-destructive text-destructive-foreground" :
                    "bg-gray-100 text-muted-foreground"
                  }`}>{option.label}</span>
                  <span className="text-sm text-foreground pt-1">{option.text}</span>
                </button>
              );
            })}
          </div>

          {selectedOption && currentQuestion.explanation && (
            <div className="mt-6 p-4 bg-gray-50 rounded-2xl animate-fade-in">
              <p className="text-xs font-semibold text-foreground mb-1">Explicação</p>
              <p className="text-sm text-foreground leading-relaxed">{currentQuestion.explanation}</p>
            </div>
          )}

          {/* Tutor help button */}
          {!showTutor && (
            <button
              onClick={openTutor}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-3"
            >
              <Sparkles className="h-4 w-4" />
              Pedir ajuda ao Tutor
            </button>
          )}
        </div>
      </main>

      {/* ─── Tutor panel (Sprint 6) ──────────────────────────────── */}
      {showTutor && (
        <>
          {/* Mobile: fullscreen overlay */}
          <div className="fixed inset-0 z-50 bg-white flex flex-col lg:hidden">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Tutor IA</span>
              </div>
              <button onClick={closeTutor} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div ref={tutorScrollMobileRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {tutorMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-8">
                  Pergunte algo sobre esta questão. O tutor vai guiar seu raciocínio sem dar a resposta.
                </p>
              )}
              {tutorMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-foreground text-white"
                      : "bg-gray-100 text-foreground"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {tutorLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                    Pensando...
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={e => { e.preventDefault(); sendTutorMessage(tutorInput); }} className="flex gap-2">
                <input
                  type="text"
                  value={tutorInput}
                  onChange={e => setTutorInput(e.target.value)}
                  placeholder="Sua dúvida..."
                  className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                  disabled={tutorLoading}
                />
                <button
                  type="submit"
                  disabled={tutorLoading || !tutorInput.trim()}
                  className="h-10 w-10 rounded-full bg-foreground text-white flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Desktop: side panel */}
          <div className="hidden lg:flex fixed top-0 right-0 w-[380px] h-screen border-l border-gray-100 bg-white flex-col z-50">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Tutor IA</span>
              </div>
              <button onClick={closeTutor} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div ref={tutorScrollDesktopRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {tutorMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-8">
                  Pergunte algo sobre esta questão. O tutor vai guiar seu raciocínio sem dar a resposta.
                </p>
              )}
              {tutorMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-foreground text-white"
                      : "bg-gray-100 text-foreground"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {tutorLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                    Pensando...
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={e => { e.preventDefault(); sendTutorMessage(tutorInput); }} className="flex gap-2">
                <input
                  type="text"
                  value={tutorInput}
                  onChange={e => setTutorInput(e.target.value)}
                  placeholder="Sua dúvida..."
                  className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                  disabled={tutorLoading}
                />
                <button
                  type="submit"
                  disabled={tutorLoading || !tutorInput.trim()}
                  className="h-10 w-10 rounded-full bg-foreground text-white flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MissionPage;
