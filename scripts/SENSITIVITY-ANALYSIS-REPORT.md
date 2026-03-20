# Relatório de Análise de Sensibilidade — Diagnóstico Elo

**Data:** 2026-03-20
**Simulações:** 49 cenários distintos
**Questões:** 30 por diagnóstico (fallback — Supabase offline neste ambiente)

---

## BUG CRÍTICO ENCONTRADO

### TODAS as 49 simulações retornaram 98% de probabilidade e "Excelente posição"

| Acerto % | Estimated Score | Gap   | Probabilidade | Banda      |
|----------|-----------------|-------|---------------|------------|
| **0%**   | 93.8            | +28.8 | **98%**       | > 70%      |
| **20%**  | 99.9            | +34.9 | **98%**       | > 70%      |
| **50%**  | 107.7           | +42.7 | **98%**       | > 70%      |
| **100%** | 121.6           | +56.6 | **98%**       | > 70%      |

**Um aluno que erra TODAS as questões recebe 98% de chance de aprovação.**

---

## Causa Raiz

### Desalinhamento de escalas: `estimateScore()` vs `cutoff_mean`

A função `estimateScore()` retorna um valor em **número absoluto de acertos esperados** (escala 0 a `total_questions`, ex: 0-180).

O `cutoff_mean` está configurado como **65** (provavelmente pensado como 65%).

**Resultado:** Score mínimo (Elo 1200 base) ≈ 93, que já é >>> 65.

```
estimateScore() = Σ expectedAccuracy(elo, meanDiff, sdDiff) × questions_por_matéria
                = ~0.55 × 180 = ~99 (escala 0-180)

cutoff_mean = 65 (escala 0-100?)

Gap = 99 - 65 = +34 → probabilidade dispara para 98%
```

### Problemas identificados:

1. **Escala incompatível:** Score em contagem absoluta (0-180) vs cutoff em percentual (0-100)
2. **Probabilidade sem variação:** `calculatePassProbability()` satura em 98% para qualquer aluno
3. **Diagnóstico inútil:** Não diferencia um aluno com 0% de acerto de um com 100%
4. **Elo base de 1200:** Mesmo sem respostas, o aluno começa com Elo alto, gerando score alto
5. **expectedAccuracy() super-otimista:** Com Elo 1200 e meanDiff 1050-1250, retorna ~50-65%

---

## Dados para análise detalhada

- **JSON completo:** `scripts/sensitivity-results.json`
- **CSV para planilha:** `scripts/sensitivity-results.csv`

### Cenários simulados:

| Categoria           | Qtd | Descrição                                          |
|---------------------|-----|-----------------------------------------------------|
| fixed_accuracy      | 11  | 0%, 10%, 20%...100% acerto sequencial               |
| random_accuracy     | 15  | 20%, 35%, 50%, 65%, 80% probabilístico (3 trials)   |
| difficulty_threshold| 5   | Acerta se questão < Elo threshold (950-1500)         |
| subject_bias        | 4   | Forte exatas/humanas, só português, só matemática    |
| anomaly             | 1   | Acerta difíceis, erra fáceis (padrão inverso)        |
| temporal            | 2   | Fadiga (90%→20%) e aquecimento (20%→90%)             |
| pattern             | 1   | Acerta/erra intercalado                              |
| baseline            | 3   | Chute puro ~20% (3 trials)                           |
| high_performer      | 2   | 85% e 95% de acerto geral                            |
| elo_realistic       | 5   | Aluno com Elo real 800, 1000, 1200, 1400, 1600       |

---

## Correções sugeridas (para validar com IA)

### Opção A: Normalizar o score para percentual
```js
// Antes:
score += expectedAccuracy(elo, meanDiff, sdDiff) * dist.questions;

// Depois:
const totalQ = Object.values(subjectDist).reduce((s, d) => s + d.questions, 0);
score = (rawScore / totalQ) * 100; // Agora em escala 0-100
```

### Opção B: Ajustar o cutoff para a escala correta
```js
// Se total_questions = 180 e cutoff é 65%:
const cutoffAbsolute = cutoffMean * totalQuestions / 100; // 117
```

### Opção C: Recalibrar a fórmula de probabilidade
- Usar `sigmaStudent` e `cutoffSd` na mesma escala do score
- Verificar se `infoScore` faz sentido com 30 questões de diagnóstico

---

## Próximos passos

1. **Decidir a escala correta** (score em % ou absoluto)
2. **Ajustar cutoff_mean** no banco ou normalizar estimateScore
3. **Re-rodar simulações** com a correção para validar
4. **Testar com dados reais** do Supabase (subject_distribution real do exam_config)
