# Kekurangan 2 — JEV SMC vs FractalTrader

Status: RESEARCH COMPLETE / NO PATCH

Kekurangan 2 berisi gap spesifik yang terlihat saat JEV v2 dibandingkan dengan implementasi publik FractalTrader. FractalTrader adalah implementation reference, bukan bukti profitabilitas.

## Confirmed gaps

### K2.1 — Equal-liquidity clustering belum ada

JEV memiliki prior-pool sweep/reclaim. FractalTrader memiliki clustering equal-high/equal-low berdasarkan tolerance, minimum touch, average level, first touch, last touch, dan touch count.

Dampak: isolated swing dan repeated liquidity cluster belum dibedakan.

### K2.2 — POI lifecycle belum lengkap

JEV belum mewajibkan schema penuh untuk `poi_id`, source impulse, age, retest, touch count, mitigation, invalidation, dan expiry reason.

### K2.3 — Nested multi-scale structure graph belum ada

JEV memiliki timeframe boundaries 1H/15M/5M, tetapi belum memiliki linked internal/external swing graph: parent swing, child swing, major structure, dan minor structure.

### K2.4 — Liquidity-cluster evidence score belum ada

JEV belum memiliki standardized record untuk touch count, cluster age, sweep count, reclaim count, dan cluster strength.

### K2.5 — POI selection provenance belum ada

JEV belum mewajibkan candidate POI list, selected POI ID, alasan pemilihan, competing POI, dan alasan penolakan.

## Batas bukti

Confirmed sebagai information/schema/auditability gaps. Belum terbukti bahwa fitur FractalTrader meningkatkan PnL. Tidak ada rule FractalTrader yang dipromosikan ke JEV.

## Tidak termasuk kekurangan

JEV tidak perlu menyalin secara otomatis:

```text
heuristic confidence score
close-cross BOS tanpa displacement
zone-touch entry tanpa 5M rejection
klaim FVG/OB sebagai bukti institutional order
```

Kekurangan 2 tetap terpisah dari Kekurangan 1. Kekurangan 1 berisi gap market-structure umum; Kekurangan 2 berisi gap spesifik hasil perbandingan FractalTrader.
