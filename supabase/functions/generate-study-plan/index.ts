import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProfScore {
  subject: string;
  score: number;
  confidence: number;
}

interface SubjectPlan {
  subject: string;
  finalPriority: number;
  weeklyMinutes: number;
  bucket: "maintenance" | "attack";
  examRelevance: number;
}

interface Mission {
  subject: string;
  subtopic: string;
  type: string;
  estimated_minutes: number;
  description: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const ALL_SUBJECTS = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Biologia",
  "Física",
  "Química",
  "Inglês",
  "Filosofia",
];

const DAYS = [
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
  "Domingo",
];

const SUBTOPICS: Record<string, string[]> = {
  Português: [
    "Interpretação de texto",
    "Gramática",
    "Literatura brasileira",
    "Figuras de linguagem",
  ],
  Matemática: [
    "Álgebra",
    "Geometria plana",
    "Funções",
    "Probabilidade",
    "Trigonometria",
  ],
  História: [
    "Brasil Colônia e Império",
    "Era Vargas e República",
    "Idade Moderna",
    "Revolução Industrial",
  ],
  Geografia: [
    "Geopolítica",
    "Climatologia",
    "Geografia do Brasil",
    "Urbanização",
  ],
  Biologia: [
    "Ecologia",
    "Genética",
    "Fisiologia humana",
    "Biologia celular",
  ],
  Física: ["Mecânica", "Termodinâmica", "Eletricidade", "Óptica"],
  Química: [
    "Química orgânica",
    "Estequiometria",
    "Termoquímica",
    "Equilíbrio químico",
  ],
  Inglês: [
    "Interpretação de texto",
    "Vocabulário em contexto",
    "Gramática aplicada",
  ],
  Filosofia: ["Ética e moral", "Filosofia política", "Epistemologia"],
};

// Mission type → [min, max] minutes
const DURATIONS: Record<string, [number, number]> = {
  questions: [20, 30],
  error_review: [10, 15],
  short_summary: [8, 12],
  spaced_review: [5, 10],
  mixed_block: [25, 40],
  reading_work: [15, 25],
  writing_outline: [15, 20],
  writing_partial: [25, 30],
};

// Beta: apenas missões do tipo "questions" em todos os planos gerados.
// Outros tipos (summaries, spaced_review, error_review, etc.) serão introduzidos em fases futuras.
const COMPOSITION: Record<string, Record<string, number>> = {
  base:         { questions: 1.0 },
  intermediario: { questions: 1.0 },
  competitivo:  { questions: 1.0 },
  forte:        { questions: 1.0 },
};

const BLOCK_MAP: Record<string, string> = {
  Português: "linguagens",
  Inglês: "linguagens",
  Matemática: "matematica",
  História: "humanas",
  Geografia: "humanas",
  Filosofia: "humanas",
  Biologia: "natureza",
  Física: "natureza",
  Química: "natureza",
};

// ─── Priority Formula (§3) ─────────────────────────────────────────────────

function buildPriorities(
  profMap: Map<string, ProfScore>,
  bottlenecks: string[],
  strengths: string[],
  phase2: string[],
  subjectDist: Record<string, { questions?: number }>,
  selfDeclared: Record<string, string>,
  daysUntilExam: number,
  competitionRatio: number,
): SubjectPlan[] {
  return ALL_SUBJECTS.map((subject) => {
    // §3.2 diagnostic_gap
    let diagnosticGap = 0.5;
    if (bottlenecks.includes(subject)) diagnosticGap = 1.0;
    else if (strengths.includes(subject)) diagnosticGap = 0.15;

    // §3.2 exam_relevance
    const isPhase2 = phase2.includes(subject);
    const qCount = subjectDist[subject]?.questions || 0;
    const highWeight = qCount >= 12;
    const medWeight = qCount >= 5;
    let examRelevance = 0.2;
    if (isPhase2 && highWeight) examRelevance = 1.0;
    else if (isPhase2 || highWeight) examRelevance = 0.7;
    else if (medWeight) examRelevance = 0.4;

    // §3.2 uncertainty
    const prof = profMap.get(subject);
    let uncertainty = 1.0;
    if (prof && prof.confidence > 0.2) uncertainty = 0.2;
    else if (prof && prof.confidence > 0.1) uncertainty = 0.6;

    // §3.2 recency_need — week 1: never practiced
    const recencyNeed = 0.7;

    // §3.2 self_declared_gap
    const block = BLOCK_MAP[subject];
    const level = block ? selfDeclared[block] : undefined;
    let selfDeclaredGap = 0.4;
    if (level === "fraco") selfDeclaredGap = 1.0;
    else if (level === "forte") selfDeclaredGap = 0.1;

    // §3.1 base_priority
    let basePriority =
      0.35 * diagnosticGap +
      0.25 * examRelevance +
      0.15 * uncertainty +
      0.15 * recencyNeed +
      0.1 * selfDeclaredGap;

    // §3.2 Trava: uncertainty can't push above 0.70 if exam_relevance < 0.4
    if (examRelevance < 0.4 && basePriority > 0.7) {
      const baseNoUncertainty =
        0.35 * diagnosticGap +
        0.25 * examRelevance +
        0.15 * recencyNeed +
        0.1 * selfDeclaredGap;
      if (baseNoUncertainty <= 0.7) basePriority = 0.7;
    }

    // §3.1 light_modifier
    let lightMod = 1.0;
    if (daysUntilExam < 90 && isPhase2) lightMod *= 1.15;
    if (competitionRatio > 30 && bottlenecks.includes(subject))
      lightMod *= 1.1;
    lightMod = Math.min(1.2, Math.max(0.8, lightMod));

    const finalPriority = basePriority * lightMod;

    return {
      subject,
      finalPriority,
      weeklyMinutes: 0,
      bucket: "attack" as const,
      examRelevance,
    };
  });
}

// ─── Time Budget (§4, §5) ──────────────────────────────────────────────────

function distributeBudget(
  priorities: SubjectPlan[],
  plannedMinutes: number,
  maintenancePct: number,
  strengths: string[],
  phase2: string[],
): SubjectPlan[] {
  const maintBudget = plannedMinutes * maintenancePct;
  const attackBudget = plannedMinutes * (1 - maintenancePct);

  // §5.2 Maintenance subjects
  const maintSet = new Set<string>();
  for (const s of phase2) maintSet.add(s);
  for (const s of strengths) {
    const p = priorities.find((x) => x.subject === s);
    if (p && p.examRelevance >= 0.7) maintSet.add(s);
  }

  const maint = priorities.filter((p) => maintSet.has(p.subject));
  const attack = priorities.filter((p) => !maintSet.has(p.subject));

  // §5.2 Distribute maintenance proportional to exam_relevance, min 20
  const maintRelTotal =
    maint.reduce((s, p) => s + p.examRelevance, 0) || 1;
  for (const p of maint) {
    p.bucket = "maintenance";
    p.weeklyMinutes = Math.max(
      20,
      Math.round((p.examRelevance / maintRelTotal) * maintBudget),
    );
  }

  // §5.3 Distribute attack proportional to finalPriority, cap 30%, floor 15
  const attackPriTotal =
    attack.reduce((s, p) => s + p.finalPriority, 0) || 1;
  const maxPerSubject = attackBudget * 0.3;
  for (const p of attack) {
    p.bucket = "attack";
    let mins = Math.round(
      (p.finalPriority / attackPriTotal) * attackBudget,
    );
    mins = Math.min(mins, maxPerSubject);
    mins = Math.max(mins, 15);
    p.weeklyMinutes = mins;
  }

  // §5.4 Low-time students: focus on 2-3 subjects
  if (plannedMinutes <= 210) {
    const topAttack = [...attack]
      .sort((a, b) => b.finalPriority - a.finalPriority)
      .slice(0, 2);
    const topMaint = [...maint]
      .sort((a, b) => b.examRelevance - a.examRelevance)
      .slice(0, 1);
    for (const p of attack)
      if (!topAttack.includes(p)) p.weeklyMinutes = 0;
    for (const p of maint)
      if (!topMaint.includes(p)) p.weeklyMinutes = 0;
  }

  return [...maint, ...attack];
}

// ─── Mission Composition (§6, §8, §9) ──────────────────────────────────────

function missionsPerDay(hpd: number): number {
  if (hpd <= 0.5) return 1;
  if (hpd <= 1) return 2;
  return 3;
}

function targetMinutes(hpd: number): number {
  if (hpd <= 0.5) return 22;
  if (hpd <= 1) return 45;
  if (hpd <= 2) return 90;
  return 130;
}

function pickSubtopic(subject: string, used: Set<string>): string {
  const opts = SUBTOPICS[subject] || [subject];
  const unused = opts.filter((st) => !used.has(`${subject}:${st}`));
  const pool = unused.length > 0 ? unused : opts;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  used.add(`${subject}:${pick}`);
  return pick;
}

function missionDescription(type: string, subject: string, subtopic: string): string {
  switch (type) {
    case "questions":
      return `Resolva questões de ${subtopic}`;
    case "error_review":
      return `Revise seus erros em ${subtopic}`;
    case "short_summary":
      return `Resumo rápido: ${subtopic}`;
    case "spaced_review":
      return `Revisão espaçada: ${subtopic}`;
    case "mixed_block":
      return `Bloco misto simulando prova — ${subject}`;
    case "reading_work":
      return `Leitura obrigatória do vestibular`;
    case "writing_outline":
      return `Planejamento de redação`;
    case "writing_partial":
      return `Rascunho parcial de redação`;
    default:
      return `Estudo de ${subject}: ${subtopic}`;
  }
}

function durationFor(type: string): number {
  const range = DURATIONS[type] || [15, 20];
  return Math.round((range[0] + range[1]) / 2);
}

function composePlan(
  priorities: SubjectPlan[],
  band: string,
  hpd: number,
  numDays: number,
  strengths: string[],
  bottlenecks: string[],
): { day: string; missions: Mission[] }[] {
  const comp = COMPOSITION[band] || COMPOSITION.intermediario;
  const slotsPerDay = missionsPerDay(hpd);
  const maxMinPerDay = targetMinutes(hpd);
  const totalSlots = slotsPerDay * numDays;

  // §6 Determine how many slots per mission type
  const typeSlots: { type: string; count: number }[] = [];
  for (const [type, pct] of Object.entries(comp)) {
    if (type === "mixed_block") continue; // §8 skip in week 1
    let t = type;
    if (t === "writing") t = "writing_outline"; // §8 week 1 → outline
    const count = Math.max(type === "reading_work" || t === "writing_outline" ? 1 : 0,
      Math.round(pct * totalSlots));
    if (count > 0) typeSlots.push({ type: t, count });
  }

  // Build ordered mission pool: assign subjects to type slots
  const active = priorities
    .filter((p) => p.weeklyMinutes > 0)
    .sort((a, b) => b.finalPriority - a.finalPriority);

  // Track remaining minutes per subject
  const remaining = new Map<string, number>();
  for (const p of active) remaining.set(p.subject, p.weeklyMinutes);

  const pool: { subject: string; type: string; minutes: number }[] = [];
  const usedSubtopics = new Set<string>();

  // For each type, assign subjects that still have minutes
  for (const { type, count } of typeSlots) {
    // Pick subjects in priority order, cycling
    let subjectIdx = 0;
    for (let i = 0; i < count; i++) {
      // Find next subject with remaining minutes
      let found = false;
      for (let attempt = 0; attempt < active.length; attempt++) {
        const idx = (subjectIdx + attempt) % active.length;
        const subj = active[idx].subject;
        const rem = remaining.get(subj) || 0;
        const dur = durationFor(type);
        if (rem >= dur * 0.5) {
          pool.push({ subject: subj, type, minutes: dur });
          remaining.set(subj, rem - dur);
          subjectIdx = (idx + 1) % active.length;
          found = true;
          break;
        }
      }
      if (!found && active.length > 0) {
        // Fallback: just use highest priority
        const subj = active[0].subject;
        pool.push({ subject: subj, type, minutes: durationFor(type) });
      }
    }
  }

  // §8 Week 1 rules: mission 1 of day 1 = strength, mission 2 = bottleneck
  const strengthItem = pool.findIndex((m) => strengths.includes(m.subject) && m.type === "questions");
  const bottleneckItem = pool.findIndex((m) => bottlenecks.includes(m.subject) && m.type === "questions");

  // Move strength to front
  if (strengthItem > 0) {
    const [item] = pool.splice(strengthItem, 1);
    pool.unshift(item);
  }
  // Move bottleneck to second
  const bnIdx = pool.findIndex((m) => bottlenecks.includes(m.subject) && m.type === "questions" && pool.indexOf(m) !== 0);
  if (bnIdx > 1) {
    const [item] = pool.splice(bnIdx, 1);
    pool.splice(1, 0, item);
  }

  // Distribute to days
  const dayPlans: { day: string; missions: Mission[] }[] = DAYS.slice(
    0,
    numDays,
  ).map((day) => ({ day, missions: [] }));

  let dayIdx = 0;
  for (const slot of pool) {
    // Try to avoid same subject on same day
    let placed = false;
    for (let attempt = 0; attempt < numDays; attempt++) {
      const tryDay = (dayIdx + attempt) % numDays;
      const daySubjects = dayPlans[tryDay].missions.map((m) => m.subject);
      const dayMinutes = dayPlans[tryDay].missions.reduce(
        (s, m) => s + m.estimated_minutes,
        0,
      );

      if (
        dayPlans[tryDay].missions.length < slotsPerDay &&
        dayMinutes + slot.minutes <= maxMinPerDay * 1.2 &&
        !daySubjects.includes(slot.subject)
      ) {
        const subtopic = pickSubtopic(slot.subject, usedSubtopics);
        dayPlans[tryDay].missions.push({
          subject: slot.subject,
          subtopic,
          type: slot.type,
          estimated_minutes: slot.minutes,
          description: missionDescription(slot.type, slot.subject, subtopic),
        });
        dayIdx = (tryDay + 1) % numDays;
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Fallback: place on least-full day
      const leastFull = dayPlans.reduce((best, day, i) =>
        day.missions.length < dayPlans[best].missions.length ? i : best, 0);
      const subtopic = pickSubtopic(slot.subject, usedSubtopics);
      dayPlans[leastFull].missions.push({
        subject: slot.subject,
        subtopic,
        type: slot.type,
        estimated_minutes: slot.minutes,
        description: missionDescription(slot.type, slot.subject, subtopic),
      });
    }
  }

  // §9.3 Cognitive sequencing within each day
  const intensity: Record<string, number> = {
    short_summary: 1,
    spaced_review: 2,
    reading_work: 3,
    writing_outline: 3,
    questions: 4,
    error_review: 5,
    writing_partial: 5,
    mixed_block: 6,
  };

  for (const day of dayPlans) {
    if (day.missions.length <= 1) continue;
    // Sort by intensity then reorder: medium → heavy → light
    const sorted = [...day.missions].sort(
      (a, b) => (intensity[a.type] || 3) - (intensity[b.type] || 3),
    );
    if (sorted.length === 2) {
      // [lighter, heavier] → good as-is (activation → peak)
      day.missions = sorted;
    } else if (sorted.length >= 3) {
      // [light, medium, heavy] → reorder to [medium, heavy, light]
      day.missions = [sorted[1], sorted[sorted.length - 1], sorted[0]];
    }
  }

  // Remove empty days
  return dayPlans.filter((d) => d.missions.length > 0);
}

// ─── Main Handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      proficiencyScores,
      userProfile,
      diagnosticResult,
      examConfig,
      weekNumber,
      completionRate,
      spacedReviews,
    } = body;

    // ─── Parse inputs with safe defaults ───────────────────────
    const profMap = new Map<string, ProfScore>();
    for (const p of proficiencyScores?.proficiency || []) {
      profMap.set(p.subject, p);
    }

    const band: string =
      diagnosticResult?.placement_band || "intermediario";
    const strengths: string[] = diagnosticResult?.strengths || [];
    const bottlenecks: string[] =
      diagnosticResult?.bottlenecks ||
      proficiencyScores?.priority_areas ||
      [];
    const phase2: string[] = examConfig?.phase2_subjects || [];
    const subjectDist: Record<string, { questions?: number }> =
      examConfig?.subject_distribution || {};
    const competitionRatio: number = examConfig?.competition_ratio || 10;
    const selfDeclared: Record<string, string> =
      userProfile?.self_declared_blocks || {};

    const hpd: number = userProfile?.hours_per_day || 1;
    const sd = userProfile?.available_days || userProfile?.study_days;
    const numDays: number =
      typeof sd === "number"
        ? sd
        : Array.isArray(sd)
          ? sd.length
          : 5;

    const examDate = userProfile?.exam_date;
    const daysUntilExam = examDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(examDate).getTime() - Date.now()) / 86400000,
          ),
        )
      : 180;

    // ─── §3 Calculate priorities ───────────────────────────────
    const priorities = buildPriorities(
      profMap,
      bottlenecks,
      strengths,
      phase2,
      subjectDist,
      selfDeclared,
      daysUntilExam,
      competitionRatio,
    );

    // ─── §4 Time budget (single adherence application) ─────────
    const wk: number = weekNumber || 1;
    const cr: number = completionRate ?? -1;
    let adherence = wk === 1 ? 0.80 : 0.85;
    if (cr >= 0 && cr < 50) adherence = 0.70;
    else if (cr > 90) adherence = 0.90;

    const declaredMinutes = hpd * numDays * 60;
    const plannedMinutes = Math.round(declaredMinutes * adherence);

    // ─── §5 Maintenance / attack split ─────────────────────────
    let maintPct = 0.25;
    if (daysUntilExam < 90 || phase2.length >= 3) maintPct = 0.3;
    else if (daysUntilExam > 180 && band === "base") maintPct = 0.2;

    const distributed = distributeBudget(
      priorities,
      plannedMinutes,
      maintPct,
      strengths,
      phase2,
    );

    // ─── §8, §9 Compose missions ──────────────────────────────
    const dayPlans = composePlan(
      distributed,
      band,
      hpd,
      numDays,
      strengths,
      bottlenecks,
    );

    // Beta: injeção de spaced_review desabilitada — planos geram apenas "questions".
    // Reativar quando revisão espaçada for introduzida no produto.

    const focusAreas = distributed
      .filter((p) => p.weeklyMinutes > 0 && p.bucket === "attack")
      .sort((a, b) => b.finalPriority - a.finalPriority)
      .slice(0, 3)
      .map((p) => p.subject);

    // ─── Output ────────────────────────────────────────────────
    const plan = {
      weeks: [
        {
          week: wk,
          focus_areas: focusAreas,
          message: wk === 1
            ? "Este é seu plano inicial. Vamos calibrar nas próximas sessões."
            : `Semana ${wk}: plano ajustado com base no seu desempenho.`,
          days: dayPlans,
        },
      ],
      metadata: {
        generation_mode: "deterministic_v2.2",
        planned_weekly_minutes: plannedMinutes,
        declared_weekly_minutes: declaredMinutes,
        adherence_factor: adherence,
        maintenance_pct: maintPct,
        placement_band: band,
        week_number: wk,
        spaced_reviews_injected: 0,
      },
    };

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("generate-study-plan error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
