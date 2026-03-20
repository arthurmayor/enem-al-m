# Analise de Sensibilidade v2 — pos-correcao de escala

**Data:** 2026-03-20
**Simulacoes:** 195
**Subject distribution soma:** 90 questoes

## Comparacao com v1

| Metrica | v1 (bugada) | v2 (corrigida) |
|---|---|---|
| Range probabilidade | 98% - 98% | 1% - 98% |
| 0% acerto | 98% prob | 1% prob |
| 100% acerto | 98% prob | 98% prob |
| Diferencia resultados? | NAO | SIM |

## Resumo: 179 OK, 10 BUG, 6 SUSPEITO de 195

## Criterios de sucesso: 9 PASS, 5 FAIL

- PASS 0% acerto -> Direito < 5%: actual=1%, expected=0-5%
- PASS 0% acerto -> Medicina < 5%: actual=1%, expected=0-5%
- PASS 0% acerto -> Admin < 5%: actual=1%, expected=0-5%
- PASS 20% acerto -> Direito < 10%: actual=1%, expected=0-10%
- PASS 20% acerto -> Medicina < 5%: actual=1%, expected=0-5%
- **FAIL** 50% acerto -> Direito 10-30%: actual=1%, expected=10-30%
- PASS 50% acerto -> Medicina < 10%: actual=1%, expected=0-10%
- **FAIL** 70% acerto -> Direito 40-70%: actual=6.15%, expected=40-70%
- **FAIL** 70% acerto -> Medicina 10-25%: actual=1%, expected=10-25%
- PASS 90% acerto -> Direito > 70%: actual=98%, expected=70-100%
- **FAIL** 90% acerto -> Medicina 40-60%: actual=6.44%, expected=40-60%
- PASS 100% acerto -> Direito > 85%: actual=98%, expected=85-100%
- **FAIL** 100% acerto -> Medicina > 85%: actual=65.42%, expected=85-100%
- PASS 100% acerto -> Admin > 85%: actual=98%, expected=85-100%

## Monotonicidade: 0 violacoes


### Administracao (cutoff 55)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 10.5 | -44.5 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 10.5 | -44.5 | 1% | < 3% | SUSPEITO |
| chute_puro_t1 | 3% | 3.6 | -51.4 | 1% | < 3% | OK |
| pessimo_t2 | 7% | 7.2 | -47.8 | 1% | < 3% | OK |
| fixed_10pct | 10% | 10.8 | -44.2 | 1% | < 3% | OK |
| mono_009pct | 10% | 10.8 | -44.2 | 1% | < 3% | OK |
| pessimo_t3 | 13% | 14.4 | -40.6 | 1% | < 3% | OK |
| so_portugues | 13% | 14.4 | -40.6 | 1% | < 3% | OK |
| so_matematica | 13% | 14.4 | -40.6 | 1% | < 3% | OK |
| chute_puro_t3 | 17% | 18 | -37 | 1% | < 3% | OK |
| chute_puro_t4 | 17% | 18 | -37 | 1% | < 3% | OK |
| chute_puro_t5 | 17% | 18 | -37 | 1% | < 3% | OK |
| mono_018pct | 17% | 18 | -37 | 1% | < 3% | OK |
| fixed_20pct | 20% | 21.6 | -33.4 | 1% | < 3% | OK |
| chute_puro_t2 | 20% | 21.6 | -33.4 | 1% | < 3% | OK |
| elo_800 | 20% | 21.6 | -33.4 | 1% | < 3% | OK |
| pessimo_t1 | 23% | 25.2 | -29.8 | 1% | < 3% | OK |
| pessimo_t4 | 27% | 28.8 | -26.2 | 1% | < 3% | OK |
| fraco_t1 | 27% | 28.8 | -26.2 | 1% | < 3% | OK |
| fraco_t2 | 27% | 28.8 | -26.2 | 1% | < 3% | OK |
| mono_027pct | 27% | 28.8 | -26.2 | 1% | < 3% | OK |
| fixed_30pct | 30% | 31.7 | -23.3 | 1% | < 3% | OK |
| fraco_t4 | 30% | 31.8 | -23.2 | 1% | < 3% | OK |
| mediano_t1 | 30% | 31.8 | -23.2 | 1% | < 3% | OK |
| elo_900 | 30% | 31.7 | -23.3 | 1% | < 3% | OK |
| mediano_t3 | 37% | 36.5 | -18.5 | 1% | < 3% | OK |
| elo_1100 | 37% | 36.6 | -18.4 | 1% | < 3% | OK |
| mono_036pct | 37% | 36.5 | -18.5 | 1% | < 3% | OK |
| fixed_40pct | 40% | 38.8 | -16.2 | 1% | < 3% | OK |
| fraco_t3 | 40% | 39 | -16 | 1% | < 3% | OK |
| acerta_faceis | 40% | 38.9 | -16.1 | 1% | < 3% | OK |
| mediano_t2 | 43% | 41.2 | -13.8 | 1% | < 3% | OK |
| acerta_dificeis | 47% | 43.8 | -11.2 | 1% | < 3% | OK |
| elo_1000 | 47% | 43.7 | -11.3 | 1% | < 3% | OK |
| elo_1200 | 47% | 43.6 | -11.4 | 1% | < 3% | OK |
| elo_1300 | 47% | 43.6 | -11.4 | 1% | < 3% | OK |
| mono_045pct | 47% | 43.6 | -11.4 | 1% | < 3% | OK |
| fixed_50pct | 50% | 46 | -9 | 1.16% | < 3% | OK |
| bom_t2 | 50% | 45.9 | -9.1 | 1.09% | < 3% | OK |
| aquecimento | 50% | 45.9 | -9.1 | 1.09% | < 3% | OK |
| alternado | 50% | 46 | -9 | 1.16% | < 3% | OK |
| mediano_t4 | 53% | 48.4 | -6.6 | 4.39% | 3-10% | OK |
| bom_t3 | 57% | 50.8 | -4.2 | 12.78% | 10-25% | OK |
| fadiga | 57% | 50.7 | -4.3 | 12.28% | 10-25% | OK |
| mono_055pct | 57% | 50.7 | -4.3 | 12.28% | 10-25% | OK |
| fixed_60pct | 60% | 53 | -2 | 27.88% | 25-40% | OK |
| elo_1400 | 63% | 55.4 | +0.4 | 55.2% | 55-70% | OK |
| mono_064pct | 63% | 55.4 | +0.4 | 55.2% | 55-70% | OK |
| bom_t4 | 67% | 57.7 | +2.7 | 77.84% | > 70% | OK |
| fixed_70pct | 70% | 60.1 | +5.1 | 91.19% | > 70% | OK |
| bom_t1 | 70% | 60.1 | +5.1 | 91.19% | > 70% | OK |
| mono_073pct | 73% | 62.5 | +7.5 | 97.25% | > 70% | OK |
| elo_1500 | 77% | 64.9 | +9.9 | 98% | > 70% | OK |
| fixed_80pct | 80% | 67.2 | +12.2 | 98% | > 70% | OK |
| mono_082pct | 83% | 69.6 | +14.6 | 98% | > 70% | OK |
| excelente_t4 | 87% | 71.9 | +16.9 | 98% | > 70% | OK |
| elo_1800 | 87% | 71.9 | +16.9 | 98% | > 70% | OK |
| fixed_90pct | 90% | 74.2 | +19.2 | 98% | > 70% | OK |
| excelente_t1 | 90% | 74.2 | +19.2 | 98% | > 70% | OK |
| excelente_t2 | 90% | 74.4 | +19.4 | 98% | > 70% | OK |
| excelente_t3 | 90% | 74.3 | +19.3 | 98% | > 70% | OK |
| mono_091pct | 90% | 74.2 | +19.2 | 98% | > 70% | OK |
| elo_1600 | 93% | 76.6 | +21.6 | 98% | > 70% | OK |
| fixed_100pct | 100% | 81.3 | +26.3 | 98% | > 70% | OK |
| mono_100pct | 100% | 81.3 | +26.3 | 98% | > 70% | OK |

### Direito (cutoff 66)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 10.5 | -55.5 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 10.5 | -55.5 | 1% | < 3% | SUSPEITO |
| fixed_10pct | 10% | 10.8 | -55.2 | 1% | < 3% | OK |
| chute_puro_t5 | 10% | 10.8 | -55.2 | 1% | < 3% | OK |
| mono_009pct | 10% | 10.8 | -55.2 | 1% | < 3% | OK |
| pessimo_t1 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| pessimo_t3 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| fraco_t1 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| fraco_t3 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| chute_puro_t2 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| chute_puro_t3 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| so_portugues | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| so_matematica | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| elo_800 | 13% | 14.4 | -51.6 | 1% | < 3% | OK |
| pessimo_t2 | 17% | 18 | -48 | 1% | < 3% | OK |
| mono_018pct | 17% | 18 | -48 | 1% | < 3% | OK |
| fixed_20pct | 20% | 21.6 | -44.4 | 1% | < 3% | OK |
| elo_900 | 20% | 21.6 | -44.4 | 1% | < 3% | OK |
| chute_puro_t4 | 27% | 28.8 | -37.2 | 1% | < 3% | OK |
| mono_027pct | 27% | 28.8 | -37.2 | 1% | < 3% | OK |
| fixed_30pct | 30% | 31.7 | -34.3 | 1% | < 3% | OK |
| fraco_t2 | 30% | 31.8 | -34.2 | 1% | < 3% | OK |
| pessimo_t4 | 33% | 34.2 | -31.8 | 1% | < 3% | OK |
| elo_1000 | 33% | 34.2 | -31.8 | 1% | < 3% | OK |
| elo_1100 | 33% | 34.2 | -31.8 | 1% | < 3% | OK |
| fraco_t4 | 37% | 36.5 | -29.5 | 1% | < 3% | OK |
| mono_036pct | 37% | 36.5 | -29.5 | 1% | < 3% | OK |
| fixed_40pct | 40% | 38.8 | -27.2 | 1% | < 3% | OK |
| chute_puro_t1 | 40% | 38.9 | -27.1 | 1% | < 3% | OK |
| acerta_faceis | 40% | 38.9 | -27.1 | 1% | < 3% | OK |
| acerta_dificeis | 40% | 38.7 | -27.3 | 1% | < 3% | OK |
| mediano_t2 | 43% | 41.2 | -24.8 | 1% | < 3% | OK |
| mediano_t3 | 43% | 41.1 | -24.9 | 1% | < 3% | OK |
| mediano_t4 | 43% | 41.1 | -24.9 | 1% | < 3% | OK |
| bom_t3 | 47% | 43.5 | -22.5 | 1% | < 3% | OK |
| mono_045pct | 47% | 43.6 | -22.4 | 1% | < 3% | OK |
| fixed_50pct | 50% | 46 | -20 | 1% | < 3% | OK |
| mediano_t1 | 50% | 46 | -20 | 1% | < 3% | OK |
| alternado | 50% | 45.9 | -20.1 | 1% | < 3% | OK |
| elo_1200 | 50% | 45.9 | -20.1 | 1% | < 3% | OK |
| elo_1300 | 53% | 48.3 | -17.7 | 1% | < 3% | OK |
| fadiga | 57% | 50.6 | -15.4 | 1% | < 3% | OK |
| aquecimento | 57% | 50.6 | -15.4 | 1% | < 3% | OK |
| mono_055pct | 57% | 50.6 | -15.4 | 1% | < 3% | OK |
| fixed_60pct | 60% | 53 | -13 | 1% | < 3% | OK |
| mono_064pct | 63% | 55.3 | -10.7 | 1% | < 3% | OK |
| bom_t4 | 67% | 57.7 | -8.3 | 1.76% | < 3% | OK |
| elo_1400 | 67% | 57.7 | -8.3 | 1.76% | < 3% | OK |
| fixed_70pct | 70% | 60.1 | -5.9 | 6.15% | 3-10% | OK |
| bom_t2 | 70% | 60.1 | -5.9 | 6.15% | 3-10% | OK |
| bom_t1 | 73% | 62.4 | -3.6 | 16.09% | 10-25% | OK |
| mono_073pct | 73% | 62.4 | -3.6 | 16.09% | 10-25% | OK |
| fixed_80pct | 80% | 67.2 | +1.2 | 64.37% | 55-70% | OK |
| excelente_t1 | 80% | 67.1 | +1.1 | 63.31% | 55-70% | OK |
| elo_1500 | 80% | 67.3 | +1.3 | 65.42% | 55-70% | OK |
| excelente_t2 | 83% | 69.5 | +3.5 | 83.31% | > 70% | OK |
| elo_1600 | 83% | 69.6 | +3.6 | 83.91% | > 70% | OK |
| mono_082pct | 83% | 69.6 | +3.6 | 83.91% | > 70% | OK |
| excelente_t3 | 87% | 71.9 | +5.9 | 93.85% | > 70% | OK |
| fixed_90pct | 90% | 74.2 | +8.2 | 98% | > 70% | OK |
| excelente_t4 | 90% | 74.3 | +8.3 | 98% | > 70% | OK |
| elo_1800 | 90% | 74.3 | +8.3 | 98% | > 70% | OK |
| mono_091pct | 90% | 74.2 | +8.2 | 98% | > 70% | OK |
| fixed_100pct | 100% | 81.3 | +15.3 | 98% | > 70% | OK |
| mono_100pct | 100% | 81.3 | +15.3 | 98% | > 70% | OK |

### Medicina (cutoff 80)

| Estrategia | Acerto% | Score | Gap | Prob% | Banda | Flag |
|---|---|---|---|---|---|---|
| fixed_0pct | 0% | 10.5 | -69.5 | 1% | < 3% | SUSPEITO |
| mono_000pct | 0% | 10.5 | -69.5 | 1% | < 3% | SUSPEITO |
| elo_800 | 7% | 7.2 | -72.8 | 1% | < 3% | OK |
| fixed_10pct | 10% | 10.8 | -69.2 | 1% | < 3% | OK |
| mono_009pct | 10% | 10.8 | -69.2 | 1% | < 3% | OK |
| pessimo_t1 | 13% | 14.4 | -65.6 | 1% | < 3% | OK |
| pessimo_t2 | 13% | 14.4 | -65.6 | 1% | < 3% | OK |
| chute_puro_t3 | 13% | 14.4 | -65.6 | 1% | < 3% | OK |
| so_portugues | 13% | 14.4 | -65.6 | 1% | < 3% | OK |
| so_matematica | 13% | 14.4 | -65.6 | 1% | < 3% | OK |
| pessimo_t4 | 17% | 18 | -62 | 1% | < 3% | OK |
| fraco_t1 | 17% | 18 | -62 | 1% | < 3% | OK |
| chute_puro_t1 | 17% | 18 | -62 | 1% | < 3% | OK |
| mono_018pct | 17% | 18 | -62 | 1% | < 3% | OK |
| fixed_20pct | 20% | 21.6 | -58.4 | 1% | < 3% | OK |
| pessimo_t3 | 20% | 21.6 | -58.4 | 1% | < 3% | OK |
| chute_puro_t5 | 20% | 21.6 | -58.4 | 1% | < 3% | OK |
| elo_900 | 20% | 21.6 | -58.4 | 1% | < 3% | OK |
| elo_1000 | 20% | 21.6 | -58.4 | 1% | < 3% | OK |
| fraco_t3 | 23% | 25.2 | -54.8 | 1% | < 3% | OK |
| mono_027pct | 27% | 28.8 | -51.2 | 1% | < 3% | OK |
| fixed_30pct | 30% | 31.7 | -48.3 | 1% | < 3% | OK |
| fraco_t2 | 30% | 31.6 | -48.4 | 1% | < 3% | OK |
| fraco_t4 | 30% | 31.8 | -48.2 | 1% | < 3% | OK |
| chute_puro_t4 | 33% | 34.2 | -45.8 | 1% | < 3% | OK |
| fadiga | 33% | 34.1 | -45.9 | 1% | < 3% | OK |
| mono_036pct | 37% | 36.5 | -43.5 | 1% | < 3% | OK |
| fixed_40pct | 40% | 38.8 | -41.2 | 1% | < 3% | OK |
| chute_puro_t2 | 40% | 38.8 | -41.2 | 1% | < 3% | OK |
| acerta_faceis | 40% | 38.9 | -41.1 | 1% | < 3% | OK |
| mediano_t2 | 43% | 41.1 | -38.9 | 1% | < 3% | OK |
| elo_1100 | 43% | 41.2 | -38.8 | 1% | < 3% | OK |
| mediano_t3 | 47% | 43.6 | -36.4 | 1% | < 3% | OK |
| mono_045pct | 47% | 43.6 | -36.4 | 1% | < 3% | OK |
| fixed_50pct | 50% | 46 | -34 | 1% | < 3% | OK |
| mediano_t4 | 50% | 46 | -34 | 1% | < 3% | OK |
| aquecimento | 50% | 45.9 | -34.1 | 1% | < 3% | OK |
| alternado | 50% | 45.9 | -34.1 | 1% | < 3% | OK |
| elo_1300 | 53% | 48.3 | -31.7 | 1% | < 3% | OK |
| mediano_t1 | 57% | 50.8 | -29.2 | 1% | < 3% | OK |
| bom_t4 | 57% | 50.8 | -29.2 | 1% | < 3% | OK |
| acerta_dificeis | 57% | 50.7 | -29.3 | 1% | < 3% | OK |
| elo_1200 | 57% | 50.7 | -29.3 | 1% | < 3% | OK |
| mono_055pct | 57% | 50.6 | -29.4 | 1% | < 3% | OK |
| fixed_60pct | 60% | 53 | -27 | 1% | < 3% | OK |
| bom_t1 | 60% | 53 | -27 | 1% | < 3% | OK |
| mono_064pct | 63% | 55.3 | -24.7 | 1% | < 3% | OK |
| bom_t2 | 67% | 57.7 | -22.3 | 1% | < 3% | OK |
| elo_1500 | 67% | 57.7 | -22.3 | 1% | < 3% | OK |
| fixed_70pct | 70% | 60.1 | -19.9 | 1% | < 3% | OK |
| elo_1400 | 70% | 60.2 | -19.8 | 1% | < 3% | OK |
| bom_t3 | 73% | 62.5 | -17.5 | 1% | < 3% | BUG |
| mono_073pct | 73% | 62.4 | -17.6 | 1% | < 3% | BUG |
| fixed_80pct | 80% | 67.2 | -12.8 | 1% | < 3% | BUG |
| excelente_t1 | 80% | 67.1 | -12.9 | 1% | < 3% | BUG |
| excelente_t3 | 80% | 67.2 | -12.8 | 1% | < 3% | BUG |
| mono_082pct | 83% | 69.6 | -10.4 | 1% | < 3% | BUG |
| elo_1800 | 87% | 71.9 | -8.1 | 1.97% | < 3% | BUG |
| fixed_90pct | 90% | 74.2 | -5.8 | 6.44% | 3-10% | BUG |
| elo_1600 | 90% | 74.2 | -5.8 | 6.44% | 3-10% | BUG |
| mono_091pct | 90% | 74.2 | -5.8 | 6.44% | 3-10% | BUG |
| excelente_t2 | 93% | 76.5 | -3.5 | 16.69% | 10-25% | OK |
| excelente_t4 | 93% | 76.6 | -3.4 | 17.32% | 10-25% | OK |
| fixed_100pct | 100% | 81.3 | +1.3 | 65.42% | 55-70% | OK |
| mono_100pct | 100% | 81.3 | +1.3 | 65.42% | 55-70% | OK |
