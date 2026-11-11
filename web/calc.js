/*
 * KalorienKompass – Rechenkern (ohne DOM, testbar mit: node test/calc.test.js)
 */
(function (root) {
  "use strict";

  const KCAL_PER_KG = 7000;          // ca. 7.000 kcal je kg Körperfett
  const DAYS_PER_MONTH = 30.44;
  const MIN_KCAL = { m: 1500, w: 1200 }; // übliche Untergrenzen ohne ärztliche Begleitung
  const COMPLETE_DAY_KCAL = 800;     // Tage mit weniger Einträgen gelten als unvollständig protokolliert

  /* ---------- Grundformeln ---------- */
  function bmrMifflin({ sex, age, heightCm, weightKg }) {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "w" ? -161 : 5);
  }
  function bmrKatch({ weightKg, bodyFatPct }) {
    return 370 + 21.6 * weightKg * (1 - bodyFatPct / 100);
  }
  function dailyDeficit(kgPerMonth) { return (kgPerMonth * KCAL_PER_KG) / DAYS_PER_MONTH; }

  /** Netto-Mehrverbrauch durch Schritte (Faustformel) */
  function stepsKcal(steps, weightKg) {
    return steps > 0 && weightKg > 0 ? steps * weightKg * 0.0004 : 0;
  }
  /** Netto-Mehrverbrauch durch Sport: (MET − 1) × kg × Stunden */
  function sportKcal(met, minutes, weightKg) {
    return met > 1 && minutes > 0 && weightKg > 0 ? (met - 1) * weightKg * (minutes / 60) : 0;
  }
  function movementKcal(day, weightKg) {
    if (!day) return 0;
    return stepsKcal(day.steps, weightKg) + sportKcal(day.met, day.min, weightKg);
  }

  function proteinRange({ heightCm, weightKg }) {
    const h = heightCm / 100, ref = 25 * h * h;
    const basis = weightKg > ref ? ref + 0.4 * (weightKg - ref) : weightKg;
    return { min: basis * 1.2, max: basis * 1.5 };
  }
  function bmi({ heightCm, weightKg }) { const h = heightCm / 100; return weightKg / (h * h); }
  function whtr(waistCm, heightCm) { return waistCm > 0 && heightCm > 0 ? waistCm / heightCm : null; }
  function round10(x) { return Math.round(x / 10) * 10; }

  /* ---------- Datum ---------- */
  function iso(d) {
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  function parseIso(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function dayDiff(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }

  function foodTotal(day) {
    return day && Array.isArray(day.food) ? day.food.reduce((s, f) => s + (Number(f.k) || 0), 0) : 0;
  }

  /** Lineare Regression; liefert Steigung (y pro x) */
  function slope(points) {
    const n = points.length;
    if (n < 2) return null;
    const mx = points.reduce((s, p) => s + p.x, 0) / n;
    const my = points.reduce((s, p) => s + p.y, 0) / n;
    let num = 0, den = 0;
    for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
    return den > 0 ? num / den : null;
  }

  /** Gleitender 7-Tage-Mittelwert des Gewichts für einen Tag (nur Tage mit Messung) */
  function weightMean(days, dateIso, span = 7) {
    const vals = [];
    for (let i = 0; i < span; i++) {
      const d = days[addDays(dateIso, -i)];
      if (d && d.w > 0) vals.push(d.w);
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  /**
   * Eichung aus dem Tagebuch: Ø-Essen der vollständig protokollierten Tage
   * minus Gewichtstrend (Regression über alle Wiegungen) im Zeitraum.
   */
  function calibrateFromLog(days, { today, weightKg, usualSteps = 0, windowDays = 28 }) {
    const start = addDays(today, -(windowDays - 1));
    const weights = [], intakes = [], moves = [];
    for (let i = 0; i < windowDays; i++) {
      const key = addDays(start, i), d = days[key];
      if (!d) continue;
      if (d.w > 0) weights.push({ x: i, y: d.w });
      const t = foodTotal(d);
      if (key !== today && t >= COMPLETE_DAY_KCAL) {   // heute ist noch nicht vollständig
        intakes.push(t);
        const hasSteps = d.steps > 0;
        moves.push(movementKcal({ steps: hasSteps ? d.steps : usualSteps, met: d.met, min: d.min }, weightKg));
      }
    }
    const span = weights.length ? weights[weights.length - 1].x - weights[0].x : 0;
    const need = { intakeDays: 14, weights: 6, spanDays: 21 };
    const res = { ok: false, intakeDays: intakes.length, weightCount: weights.length, spanDays: span, need };
    if (intakes.length < need.intakeDays || weights.length < need.weights || span < need.spanDays) {
      res.reason = "zu wenig Daten";
      return res;
    }
    const kgPerDay = slope(weights);
    const avgIntake = intakes.reduce((a, b) => a + b, 0) / intakes.length;
    const tdee = avgIntake - kgPerDay * KCAL_PER_KG;
    Object.assign(res, {
      avgIntake, kgPerWeek: kgPerDay * 7, tdee,
      baselineMovement: moves.reduce((a, b) => a + b, 0) / moves.length,
    });
    if (!(tdee > 1000 && tdee < 5000)) { res.reason = "unplausibel"; return res; }
    res.ok = true;
    return res;
  }

  /** Manuelle Eichung (z. B. aus einer anderen App) – erst ab 3 Wochen sinnvoll */
  function calibrateManual({ avgIntake, weeks, weightChangeKg }) {
    if (!(avgIntake > 0) || !(weeks > 0) || !Number.isFinite(weightChangeKg)) return null;
    const tdee = avgIntake - (weightChangeKg * KCAL_PER_KG) / (weeks * 7);
    const res = { ok: false, avgIntake, tdee, weeks, manual: true };
    if (weeks < 3) { res.reason = "zu kurz"; return res; }
    if (!(tdee > 1000 && tdee < 5000)) { res.reason = "unplausibel"; return res; }
    res.ok = true;
    return res;
  }

  /**
   * Gesamtrechnung für einen Tag.
   * p: { sex, age, heightCm, weightKg, bodyFatPct, waistCm, pal, goalKgPerMonth, targetWeightKg,
   *      startWeightKg, supervised, usualSteps, eatbackPct }
   * calib: Ergebnis von calibrateFromLog/calibrateManual oder null
   * today: { steps, met, min }
   */
  function calculate(p, calib, today, now = new Date()) {
    const sex = p.sex === "w" ? "w" : "m";
    const hasBf = p.bodyFatPct > 3 && p.bodyFatPct < 70;
    const bmr = hasBf ? bmrKatch(p) : bmrMifflin({ ...p, sex });
    const formulaTdee = bmr * p.pal;
    const calibUsed = !!(calib && calib.ok);
    const maintain = calibUsed ? calib.tdee : formulaTdee;
    const minKcal = MIN_KCAL[sex];

    // Ziel
    const kg = p.goalKgPerMonth > 0 ? p.goalKgPerMonth : 0;
    const deficit = dailyDeficit(kg);
    const raw = maintain - deficit;
    const belowMin = kg > 0 && raw < minKcal;
    const clamped = belowMin && !p.supervised;
    const goalKcal = clamped ? minKcal : raw;

    // Bonus: nur Bewegung über dem Üblichen zählt (das Übliche steckt im Bedarf schon drin)
    const usual = p.usualSteps > 0 ? p.usualSteps : 0;
    const baseline = calibUsed && calib.baselineMovement != null
      ? calib.baselineMovement
      : stepsKcal(usual, p.weightKg);
    const t = today || {};
    // Keine Schritte eingetragen → wie ein normaler Tag rechnen (so wie bei der Eichung)
    const todayMove = movementKcal({ steps: t.steps > 0 ? t.steps : usual, met: t.met, min: t.min }, p.weightKg);
    const extra = todayMove - baseline > 1 ? todayMove - baseline : 0;
    const eatback = (p.eatbackPct == null ? 50 : p.eatbackPct) / 100;
    const bonus = extra * eatback;

    // Ziel-Gewicht
    let lostPct = null;
    if (p.startWeightKg > p.weightKg) lostPct = ((p.startWeightKg - p.weightKg) / p.startWeightKg) * 100;
    let months = null, targetDate = null;
    if (kg > 0 && p.targetWeightKg > 0 && p.targetWeightKg < p.weightKg) {
      months = (p.weightKg - p.targetWeightKg) / kg;
      targetDate = new Date(now.getFullYear(), now.getMonth() + Math.ceil(months), 1);
    }

    return {
      sex, bmr, usedKatch: hasBf, formulaTdee, calibUsed, calib, maintain,
      gap: calibUsed ? formulaTdee - calib.tdee : null,
      minKcal,
      goal: { kgPerMonth: kg, deficit, raw, kcal: goalKcal, belowMin, clamped },
      bonus: { today: todayMove, baseline, extra, eatback, kcal: bonus },
      todayTarget: goalKcal + bonus,
      bmi: bmi(p), whtr: whtr(p.waistCm, p.heightCm), protein: proteinRange(p),
      lostPct, months, targetDate,
    };
  }

  const api = {
    API: 2,
    KCAL_PER_KG, DAYS_PER_MONTH, MIN_KCAL, COMPLETE_DAY_KCAL,
    bmrMifflin, bmrKatch, dailyDeficit, stepsKcal, sportKcal, movementKcal, proteinRange, bmi, whtr,
    round10, iso, parseIso, addDays, dayDiff, foodTotal, slope, weightMean,
    calibrateFromLog, calibrateManual, calculate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KCalc = api;
})(typeof self !== "undefined" ? self : this);
