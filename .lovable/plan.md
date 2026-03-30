

## Plano: Remover o subtítulo dinâmico do header do Dashboard

**O que será removido:**  
O parágrafo com texto dinâmico abaixo do "Olá, {nome}" no header (ex: "11 missões pendentes de dias anteriores."). Corresponde às linhas 510-512 do `src/pages/Dashboard.tsx`.

**Mudanças:**
1. **`src/pages/Dashboard.tsx`** — Remover o bloco condicional `{subtitle && (<p>...</p>)}` (linhas 510-512). A variável `subtitle` e sua lógica (linhas 482-493) também podem ser removidas por limpeza, já que não será mais usada.

Nenhum outro arquivo é afetado.

