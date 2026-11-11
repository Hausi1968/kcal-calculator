// Prüft den Rechenkern: node test/calc.test.js
const assert = require("assert");
const C = require("../web/calc.js");
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

// Mifflin-St-Jeor
near(C.bmrMifflin({ sex: "m", age: 58, heightCm: 170, weightKg: 93.2 }), 1709.5, 0.01);
near(C.bmrMifflin({ sex: "w", age: 58, heightCm: 170, weightKg: 93.2 }), 1543.5, 0.01);

const P = { sex: "m", age: 58, heightCm: 170, weightKg: 93.2, pal: 1.2, goalKgPerMonth: 1,
  usualSteps: 3000, eatbackPct: 50, startWeightKg: 151.2, targetWeightKg: 85 };

// Formel ohne Eichung
let r = C.calculate(P, null, {});
near(r.maintain, 2051.4);
near(r.goal.kcal, 2051.4 - 7000 / 30.44);
assert.strictEqual(r.goal.clamped, false);
near(r.lostPct, 38.4, 0.1);
near(r.months, 8.2, 0.01);

// Bonus: nur Schritte über dem Üblichen zählen, davon 50 %
r = C.calculate(P, null, { steps: 8000 });
near(r.bonus.extra, C.stepsKcal(5000, 93.2));
near(r.bonus.kcal, C.stepsKcal(5000, 93.2) / 2);
near(r.todayTarget, r.goal.kcal + r.bonus.kcal);
r = C.calculate(P, null, { steps: 2000 });
near(r.bonus.kcal, 0, 0.001);

// Manuelle Eichung: unter 3 Wochen nicht verwendet
assert.strictEqual(C.calibrateManual({ avgIntake: 1550, weeks: 2, weightChangeKg: 0 }).ok, false);
const man = C.calibrateManual({ avgIntake: 1550, weeks: 8, weightChangeKg: 0 });
assert.strictEqual(man.ok, true);
near(C.calibrateManual({ avgIntake: 2000, weeks: 4, weightChangeKg: 1 }).tdee, 1750);

// Untergrenze: ohne ärztliche Begleitung auf 1.500 begrenzt, mit Begleitung echter Wert
r = C.calculate(P, man, {});
near(r.maintain, 1550);
assert.strictEqual(r.goal.clamped, true);
assert.strictEqual(r.goal.kcal, 1500);
near(r.gap, 501.4);
r = C.calculate({ ...P, supervised: true }, man, {});
assert.strictEqual(r.goal.clamped, false);
near(r.goal.kcal, 1550 - 230, 1);

// Eichung aus dem Tagebuch: 28 Tage, 1.600 kcal, Gewicht fällt 0,25 kg/Woche
const today = "2026-11-11";
const days = {};
for (let i = 0; i < 28; i++) {
  const key = C.addDays(today, -27 + i);
  days[key] = { food: [{ k: 1000 }, { k: 600 }], steps: 4000 };
  if (i % 2 === 0) days[key].w = 95 - (0.25 / 7) * i;
}
const cal = C.calibrateFromLog(days, { today, weightKg: 93.2, usualSteps: 3000 });
assert.strictEqual(cal.ok, true, cal.reason);
near(cal.kgPerWeek, -0.25, 0.001);
near(cal.tdee, 1600 + 250, 1);
near(cal.baselineMovement, C.stepsKcal(4000, 93.2));
// mit Eichung: Bonus erst über den geloggten Ø-Schritten
r = C.calculate(P, cal, { steps: 4000 });
near(r.bonus.kcal, 0, 0.001);

// zu wenig Daten
const few = C.calibrateFromLog({ [today]: { w: 93, food: [{ k: 1500 }] } }, { today, weightKg: 93 });
assert.strictEqual(few.ok, false);
// unvollständige Tage (< 800 kcal) zählen nicht
const part = {};
for (let i = 0; i < 28; i++) part[C.addDays(today, -i)] = { w: 93, food: [{ k: 500 }] };
assert.strictEqual(C.calibrateFromLog(part, { today, weightKg: 93 }).intakeDays, 0);

// 7-Tage-Mittel
near(C.weightMean({ [today]: { w: 92 }, [C.addDays(today, -1)]: { w: 94 }, [C.addDays(today, -9)]: { w: 99 } }, today), 93);

// Sonstiges
near(C.sportKcal(3.5, 60, 93.2), 233, 0.1);
const p = C.proteinRange({ heightCm: 170, weightKg: 93.2 });
near(p.min, 96.7, 0.2); near(p.max, 120.9, 0.2);
near(C.whtr(102, 170), 0.6, 0.001);
assert.strictEqual(C.dayDiff("2026-10-31", "2026-11-02"), 2);

console.log("Alle Tests bestanden ✓");
