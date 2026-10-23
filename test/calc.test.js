// Prüft den Rechenkern: node test/calc.test.js
const assert = require("assert");
const C = require("../web/calc.js");
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Mifflin-St-Jeor: Mann, 58 J., 170 cm, 93,2 kg
near(C.bmrMifflin({ sex: "m", age: 58, heightCm: 170, weightKg: 93.2 }), 1709.5, 0.01);
near(C.bmrMifflin({ sex: "w", age: 58, heightCm: 170, weightKg: 93.2 }), 1543.5, 0.01);

const r = C.calculate({ sex: "m", age: 58, heightCm: 170, weightKg: 93.2, pal: 1.2, goals: [0, 1, 2] });
near(r.tdee, 2051.4);
near(r.goals[1].kcal, 2051.4 - 7000 / 30.44);
near(r.goals[2].kcal, 2051.4 - 14000 / 30.44);
assert.strictEqual(r.goals[2].belowBmr, true);
assert.strictEqual(r.goals[1].belowMin, false);

// Eichung: 1.550 kcal gegessen, Gewicht 4 Wochen stabil → Bedarf 1.550
const k = C.calculate({ sex: "m", age: 58, heightCm: 170, weightKg: 93.2, pal: 1.2, goals: [0, 1],
  calib: { avgIntake: 1550, weeks: 4, weightChangeKg: 0 }, useCalib: true, startWeightKg: 151.2 });
assert.strictEqual(k.calibUsed, true);
near(k.tdee, 1550);
near(k.goals[1].kcal, 1550 - 230, 1);
assert.strictEqual(k.goals[1].belowMin, true);
near(k.lostPct, 38.4, 0.1);
// 1 kg Zunahme in 4 Wochen bei 2.000 kcal → Bedarf 1.750
near(C.calibratedTdee({ avgIntake: 2000, weeks: 4, weightChangeKg: 1 }), 1750);

// Bonus
near(C.stepsKcal(10000, 93.2), 372.8, 0.1);
near(C.sportKcal(3.5, 60, 93.2), 233, 0.1);
assert.strictEqual(C.sportKcal(0, 60, 90), 0);

// Eiweiß über angepasstes Bezugsgewicht
const p = C.proteinRange({ heightCm: 170, weightKg: 93.2 });
near(p.min, 96.7, 0.2); near(p.max, 120.9, 0.2);

console.log("Alle Tests bestanden ✓");
