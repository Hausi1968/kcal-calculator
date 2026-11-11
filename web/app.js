/* KalorienKompass – Oberfläche */
(function () {
  "use strict";
  const C = window.KCalc;
  // Passt calc.js nicht zu dieser app.js (z. B. halb aktualisierter Cache)? Einmal frisch laden.
  if (!C || C.API !== 2) {
    try { if (!sessionStorage.getItem("kk-reload")) { sessionStorage.setItem("kk-reload", "1"); location.reload(); return; } } catch (e) {}
  }
  try { sessionStorage.removeItem("kk-reload"); } catch (e) {}
  const VERSION = self.APP_VERSION || "?";
  const KEY = "kalorienkompass.v2";
  const OLD_KEY = "kalorienkompass.v1";
  const app = window.AndroidApp || null;
  const has = (fn) => !!(app && typeof app[fn] === "function");

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => Math.round(n).toLocaleString("de-DE");
  const fmt10 = (n) => C.round10(n).toLocaleString("de-DE");
  const fmt1 = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sign1 = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt1(Math.abs(n));
  const num = (v) => {
    const s = String(v == null ? "" : v).trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
    return s === "" ? NaN : Number(s);
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ================= Daten ================= */
  const DEFAULT_PROFILE = {
    sex: "m", age: "", height: "", weight: "", waist: "", startWeight: "", targetWeight: "",
    goal: "1", supervised: false, pal: "1.2", usualSteps: "3000", eatback: "50",
    conditions: [], meds: [], medsOther: "", calibMode: "auto", calIntake: "", calWeeks: "", calChange: "", bodyfat: "",
  };
  let state = { v: 2, profile: { ...DEFAULT_PROFILE }, days: {} };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); state = { v: 2, profile: sanitizeProfile(s.profile || {}), days: sanitizeDays(s.days) }; return; }
      const old = localStorage.getItem(OLD_KEY);
      if (old) migrate(JSON.parse(old));
    } catch (e) { /* Speicher nicht verfügbar → mit leerem Zustand weiter */ }
  }
  function migrate(o) {
    const p = { ...DEFAULT_PROFILE };
    ["age", "height", "weight", "startWeight", "targetWeight", "bodyfat", "medsOther", "calIntake", "calWeeks", "calChange", "eatback"]
      .forEach((k) => { if (o[k] != null) p[k] = String(o[k]); });
    p.sex = o.sex === "w" ? "w" : "m";
    const pal = Number(o.pal);
    p.pal = pal >= 1.5 ? "1.6" : pal > 1.3 ? "1.4" : "1.2";
    const g = num(o.g1);
    p.goal = String([0, 0.5, 1, 1.5, 2, 3].reduce((a, b) => (Math.abs(b - g) < Math.abs(a - g) ? b : a), 1));
    p.conditions = o.conditions || [];
    p.meds = (o.meds || []).map((m) => (m === "glp1" ? "glp1other" : m));
    p.calibMode = o.useCalib && num(o.calIntake) > 0 ? "manual" : "auto";
    state.profile = p;
    save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  const today = () => C.iso(new Date());
  let viewDay = today();
  function day(key, create) {
    if (!state.days[key] && create) state.days[key] = {};
    return state.days[key];
  }
  function cleanDay(key) {
    const d = state.days[key];
    if (!d) return;
    if (d.food && !d.food.length) delete d.food;
    if (!(d.steps > 0)) delete d.steps;
    if (!(d.met > 0)) { delete d.met; delete d.sp; }
    if (!(d.min > 0)) delete d.min;
    if (!(d.w > 0)) delete d.w;
    if (!Object.keys(d).length) delete state.days[key];
  }
  function latestWeight(upTo = today()) {
    const keys = Object.keys(state.days).filter((k) => k <= upTo && state.days[k].w > 0).sort();
    return keys.length ? state.days[keys[keys.length - 1]].w : num(state.profile.weight);
  }

  /* ================= Rechnen ================= */
  function profileNums() {
    const p = state.profile;
    return {
      sex: p.sex, age: num(p.age), heightCm: num(p.height), weightKg: latestWeight(),
      waistCm: num(p.waist), startWeightKg: num(p.startWeight), targetWeightKg: num(p.targetWeight),
      bodyFatPct: num(p.bodyfat), pal: Number(p.pal) || 1.2, goalKgPerMonth: Number(p.goal) || 0,
      supervised: !!p.supervised, usualSteps: num(p.usualSteps) || 0, eatbackPct: Number(p.eatback),
    };
  }
  function valid(n) {
    return n.age >= 15 && n.age <= 110 && n.heightCm >= 120 && n.heightCm <= 230 && n.weightKg >= 35 && n.weightKg <= 350;
  }
  function calibration(n) {
    const p = state.profile;
    if (p.calibMode === "off") return null;
    if (p.calibMode === "manual") {
      return C.calibrateManual({ avgIntake: num(p.calIntake), weeks: num(p.calWeeks), weightChangeKg: num(p.calChange) });
    }
    return C.calibrateFromLog(state.days, { today: today(), weightKg: n.weightKg, usualSteps: n.usualSteps });
  }
  function compute(forDay = viewDay) {
    const n = profileNums();
    if (!valid(n)) return null;
    const cal = calibration(n);
    return { n, r: C.calculate(n, cal, day(forDay) || {}) };
  }

  /* ================= Navigation ================= */
  const VIEWS = ["heute", "verlauf", "profil", "info"];
  function route(keepScroll) {
    let v = location.hash.replace("#", "");
    if (!VIEWS.includes(v)) v = "heute";
    VIEWS.forEach((x) => { $(`#view-${x}`).hidden = x !== v; });
    $$(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === v));
    if (v === "heute") renderHeute();
    if (v === "verlauf") renderVerlauf();
    if (v === "profil") renderProfilState();
    if (keepScroll !== true) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => route());
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.goto; }));

  /* ================= HEUTE ================= */
  function dayLabel(key) {
    const t = today();
    if (key === t) return "Heute";
    if (key === C.addDays(t, -1)) return "Gestern";
    return C.parseIso(key).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  }

  function renderHeute() {
    const t = today();
    if (viewDay > t) viewDay = t;
    $("#day-label").textContent = dayLabel(viewDay);
    $("#day-next").disabled = viewDay >= t;
    $("#day-prev").disabled = C.dayDiff(viewDay, t) >= 60;

    const d = day(viewDay) || {};
    const res = compute();
    $("#setup").hidden = !!res;
    $("#hero").hidden = !res;

    // Essen
    const list = $("#food-list"); list.innerHTML = "";
    (d.food || []).forEach((f, i) => {
      const li = el("li");
      li.append(el("span", "n", f.n || "Eintrag"));
      if (f.t) li.append(el("span", "t", f.t));
      li.append(el("b", null, fmt(f.k)));
      const del = el("button", null, "×");
      del.type = "button"; del.setAttribute("aria-label", "Eintrag löschen");
      del.addEventListener("click", () => {
        const key = viewDay;
        const removed = d.food.splice(i, 1)[0];
        cleanDay(key); save(); renderHeute();
        toast("Eintrag gelöscht.", "Rückgängig", () => {
          const dd = day(key, true); dd.food = dd.food || []; dd.food.splice(Math.min(i, dd.food.length), 0, removed);
          save(); renderHeute(); hideToast();
        });
      });
      li.append(del);
      list.append(li);
    });
    const eaten = C.foodTotal(d);
    $("#food-sum").textContent = d.food && d.food.length ? `Zusammen: ${fmt(eaten)} kcal` : "";

    // Gewicht
    const wi = $("#weight-input");
    if (document.activeElement !== wi) wi.value = d.w ? String(d.w).replace(".", ",") : "";
    $("#weight-form").querySelector("span").textContent = viewDay === t ? "Heute gewogen" : "Gewogen";
    const mean = C.weightMean(state.days, viewDay), prev = C.weightMean(state.days, C.addDays(viewDay, -7));
    $("#weight-info").textContent = mean
      ? `7-Tage-Schnitt: ${fmt1(mean)} kg` + (prev ? ` (${sign1(mean - prev)} kg zur Vorwoche)` : "")
      : "Morgens nach dem Toilettengang wiegen – zählen tut der Wochenschnitt, nicht der einzelne Tag.";

    // Bewegung
    const st = $("#mv-steps"), mt = $("#mv-met"), mn = $("#mv-min");
    if (document.activeElement !== st) st.value = d.steps || "";
    if (document.activeElement !== mn) mn.value = d.min || "";
    if (document.activeElement !== mt) {
      if (d.sp > 0 && d.sp < mt.options.length) mt.selectedIndex = d.sp;
      else mt.value = d.met ? d.met.toFixed(1) : "0";
      if (mt.selectedIndex < 0) mt.selectedIndex = 0;
    }

    if (!res) { $("#mv-info").textContent = ""; renderNotes(null); return; }
    const { r } = res;

    // Hauptzahl
    const target = r.todayTarget;
    $("#h-target").textContent = fmt10(target);
    const left = target - eaten;
    const pct = Math.min(100, (eaten / target) * 100);
    const bar = $("#h-bar"); bar.style.width = pct + "%"; bar.classList.toggle("over", left < 0);
    const hl = $("#h-left");
    hl.classList.toggle("over", left < 0);
    hl.textContent = eaten === 0 ? "Noch nichts eingetragen"
      : left >= 0 ? `Noch ${fmt10(left)} kcal übrig` : `${fmt10(-left)} kcal über dem Ziel`;

    const src = r.calibUsed ? (r.calib.manual ? "aus deinen Werten" : "aus deinem Tagebuch") : "laut Formel";
    const goalTxt = r.goal.kgPerMonth > 0 ? `Ziel −${fmt1(r.goal.kgPerMonth).replace(",0", "")} kg/Monat` : "Gewicht halten";
    let sub = `${goalTxt} · Bedarf zum Halten ${fmt10(r.maintain)} kcal (${src})`;
    if (r.bonus.kcal >= 10) sub += ` · inkl. +${fmt10(r.bonus.kcal)} kcal Bonus`;
    $("#h-sub").textContent = sub;

    const note = $("#h-note");
    if (r.goal.clamped) {
      note.hidden = false;
      note.textContent = `Rechnerisch wären es ${fmt10(r.goal.raw)} kcal. Ohne ärztliche Begleitung zeigt der Rechner nicht weniger als ${fmt(r.minKcal)} kcal – den Rest schafft Bewegung. Wirst du ärztlich begleitet, kannst du das im Profil angeben.`;
    } else note.hidden = true;

    // Bewegungstext
    const b = r.bonus;
    if (b.today > 0) {
      const base = r.calibUsed && !r.calib.manual ? "deinem Schnitt der letzten 4 Wochen" : "deinem normalen Tag";
      $("#mv-info").textContent = b.extra > 0
        ? `Bewegung ≈ ${fmt10(b.today)} kcal, davon ${fmt10(b.extra)} kcal über ${base}. ${Math.round(b.eatback * 100)} % davon = +${fmt10(b.kcal)} kcal zum Essen.`
        : `Bewegung ≈ ${fmt10(b.today)} kcal – das liegt noch nicht über ${base}, deshalb kein Bonus.`;
    } else $("#mv-info").textContent = `Bonus gibt es für alles über ${fmt(num(state.profile.usualSteps) || 0)} Schritte an einem normalen Tag.`;

    renderNotes(res);
  }

  $("#day-prev").addEventListener("click", () => { viewDay = C.addDays(viewDay, -1); renderHeute(); });
  $("#day-next").addEventListener("click", () => { viewDay = C.addDays(viewDay, 1); renderHeute(); });

  $("#food-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = num($("#food-kcal").value);
    if (!(k > 0 && k < 10000)) { $("#food-kcal").classList.add("bad"); $("#food-kcal").focus(); return; }
    $("#food-kcal").classList.remove("bad");
    const d = day(viewDay, true);
    d.food = d.food || [];
    const now = new Date();
    d.food.push({ n: $("#food-name").value.trim().slice(0, 40), k: Math.round(k),
      t: viewDay === today() ? now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "" });
    save();
    $("#food-name").value = ""; $("#food-kcal").value = "";
    renderHeute();
    $("#food-name").focus();
  });

  $("#weight-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#weight-input"), w = num(inp.value);
    const d = day(viewDay, true);
    if (inp.value.trim() === "") { delete d.w; cleanDay(viewDay); save(); renderHeute(); return; }
    if (!(w >= 35 && w <= 350)) { inp.classList.add("bad"); return; }
    inp.classList.remove("bad");
    d.w = Math.round(w * 10) / 10;
    if (viewDay >= (lastWeightDay() || "")) state.profile.weight = String(d.w);
    save(); inp.blur(); renderHeute();
    toast("Gewicht gespeichert.");
  });
  function lastWeightDay() {
    const k = Object.keys(state.days).filter((x) => state.days[x].w > 0).sort();
    return k[k.length - 1];
  }

  function saveMovement() {
    const d = day(viewDay, true);
    d.steps = Math.max(0, Math.round(num($("#mv-steps").value) || 0));
    d.met = Number($("#mv-met").value) || 0;
    d.sp = $("#mv-met").selectedIndex;
    d.min = Math.max(0, Math.round(num($("#mv-min").value) || 0));
    cleanDay(viewDay); save(); renderHeute();
  }
  ["#mv-steps", "#mv-min"].forEach((s) => $(s).addEventListener("change", saveMovement));
  $("#mv-met").addEventListener("change", saveMovement);

  /* ================= Hinweise ================= */
  function renderNotes(res) {
    const card = $("#notes-card"), ul = $("#notes");
    ul.innerHTML = "";
    if (!res) { card.hidden = true; return; }
    const { r, n } = res;
    const p = state.profile, set = new Set([...(p.conditions || []), ...(p.meds || [])]);
    const is = (x) => set.has(x);
    const glp1 = is("semaglutid") || is("tirzepatid") || is("glp1other");
    const diabetes = is("diabetes2") || is("diabetes1");
    const heart = is("khk") || is("hf");
    const notes = [];
    const add = (title, text, important) => notes.push({ title, text, important });

    if (r.goal.belowMin && p.supervised)
      add("Unter der üblichen Untergrenze",
        `Dein Ziel liegt bei ${fmt10(r.goal.raw)} kcal und damit unter ${fmt(r.minKcal)} kcal. Bitte nur so, wenn es mit deinem Arzt abgesprochen ist.`);

    if (r.calibUsed && r.gap > 300)
      add("Dein echter Bedarf liegt deutlich unter der Formel",
        `Der Unterschied beträgt ${fmt10(r.gap)} kcal pro Tag. Häufigste Ursache: Es wird mehr gegessen als eingetragen (Öl, Getränke, Soßen, Kleinigkeiten). Wiege eine Woche lang alles ab, bevor du weniger isst. Erst wenn es dann noch stimmt, spielen Stoffwechselanpassung, Medikamente oder wenig Muskelmasse eine Rolle.`, true);

    if (r.lostPct >= 10) {
      if (glp1 && r.lostPct >= 15)
        add("Plateau ist hier normal",
          `Du hast rund ${fmt(r.lostPct)} % deines Startgewichts verloren. Unter GLP-1-Wirkstoffen flacht die Abnahme nach etwa 1 bis 1,5 Jahren typischerweise ab. Das neue Gewicht zu halten ist ein großer Erfolg. Jetzt zählt vor allem, Muskeln zu erhalten – nicht, immer weniger zu essen.`);
      else
        add("Stoffwechsel nach starkem Abnehmen",
          `Du hast rund ${fmt(r.lostPct)} % deines Startgewichts verloren. Danach verbraucht der Körper oft 100–300 kcal weniger als Formeln annehmen. Der Bedarf aus deinem Tagebuch ist deshalb genauer.`);
    }

    if (r.goal.kgPerMonth > 0 || r.lostPct >= 10) {
      let t = `Eiweiß ${fmt(r.protein.min)}–${fmt(r.protein.max)} g am Tag, verteilt auf 3–4 Mahlzeiten mit je 25–30 g. Dazu 2–3× pro Woche Krafttraining${heart ? " – bei deinem Herz nur mit Freigabe vom Kardiologen" : ""}.`;
      if (is("kidney")) t += " Wegen der Nieren die Eiweißmenge unbedingt mit dem Arzt festlegen.";
      else if (diabetes) t += " Bei Diabetes vorher die Nierenwerte (eGFR, Eiweiß im Urin) kennen.";
      add("Muskeln erhalten", t, is("kidney"));
    }

    if (is("insulin") || is("su"))
      add("Unterzuckerung vermeiden",
        `Insulin und Sulfonylharnstoffe senken den Blutzucker auch, wenn du wenig isst. Weniger essen oder mehr Bewegung nur nach Absprache – oft muss die Dosis angepasst werden. Kohlenhydrate gleichmäßig über den Tag verteilen und häufiger messen.${is("betablocker") ? " Achtung: Betablocker können Warnzeichen wie Zittern oder Herzrasen abschwächen." : ""}`, true);

    if (is("semaglutid") && heart)
      add("Ozempic / Wegovy und Herz",
        "Für Semaglutid ist belegt, dass es bei Menschen mit Herz-Kreislauf-Erkrankung das Risiko für Herzinfarkt und Schlaganfall senkt – unabhängig davon, wie viel man damit abnimmt. Ein Stillstand auf der Waage ist also kein Grund, es abzusetzen; das immer mit dem Arzt besprechen.");
    if (glp1)
      add("GLP-1-Wirkstoff",
        `Der Appetit ist gedämpft – trotzdem genug Eiweiß essen und genug trinken. Bei Erbrechen oder Durchfall besonders auf Flüssigkeit achten${is("sglt2") || is("diuretic") ? ", vor allem zusammen mit SGLT2-Hemmern oder Entwässerungstabletten (Nieren)" : ""}. Ob die Dosis passt, entscheidet der Arzt.${is("tirzepatid") || is("glp1other") ? " Ob dein Wirkstoff auch das Herz schützt, ist je nach Präparat unterschiedlich belegt – frag deinen Arzt." : ""}`);

    if (is("sglt2"))
      add("SGLT2-Hemmer",
        "Über den Urin gehen täglich etwa 200–300 kcal als Zucker verloren. Bei Erbrechen, Durchfall, wenn du kaum isst oder vor einer Operation: nach Absprache mit dem Arzt pausieren. Sehr kohlenhydratarme Diäten nur mit dem Arzt (Gefahr einer Ketoazidose).", true);

    if (is("metformin"))
      add("Metformin", "Metformin kann auf Dauer den Vitamin-B12-Spiegel senken. Lass ihn regelmäßig beim Arzt kontrollieren.");

    if (heart)
      add("Herz und Training",
        "Training nur mit Freigabe vom Kardiologen – ideal ist eine ärztlich betreute Herzsportgruppe (Rehasport auf Verordnung). Kein Pressatmen, keine Maximalgewichte. Bei Brustenge, ungewöhnlicher Atemnot oder Schwindel sofort aufhören. Wird es in Ruhe nicht besser: 112 anrufen.", true);

    if (is("betablocker"))
      add("Betablocker",
        "Pulszonen nach Formeln (z. B. 220 minus Alter) passen nicht, weil der Puls gebremst ist. Steuere die Belastung nach Gefühl – „etwas anstrengend, aber ich kann noch sprechen“ – oder nach den Werten aus deinem Belastungs-EKG.");

    if (is("hf"))
      add("Täglich wiegen",
        "Mehr als 2 kg Zunahme in drei Tagen, dicke Knöchel oder Atemnot im Liegen können Wassereinlagerungen sein – dann zeitnah zum Arzt. Trinkmenge wie vom Arzt vorgegeben.", true);

    if (is("kidney") && !(r.goal.kgPerMonth > 0 || r.lostPct >= 10))
      add("Nieren", "Die Eiweißmenge bei Nierenschwäche unbedingt mit dem Arzt festlegen.", true);
    if (is("thyroid"))
      add("Schilddrüse", "Eine nicht optimal eingestellte Unterfunktion senkt den Verbrauch. Bei Stillstand den TSH-Wert prüfen lassen.");
    if (is("htn"))
      add("Blutdruck", "Weniger als 5–6 g Salz am Tag. Abnehmen senkt den Blutdruck oft spürbar – Medikamente dann ggf. anpassen lassen.");
    if (is("lipids"))
      add("Blutfette", "Weniger gesättigte Fette (Wurst, Butter, fetter Käse), mehr Ballaststoffe (Hafer, Hülsenfrüchte, Gemüse) und Fisch. Abnehmen und wenig Zucker und Alkohol senken vor allem die Triglyceride.");
    if (is("diuretic") || is("cortison"))
      add("Wasser auf der Waage", "Entwässerungstabletten und Kortison verschieben Wasser im Körper. Bewerte nur den Wochenschnitt, nicht einzelne Tage.");
    if (is("psych") || is("insulin") || is("cortison"))
      add("Medikamente und Gewicht", "Einige deiner Medikamente können Appetit oder Gewicht erhöhen. Nicht selbst absetzen – frag den Arzt nach gewichtsneutralen Alternativen.");

    if (r.goal.kgPerMonth >= 1.5 || (glp1 && r.lostPct >= 10))
      add("Gallensteine", "Schnelles Abnehmen (und GLP-1-Wirkstoffe) erhöhen das Risiko für Gallensteine. Nicht ganz fettfrei essen – etwas Öl oder Nüsse pro Mahlzeit. Bei krampfartigen Schmerzen rechts oben im Bauch zum Arzt.");

    if (r.whtr && r.whtr >= 0.5)
      add("Bauchumfang", `Bauchumfang geteilt durch Größe: ${r.whtr.toLocaleString("de-DE", { maximumFractionDigits: 2 })}. Ziel ist unter 0,5. Bauchfett sagt mehr über Herz- und Diabetesrisiko als der BMI (${fmt1(r.bmi)}).`);

    add("Waage richtig lesen", is("hf")
      ? "Wegen der Herzschwäche: täglich zur gleichen Zeit wiegen. Kleine Schwankungen sind normal, eine schnelle Zunahme (über 2 kg in 3 Tagen) nicht."
      : "Schwankungen von 0,5–2 kg von Tag zu Tag sind normal (Wasser, Salz, Darminhalt). Vergleiche nur den Wochenschnitt.");

    const imp = notes.filter((x) => x.important).length;
    const title = $("#notes-title");
    title.textContent = `${notes.length} Hinweise für dich`;
    if (imp) { const bd = el("span", "badge", String(imp)); bd.title = "wichtig"; title.append(bd); }
    notes.forEach((x) => {
      const li = el("li", x.important ? "important" : "");
      li.append(el("b", null, x.title), document.createTextNode(x.text));
      ul.append(li);
    });
    card.hidden = false;
  }

  /* ================= VERLAUF ================= */
  function renderVerlauf() {
    const t = today();
    const range = Number($("input[name=range]:checked").value);
    const keys = Object.keys(state.days).filter((k) => state.days[k].w > 0 && k <= t).sort();
    const from = range > 1000 ? (keys[0] || t) : C.addDays(t, -(range - 1));
    const pts = keys.filter((k) => k >= from).map((k) => ({ k, w: state.days[k].w }));
    drawChart(pts, from, t);

    const mean = C.weightMean(state.days, t);
    const mean28 = C.weightMean(state.days, C.addDays(t, -28));
    const start = num(state.profile.startWeight);
    const stats = $("#stats"); stats.innerHTML = "";
    const stat = (label, val) => { const d = el("div"); d.append(el("span", null, label), el("b", null, val)); stats.append(d); };
    stat("Wochenschnitt", mean ? `${fmt1(mean)} kg` : "–");
    stat("4 Wochen", mean && mean28 ? `${sign1(mean - mean28)} kg` : "–");
    stat("Seit Start", mean && start > 0 ? `${sign1(mean - start)} kg` : "–");

    renderCalibInfo();

    const tb = $("#days-body"); tb.innerHTML = "";
    for (let i = 0; i < 14; i++) {
      const k = C.addDays(t, -i), d = state.days[k] || {};
      const tr = el("tr");
      tr.append(el("td", null, C.parseIso(k).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })));
      tr.append(el("td", d.w ? "" : "muted", d.w ? fmt1(d.w) : "–"));
      const ft = C.foodTotal(d);
      tr.append(el("td", ft ? (ft < C.COMPLETE_DAY_KCAL ? "muted" : "") : "muted", ft ? fmt(ft) : "–"));
      tr.append(el("td", d.steps ? "" : "muted", d.steps ? fmt(d.steps) : "–"));
      tb.append(tr);
    }
  }
  $$("input[name=range]").forEach((r) => r.addEventListener("change", renderVerlauf));

  function drawChart(pts, from, to) {
    const box = $("#chart");
    if (pts.length < 2) {
      box.innerHTML = "";
      box.append(el("p", "empty", "Sobald du dich an zwei Tagen gewogen hast, erscheint hier dein Verlauf."));
      return;
    }
    const W = 340, H = 200, L = 40, R = 10, T = 12, B = 26;
    const span = Math.max(1, C.dayDiff(from, to));
    const x = (k) => L + (C.dayDiff(from, k) / span) * (W - L - R);
    const means = [];
    for (let i = 0; i <= span; i++) {
      const k = C.addDays(from, i), m = C.weightMean(state.days, k);
      if (m && C.weightMean(state.days, k, 1) !== null) means.push({ k, m });
      else if (m && i === span) means.push({ k, m });
    }
    const ws = pts.map((p) => p.w).concat(means.map((m) => m.m));
    let lo = Math.floor(Math.min(...ws) - 0.5), hi = Math.ceil(Math.max(...ws) + 0.5);
    if (hi - lo < 3) { const c = (hi + lo) / 2; lo = Math.floor(c - 1.5); hi = Math.ceil(c + 1.5); }
    const y = (w) => T + (1 - (w - lo) / (hi - lo)) * (H - T - B);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Gewichtsverlauf von ${fmt1(pts[0].w)} auf ${fmt1(pts[pts.length - 1].w)} kg`);
    const mk = (tag, attrs, cls) => { const e = document.createElementNS(ns, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (cls) e.setAttribute("class", cls); svg.append(e); return e; };
    const step = Math.max(1, Math.ceil((hi - lo) / 4));
    for (let v = lo; v <= hi; v += step) {
      mk("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }, "c-grid");
      mk("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, "c-label").textContent = v;
    }
    const dl = (k) => C.parseIso(k).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    mk("text", { x: L, y: H - 6 }, "c-label").textContent = dl(from);
    mk("text", { x: W - R, y: H - 6, "text-anchor": "end" }, "c-label").textContent = dl(to);
    pts.forEach((p) => mk("circle", { cx: x(p.k), cy: y(p.w), r: 3.2 }, "c-dot"));
    if (means.length > 1)
      mk("path", { d: means.map((m, i) => `${i ? "L" : "M"}${x(m.k).toFixed(1)} ${y(m.m).toFixed(1)}`).join(" ") }, "c-line");
    const tw = num(state.profile.targetWeight);
    if (tw >= lo && tw <= hi) {
      mk("line", { x1: L, x2: W - R, y1: y(tw), y2: y(tw) }, "c-target");
      mk("text", { x: W - R, y: y(tw) - 4, "text-anchor": "end" }, "c-label").textContent = "Ziel";
    }
    box.innerHTML = ""; box.append(svg);
  }

  function renderCalibInfo() {
    const box = $("#calib-info"); box.innerHTML = "";
    const res = compute(today());
    const mode = state.profile.calibMode;
    if (!res) { box.append(el("p", "hint lead", "Richte zuerst dein Profil ein.")); return; }
    const { r, n } = res;
    const kv = el("dl", "kv");
    const row = (k, v) => { kv.append(el("dt", null, k), el("dd", null, v)); };
    if (mode === "off") {
      row("Bedarf laut Formel", `${fmt10(r.formulaTdee)} kcal`);
      box.append(kv, el("p", "hint", "Die Ermittlung aus echten Werten ist im Profil ausgeschaltet."));
      return;
    }
    const c = r.calib;
    if (r.calibUsed) {
      row("Ø gegessen", `${fmt10(c.avgIntake)} kcal`);
      if (c.kgPerWeek != null) row("Gewichtstrend", `${sign1(c.kgPerWeek)} kg / Woche`);
      row("Dein echter Bedarf", `${fmt10(c.tdee)} kcal`);
      row("Laut Formel", `${fmt10(r.formulaTdee)} kcal`);
      box.append(kv);
      box.append(el("p", "hint", c.manual ? "Aus deinen eingegebenen Werten." : `Aus den letzten 4 Wochen: ${c.intakeDays} Tage mit Essen, ${c.weightCount} Wiegungen.`));
      return;
    }
    row("Bedarf laut Formel", `${fmt10(r.formulaTdee)} kcal`);
    box.append(kv);
    if (mode === "manual") {
      box.append(el("p", "hint", c && c.reason === "zu kurz" ? "Der Zeitraum muss mindestens 3 Wochen sein, sonst verfälschen Wasserschwankungen das Ergebnis."
        : c && c.reason === "unplausibel" ? "Die eingegebenen Werte ergeben keinen plausiblen Bedarf – bitte prüfen."
        : "Trag im Profil deine Werte ein."));
      return;
    }
    const nd = c ? c.need : { intakeDays: 14, weights: 6, spanDays: 21 };
    box.append(el("p", "hint lead", c && c.reason === "unplausibel"
      ? "Die Daten ergeben noch keinen plausiblen Wert. Fehlen an manchen Tagen Einträge?"
      : "Noch nicht genug Daten. So weit bist du:"));
    const ul = el("ul", "progress-list");
    ul.append(el("li", null, `Essen vollständig eingetragen: ${c ? c.intakeDays : 0} von ${nd.intakeDays} Tagen`));
    ul.append(el("li", null, `Wiegungen: ${c ? c.weightCount : 0} von mindestens ${nd.weights}`));
    ul.append(el("li", null, `Zeitraum der Wiegungen: ${c ? c.spanDays : 0} von ${nd.spanDays} Tagen`));
    box.append(ul, el("p", "hint", `Tage mit weniger als ${fmt(C.COMPLETE_DAY_KCAL)} kcal gelten als unvollständig und zählen nicht.`));
  }

  /* ================= PROFIL ================= */
  const form = $("#profile");
  function writeProfileForm() {
    const p = state.profile;
    for (const e of form.elements) {
      if (!e.name || !(e.name in p)) continue;
      if (e.type === "radio") e.checked = e.value === p[e.name];
      else if (e.type === "checkbox") e.checked = !!p[e.name];
      else e.value = p[e.name];
    }
    ["conditions", "meds"].forEach((g) => $$(`[data-group="${g}"] input`).forEach((i) => { i.checked = (p[g] || []).includes(i.value); }));
  }
  function readProfileForm() {
    const p = state.profile;
    for (const e of form.elements) {
      if (!e.name || e.name === "range") continue;
      if (e.type === "radio") { if (e.checked) p[e.name] = e.value; }
      else if (e.type === "checkbox") p[e.name] = e.checked;
      else p[e.name] = e.value;
    }
    p.conditions = $$('[data-group="conditions"] input:checked').map((i) => i.value);
    p.meds = $$('[data-group="meds"] input:checked').map((i) => i.value);
  }
  function renderProfilState() {
    const p = state.profile;
    $("#eatbackVal").textContent = p.eatback + " %";
    $$("[data-show]").forEach((x) => { x.hidden = x.dataset.show !== p.calibMode; });
    const checks = [["age", 15, 110], ["height", 120, 230], ["weight", 35, 350]];
    checks.forEach(([nm, a, b]) => {
      const i = form.elements[nm], v = num(i.value);
      i.classList.toggle("bad", i.value.trim() !== "" && !(v >= a && v <= b));
    });
  }
  form.addEventListener("input", () => { readProfileForm(); save(); renderProfilState(); });
  form.addEventListener("change", (e) => {
    readProfileForm();
    // Gewicht im Profil geändert → als heutige Wiegung übernehmen, wenn heute noch keine
    if (e.target.name === "weight") {
      const w = num(e.target.value), d = day(today());
      if (w >= 35 && w <= 350 && !(d && d.w)) { day(today(), true).w = Math.round(w * 10) / 10; }
    }
    save(); renderProfilState();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  /* ================= Export / Import ================= */
  function exportText() {
    return JSON.stringify({ app: "KalorienKompass", version: VERSION, exported: new Date().toISOString(), data: state }, null, 1);
  }
  $("#btn-export").addEventListener("click", () => {
    const name = `KalorienKompass-${today()}.json`;
    const text = exportText();
    dialog("Daten sichern", [
      el("p", null, "Speichere die Datei z. B. in Google Drive oder schick sie dir per E-Mail. Mit „Wiederherstellen“ holst du alles zurück."),
    ], [
      ["In Zwischenablage kopieren", () => copyText(text)],
      ["Als Datei speichern", () => saveFile(name, text), true],
    ]);
  });
  function saveFile(name, text) {
    if (has("saveFile")) { app.saveFile(name, text); return; }
    try {
      const a = el("a"); a.download = name;
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { copyText(text); }
  }
  function copyText(text) {
    const done = () => toast("Kopiert – jetzt z. B. in eine E-Mail an dich einfügen.");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text));
    else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = el("textarea"); ta.value = text; ta.readOnly = true;
    dialog("Text kopieren", [el("p", null, "Alles markieren und kopieren:"), ta], [["Schließen"]]);
    setTimeout(() => { ta.focus(); ta.select(); }, 50);
  }

  $("#btn-import").addEventListener("click", () => {
    const ta = el("textarea"); ta.placeholder = "…oder gesicherten Text hier einfügen";
    dialog("Daten wiederherstellen", [
      el("p", null, "Wähle die gesicherte Datei aus oder füge den kopierten Text ein. Die Daten auf diesem Gerät werden dabei ersetzt."),
      ta,
    ], [
      ["Datei auswählen", () => $("#import-file").click()],
      ["Text übernehmen", () => importText(ta.value), true],
    ]);
  });
  $("#import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(importText).catch(() => toast("Datei konnte nicht gelesen werden."));
    e.target.value = "";
  });
  function importText(text) {
    let obj;
    try { obj = JSON.parse(String(text).trim()); } catch (e) { toast("Das ist keine gültige Sicherung."); return; }
    const data = obj && obj.data ? obj.data : obj;
    if (!data || typeof data !== "object" || typeof data.profile !== "object" || typeof (data.days || {}) !== "object") {
      toast("Das ist keine gültige Sicherung."); return;
    }
    const days = sanitizeDays(data.days || {});
    if (!confirm(`Alle Daten auf diesem Gerät durch die Sicherung ersetzen? (${Object.keys(days).length} Tage)`)) return;
    state = { v: 2, profile: sanitizeProfile(data.profile), days };
    save(); writeProfileForm(); closeDialog(); route();
    toast(`Wiederhergestellt: ${Object.keys(state.days).length} Tage.`);
  }

  function sanitizeProfile(p) {
    const out = { ...DEFAULT_PROFILE };
    for (const k in DEFAULT_PROFILE) {
      if (!(k in p)) continue;
      const def = DEFAULT_PROFILE[k], v = p[k];
      if (Array.isArray(def)) out[k] = Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : [];
      else if (typeof def === "boolean") out[k] = v === true;
      else out[k] = v == null ? "" : String(v).slice(0, 200);
    }
    return out;
  }
  function sanitizeDays(src) {
    const out = {};
    if (!src || typeof src !== "object") return out;
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    for (const k of Object.keys(src)) {
      const d = src[k];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d || typeof d !== "object") continue;
      const o = {};
      if (n(d.w) >= 35 && n(d.w) <= 350) o.w = Math.round(n(d.w) * 10) / 10;
      if (n(d.steps) > 0) o.steps = Math.round(n(d.steps));
      if (n(d.met) > 0) o.met = n(d.met);
      if (n(d.min) > 0) o.min = Math.round(n(d.min));
      if (n(d.sp) > 0) o.sp = Math.round(n(d.sp));
      if (Array.isArray(d.food)) {
        const f = d.food.filter((x) => x && typeof x === "object" && n(x.k) > 0)
          .map((x) => ({ n: String(x.n || "").slice(0, 40), k: Math.round(n(x.k)), t: String(x.t || "").slice(0, 5) }));
        if (f.length) o.food = f;
      }
      if (Object.keys(o).length) out[k] = o;
    }
    return out;
  }

  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Wirklich ALLE Daten auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.")) return;
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) {}
    state = { v: 2, profile: { ...DEFAULT_PROFILE }, days: {} };
    writeProfileForm(); location.hash = "heute"; route();
  });

  /* ================= Für den Arzt ================= */
  $("#btn-print").addEventListener("click", () => {
    const res = compute(today());
    if (!res) { toast("Bitte zuerst Alter, Größe und Gewicht eintragen."); return; }
    const { r, n } = res, p = state.profile;
    const labels = (g) => $$(`[data-group="${g}"] input:checked`).map((i) => i.nextElementSibling.textContent).join(", ") || "–";
    const box = $("#print"); box.innerHTML = "";
    box.append(el("h1", null, "KalorienKompass – Zusammenfassung"), el("p", null, "Stand: " + new Date().toLocaleDateString("de-DE")));
    const table = (rows) => {
      const tb = el("table");
      rows.forEach(([k, v]) => { const tr = el("tr"); tr.append(el("th", null, k), el("td", null, v)); tb.append(tr); });
      box.append(tb);
    };
    const mean = C.weightMean(state.days, today());
    table([
      ["Geschlecht / Alter", `${p.sex === "w" ? "Frau" : "Mann"}, ${n.age} Jahre`],
      ["Größe / Gewicht", `${fmt(n.heightCm)} cm · ${fmt1(n.weightKg)} kg${mean ? ` (7-Tage-Schnitt ${fmt1(mean)} kg)` : ""} · BMI ${fmt1(r.bmi)}`],
      ["Bauchumfang", n.waistCm > 0 ? `${fmt(n.waistCm)} cm (Verhältnis zur Größe ${r.whtr.toLocaleString("de-DE", { maximumFractionDigits: 2 })})` : "–"],
      ["Startgewicht", n.startWeightKg > 0 ? `${fmt1(n.startWeightKg)} kg` : "–"],
      ["Erkrankungen", labels("conditions")],
      ["Medikamente", labels("meds") + (p.medsOther.trim() ? " · " + p.medsOther.trim() : "")],
    ]);
    box.append(el("h2", null, "Energiebedarf"));
    const rows = [
      ["Grundumsatz", `${fmt10(r.bmr)} kcal`],
      ["Bedarf laut Formel", `${fmt10(r.formulaTdee)} kcal (Alltagsfaktor ${String(n.pal).replace(".", ",")})`],
    ];
    if (r.calibUsed) rows.push(["Gemessener Bedarf", `${fmt10(r.calib.tdee)} kcal (Ø ${fmt10(r.calib.avgIntake)} kcal gegessen${r.calib.kgPerWeek != null ? `, Trend ${sign1(r.calib.kgPerWeek)} kg/Woche` : ""})`]);
    rows.push(["Ziel", r.goal.kgPerMonth > 0 ? `−${fmt1(r.goal.kgPerMonth)} kg/Monat → ${fmt10(r.goal.raw)} kcal/Tag` : "Gewicht halten"]);
    rows.push(["Eiweiß", `${fmt(r.protein.min)}–${fmt(r.protein.max)} g/Tag`]);
    table(rows);
    box.append(el("h2", null, "Gewicht der letzten Wochen (Wochenschnitt)"));
    const wr = [];
    for (let i = 0; i < 8; i++) {
      const k = C.addDays(today(), -7 * i), m = C.weightMean(state.days, k);
      if (m) wr.push([`bis ${C.parseIso(k).toLocaleDateString("de-DE")}`, `${fmt1(m)} kg`]);
    }
    table(wr.length ? wr : [["–", "keine Wiegungen eingetragen"]]);
    box.append(el("h2", null, "Fragen an den Arzt"));
    const q = el("ul");
    ["Welches Kalorienziel ist für mich sicher?", "Welches Training ist erlaubt, wie stark darf ich mich belasten?", "Passen meine Medikamente (Dosis) zum Abnehmen?"]
      .forEach((x) => q.append(el("li", null, x)));
    box.append(q);
    if (has("print")) app.print(); else window.print();
  });

  /* ================= Hilfen ================= */
  function toast(text, actionLabel, action) {
    const t = $("#toast"); t.innerHTML = "";
    t.append(el("span", null, text));
    if (actionLabel) { const b = el("button", null, actionLabel); b.type = "button"; b.onclick = action; t.append(b); }
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(hideToast, actionLabel ? 6000 : 3000);
  }
  function hideToast() { $("#toast").hidden = true; }

  const dlg = $("#dlg");
  function dialog(title, bodyNodes, actions) {
    $("#dlg-title").textContent = title;
    const body = $("#dlg-body"); body.innerHTML = ""; bodyNodes.forEach((n) => body.append(n));
    const act = $("#dlg-actions"); act.innerHTML = "";
    const close = el("button", "btn", "Abbrechen"); close.value = "cancel"; act.append(close);
    actions.forEach(([label, fn, primary]) => {
      if (!fn) { close.textContent = label; return; }
      const b = el("button", "btn" + (primary ? " primary" : ""), label); b.type = "button";
      b.addEventListener("click", fn); act.append(b);
    });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeDialog() { if (dlg.open) dlg.close(); }

  /* ================= Start ================= */
  $("#ver").textContent = "Version " + VERSION + (has("versionCode") ? ` · App ${app.versionCode()}` : "");
  if (app) $("#apk-link").parentElement.hidden = true;

  load();
  writeProfileForm();
  route();

  // Neuer Tag, während die App offen war → neu zeichnen
  let wasToday = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { wasToday = viewDay === today(); return; }
    if (wasToday || viewDay > today()) viewDay = today();
    route(true);
  });

  // Updates „aus der Luft“
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw && nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller)
            toast("Neue Version verfügbar.", "Aktualisieren", () => location.reload());
        });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
  }
})();
