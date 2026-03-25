# Cátedra — Core Contract (Sprint 0)

> Documento canônico de definições. Qualquer divergência no código deve ser
> corrigida para convergir com este contrato.

---

## 1. Glossário canônico

| Termo canônico         | Alias proibido     | Significado                                                    |
|------------------------|--------------------|----------------------------------------------------------------|
| `available_days`       | `study_days`       | Array de dias da semana em que o aluno estuda (ex.: `["Segunda","Quarta","Sexta"]`) |
| `study_plan_id`        | `plan_id`          | FK que liga `daily_missions` ao `study_plans`                  |
| `mission_type`         | `type`             | Tipo da missão (`questions`, `error_review`, etc.)             |
| `placement_band`       | `band`, `level`    | Faixa de proficiência: `base`, `intermediario`, `competitivo`, `forte` |
| `proficiency_scores`   | `proficiencies`    | Tabela de proficiência por matéria (source of truth de Elo)    |
| `answer_history`       | `answers`          | Tabela de respostas do aluno (source of truth de score bruto)  |
| `daily_missions`       | `missions`         | Tabela de missões diárias (source of truth de progresso)       |

---

## 2. Status válidos de missão (`daily_missions.status`)

| Status        | Descrição                                              |
|---------------|--------------------------------------------------------|
| `pending`     | Criada, aguardando execução                            |
| `in_progress` | Aluno abriu a missão e está respondendo                |
| `completed`   | Missão finalizada com sucesso                          |
| `abandoned`   | Aluno saiu sem completar                               |
| `expired`     | Data da missão passou sem execução                     |
| `superseded`  | Plano foi regenerado e missão foi substituída           |

---

## 3. Source of Truth

| Dado                         | Tabela canônica         | Observação                                    |
|------------------------------|-------------------------|-----------------------------------------------|
| Score bruto por questão      | `answer_history`        | `is_correct`, `response_time_seconds`         |
| Proficiência (Elo) por matéria | `proficiency_scores`  | `score` (0-1), `source` (diagnostic/calibration) |
| Progresso diário             | `daily_missions`        | `status`, `score`, `completed_at`             |
| Plano semanal ativo          | `study_plans`           | `is_current = true`, `status = 'active'`      |
| Resultado diagnóstico        | `diagnostic_estimates`  | `proficiencies`, `placement_band`             |
| Eventos de analytics         | `analytics_events`      | `event_name`, `properties`                    |

---

## 4. Tabelas do loop core (16 tabelas)

| #  | Tabela                      | Papel                                                       |
|----|-----------------------------|-------------------------------------------------------------|
| 1  | `profiles`                  | Dados do aluno, onboarding, XP, streak                      |
| 2  | `exam_configs`              | Configuração do vestibular (distribuição, corte, matérias)   |
| 3  | `diagnostic_sessions`       | Sessões de diagnóstico (router/deep/calibration)             |
| 4  | `diagnostic_item_responses` | Respostas individuais do diagnóstico                        |
| 5  | `diagnostic_estimates`      | Estimativas finais do diagnóstico (proficiências, banda)     |
| 6  | `diagnostic_questions`      | Banco de questões diagnósticas                               |
| 7  | `diagnostic_results`        | Resultados históricos de diagnóstico                         |
| 8  | `study_plans`               | Planos semanais gerados por IA                               |
| 9  | `daily_missions`            | Missões diárias atribuídas ao aluno                          |
| 10 | `questions`                 | Banco de questões para prática/simulados                     |
| 11 | `answer_history`            | Histórico de respostas do aluno                              |
| 12 | `proficiency_scores`        | Proficiência por matéria via Elo rating                      |
| 13 | `spaced_review_queue`       | Fila de revisão espaçada                                     |
| 14 | `exam_results`              | Resultados de simulados completos                            |
| 15 | `analytics_events`          | Log de eventos de interação                                  |
| 16 | `chat_history`              | Histórico de conversas com tutor IA                          |

---

## 5. Mission types canônicos

| `mission_type`     | Label PT-BR                | Descrição                        |
|--------------------|----------------------------|----------------------------------|
| `questions`        | Questões                   | Prática de questões              |
| `error_review`     | Revisão de erros           | Revisão de questões erradas      |
| `short_summary`    | Resumo                     | Resumo gerado por IA             |
| `spaced_review`    | Revisão espaçada           | Revisão com repetição espaçada   |
| `mixed_block`      | Bloco misto                | Bloco com múltiplas matérias     |
| `reading_work`     | Leitura                    | Leitura orientada                |
| `writing_outline`  | Planejamento de redação    | Planejamento de redação          |
| `writing_partial`  | Redação parcial            | Redação parcial                  |
| `writing_full`     | Redação completa           | Redação completa                 |
| `summary`          | Resumo (legacy)            | Legacy — usar `short_summary`    |
| `flashcards`       | Flashcards (legacy)        | Legacy                           |
| `review`           | Revisão de erros (legacy)  | Legacy — usar `error_review`     |

---

## 6. Eventos de analytics obrigatórios

| Evento               | Onde é emitido              | Quando                              |
|----------------------|-----------------------------|--------------------------------------|
| `mission_started`    | `MissionPage`               | Ao abrir missão                      |
| `question_answered`  | `MissionPage`               | Após cada resposta                   |
| `mission_completed`  | `MissionPage`               | Ao finalizar missão                  |
| `mission_abandoned`  | `MissionPage`               | Ao sair sem completar                |
| `replan_triggered`   | `Dashboard`                 | Quando `regeneratePlan` é chamado    |
| `replan_applied`     | `Dashboard`                 | Após plano salvo com sucesso         |
| `dashboard_loaded`   | `Dashboard`                 | No useEffect inicial                 |
| `onboarding_started` | `Onboarding`                | Início do onboarding                 |
| `onboarding_completed`| `Onboarding`               | Fim do onboarding                    |
| `diagnostic_started` | `DiagnosticTest`            | Início do diagnóstico                |
| `diagnostic_completed`| `DiagnosticTest`           | Fim do diagnóstico                   |
| `plan_generated`     | `DiagnosticResults`         | Após plano gerado                    |

---

## 7. Placement bands

| Band            | Score médio  | Descrição                  |
|-----------------|-------------|----------------------------|
| `base`          | < 0.35      | Nível inicial              |
| `intermediario` | 0.35 – 0.55 | Intermediário              |
| `competitivo`   | 0.55 – 0.75 | Competitivo                |
| `forte`         | >= 0.75     | Forte                      |
