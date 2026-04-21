# Como processar uma prova nova (passo a passo)

Guia de operação em linguagem simples. Segue isso que sai do nada a uma
prova inteira aparecendo pro aluno em ~15 minutos.

## O que você precisa na mão

- **PDF da prova** (o caderno de questões da banca).
- **PDF do gabarito oficial**.
- **Chave de Supabase** (service-role). Alguém do time já tem.
- **Chave da Anthropic** (API key). Começa com `sk-ant-...`.
- **Um terminal** com Node.js ≥ 18. Se o computador abre VS Code, já tem.

> Se você não tem as chaves, pede pra quem cuida da infra. **Nunca** cole
> elas num arquivo que vá pro git.

---

## Passo 1 — Nomear os PDFs

Use nomes previsíveis. Exemplo para a Fuvest 1ª fase 2026, versão V1:

```
fuvest-2026-fase1-V1-prova.pdf
fuvest-2026-fase1-gabarito.pdf
```

Regra geral: `{banca}-{ano}-fase{fase}-{versao}-prova.pdf` e
`{banca}-{ano}-fase{fase}-gabarito.pdf`.

---

## Passo 2 — Subir os PDFs pro Supabase

1. Abre o painel do Supabase → **Storage** → bucket `exam-files`.
2. Clica em **Upload** e seleciona os dois PDFs.
3. Confere que eles apareceram na listagem.

Os caminhos (`storage paths`) que você vai usar depois são:

```
exam-files/fuvest-2026-fase1-V1-prova.pdf
exam-files/fuvest-2026-fase1-gabarito.pdf
```

---

## Passo 3 — Abrir o terminal na raiz do projeto

```bash
cd caminho/para/enem-al-m
```

Se nunca instalou as dependências antes, roda uma vez:

```bash
npm install
```

---

## Passo 4 — Exportar as chaves (só nessa sessão do terminal)

```bash
export SUPABASE_SERVICE_ROLE_KEY="cole-aqui-a-chave-service-role"
export ANTHROPIC_API_KEY="sk-ant-...cole-aqui..."
```

> Essas duas linhas **não** ficam salvas no arquivo; elas valem só
> enquanto essa janela do terminal estiver aberta. Se fechar, repete.

---

## Passo 5 — Rodar o pipeline

### Uma prova só

```bash
npx tsx tools/extraction/process-exam.ts \
  --banca Fuvest --ano 2026 --fase 1 --versao V1 \
  --prova    exam-files/fuvest-2026-fase1-V1-prova.pdf \
  --gabarito exam-files/fuvest-2026-fase1-gabarito.pdf
```

Troca `Fuvest / 2026 / 1 / V1` e os caminhos pra prova que você está
processando. Funciona igual pra ENEM, Unicamp, UNESP, qualquer banca —
o que muda é só o valor dos flags.

O que vai acontecer na tela:

```
[process-exam] ▶ Fuvest 2026 F1 V1
  prova:    exam-files/fuvest-2026-fase1-V1-prova.pdf
  gabarito: exam-files/fuvest-2026-fase1-gabarito.pdf

[extract-exam-local] 1/11 pre-parser...
[extract-exam-local] 2/11 profiler...
...
[extract-exam-local] 11/11 inserter...
```

Dura **10 a 15 minutos** numa prova de 90 questões. Não fecha o terminal.
Pode dar um café.

### Várias provas de uma vez

Cria um arquivo `provas.json`:

```json
[
  {
    "banca": "Fuvest", "ano": 2026, "fase": "1", "versao": "V1",
    "prova":    "exam-files/fuvest-2026-fase1-V1-prova.pdf",
    "gabarito": "exam-files/fuvest-2026-fase1-gabarito.pdf"
  },
  {
    "banca": "Unicamp", "ano": 2025, "fase": "1", "versao": "V",
    "prova":    "exam-files/unicamp-2025-fase1.pdf",
    "gabarito": "exam-files/unicamp-2025-fase1-gabarito.pdf"
  }
]
```

E roda:

```bash
npx tsx tools/extraction/process-exam.ts --batch-file provas.json
```

As provas rodam em sequência. Se uma falhar, a próxima continua.

---

## Passo 6 — Ler o resumo

Quando terminar, você vê algo assim:

```
PROCESS-EXAM COMPLETO: 1 provas, 1 ok, 0 com pendência
=====================================================
✓ Fuvest 2026 F1 V1: 90/90 occ · 90 questions [742s]
```

- **`90/90 occ`** = 90 ocorrências inseridas de 90 esperadas → perfeito.
- **`(N manual review)`** = algumas questões entraram mas estão
  marcadas `needs_manual_review=true` (imagem só no PDF, alternativa
  truncada etc). Você pode revisar depois pelo painel.
- **`flagged=N`** no final significa que N rows não puderam ser
  inseridas automaticamente — vê o passo 7.

---

## Passo 7 — Se ficar algo pendente

Roda o check:

```bash
npx tsx tools/extraction/check-state.ts
```

(Se a sua banca/ano não estão lá hard-coded, abre o arquivo e edita a
lista `provas` — é rápido.)

Olha as issues bloqueantes:

```bash
# Entra no painel do Supabase → Table editor → question_issues
# Filtra por exam_id e resolved = false
```

Na maioria dos casos um dos scripts de recovery resolve:

| Sintoma | Script |
|---|---|
| Questão é uma figura que o PDF só tem como imagem | `fix-step-final-manual-review.ts` (com ajuste de UUID) |
| Questão foi anulada pela banca (gabarito `*`) | `fix-step-7-annul.ts` |
| Alternativas saíram bagunçadas em 3 números específicos | `repair-options.ts <exam_id> 47,53,61` |
| Contexto compartilhado ficou vazio | o auto-recovery do `process-exam.ts` já tenta; se sobrar, `recover-shared-context.ts <exam_id>` |

Depois de qualquer fix, re-insere:

```bash
npx tsx tools/extraction/run-inserter-only.ts <exam_id>
```

Roda `check-state.ts` de novo. Quando `questions == expected` e
`flagged == 0`, a prova está 100%.

---

## Problemas comuns

- **“SUPABASE_SERVICE_ROLE_KEY not set”** → você esqueceu do Passo 4.
- **`fetch failed` / `ENOTFOUND`** → rede instável. O script já tenta
  de novo 8 vezes com backoff; se falhar tudo, roda de novo.
- **Pipeline parou no meio** → roda `npx tsx tools/extraction/check-state.ts`
  primeiro. Normalmente dá pra continuar com
  `npx tsx tools/extraction/run-inserter-only.ts <exam_id>`
  sem refazer as etapas caras.
- **Prova aparece duplicada** → o upsert é por `(banca, ano, fase,
  versao)`. Se você mandou duas vezes a mesma combinação, o `exam_id`
  é o mesmo. Raws novos foram adicionados por cima dos velhos.

---

## Glossário mínimo

- **prova** → caderno de questões.
- **gabarito** → folha de respostas oficial.
- **banca** → instituição que fez a prova (Fuvest, ENEM, Unicamp, …).
- **fase** → "1" (primeira fase) ou "2" (segunda fase).
- **versao** → "V" / "V1" / "V2" — varia por banca. Se tiver só uma
  versão, usa "V".
- **question_raw** → linha crua por questão antes de virar visível.
- **question_occurrences** → o que o aluno vê. É isso que queremos
  cheio.
- **flagged** → questão com problema bloqueante.
- **needs_manual_review** → questão entrou, mas alguém precisa olhar.
