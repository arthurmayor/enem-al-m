# Inventário do Projeto — ENEM-AL-M

Plataforma de aprendizado adaptativo para vestibulares brasileiros (ENEM, Fuvest, Unicamp, etc.).

---

## 1. Páginas (src/pages/) — 18 arquivos

| Arquivo | Descrição |
|---------|-----------|
| Landing.tsx | Homepage pública com features, depoimentos, FAQs e CTAs |
| Login.tsx | Login por email/senha com recuperação de senha |
| Register.tsx | Cadastro com nome, email, senha e aceite de termos |
| Onboarding.tsx | Fluxo de 3 etapas: escolha de vestibular/curso, dados pessoais, rotina de estudos |
| Dashboard.tsx | Hub principal: missões do dia, progresso semanal, matérias foco, countdown do vestibular |
| DiagnosticIntro.tsx | Tela introdutória do diagnóstico (modo "router" 8q ou "deep" 30q) |
| DiagnosticTest.tsx | Teste diagnóstico adaptativo com IRT/ELO, cronômetro por questão |
| DiagnosticLoading.tsx | Tela de carregamento durante análise do diagnóstico |
| DiagnosticResults.tsx | Resultados do diagnóstico com proficiência por matéria, áreas prioritárias e geração do plano |
| AiTutor.tsx | Chat com tutor IA (Claude), contexto do aluno e erros recentes |
| Performance.tsx | Dashboard analítico: gráficos, proficiência ao longo do tempo, subtópicos com mais erros |
| Profile.tsx | Perfil do aluno: meta, série, horas/dia, universidades alvo, XP, streaks |
| Study.tsx | Navegador de missões da semana com filtros (todas/pendentes/concluídas) |
| Exams.tsx | Seleção de simulados e histórico de resultados |
| ExamSession.tsx | Simulador de prova completa com timer, marcação de questões e score por matéria |
| MissionPage.tsx | Executor de missão individual: busca questões com fallback hierárquico, marca conclusão, dá XP |
| Ranking.tsx | Leaderboard top 50 por XP, streak ou missões concluídas |
| NotFound.tsx | Página 404 |

---

## 2. Edge Functions (supabase/functions/) — 3 funções

| Função | Linhas | Status | Descrição |
|--------|--------|--------|-----------|
| ai-tutor | 97 | Funcional | Chama Claude (sonnet) com contexto do aluno para tutoria em PT-BR |
| analyze-diagnostic | 80 | Legada | Chama Claude para analisar respostas do diagnóstico (pode ser substituída por lógica local) |
| generate-study-plan | 660 | Nova (v2.1) | Gerador 100% determinístico de plano de estudos: priorização aditiva, budget semanal, composição por band, sequenciamento cognitivo |

---

## 3. Tabelas do Supabase — 14 tabelas

| Tabela | Finalidade | Operações principais |
|--------|-----------|---------------------|
| profiles | Dados do aluno (nome, meta, streak, XP, série, horas/dia) | select, update, upsert |
| exam_configs | Vestibulares e cursos disponíveis (cutoff, distribuição, competição) | select |
| diagnostic_questions | Banco de questões do diagnóstico (200 planejadas, 5 níveis ELO) | select |
| questions | Banco de questões para missões e simulados | select |
| daily_missions | Missões diárias personalizadas (subject, subtopic, type, status, score) | select, insert, update, delete |
| answer_history | Histórico de respostas (diagnóstico, prática, simulado) | insert, select |
| diagnostic_sessions | Sessões de teste diagnóstico | insert, select |
| diagnostic_item_responses | Respostas individuais do diagnóstico | insert |
| diagnostic_estimates | Estimativas de proficiência IRT | insert |
| diagnostic_results | Resumo dos resultados do diagnóstico | insert |
| proficiency_scores | Proficiência por matéria ao longo do tempo | insert, select |
| chat_history | Histórico de conversas com tutor IA | insert, select |
| exam_results | Resultados de simulados | insert, select |
| study_plans | Planos de estudo gerados | insert, select, delete |

---

## 4. Rotas (App.tsx) — 18 rotas

| Rota | Componente | Protegida |
|------|-----------|-----------|
| `/` | Landing | Nao |
| `/login` | Login | Nao |
| `/registro` | Register | Nao |
| `/onboarding` | Onboarding | Sim |
| `/dashboard` | Dashboard | Sim |
| `/diagnostic/intro` | DiagnosticIntro | Sim |
| `/diagnostic/test` | DiagnosticTest | Sim |
| `/diagnostic/loading` | DiagnosticLoading | Sim |
| `/diagnostic/results` | DiagnosticResults | Sim |
| `/tutor` | AiTutor | Sim |
| `/desempenho` | Performance | Sim |
| `/perfil` | Profile | Sim |
| `/study` | Study | Sim |
| `/exams` | Exams | Sim |
| `/exam/:examId` | ExamSession | Sim |
| `/mission/:type/:id` | MissionPage | Sim |
| `/ranking` | Ranking | Sim |
| `*` | NotFound | Nao |

---

## 5. Componentes reutilizáveis (src/components/)

### Componentes customizados (3)
- **BottomNav.tsx** — Barra de navegação inferior com 5 itens (Inicio, Estudar, Simulados, Performance, Ranking)
- **ProtectedRoute.tsx** — Wrapper de autenticacao com flag DEV_SKIP_AUTH
- **NavLink.tsx** — Componente de link de navegacao

### Componentes UI — shadcn/ui (49)
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip

---

## 6. Contagens

| Metrica | Valor |
|---------|-------|
| Linhas de codigo (src/) | 9.076 |
| Linhas de codigo (edge functions) | 837 |
| **Total LOC** | **9.913** |
| Paginas | 18 |
| Rotas | 18 (15 protegidas, 3 publicas) |
| Edge Functions | 3 |
| Tabelas Supabase | 14 |
| Componentes customizados | 3 |
| Componentes UI (shadcn) | 49 |
| Questoes diagnosticas planejadas | 200 (9 materias, 5 niveis) |
| exam_configs conhecidos | Fuvest (6 cursos com cutoffs), ENEM, Unicamp |

---

*Gerado em 2026-03-24*
