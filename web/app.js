/* KalorienKompass – Oberfläche */
(function () {
  "use strict";
  const APP_VERSION = "1.0.0";
  const STORE_KEY = "kalorienkompass.v1";
  const C = window.KCalc;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const form = $("#form");
  const fmt = (n) => Math.round(n).toLocaleString("de-DE");
  const fmt10 = (n) => C.round10(n).toLocaleString("de-DE");
  const fmt1 = (n) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

  $("#ver").textContent = "v" + APP_VERSION;

  /* ---------- Eingaben lesen ---------- */
  function num(name) {
    const el = form.elements[name];
    if (!el) return NaN;
    const raw = String(el.value).trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
    if (raw === "") return NaN;
    return Number(raw);
  }
  function checked(group) {
    return $$(`[data-group="${group}"] input:checked`).map((i) => i.value);
  }

  function readState() {
    const s = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "radio") { if (el.checked) s[el.name] = el.value; }
      else if (el.type === "checkbox") s[el.name] = el.checked;
      else s[el.name] = el.value;
    }
    s.conditions = checked("conditions");
    s.meds = checked("meds");
    return s;
  }
  function writeState(s) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      if (el.type === "radio") el.checked = el.value === s[el.name];
      else if (el.type === "checkbox") el.checked = !!s[el.name];
      else el.value = s[el.name];
    }
    for (const g of ["conditions", "meds"]) {
      const vals = s[g] || [];
      $$(`[data-group="${g}"] input`).forEach((i) => (i.checked = vals.includes(i.value)));
    }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(readState())); } catch (e) {} }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) writeState(JSON.parse(raw)); } catch (e) {}
  }

  /* ---------- Rechnen & Anzeigen ---------- */
  let last = null;

  function render() {
    const sex = (form.elements.sex.value) || "m";
    const age = num("age"), heightCm = num("height"), weightKg = num("weight");
    const valid = age >= 15 && age <= 110 && heightCm >= 120 && heightCm <= 230 && weightKg >= 35 && weightKg <= 350;

    [["age", age >= 15 && age <= 110], ["height", heightCm >= 120 && heightCm <= 230], ["weight", weightKg >= 35 && weightKg <= 350]]
      .forEach(([n, ok]) => form.elements[n].classList.toggle("bad", form.elements[n].value.trim() !== "" && !ok));

    $("#eatbackVal").textContent = form.elements.eatback.value + " %";

    if (!valid) { $("#empty").hidden = false; $("#out").hidden = true; $("#notes-card").hidden = true; last = null; return; }

    const goals = [0];
    ["g1", "g2", "g3"].forEach((g) => { const v = num(g); if (v > 0 && v <= 6) goals.push(v); });

    const calIntake = num("calIntake"), calWeeks = num("calWeeks"), calChange = num("calChange");
    const calib = calIntake > 0 && calWeeks > 0 && Number.isFinite(calChange)
      ? { avgIntake: calIntake, weeks: calWeeks, weightChangeKg: calChange } : null;

    const r = C.calculate({
      sex, age, heightCm, weightKg,
      bodyFatPct: num("bodyfat"),
      pal: Number(form.elements.pal.value),
      goals, calib, useCalib: form.elements.useCalib.checked,
      startWeightKg: num("startWeight"), targetWeightKg: num("targetWeight"),
    });

    // Bonus
    const steps = num("steps");
    const stepK = C.stepsKcal(steps, weightKg);
    const sportK = C.sportKcal(Number(form.elements.sport.value), num("sportMin"), weightKg);
    const eatback = Number(form.elements.eatback.value) / 100;
    const bonus = (stepK + sportK) * eatback;

    // KPIs
    $("#empty").hidden = true; $("#out").hidden = false;
    $("#k-bmr").textContent = fmt10(r.bmr);
    $("#k-bmr-src").textContent = r.usedKatch ? "kcal · Katch-McArdle" : "kcal · Mifflin-St-Jeor";
    $("#k-tdee").textContent = fmt10(r.formulaTdee);
    const kc = $("#kpi-cal");
    if (r.calibratedTdee) {
      kc.hidden = false;
      $("#k-cal").textContent = fmt10(r.calibratedTdee);
      const d = r.formulaVsCalib;
      $("#k-cal-diff").textContent = Math.abs(d) < 50
        ? "kcal / Tag · passt zur Formel"
        : `kcal / Tag · ${fmt10(Math.abs(d))} kcal ${d > 0 ? "weniger" : "mehr"} als die Formel` + (r.calibUsed ? "" : " (nicht verwendet)");
    } else kc.hidden = true;

    // Ziele
    const ul = $("#goals"); ul.innerHTML = "";
    r.goals.forEach((g) => {
      const li = document.createElement("li");
      const label = g.kgPerMonth === 0 ? "Gewicht halten" : `− ${fmt1(g.kgPerMonth)} kg pro Monat`;
      const sub = g.kgPerMonth === 0
        ? (r.calibUsed ? "geeichter Bedarf" : "Bedarf laut Formel")
        : `ca. ${fmt10(g.deficit)} kcal Defizit · ≈ ${fmt1((g.kgPerMonth / C.DAYS_PER_MONTH) * 7)} kg/Woche`;
      let flag = "";
      if (g.belowMin) { li.className = "danger"; flag = `Unter ${fmt(r.minKcal)} kcal – nur mit ärztlicher Begleitung.`; }
      else if (g.belowBmr) { li.className = "warn"; flag = "Liegt unter dem Grundumsatz – auf Dauer anstrengend, Eiweiß im Blick behalten."; }
      li.innerHTML = `<span class="lbl">${label}</span><span class="sub">${sub}</span>
        <span class="val">${fmt10(g.kcal)}<small>kcal / Tag</small>${bonus >= 10 ? `<span class="plus">+ ${fmt10(bonus)} Bonus</span>` : ""}</span>
        ${flag ? `<span class="flag">${flag}</span>` : ""}`;
      ul.appendChild(li);
    });

    // Bonus-Box
    const bx = $("#bonus");
    if (stepK + sportK > 0) {
      bx.hidden = false;
      $("#b-total").textContent = "+" + fmt10(bonus) + " kcal";
      const parts = [];
      if (stepK) parts.push(`${fmt(steps)} Schritte ≈ ${fmt10(stepK)} kcal`);
      if (sportK) parts.push(`${form.elements.sport.selectedOptions[0].text} ≈ ${fmt10(sportK)} kcal`);
      $("#b-detail").textContent = parts.join(" · ") + ` · davon ${form.elements.eatback.value} % zurückessen`;
    } else bx.hidden = true;

    // Fakten
    $("#f-bmi").textContent = fmt1(r.bmi);
    $("#f-protein").textContent = `${fmt(r.protein.min)}–${fmt(r.protein.max)} g / Tag`;
    const tw = $("#f-target-wrap");
    if (r.monthsToTarget && r.monthsToTarget.length) {
      tw.hidden = false;
      $("#f-target").textContent = r.monthsToTarget
        .map((m) => `${fmt1(m.months)} Monate bei −${fmt1(m.kgPerMonth)} kg`).join(" · ");
    } else tw.hidden = true;

    renderNotes(r, { sex, weightKg });
    last = { r, sex, age, heightCm, weightKg, bonus, stepK, sportK };
  }

  /* ---------- Hinweise passend zu Erkrankungen & Medikamenten ---------- */
  function renderNotes(r, { weightKg }) {
    const cond = checked("conditions"), meds = checked("meds");
    const has = (x) => cond.includes(x) || meds.includes(x);
    const notes = [];
    const add = (title, text, important) => notes.push({ title, text, important });

    if (r.lostPct && r.lostPct >= 10)
      add("Stoffwechsel nach starkem Abnehmen",
        `Du hast rund ${fmt(r.lostPct)} % deines Startgewichts verloren. Danach verbraucht der Körper oft 100–300 kcal weniger, als Formeln annehmen. ${r.calibratedTdee ? "Gut, dass du mit echten Daten geeicht hast." : "Eiche den Bedarf in Abschnitt 4 mit deinen echten Werten."}`);

    if (r.calibratedTdee && r.formulaVsCalib > 150)
      add("Formel überschätzt dich",
        `Dein geeichter Bedarf liegt ${fmt10(r.formulaVsCalib)} kcal unter der Formel. Das ist nach großen Gewichtsverlusten, mit Betablockern oder wenig Muskelmasse häufig. Krafttraining (mit ärztlicher Freigabe) ist der beste Hebel dagegen.`);

    if (has("insulin") || has("su"))
      add("Unterzuckerungsgefahr",
        "Insulin und Sulfonylharnstoffe senken den Blutzucker unabhängig vom Essen. Weniger Kalorien oder mehr Bewegung nur nach Absprache mit dem Arzt – die Dosis muss oft angepasst werden.", true);

    if (has("glp1"))
      add("GLP-1-Wirkstoff",
        "Der Appetit ist gedämpft – trotzdem genug Eiweiß und Flüssigkeit aufnehmen, sonst geht Muskulatur verloren. Plateaus auf einer Dosisstufe sind häufig; ob die Dosis passt, entscheidet der Arzt. Bei Diabetes mit Herzerkrankung schützt der Wirkstoff zusätzlich das Herz.");

    if (has("sglt2"))
      add("SGLT2-Hemmer",
        "Über den Urin gehen täglich etwa 200–300 kcal als Zucker verloren – das kann geeichte Werte erklären. Sehr kohlenhydratarme Diäten erhöhen das Risiko einer Ketoazidose: nur mit dem Arzt.", true);

    if (has("diabetes2") || has("diabetes1"))
      add("Diabetes",
        "Kohlenhydrate gleichmäßig über den Tag verteilen und bei jeder Umstellung von Kalorien oder Training häufiger messen.");

    if (has("khk") || has("hf"))
      add("Herz",
        "Training nur mit Freigabe vom Kardiologen – ideal ist eine ärztlich betreute Herzsportgruppe (Rehasport, auf Verordnung). Kein Pressatmen, keine Maximalgewichte. Wenig Salz, mediterran essen.", true);

    if (has("hf"))
      add("Täglich wiegen",
        "Mehr als 2 kg Zunahme in drei Tagen, dicke Knöchel oder Atemnot im Liegen sind Warnzeichen für Wassereinlagerung – dann zeitnah zum Arzt. Trinkmenge wie vom Arzt vorgegeben.", true);

    if (has("betablocker"))
      add("Betablocker",
        "Sie können den Verbrauch leicht senken. Pulsbasierte Fitness-Uhren unterschätzen oder verfälschen den Sport-Verbrauch, weil der Puls gebremst ist – den Bonus also eher vorsichtig ansetzen.");

    if (has("kidney"))
      add("Nieren",
        `Die Eiweißempfehlung (${fmt(r.protein.min)}–${fmt(r.protein.max)} g) gilt für gesunde Nieren. Bei Nierenschwäche die Eiweißmenge unbedingt mit dem Arzt festlegen.`, true);

    if (has("thyroid"))
      add("Schilddrüse",
        "Eine nicht optimal eingestellte Unterfunktion senkt den Verbrauch. Bei Stillstand den TSH-Wert prüfen lassen.");

    if (has("htn"))
      add("Blutdruck", "Unter 5–6 g Salz pro Tag; Abnehmen senkt den Blutdruck oft spürbar – Medikamente ggf. anpassen lassen.");

    if (has("diuretic") || has("cortison"))
      add("Wasserschwankungen",
        "Entwässerungstabletten und Kortison verschieben Wasser im Körper. Tageswerte auf der Waage sagen dann wenig – nur den Wochendurchschnitt bewerten.");

    if (has("psych") || has("insulin") || has("cortison"))
      add("Gewichtsfördernde Medikamente",
        "Einige deiner Medikamente können Appetit oder Gewicht erhöhen. Nicht selbst absetzen – beim Arzt nach gewichtsneutralen Alternativen fragen.");

    const deepest = r.goals.filter((g) => g.kgPerMonth > 0).sort((a, b) => a.kcal - b.kcal)[0];
    if (deepest && deepest.belowMin)
      add("Sehr niedrige Kalorienzufuhr",
        `Ziele unter ${fmt(r.minKcal)} kcal sollten nur ärztlich begleitet werden – sonst drohen Nährstoffmangel und Muskelabbau.`, true);

    notes.push({ title: "Waage richtig lesen", text: "Morgens nach dem Toilettengang wiegen und den Wochendurchschnitt vergleichen. Schwankungen von 0,5–2 kg pro Tag sind normal (Wasser, Salz, Darminhalt)." });

    const list = $("#notes"); list.innerHTML = "";
    notes.forEach((n) => {
      const li = document.createElement("li");
      if (n.important) li.className = "important";
      li.innerHTML = `<b>${n.title}</b>${n.text}`;
      list.appendChild(li);
    });
    $("#notes-card").hidden = notes.length === 0;
  }

  /* ---------- Druckansicht für den Arzt ---------- */
  function buildPrint() {
    render();
    if (!last) { toast("Bitte zuerst Alter, Größe und Gewicht eingeben."); return false; }
    const { r, sex, age, heightCm, weightKg } = last;
    const labels = (g) => $$(`[data-group="${g}"] input:checked`).map((i) => i.nextElementSibling.textContent).join(", ") || "–";
    const other = form.elements.medsOther.value.trim();
    const rows = r.goals.map((g) =>
      `<tr><td>${g.kgPerMonth === 0 ? "Gewicht halten" : "−" + fmt1(g.kgPerMonth) + " kg / Monat"}</td><td>${fmt10(g.kcal)} kcal</td></tr>`).join("");
    $("#print").innerHTML = `
      <h1>KalorienKompass – Zusammenfassung</h1>
      <p>Stand: ${new Date().toLocaleDateString("de-DE")}</p>
      <table>
        <tr><th>Geschlecht / Alter</th><td>${{ m: "Mann", w: "Frau", d: "Divers" }[sex]}, ${age} Jahre</td></tr>
        <tr><th>Größe / Gewicht / BMI</th><td>${fmt(heightCm)} cm · ${fmt1(weightKg)} kg · BMI ${fmt1(r.bmi)}</td></tr>
        <tr><th>Erkrankungen</th><td>${labels("conditions")}</td></tr>
        <tr><th>Medikamente</th><td>${labels("meds")}${other ? " · " + other.replace(/</g, "&lt;") : ""}</td></tr>
        <tr><th>Grundumsatz</th><td>${fmt10(r.bmr)} kcal (${r.usedKatch ? "Katch-McArdle" : "Mifflin-St-Jeor"})</td></tr>
        <tr><th>Erhalt laut Formel</th><td>${fmt10(r.formulaTdee)} kcal (Faktor ${form.elements.pal.value})</td></tr>
        ${r.calibratedTdee ? `<tr><th>Erhalt geeicht</th><td>${fmt10(r.calibratedTdee)} kcal (Ø ${fmt(num("calIntake"))} kcal über ${fmt1(num("calWeeks"))} Wochen, Gewichtsänderung ${fmt1(num("calChange"))} kg)</td></tr>` : ""}
        <tr><th>Eiweiß</th><td>${fmt(r.protein.min)}–${fmt(r.protein.max)} g / Tag</td></tr>
      </table>
      <h2>Tägliche Kalorienziele</h2>
      <table>${rows}</table>
      <p>Frage an den Arzt: Welches Kalorienziel und welches Training sind für mich sicher?</p>`;
    return true;
  }
  const inApp = !!window.AndroidApp;
  if (inApp) {
    $("#apk-link").hidden = true;
    try { $("#ver").textContent += " · App " + window.AndroidApp.versionCode(); } catch (e) {}
  }
  $("#btn-print").addEventListener("click", () => {
    if (!buildPrint()) return;
    if (inApp && window.AndroidApp.print) window.AndroidApp.print(); else window.print();
  });

  /* ---------- Sonstiges ---------- */
  function toast(text, actionLabel, action) {
    const t = $("#toast");
    t.innerHTML = "";
    t.append(document.createTextNode(text));
    if (actionLabel) {
      const b = document.createElement("button"); b.textContent = actionLabel; b.onclick = action; t.append(b);
    }
    t.hidden = false;
    clearTimeout(toast._t);
    if (!actionLabel) toast._t = setTimeout(() => (t.hidden = true), 3500);
  }

  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Alle Eingaben auf diesem Gerät löschen?")) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    form.reset(); render();
  });

  form.addEventListener("input", () => { render(); save(); });
  form.addEventListener("change", () => { render(); save(); });
  form.addEventListener("submit", (e) => e.preventDefault());

  load();
  render();

  /* ---------- Offline & Updates „aus der Luft“ ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw && nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller)
            toast("Neue Version verfügbar.", "Aktualisieren", () => location.reload());
        });
      });
      // regelmäßig nach Updates schauen, solange die App offen ist
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
  }
})();
