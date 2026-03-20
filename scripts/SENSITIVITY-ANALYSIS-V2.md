# Analise de Sensibilidade v2 — pos-correcao de escala

**Data:** 2026-03-20
**Simulacoes:** 195
**Subject distribution soma:** 90 questoes

## Comparacao com v1

| Metrica | v1 (bugada) | v2 (corrigida) |
|---|---|---|
| Range probabilidade | 98% - 98% | 1% - 55.2% |
| 0% acerto | 98% prob | 1% prob |
| 100% acerto | 98% prob | 1% prob |
| Diferencia resultados? | NAO | SIM |

## Resumo: 77 OK, 27 BUG, 91 SUSPEITO de 195

## Criterios de sucesso: 6 PASS, 8 FAIL

- PASS 0% acerto -> Direito < 5%: actual=1%, expected=0-5%
- PASS 0% acerto -> Medicina < 5%: actual=1%, expected=0-5%
- PASS 0% acerto -> Admin < 5%: actual=1%, expected=0-5%
- PASS 20% acerto -> Direito < 10%: actual=1%, expected=0-10%
- PASS 20% acerto -> Medicina < 5%: actual=1%, expected=0-5%
- **FAIL** 50% acerto -> Direito 10-30%: actual=1%, expected=10-30%
- PASS 50% acerto -> Medicina < 10%: actual=1%, expected=0-10%
- **FAIL** 70% acerto -> Direito 40-70%: actual=1%, expected=40-70%
- **FAIL** 70% acerto -> Medicina 10-25%: actual=1%, expected=10-25%
- **FAIL** 90% acerto -> Direito > 70%: actual=1%, expected=70-100%
- **FAIL** 90% acerto -> Medicina 40-60%: actual=1%, expected=40-60%
- **FAIL** 100% acerto -> Direito > 85%: actual=1%, expected=85-100%
- **FAIL** 100% acerto -> Medicina > 85%: actual=1%, expected=85-100%
- **FAIL** 100% acerto -> Admin > 85%: actual=55.2%, expected=85-100%

## Monotonicidade: 0 violacoes


### Administracao (cutoff 55)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 42.2 | -12.8 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 42.2 | -12.8 | 1% | < 3% | SUSPEITO |
| elo_900 | 7% | 42.9 | -12.1 | 1% | < 3% | SUSPEITO |
| fixed_10pct | 10% | 43.5 | -11.5 | 1% | < 3% | SUSPEITO |
| pessimo_t1 | 10% | 43.5 | -11.5 | 1% | < 3% | SUSPEITO |
| chute_puro_t5 | 10% | 43.5 | -11.5 | 1% | < 3% | SUSPEITO |
| mono_009pct | 10% | 43.5 | -11.5 | 1% | < 3% | SUSPEITO |
| so_portugues | 13% | 44.3 | -10.7 | 1% | < 3% | SUSPEITO |
| so_matematica | 13% | 43.9 | -11.1 | 1% | < 3% | SUSPEITO |
| pessimo_t2 | 17% | 44 | -11 | 1% | < 3% | SUSPEITO |
| pessimo_t4 | 17% | 44.3 | -10.7 | 1% | < 3% | SUSPEITO |
| chute_puro_t1 | 17% | 44.3 | -10.7 | 1% | < 3% | SUSPEITO |
| chute_puro_t4 | 17% | 44.6 | -10.4 | 1% | < 3% | SUSPEITO |
| mono_018pct | 17% | 44.6 | -10.4 | 1% | < 3% | SUSPEITO |
| fixed_20pct | 20% | 45 | -10 | 1% | < 3% | SUSPEITO |
| pessimo_t3 | 20% | 44.9 | -10.1 | 1% | < 3% | SUSPEITO |
| fraco_t1 | 23% | 45.2 | -9.8 | 1% | < 3% | SUSPEITO |
| elo_800 | 23% | 45.5 | -9.5 | 1% | < 3% | SUSPEITO |
| chute_puro_t2 | 27% | 45.6 | -9.4 | 1% | < 3% | SUSPEITO |
| elo_1100 | 27% | 45.9 | -9.1 | 1.09% | < 3% | SUSPEITO |
| mono_027pct | 27% | 45.7 | -9.3 | 1% | < 3% | SUSPEITO |
| fixed_30pct | 30% | 45.9 | -9.1 | 1.09% | < 3% | SUSPEITO |
| fraco_t2 | 30% | 46 | -9 | 1.16% | < 3% | SUSPEITO |
| fraco_t4 | 30% | 45.8 | -9.2 | 1.02% | < 3% | SUSPEITO |
| chute_puro_t3 | 30% | 46.4 | -8.6 | 1.47% | < 3% | SUSPEITO |
| elo_1000 | 30% | 46.2 | -8.8 | 1.31% | < 3% | SUSPEITO |
| fraco_t3 | 37% | 47.2 | -7.8 | 2.33% | < 3% | SUSPEITO |
| mono_036pct | 37% | 46.9 | -8.1 | 1.97% | < 3% | SUSPEITO |
| fixed_40pct | 40% | 47.3 | -7.7 | 2.46% | < 3% | OK |
| acerta_faceis | 40% | 47.4 | -7.6 | 2.6% | < 3% | OK |
| mediano_t1 | 43% | 47.7 | -7.3 | 3.06% | 3-10% | OK |
| mediano_t3 | 43% | 47.9 | -7.1 | 3.4% | 3-10% | OK |
| acerta_dificeis | 43% | 48.1 | -6.9 | 3.77% | 3-10% | OK |
| mono_045pct | 47% | 48.4 | -6.6 | 4.39% | 3-10% | OK |
| fixed_50pct | 50% | 48.9 | -6.1 | 5.6% | 3-10% | OK |
| alternado | 50% | 48.8 | -6.2 | 5.33% | 3-10% | OK |
| mediano_t2 | 53% | 49.6 | -5.4 | 7.72% | 3-10% | OK |
| elo_1200 | 53% | 49.4 | -5.6 | 7.06% | 3-10% | OK |
| elo_1300 | 53% | 49.3 | -5.7 | 6.75% | 3-10% | OK |
| mediano_t4 | 57% | 49.9 | -5.1 | 8.81% | 3-10% | OK |
| fadiga | 57% | 49.6 | -5.4 | 7.72% | 3-10% | OK |
| aquecimento | 57% | 49.9 | -5.1 | 8.81% | 3-10% | OK |
| mono_055pct | 57% | 49.6 | -5.4 | 7.72% | 3-10% | OK |
| fixed_60pct | 60% | 49.9 | -5.1 | 8.81% | 3-10% | OK |
| bom_t2 | 60% | 49.7 | -5.3 | 8.07% | 3-10% | OK |
| elo_1400 | 60% | 50.3 | -4.7 | 10.44% | 10-25% | OK |
| mono_064pct | 63% | 50.4 | -4.6 | 10.88% | 10-25% | OK |
| bom_t3 | 67% | 50.7 | -4.3 | 12.28% | 10-25% | OK |
| elo_1500 | 67% | 50.8 | -4.2 | 12.78% | 10-25% | OK |
| fixed_70pct | 70% | 51.3 | -3.7 | 15.5% | 10-25% | OK |
| bom_t4 | 70% | 51.4 | -3.6 | 16.09% | 10-25% | OK |
| bom_t1 | 73% | 52.3 | -2.7 | 22.16% | 10-25% | OK |
| elo_1600 | 73% | 51.5 | -3.5 | 16.69% | 10-25% | OK |
| mono_073pct | 73% | 51.9 | -3.1 | 19.29% | 10-25% | OK |
| fixed_80pct | 80% | 53 | -2 | 27.88% | 25-40% | OK |
| excelente_t1 | 83% | 53.1 | -1.9 | 28.78% | 25-40% | SUSPEITO |
| excelente_t3 | 83% | 53.6 | -1.4 | 33.56% | 25-40% | SUSPEITO |
| mono_082pct | 83% | 53.4 | -1.6 | 31.59% | 25-40% | SUSPEITO |
| fixed_90pct | 90% | 53.9 | -1.1 | 36.69% | 25-40% | SUSPEITO |
| excelente_t2 | 90% | 53.9 | -1.1 | 36.69% | 25-40% | SUSPEITO |
| excelente_t4 | 90% | 53.7 | -1.3 | 34.58% | 25-40% | SUSPEITO |
| mono_091pct | 90% | 53.9 | -1.1 | 36.69% | 25-40% | SUSPEITO |
| fixed_100pct | 100% | 55.4 | +0.4 | 55.2% | 55-70% | SUSPEITO |
| elo_1800 | 100% | 55.4 | +0.4 | 55.2% | 55-70% | SUSPEITO |
| mono_100pct | 100% | 55.4 | +0.4 | 55.2% | 55-70% | SUSPEITO |

### Direito (cutoff 66)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 42.1 | -23.9 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 42.1 | -23.9 | 1% | < 3% | SUSPEITO |
| pessimo_t2 | 7% | 43.2 | -22.8 | 1% | < 3% | SUSPEITO |
| fraco_t1 | 7% | 43 | -23 | 1% | < 3% | SUSPEITO |
| fixed_10pct | 10% | 43.5 | -22.5 | 1% | < 3% | SUSPEITO |
| mono_009pct | 10% | 43.5 | -22.5 | 1% | < 3% | SUSPEITO |
| so_portugues | 13% | 44.2 | -21.8 | 1% | < 3% | SUSPEITO |
| so_matematica | 13% | 43.8 | -22.2 | 1% | < 3% | SUSPEITO |
| mono_018pct | 17% | 44.5 | -21.5 | 1% | < 3% | SUSPEITO |
| fixed_20pct | 20% | 45 | -21 | 1% | < 3% | SUSPEITO |
| pessimo_t1 | 20% | 44.9 | -21.1 | 1% | < 3% | SUSPEITO |
| chute_puro_t1 | 20% | 44.8 | -21.2 | 1% | < 3% | SUSPEITO |
| chute_puro_t4 | 20% | 44.6 | -21.4 | 1% | < 3% | SUSPEITO |
| chute_puro_t5 | 20% | 44.8 | -21.2 | 1% | < 3% | SUSPEITO |
| elo_900 | 20% | 44.9 | -21.1 | 1% | < 3% | SUSPEITO |
| elo_1000 | 20% | 44.9 | -21.1 | 1% | < 3% | SUSPEITO |
| pessimo_t3 | 23% | 45.3 | -20.7 | 1% | < 3% | SUSPEITO |
| fraco_t2 | 23% | 45.3 | -20.7 | 1% | < 3% | SUSPEITO |
| chute_puro_t3 | 23% | 45.5 | -20.5 | 1% | < 3% | SUSPEITO |
| mono_027pct | 27% | 45.6 | -20.4 | 1% | < 3% | SUSPEITO |
| fixed_30pct | 30% | 45.9 | -20.1 | 1% | < 3% | SUSPEITO |
| pessimo_t4 | 30% | 46.3 | -19.7 | 1% | < 3% | SUSPEITO |
| chute_puro_t2 | 30% | 46.1 | -19.9 | 1% | < 3% | SUSPEITO |
| elo_800 | 30% | 46.4 | -19.6 | 1% | < 3% | SUSPEITO |
| fraco_t3 | 33% | 46.9 | -19.1 | 1% | < 3% | SUSPEITO |
| fraco_t4 | 33% | 46.2 | -19.8 | 1% | < 3% | SUSPEITO |
| elo_1100 | 37% | 46.8 | -19.2 | 1% | < 3% | SUSPEITO |
| mono_036pct | 37% | 46.8 | -19.2 | 1% | < 3% | SUSPEITO |
| fixed_40pct | 40% | 47.3 | -18.7 | 1% | < 3% | OK |
| acerta_faceis | 40% | 47.5 | -18.5 | 1% | < 3% | OK |
| mediano_t2 | 43% | 47.6 | -18.4 | 1% | < 3% | OK |
| mediano_t1 | 47% | 48.4 | -17.6 | 1% | < 3% | OK |
| mediano_t3 | 47% | 48.1 | -17.9 | 1% | < 3% | OK |
| mono_045pct | 47% | 48.4 | -17.6 | 1% | < 3% | OK |
| fixed_50pct | 50% | 48.9 | -17.1 | 1% | < 3% | OK |
| bom_t4 | 50% | 48.6 | -17.4 | 1% | < 3% | OK |
| alternado | 50% | 48.7 | -17.3 | 1% | < 3% | OK |
| mediano_t4 | 53% | 48.9 | -17.1 | 1% | < 3% | OK |
| fadiga | 57% | 49.6 | -16.4 | 1% | < 3% | OK |
| elo_1200 | 57% | 49.3 | -16.7 | 1% | < 3% | OK |
| mono_055pct | 57% | 49.6 | -16.4 | 1% | < 3% | OK |
| fixed_60pct | 60% | 49.8 | -16.2 | 1% | < 3% | OK |
| acerta_dificeis | 60% | 50.3 | -15.7 | 1% | < 3% | OK |
| aquecimento | 60% | 50.5 | -15.5 | 1% | < 3% | OK |
| elo_1300 | 60% | 50 | -16 | 1% | < 3% | OK |
| bom_t3 | 63% | 50.5 | -15.5 | 1% | < 3% | OK |
| elo_1400 | 63% | 50.6 | -15.4 | 1% | < 3% | OK |
| mono_064pct | 63% | 50.4 | -15.6 | 1% | < 3% | OK |
| bom_t1 | 67% | 50.8 | -15.2 | 1% | < 3% | OK |
| bom_t2 | 67% | 51.1 | -14.9 | 1% | < 3% | OK |
| fixed_70pct | 70% | 51.2 | -14.8 | 1% | < 3% | OK |
| excelente_t3 | 70% | 51.5 | -14.5 | 1% | < 3% | OK |
| mono_073pct | 73% | 51.8 | -14.2 | 1% | < 3% | BUG |
| elo_1600 | 77% | 51.9 | -14.1 | 1% | < 3% | BUG |
| fixed_80pct | 80% | 52.9 | -13.1 | 1% | < 3% | BUG |
| excelente_t2 | 83% | 53 | -13 | 1% | < 3% | BUG |
| elo_1500 | 83% | 53 | -13 | 1% | < 3% | BUG |
| mono_082pct | 83% | 53.4 | -12.6 | 1% | < 3% | BUG |
| excelente_t1 | 87% | 53.6 | -12.4 | 1% | < 3% | BUG |
| fixed_90pct | 90% | 53.9 | -12.1 | 1% | < 3% | BUG |
| mono_091pct | 90% | 53.9 | -12.1 | 1% | < 3% | BUG |
| excelente_t4 | 97% | 55.1 | -10.9 | 1% | < 3% | BUG |
| elo_1800 | 97% | 54.9 | -11.1 | 1% | < 3% | BUG |
| fixed_100pct | 100% | 55.3 | -10.7 | 1% | < 3% | BUG |
| mono_100pct | 100% | 55.3 | -10.7 | 1% | < 3% | BUG |

### Medicina (cutoff 80)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 42.2 | -37.8 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 42.2 | -37.8 | 1% | < 3% | SUSPEITO |
| fixed_10pct | 10% | 43.5 | -36.5 | 1% | < 3% | SUSPEITO |
| chute_puro_t4 | 10% | 43.9 | -36.1 | 1% | < 3% | SUSPEITO |
| elo_800 | 10% | 43.5 | -36.5 | 1% | < 3% | SUSPEITO |
| mono_009pct | 10% | 43.5 | -36.5 | 1% | < 3% | SUSPEITO |
| pessimo_t1 | 13% | 44.1 | -35.9 | 1% | < 3% | SUSPEITO |
| pessimo_t4 | 13% | 44.2 | -35.8 | 1% | < 3% | SUSPEITO |
| so_portugues | 13% | 44.3 | -35.7 | 1% | < 3% | SUSPEITO |
| so_matematica | 13% | 43.9 | -36.1 | 1% | < 3% | SUSPEITO |
| chute_puro_t2 | 17% | 44.3 | -35.7 | 1% | < 3% | SUSPEITO |
| mono_018pct | 17% | 44.6 | -35.4 | 1% | < 3% | SUSPEITO |
| fixed_20pct | 20% | 45 | -35 | 1% | < 3% | SUSPEITO |
| pessimo_t3 | 20% | 45 | -35 | 1% | < 3% | SUSPEITO |
| elo_1000 | 23% | 45.3 | -34.7 | 1% | < 3% | SUSPEITO |
| elo_900 | 27% | 46 | -34 | 1% | < 3% | SUSPEITO |
| mono_027pct | 27% | 45.7 | -34.3 | 1% | < 3% | SUSPEITO |
| fixed_30pct | 30% | 45.9 | -34.1 | 1% | < 3% | SUSPEITO |
| fraco_t3 | 30% | 46 | -34 | 1% | < 3% | SUSPEITO |
| fraco_t4 | 30% | 47 | -33 | 1% | < 3% | SUSPEITO |
| chute_puro_t1 | 30% | 46.4 | -33.6 | 1% | < 3% | SUSPEITO |
| chute_puro_t3 | 33% | 46.4 | -33.6 | 1% | < 3% | SUSPEITO |
| chute_puro_t5 | 37% | 47.5 | -32.5 | 1% | < 3% | SUSPEITO |
| elo_1100 | 37% | 47.4 | -32.6 | 1% | < 3% | SUSPEITO |
| mono_036pct | 37% | 46.9 | -33.1 | 1% | < 3% | SUSPEITO |
| fixed_40pct | 40% | 47.3 | -32.7 | 1% | < 3% | OK |
| pessimo_t2 | 40% | 47.6 | -32.4 | 1% | < 3% | OK |
| fraco_t1 | 40% | 47.2 | -32.8 | 1% | < 3% | OK |
| fraco_t2 | 40% | 47.5 | -32.5 | 1% | < 3% | OK |
| acerta_faceis | 40% | 47.4 | -32.6 | 1% | < 3% | OK |
| mediano_t3 | 47% | 48.1 | -31.9 | 1% | < 3% | OK |
| mono_045pct | 47% | 48.4 | -31.6 | 1% | < 3% | OK |
| fixed_50pct | 50% | 48.9 | -31.1 | 1% | < 3% | OK |
| alternado | 50% | 48.8 | -31.2 | 1% | < 3% | OK |
| elo_1200 | 50% | 48.7 | -31.3 | 1% | < 3% | OK |
| mediano_t4 | 53% | 49.6 | -30.4 | 1% | < 3% | OK |
| mediano_t1 | 57% | 49.5 | -30.5 | 1% | < 3% | OK |
| acerta_dificeis | 57% | 49.6 | -30.4 | 1% | < 3% | OK |
| aquecimento | 57% | 49.8 | -30.2 | 1% | < 3% | OK |
| mono_055pct | 57% | 49.6 | -30.4 | 1% | < 3% | OK |
| fixed_60pct | 60% | 49.9 | -30.1 | 1% | < 3% | OK |
| mediano_t2 | 60% | 50.1 | -29.9 | 1% | < 3% | OK |
| bom_t3 | 60% | 50.3 | -29.7 | 1% | < 3% | OK |
| fadiga | 60% | 50 | -30 | 1% | < 3% | OK |
| bom_t4 | 63% | 50.1 | -29.9 | 1% | < 3% | OK |
| elo_1300 | 63% | 50.8 | -29.2 | 1% | < 3% | OK |
| mono_064pct | 63% | 50.4 | -29.6 | 1% | < 3% | OK |
| bom_t1 | 67% | 51.5 | -28.5 | 1% | < 3% | OK |
| bom_t2 | 67% | 51 | -29 | 1% | < 3% | OK |
| fixed_70pct | 70% | 51.3 | -28.7 | 1% | < 3% | OK |
| elo_1500 | 70% | 51.5 | -28.5 | 1% | < 3% | OK |
| elo_1600 | 73% | 52.1 | -27.9 | 1% | < 3% | BUG |
| mono_073pct | 73% | 51.9 | -28.1 | 1% | < 3% | BUG |
| elo_1400 | 77% | 52.5 | -27.5 | 1% | < 3% | BUG |
| fixed_80pct | 80% | 53 | -27 | 1% | < 3% | BUG |
| excelente_t3 | 80% | 52.5 | -27.5 | 1% | < 3% | BUG |
| excelente_t4 | 80% | 52.7 | -27.3 | 1% | < 3% | BUG |
| mono_082pct | 83% | 53.4 | -26.6 | 1% | < 3% | BUG |
| fixed_90pct | 90% | 53.9 | -26.1 | 1% | < 3% | BUG |
| excelente_t1 | 90% | 53.8 | -26.2 | 1% | < 3% | BUG |
| excelente_t2 | 90% | 53.8 | -26.2 | 1% | < 3% | BUG |
| mono_091pct | 90% | 53.9 | -26.1 | 1% | < 3% | BUG |
| elo_1800 | 97% | 55 | -25 | 1% | < 3% | BUG |
| fixed_100pct | 100% | 55.4 | -24.6 | 1% | < 3% | BUG |
| mono_100pct | 100% | 55.4 | -24.6 | 1% | < 3% | BUG |
