#!/usr/bin/env node
/**
 * Gera 200 questões de diagnóstico para Fuvest via Claude API
 * e insere diretamente na tabela diagnostic_questions do Supabase.
 *
 * Uso: ANTHROPIC_API_KEY=sk-... node scripts/generate-diagnostic-questions.mjs
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY não definida. Uso: ANTHROPIC_API_KEY=sk-... node scripts/generate-diagnostic-questions.mjs");
  process.exit(1);
}

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const DIFFICULTY_ELO_MAP = { 1: 900, 2: 1050, 3: 1200, 4: 1400, 5: 1600 };

const DIFFICULTY_DESCRIPTIONS = {
  1: "Fácil: conceito básico, aplicação direta, aluno mediano do ensino médio acerta",
  2: "Médio-fácil: requer algum raciocínio, mas sem pegadinhas",
  3: "Médio: nível típico da Fuvest, requer domínio do conteúdo",
  4: "Médio-difícil: exige raciocínio aprofundado ou conexão entre conceitos",
  5: "Difícil: questão que apenas os melhores alunos acertam, raciocínio multi-etapa",
};

// ─── Distribution matrix ─────────────────────────────────────────────────────

const SUBJECTS = [
  {
    name: "Português", total: 30, perDiff: 6,
    subtopics: [
      "Interpretação de texto", "Figuras de linguagem", "Análise sintática",
      "Concordância", "Regência", "Crase", "Gêneros textuais",
      "Obras obrigatórias (Machado de Assis, Guimarães Rosa, Clarice Lispector)",
      "Variação linguística", "Coesão e coerência",
    ],
  },
  {
    name: "Matemática", total: 25, perDiff: 5,
    subtopics: [
      "Funções (1º e 2º grau)", "Funções exponenciais e logarítmicas",
      "Geometria plana", "Geometria espacial", "Trigonometria",
      "Probabilidade e combinatória", "Progressões (PA/PG)",
      "Análise de gráficos", "Equações", "Porcentagem",
    ],
  },
  {
    name: "História", total: 25, perDiff: 5,
    subtopics: [
      "Brasil Colônia", "Brasil Império", "Brasil República",
      "Revolução Francesa", "Revolução Industrial", "Guerras Mundiais",
      "Guerra Fria", "Idade Média", "Antiguidade Clássica", "Escravidão e abolição",
    ],
  },
  {
    name: "Geografia", total: 25, perDiff: 5,
    subtopics: [
      "Clima e vegetação", "Demografia", "Urbanização",
      "Questões ambientais", "Globalização", "Espaço agrário",
      "Geopolítica", "Recursos naturais", "Cartografia", "Migrações",
    ],
  },
  {
    name: "Biologia", total: 20, perDiff: 4,
    subtopics: [
      "Ecologia", "Genética", "Citologia", "Evolução", "Botânica",
      "Zoologia", "Fisiologia humana", "Microbiologia", "Bioquímica", "Biotecnologia",
    ],
  },
  {
    name: "Física", total: 20, perDiff: 4,
    subtopics: [
      "Cinemática", "Dinâmica (Leis de Newton)", "Trabalho e energia",
      "Termologia", "Óptica", "Ondulatória", "Eletrostática",
      "Eletrodinâmica", "Magnetismo", "Hidrostática",
    ],
  },
  {
    name: "Química", total: 20, perDiff: 4,
    subtopics: [
      "Estrutura atômica", "Tabela periódica", "Ligações químicas",
      "Estequiometria", "Soluções", "Termoquímica", "Cinética",
      "Equilíbrio químico", "Eletroquímica", "Química orgânica",
    ],
  },
  {
    name: "Inglês", total: 15, perDiff: 3,
    subtopics: [
      "Interpretação de texto (científico)", "Interpretação (cotidiano)",
      "Vocabulário em contexto", "Conectivos e referência",
      "Inferência", "Falsos cognatos",
    ],
  },
  {
    name: "Filosofia", total: 20, perDiff: 4,
    subtopics: [
      "Filosofia Antiga (Sócrates, Platão, Aristóteles)", "Filosofia Medieval",
      "Filosofia Moderna (Descartes, Kant)", "Filosofia Contemporânea",
      "Ética", "Política", "Sociologia clássica (Durkheim, Weber, Marx)",
      "Cultura e ideologia", "Cidadania", "Movimentos sociais",
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaude(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 8192,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Claude");

      // Strip markdown fences if present
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (err) {
      console.error(`  ⚠️  Tentativa ${attempt}/${retries} falhou: ${err.message}`);
      if (attempt < retries) {
        const waitMs = 2000 * Math.pow(2, attempt - 1);
        console.error(`  Aguardando ${waitMs / 1000}s antes de tentar novamente...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

function validateQuestion(q, expectedSubject, expectedDifficulty) {
  const errors = [];
  if (!q.question_text || q.question_text.trim().length < 10)
    errors.push("question_text vazio ou muito curto");
  if (!q.subject) errors.push("subject vazio");
  if (!q.subtopic) errors.push("subtopic vazio");
  if (!Array.isArray(q.options) || q.options.length !== 5)
    errors.push(`options deve ter 5 itens (tem ${q.options?.length})`);
  else {
    const correctCount = q.options.filter((o) => o.is_correct === true).length;
    if (correctCount !== 1) errors.push(`deve ter exatamente 1 correta (tem ${correctCount})`);
    const labels = q.options.map((o) => o.label).sort().join("");
    if (labels !== "ABCDE") errors.push(`labels devem ser A-E (tem ${labels})`);
    for (const o of q.options) {
      if (!o.text || o.text.trim().length < 2) errors.push(`opção ${o.label} texto vazio`);
    }
  }
  if (!q.explanation) errors.push("explanation vazio");
  return errors;
}

async function supabaseInsert(rows) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diagnostic_questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase insert failed: HTTP ${response.status} — ${errorText}`);
  }
  return true;
}

function buildPrompt(subject, subtopics, difficulty, count) {
  const subtopicList = subtopics.map((s) => `- ${s}`).join("\n");
  return `Gere ${count} questões de múltipla escolha para vestibular FUVEST.

Matéria: ${subject}
Subtópicos a cobrir:
${subtopicList}

Dificuldade: ${difficulty} (${DIFFICULTY_DESCRIPTIONS[difficulty]})

Requisitos:
- 5 alternativas (A a E), exatamente 1 correta
- Estilo da Fuvest: enunciados claros, alternativas plausíveis, pegadinhas realistas
- Cada questão deve testar um subtópico diferente
- Explicação breve da resposta correta (2-3 linhas)
- Dificuldade ${difficulty}: ${DIFFICULTY_DESCRIPTIONS[difficulty]}

Responda APENAS em JSON válido, sem markdown, sem backticks. Formato exato:
[
  {
    "subject": "${subject}",
    "subtopic": "Nome do Subtópico",
    "difficulty": ${difficulty},
    "question_text": "Enunciado da questão",
    "options": [
      {"label": "A", "text": "Alternativa A", "is_correct": false},
      {"label": "B", "text": "Alternativa B", "is_correct": true},
      {"label": "C", "text": "Alternativa C", "is_correct": false},
      {"label": "D", "text": "Alternativa D", "is_correct": false},
      {"label": "E", "text": "Alternativa E", "is_correct": false}
    ],
    "explanation": "Explicação da resposta correta"
  }
]`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 Gerador de Questões Diagnósticas — Fuvest");
  console.log(`   Modelo: ${ANTHROPIC_MODEL}`);
  console.log(`   Supabase: ${SUPABASE_URL}\n`);

  const expectedTotal = SUBJECTS.reduce((s, sub) => s + sub.total, 0);
  console.log(`   Total esperado: ${expectedTotal} questões\n`);

  let totalGenerated = 0;
  let totalInserted = 0;
  let totalFailed = 0;
  const statsBySubject = {};
  const statsByDifficulty = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const subject of SUBJECTS) {
    statsBySubject[subject.name] = { generated: 0, inserted: 0, failed: 0 };

    for (let diff = 1; diff <= 5; diff++) {
      const count = subject.perDiff;
      // Pick subtopics for this batch (cycle through them)
      const subtopicsForBatch = [];
      for (let i = 0; i < count; i++) {
        subtopicsForBatch.push(subject.subtopics[(diff - 1) * count + i] || subject.subtopics[i % subject.subtopics.length]);
      }
      // Deduplicate
      const uniqueSubtopics = [...new Set(subtopicsForBatch)];

      const label = `${subject.name} dificuldade ${diff}`;
      process.stdout.write(`  Gerando ${label} (${count} questões)... `);

      let questions;
      try {
        const prompt = buildPrompt(subject.name, uniqueSubtopics, diff, count);
        questions = await callClaude(prompt);
      } catch (err) {
        console.log(`❌ API falhou: ${err.message}`);
        totalFailed += count;
        statsBySubject[subject.name].failed += count;
        continue;
      }

      if (!Array.isArray(questions)) {
        console.log(`❌ Resposta não é array`);
        totalFailed += count;
        statsBySubject[subject.name].failed += count;
        continue;
      }

      // Validate and prepare for insert
      const validRows = [];
      for (const q of questions) {
        const errors = validateQuestion(q, subject.name, diff);
        if (errors.length > 0) {
          console.log(`\n    ⚠️  Questão inválida: ${errors.join(", ")}`);
          totalFailed++;
          statsBySubject[subject.name].failed++;
          continue;
        }

        validRows.push({
          exam_slug: "fuvest",
          subject: q.subject || subject.name,
          subtopic: q.subtopic,
          difficulty: diff,
          difficulty_elo: DIFFICULTY_ELO_MAP[diff],
          question_text: q.question_text,
          options: q.options,
          explanation: q.explanation,
          is_active: true,
          is_verified: false,
        });
      }

      totalGenerated += validRows.length;
      statsBySubject[subject.name].generated += validRows.length;

      // Insert in batches of 20
      if (validRows.length > 0) {
        try {
          for (let i = 0; i < validRows.length; i += 20) {
            const batch = validRows.slice(i, i + 20);
            await supabaseInsert(batch);
          }
          totalInserted += validRows.length;
          statsBySubject[subject.name].inserted += validRows.length;
          statsByDifficulty[diff] += validRows.length;
          console.log(`✅ ${validRows.length} questões inseridas`);
        } catch (err) {
          console.log(`❌ Supabase insert falhou: ${err.message}`);
          totalFailed += validRows.length;
          statsBySubject[subject.name].failed += validRows.length;
          statsBySubject[subject.name].inserted -= validRows.length;
        }
      } else {
        console.log(`⚠️  Nenhuma questão válida`);
      }

      // Rate limit: wait between API calls
      await sleep(1000);
    }
  }

  // ─── Final stats ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📊 RESUMO FINAL");
  console.log("═".repeat(60));
  console.log(`\n  Total: ${totalInserted}/${expectedTotal} questões geradas e inseridas (${totalFailed} falharam)\n`);

  console.log("  Por matéria:");
  console.log("  " + "─".repeat(50));
  for (const [name, stats] of Object.entries(statsBySubject)) {
    const status = stats.failed === 0 ? "✅" : "⚠️";
    console.log(`  ${status} ${name.padEnd(15)} ${String(stats.inserted).padStart(3)} inseridas  ${String(stats.failed).padStart(2)} falharam`);
  }

  console.log("\n  Por dificuldade:");
  console.log("  " + "─".repeat(50));
  for (let d = 1; d <= 5; d++) {
    console.log(`  Nível ${d} (Elo ${DIFFICULTY_ELO_MAP[d]}): ${statsByDifficulty[d]} questões`);
  }
  console.log();
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
