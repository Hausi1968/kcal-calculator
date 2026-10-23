/*
 * KalorienKompass – Rechenkern
 * Reine Funktionen ohne DOM, damit sie sich testen lassen (node test/calc.test.js).
 */
(function (root) {
  "use strict";

  const KCAL_PER_KG_FAT = 7000;   // ca. 7.000 kcal je kg Körperfett
  const DAYS_PER_MONTH = 30.44;
  const MIN_KCAL = { m: 1500, w: 1200, d: 1350 }; // übliche Untergrenzen ohne ärztliche Begleitung

  /** Mifflin-St-Jeor-Grundumsatz */
  function bmrMifflin({ sex, age, heightCm, weightKg }) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (sex === "m") return base + 5;
    if (sex === "w") return base - 161;
    return base - 78; // divers: Mittelwert der beiden Konstanten
  }

  /** Katch-McArdle-Grundumsatz (nur mit Körperfettanteil) */
  function bmrKatch({ weightKg, bodyFatPct }) {
    const lbm = weightKg * (1 - bodyFatPct / 100);
    return 370 + 21.6 * lbm;
  }

  /** Tatsächlichen Erhaltungsbedarf aus echten Daten zurückrechnen */
  function calibratedTdee({ avgIntake, weightChangeKg, weeks }) {
    if (!(avgIntake > 0) || !(weeks > 0) || !Number.isFinite(weightChangeKg)) return null;
    const days = weeks * 7;
    return avgIntake - (weightChangeKg * KCAL_PER_KG_FAT) / days;
  }

  function dailyDeficitForKgPerMonth(kgPerMonth) {
    return (kgPerMonth * KCAL_PER_KG_FAT) / DAYS_PER_MONTH;
  }

  /** Netto-Mehrverbrauch durch Schritte (grobe Faustformel) */
  function stepsKcal(steps, weightKg) {
    if (!(steps > 0) || !(weightKg > 0)) return 0;
    return steps * weightKg * 0.0004;
  }

  /** Netto-Mehrverbrauch durch Sport über MET-Werte: (MET − 1) × kg × Stunden */
  function sportKcal(met, minutes, weightKg) {
    if (!(met > 1) || !(minutes > 0) || !(weightKg > 0)) return 0;
    return (met - 1) * weightKg * (minutes / 60);
  }

  /** Eiweißempfehlung (g/Tag) über ein angepasstes Bezugsgewicht bei Übergewicht */
  function proteinRange({ heightCm, weightKg }) {
    const h = heightCm / 100;
    const ref = 25 * h * h; // Gewicht bei BMI 25
    const basis = weightKg > ref ? ref + 0.4 * (weightKg - ref) : weightKg;
    return { min: basis * 1.2, max: basis * 1.5, basis };
  }

  function bmi({ heightCm, weightKg }) {
    const h = heightCm / 100;
    return weightKg / (h * h);
  }

  function round10(x) { return Math.round(x / 10) * 10; }

  /**
   * Gesamtrechnung.
   * input: { sex, age, heightCm, weightKg, bodyFatPct?, pal, goals:[kg/Monat],
   *          calib?: {avgIntake, weightChangeKg, weeks}, useCalib, startWeightKg?, targetWeightKg? }
   */
  function calculate(input) {
    const { sex, age, heightCm, weightKg, pal } = input;
    const bmrM = bmrMifflin({ sex, age, heightCm, weightKg });
    const hasBf = input.bodyFatPct > 3 && input.bodyFatPct < 70;
    const bmrK = hasBf ? bmrKatch({ weightKg, bodyFatPct: input.bodyFatPct }) : null;
    const bmr = hasBf ? bmrK : bmrM;
    const formulaTdee = bmr * pal;

    const calTdee = input.calib ? calibratedTdee(input.calib) : null;
    const calibUsed = !!(input.useCalib && calTdee && calTdee > 800 && calTdee < 6000);
    const tdee = calibUsed ? calTdee : formulaTdee;
    const minKcal = MIN_KCAL[sex] || MIN_KCAL.d;

    const goals = (input.goals || [0, 1, 2]).map((kg) => {
      const deficit = dailyDeficitForKgPerMonth(kg);
      const kcal = tdee - deficit;
      return {
        kgPerMonth: kg,
        deficit,
        kcal,
        belowBmr: kg > 0 && kcal < bmr,
        belowMin: kg > 0 && kcal < minKcal,
      };
    });

    let lostPct = null;
    if (input.startWeightKg > weightKg) {
      lostPct = ((input.startWeightKg - weightKg) / input.startWeightKg) * 100;
    }

    let monthsToTarget = null;
    if (input.targetWeightKg > 0 && input.targetWeightKg < weightKg) {
      monthsToTarget = goals
        .filter((g) => g.kgPerMonth > 0)
        .map((g) => ({ kgPerMonth: g.kgPerMonth, months: (weightKg - input.targetWeightKg) / g.kgPerMonth }));
    }

    return {
      bmr, bmrMifflin: bmrM, bmrKatch: bmrK, usedKatch: hasBf,
      formulaTdee, calibratedTdee: calTdee, calibUsed, tdee,
      formulaVsCalib: calTdee ? formulaTdee - calTdee : null,
      goals, minKcal,
      bmi: bmi({ heightCm, weightKg }),
      protein: proteinRange({ heightCm, weightKg }),
      lostPct, monthsToTarget,
    };
  }

  const api = {
    KCAL_PER_KG_FAT, DAYS_PER_MONTH, MIN_KCAL,
    bmrMifflin, bmrKatch, calibratedTdee, dailyDeficitForKgPerMonth,
    stepsKcal, sportKcal, proteinRange, bmi, round10, calculate,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KCalc = api;
})(typeof self !== "undefined" ? self : this);
