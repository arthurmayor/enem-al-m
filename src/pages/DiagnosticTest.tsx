import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

interface SubjectDistEntry {
  questions: number;
  meanDiff: number;
  sdDiff: number;
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

interface Proficiency {
  elo: number;
  correct: number;
  total: number;
}

// ─── Elo v3 Functions ────────────────────────────────────────────────────────

function eloExpected(studentElo: number, questionElo: number): number {
  return 1 / (1 + Math.pow(10, (questionElo - studentElo) / 400));
}

function eloUpdate(rating: number, expected: number, actual: number, k: number): number {
  return rating + k * (actual - expected);
}

function getKFactor(numAttempts: number, totalQuestionsForSubject: number): number {
  // Base K by experience
  const baseK = numAttempts < 10 ? 32 : numAttempts < 30 ? 16 : 8;
  // Boost for subjects with ≤3 questions in diagnostic: each answer weighs more
  if (totalQuestionsForSubject <= 3) return Math.round(baseK * 1.5);
  return baseK;
}

function expectedAccuracy(studentElo: number, meanDiff: number, sdDiff: number): number {
  const grid = [-2.0, -1.5, -1.0, -0.5, -0.25, 0, 0.25, 0.5, 1.0, 1.5, 2.0];
  const weights = [0.02, 0.05, 0.10, 0.15, 0.18, 0.18, 0.15, 0.10, 0.05, 0.02, 0.00];
  let totalP = 0;
  for (let i = 0; i < grid.length; i++) {
    const qDiff = meanDiff + grid[i] * sdDiff;
    totalP += (1 / (1 + Math.pow(10, (qDiff - studentElo) / 400))) * weights[i];
  }
  return totalP;
}

function estimateScore(
  proficiencies: Record<string, Proficiency>,
  subjectDist: Record<string, SubjectDistEntry>,
  totalDiagnosticQuestions: number,
  totalDiagnosticCorrect: number,
  totalSimulados: number = 0,
  totalQuestionsEver: number = 0,
): number {
  // === ACERTO DIRETO: projeção linear da taxa de acerto real ===
  // Se acertou 50% do diagnóstico, projeta 50% × 90 = 45 pontos
  const rawAccuracyRate = totalDiagnosticQuestions > 0
    ? totalDiagnosticCorrect / totalDiagnosticQuestions
    : 0;
  const directScore = rawAccuracyRate * 90;

  // === ACERTO POR ELO: projeção via grade discreta por matéria ===
  let eloScore = 0;
  let totalQInDist = 0;
  for (const [subject, dist] of Object.entries(subjectDist)) {
    const elo = proficiencies[subject]?.elo || 1200;
    eloScore += expectedAccuracy(elo, dist.meanDiff, dist.sdDiff) * dist.questions;
    totalQInDist += dist.questions;
  }
  // Normalizar para 90 se a distribuição não somar 90
  if (totalQInDist !== 90 && totalQInDist > 0) {
    eloScore = (eloScore / totalQInDist) * 90;
  }

  // === BLEND: peso do acerto direto diminui conforme mais dados ===
  // No diagnóstico (30 questões, 0 simulados): peso direto = 0.75, peso Elo = 0.25
  // Após 100 questões + 1 simulado: peso direto = 0.50, peso Elo = 0.50
  // Após 300 questões + 3 simulados: peso direto = 0.25, peso Elo = 0.75
  // Após 500+ questões + 5 simulados: peso direto = 0.10, peso Elo = 0.90
  const dataVolume = (totalQuestionsEver || totalDiagnosticQuestions) + (totalSimulados * 90);
  let directWeight: number;
  if (dataVolume <= 50) directWeight = 0.75;
  else if (dataVolume <= 200) directWeight = 0.50;
  else if (dataVolume <= 500) directWeight = 0.25;
  else directWeight = 0.10;

  const eloWeight = 1 - directWeight;
  let score = directScore * directWeight + eloScore * eloWeight;

  // === Sanity checks ===
  if (score > 90) {
    console.error('SCORE > 90, clamping:', score);
    score = 90;
  }
  if (score < 0) {
    console.error('SCORE < 0, clamping:', score);
    score = 0;
  }
  // Score não pode ser maior que acerto_real * 90 * 1.2 (no máximo 20% acima do acerto real)
  const maxReasonableScore = rawAccuracyRate * 90 * 1.2;
  if (score > maxReasonableScore && rawAccuracyRate > 0) {
    console.warn(`Score ${score} acima do razoável (max ${maxReasonableScore}). Clamping.`);
    score = maxReasonableScore;
  }

  return Math.round(score * 10) / 10;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

function calculatePassProbability(
  score: number,
  cutoffMean: number,
  cutoffSd: number,
  questionsAnswered: number,
  simulados: number,
  subjectsCovered: number
): number {
  // Validação: cutoff_sd não pode ser maior que 5 (seria absurdo para nota de corte)
  const safeCutoffSd = Math.min(cutoffSd, 5);

  // Validação: score e cutoff devem estar na mesma escala
  if (score > 100 && cutoffMean < 100) {
    console.error(`ESCALA INCOMPATÍVEL: score=${score}, cutoff=${cutoffMean}. Corrigir exam_configs.`);
  }

  const infoScore = (questionsAnswered / 100) + (simulados * 3) + (subjectsCovered * 0.5);
  const sigmaStudent = Math.max(3, 8 / Math.sqrt(Math.max(0.1, infoScore)));
  const muDiff = score - cutoffMean;
  const sigmaDiff = Math.sqrt(sigmaStudent ** 2 + safeCutoffSd ** 2);
  const raw = normalCDF(muDiff / sigmaDiff);
  return Math.max(0.01, Math.min(0.98, raw));
}

function getProbabilityBand(prob: number) {
  if (prob < 0.03) return { band: "< 3%", label: "Início da jornada", color: "#991b1b", bgColor: "#fef2f2", borderColor: "#fecaca" };
  if (prob < 0.10) return { band: "3–10%", label: "Distante da meta", color: "#9a3412", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  if (prob < 0.25) return { band: "10–25%", label: "Em construção", color: "#854d0e", bgColor: "#fefce8", borderColor: "#fef08a" };
  if (prob < 0.40) return { band: "25–40%", label: "Potencial", color: "#a16207", bgColor: "#fefce8", borderColor: "#fef08a" };
  if (prob < 0.55) return { band: "40–55%", label: "Competitivo", color: "#15803d", bgColor: "#f0fdf4", borderColor: "#bbf7d0" };
  if (prob < 0.70) return { band: "55–70%", label: "Forte candidato", color: "#166534", bgColor: "#f0fdf4", borderColor: "#86efac" };
  return { band: "> 70%", label: "Excelente posição", color: "#14532d", bgColor: "#ecfdf5", borderColor: "#6ee7b7" };
}

function getLevel(elo: number) {
  if (elo >= 1500) return { label: "Avançado", color: "#14532d" };
  if (elo >= 1350) return { label: "Bom", color: "#059669" };
  if (elo >= 1200) return { label: "Intermediário", color: "#d97706" };
  if (elo >= 1050) return { label: "Baixo", color: "#dc2626" };
  return { label: "Muito baixo", color: "#991b1b" };
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

// ─── Fallback mock questions ─────────────────────────────────────────────────

const FALLBACK_SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];
const DIFFICULTY_ELOS = [900, 1050, 1200, 1400, 1600];

function generateFallbackQuestions(examSlug: string): Question[] {
  const questions: Question[] = [];
  for (let i = 0; i < 30; i++) {
    const subject = FALLBACK_SUBJECTS[i % FALLBACK_SUBJECTS.length];
    const diffIdx = Math.min(4, Math.floor(i / 6));
    const diffElo = DIFFICULTY_ELOS[diffIdx];
    const correctIdx = i % 5;
    questions.push({
      id: `fallback-${i}`,
      subject,
      subtopic: `Tópico Geral`,
      difficulty: diffIdx + 1,
      difficulty_elo: diffElo,
      question_text: `[${subject} — ${examSlug.toUpperCase()}] Questão de exemplo ${i + 1}. Esta é uma questão placeholder de dificuldade ${diffIdx + 1}. Selecione a alternativa correta.`,
      options: [
        { label: "A", text: "Alternativa A", is_correct: correctIdx === 0 },
        { label: "B", text: "Alternativa B", is_correct: correctIdx === 1 },
        { label: "C", text: "Alternativa C", is_correct: correctIdx === 2 },
        { label: "D", text: "Alternativa D", is_correct: correctIdx === 3 },
        { label: "E", text: "Alternativa E", is_correct: correctIdx === 4 },
      ],
      explanation: "Explicação da resposta correta.",
    });
  }
  return questions;
}

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
  const [usingFallback, setUsingFallback] = useState(false);

  // Elo tracking per subject
  const proficienciesRef = useRef<Record<string, Proficiency>>({});
  const totalCorrectRef = useRef(0);
  const rawAnswersRef = useRef<Array<{ question_id: string; subject: string; selected: string; is_correct: boolean; response_time: number; difficulty_elo: number }>>([]);

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
        .select("exam_config_id")
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

      let finalQuestions: Question[];
      if (dbQuestions && dbQuestions.length >= 20) {
        finalQuestions = interleaveQuestions(
          dbQuestions.map((q) => ({
            id: q.id,
            subject: q.subject,
            subtopic: q.subtopic,
            difficulty: q.difficulty,
            difficulty_elo: q.difficulty_elo || 1200,
            question_text: q.question_text,
            options: q.options as QuestionOption[],
            explanation: q.explanation,
          })),
          TOTAL_QUESTIONS
        );
        setUsingFallback(false);
      } else {
        finalQuestions = generateFallbackQuestions(examConf.exam_slug);
        setUsingFallback(true);
      }

      setQuestions(finalQuestions);
      setLoading(false);
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
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
      if (user && !q.id.startsWith("fallback")) {
        await supabase.from("answer_history").insert({
          user_id: user.id,
          question_id: q.id,
          selected_option: optionLabel,
          is_correct: correct,
          response_time_seconds: responseTime,
          context: "diagnostic",
        });
      }

      // Next question after delay
      setTimeout(() => {
        if (currentIndex < TOTAL_QUESTIONS - 1) {
          setCurrentIndex((i) => i + 1);
          setSelectedOption(null);
          setQuestionStartTime(Date.now());
        } else {
          // Finalize and navigate
          finishDiagnostic();
        }
      }, 1200);
    },
    [selectedOption, currentQuestion, currentIndex, questionStartTime, user]
  );

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

    // CORREÇÃO 5: Debug log permanente — NÃO REMOVER
    const distTotal = Object.values(subjectDist).reduce((s, d) => s + d.questions, 0);
    console.log("=== DIAGNOSTIC RESULT DEBUG ===", {
      totalQuestionsInDist: distTotal,
      estimatedScore: score,
      cutoffMean,
      cutoffSd,
      gap,
      probability,
      probBand,
      proficiencies: Object.fromEntries(
        Object.entries(prof).map(([k, v]) => [k, { elo: Math.round(v.elo), correct: v.correct, total: v.total }])
      ),
    });

    // Priority areas: subjects with Elo < 1200, sorted by impact
    const priorities = Object.entries(prof)
      .filter(([, p]) => p.elo < 1200)
      .sort((a, b) => a[1].elo - b[1].elo)
      .map(([subject, p]) => ({
        subject,
        elo: Math.round(p.elo),
        level: getLevel(p.elo),
      }));

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

  if (loading || !currentQuestion) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-foreground">
              Questão {currentIndex + 1} de {TOTAL_QUESTIONS}
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
              style={{ width: `${((currentIndex + 1) / TOTAL_QUESTIONS) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {usingFallback && (
        <div className="bg-warning/10 border-b border-warning/20 px-4 py-2">
          <p className="text-xs text-center text-warning font-medium max-w-3xl mx-auto">
            Modo demonstração — questões de diagnóstico insuficientes no banco. Importe questões na tabela diagnostic_questions.
          </p>
        </div>
      )}

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
