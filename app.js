/* Cognitive Balance 2.0 — static, client-side build (deploys on Vercel as-is). */
"use strict";

const CATS = ["Deep Work", "Physical Recovery", "Mental Rest"];
const COLORS = { "Deep Work": "#e4572e", "Physical Recovery": "#29a19c", "Mental Rest": "#6c8ebf" };
const MOODS = ["Exhausted", "Stressed", "Neutral", "Focused", "Energized"];
const KEY = "cognitive-balance-v2";
const DEFAULTS = { maxLoad: 6, minRecovery: 2, ratio: 2 };

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmt(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return fmt(new Date(y, m - 1, d + n)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (n) => Math.round(n * 10) / 10;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

/* ---------------------------------------------------------------- state */
function sampleSchedule() {
  const t = today();
  return [
    { id: uid(), date: t, task: "Operating Systems Coursework", category: "Deep Work", hours: 3, intensity: 4 },
    { id: uid(), date: t, task: "Strength Training (Push Day)", category: "Physical Recovery", hours: 1.5, intensity: 3 },
    { id: uid(), date: t, task: "Reading Fiction (Dark Mode)", category: "Mental Rest", hours: 1, intensity: 1 },
  ];
}

function cleanEntry(e) {
  return {
    id: e.id || uid(),
    date: isDate(e.date) ? e.date : today(),
    task: String(e.task || "").trim().slice(0, 80) || "Untitled",
    category: CATS.includes(e.category) ? e.category : "Deep Work",
    hours: clamp(Number(e.hours) || 0, 0, 24),
    intensity: Math.round(clamp(Number(e.intensity) || 3, 1, 5)),
    ...(e.src === "plan" ? { src: "plan", examId: String(e.examId || "") } : {}),
  };
}

function cleanExam(x) {
  return {
    id: x.id || uid(),
    subject: String(x.subject || "").trim().slice(0, 60) || "Exam",
    date: isDate(x.date) ? x.date : today(),
    hours: clamp(Number(x.hours) || 10, 1, 100),
    difficulty: Math.round(clamp(Number(x.difficulty) || 3, 1, 5)),
  };
}

function cleanState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    schedule: Array.isArray(r.schedule) ? r.schedule.map(cleanEntry) : sampleSchedule(),
    exams: Array.isArray(r.exams) ? r.exams.map(cleanExam) : [],
    examMode: r.examMode === true,
    moods: (Array.isArray(r.moods) ? r.moods : []).filter((m) => MOODS.includes(m.mood) && m.time).slice(-200),
    settings: {
      maxLoad: clamp(Number(r.settings?.maxLoad) || DEFAULTS.maxLoad, 1, 16),
      minRecovery: clamp(Number(r.settings?.minRecovery ?? DEFAULTS.minRecovery), 0, 8),
      ratio: clamp(Number(r.settings?.ratio) || DEFAULTS.ratio, 1, 6),
    },
  };
}

function loadState() {
  try { return cleanState(JSON.parse(localStorage.getItem(KEY))); } catch { return cleanState(null); }
}

let S = loadState();
let viewDate = today();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full/blocked */ } };

/* ---------------------------------------------------------- burnout model */
// Exam Season shifts the limits: heavier days tolerated, but more recovery demanded.
const eff = () => {
  const s = S.settings;
  return S.examMode ? { maxLoad: s.maxLoad + 2, minRecovery: s.minRecovery + 0.5, ratio: s.ratio + 0.5 } : s;
};
const daysUntil = (d) => Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
const nextExam = () => S.exams.filter((x) => x.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
function dayStats(day) {
  let work = 0, load = 0, phys = 0, mental = 0;
  for (const e of S.schedule) {
    if (e.date !== day) continue;
    if (e.category === "Deep Work") { work += e.hours; load += (e.hours * e.intensity) / 3; }
    else if (e.category === "Physical Recovery") phys += e.hours;
    else mental += e.hours;
  }
  return { work, load, phys, mental, recovery: phys + mental };
}

function classify(st) {
  const s = eff();
  if (st.work === 0 && st.recovery === 0) return "empty";
  if (st.load > s.maxLoad && st.recovery < s.minRecovery) return "critical";
  if (st.load > st.recovery * s.ratio) return "warning";
  return "optimal";
}

function balanceScore(st) {
  const s = eff();
  let score = 100;
  score -= Math.max(0, st.load - s.maxLoad) * 12;
  score -= Math.max(0, s.minRecovery - st.recovery) * 15;
  score -= Math.max(0, st.load - st.recovery * s.ratio) * 5;
  return Math.round(clamp(score, 0, 100));
}

function recoveryNeeded(st) {
  const s = eff();
  return Math.max(0, s.minRecovery - st.recovery, st.load / s.ratio - st.recovery);
}

function suggestions(st, mood) {
  const s = eff(), tips = [], need = recoveryNeeded(st);
  if (need > 0) tips.push(`Add about <b>${round1(need)} hr</b> of recovery to get back in range.`);
  if (st.load >= 3 && st.mental === 0) tips.push("No mental rest scheduled — try 30–60 min of reading, music or a walk without a screen.");
  if (st.load >= 3 && st.phys === 0) tips.push("No physical recovery yet — even a 20-minute walk or stretch helps reset focus.");
  if (st.load > s.maxLoad) tips.push("Your load is above your daily limit. Consider moving one deep-work block to another day.");
  if ((mood === "Exhausted" || mood === "Stressed") && st.load >= s.maxLoad * 0.6)
    tips.push(`You logged <b>${esc(mood)}</b> and the day is heavy — shorten the next focus block and take a break first.`);
  const nx = nextExam();
  if (S.examMode && nx && daysUntil(nx.date) <= 3 && daysUntil(nx.date) >= 0)
    tips.push(`<b>${esc(nx.subject)}</b> is ${daysUntil(nx.date) === 0 ? "today" : "in " + daysUntil(nx.date) + " day(s)"}: protect your sleep, no all-nighters, and keep revision light and recovery-heavy.`);
  if (!tips.length) tips.push("Nothing to fix — keep the rhythm and protect your recovery time.");
  return tips;
}

const latestMood = () => (S.moods.length ? S.moods[S.moods.length - 1].mood : null);

/* ----------------------------------------------------------------- charts */
let donutSel = null; // null = closed, "all", or a category name

function donutSVG(parts, sel) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return '<p class="muted">No hours logged.</p>';
  const dim = (n) => sel && sel !== "all" && sel !== n;
  let off = 25, rings = "";
  for (const p of parts) {
    if (!p.v) continue;
    const pct = (p.v / total) * 100;
    rings += `<circle class="slice" data-cat="${esc(p.n)}" tabindex="0" role="button" aria-label="Show ${esc(p.n)} breakdown" r="15.9155" cx="21" cy="21" fill="none" stroke="${p.c}" stroke-width="${sel === p.n ? 7.5 : 6}" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${off}" opacity="${dim(p.n) ? 0.3 : 1}"><title>${esc(p.n)}: ${round1(p.v)} hrs. Click for breakdown</title></circle>`;
    off -= pct;
  }
  const legend = parts.map((p) => `<span class="lg${dim(p.n) ? " off" : ""}" data-cat="${esc(p.n)}" role="button" tabindex="0"><i class="dot" style="background:${p.c}"></i>${esc(p.n)} ${round1(p.v)}h</span>`).join("");
  return `<svg viewBox="0 0 42 42" width="170" height="170" role="img" aria-label="Today's hours by category. Click a slice for the breakdown.">${rings}<circle class="hub" data-cat="all" r="10" cx="21" cy="21" fill="transparent"><title>Show all work</title></circle><text x="21" y="22.5" text-anchor="middle" style="font-size:6px;fill:var(--text);pointer-events:none">${round1(total)}h</text></svg><div class="legend">${legend}</div><p class="muted hint">${sel ? "" : "Click a slice to see how your work is distributed."}</p>`;
}

function donutDetail(day, sel) {
  if (!sel) return "";
  const dayRows = S.schedule.filter((e) => e.date === day);
  const dayTotal = dayRows.reduce((a, e) => a + e.hours, 0);
  const rows = dayRows.filter((e) => sel === "all" || e.category === sel);
  const sum = rows.reduce((a, e) => a + e.hours, 0);
  const title = sel === "all" ? "All work today" : sel;
  const color = sel === "all" ? "var(--accent)" : COLORS[sel];
  const head = `<div class="dd-head"><b style="color:${color}">${esc(title)}</b><span class="muted">${round1(sum)}h${dayTotal ? ` · ${Math.round((sum / dayTotal) * 100)}% of the day` : ""}</span><button class="x" data-close aria-label="Close breakdown">✕</button></div>`;
  if (!rows.length || !sum) return `<div class="dd">${head}<p class="muted">Nothing logged here for this day.</p></div>`;

  const map = new Map();
  rows.forEach((e) => {
    const k = e.category + "|" + e.task, o = map.get(k) || { task: e.task, cat: e.category, h: 0 };
    o.h += e.hours; map.set(k, o);
  });
  const items = [...map.values()].sort((a, b) => b.h - a.h);

  const stack = sel === "all"
    ? `<div class="stack">${CATS.map((c) => {
        const h = rows.filter((e) => e.category === c).reduce((a, e) => a + e.hours, 0);
        return h ? `<div style="width:${(h / sum) * 100}%;background:${COLORS[c]}" title="${esc(c)}: ${round1(h)}h"></div>` : "";
      }).join("")}</div>` : "";

  const list = items.map((o) => {
    const pct = Math.round((o.h / sum) * 100);
    return `<li><div class="dd-row"><span><i class="dot" style="background:${COLORS[o.cat]}"></i>${esc(o.task)}</span><span class="muted">${round1(o.h)}h · ${pct}%</span></div><div class="track"><div style="width:${pct}%;background:${COLORS[o.cat]}"></div></div></li>`;
  }).join("");
  return `<div class="dd">${head}${stack}<ul class="dd-list">${list}</ul></div>`;
}

function weekSVG(endDay) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(endDay, i - 6));
  const data = days.map((d) => {
    const o = { d }; CATS.forEach((c) => (o[c] = 0));
    S.schedule.forEach((e) => { if (e.date === d) o[e.category] += e.hours; });
    return o;
  });
  const max = Math.max(1, ...data.map((o) => CATS.reduce((a, c) => a + o[c], 0)));
  const W = 360, H = 180, bw = 28, gap = (W - 7 * bw) / 8;
  let out = "";
  data.forEach((o, i) => {
    let y = H - 20;
    const x = gap + i * (bw + gap);
    CATS.forEach((c) => {
      const h = (o[c] / max) * (H - 40);
      if (h > 0) { y -= h; out += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${COLORS[c]}"><title>${esc(c)}: ${round1(o[c])} hrs (${o.d})</title></rect>`; }
    });
    out += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${o.d.slice(8)}/${o.d.slice(5, 7)}</text>`;
  });
  const legend = CATS.map((c) => `<span><i class="dot" style="background:${COLORS[c]}"></i>${c}</span>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Hours per category, last 7 days">${out}</svg><div class="legend">${legend}</div>`;
}

function moodSVG() {
  const pts = S.moods.slice(-20);
  if (!pts.length) return "";
  const W = 360, H = 130, px = 24;
  const X = (i) => (pts.length === 1 ? W / 2 : px + (i * (W - 2 * px)) / (pts.length - 1));
  const Y = (m) => H - 20 - (MOODS.indexOf(m) / 4) * (H - 40);
  const line = pts.map((p, i) => `${X(i)},${Y(p.mood)}`).join(" ");
  const dots = pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.mood)}" r="4" fill="var(--accent)"><title>${esc(p.mood)} · ${esc(p.time.replace("T", " "))}${p.note ? " · " + esc(p.note) : ""}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Mood trend"><text x="2" y="${Y("Energized") + 3}">5</text><text x="2" y="${Y("Exhausted") + 3}">1</text><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}</svg>`;
}

/* ---------------------------------------------------------------- render */
function renderDashboard() {
  const st = dayStats(viewDate), status = classify(st), score = balanceScore(st), s = eff();
  $("#m-load").textContent = `${round1(st.load)} hrs`;
  const diff = round1(st.load - s.maxLoad);
  $("#m-load-sub").textContent = `${diff > 0 ? "+" : ""}${diff} vs limit · raw ${round1(st.work)}h`;
  $("#m-phys").textContent = `${round1(st.phys)} hrs`;
  $("#m-mental").textContent = `${round1(st.mental)} hrs`;
  $("#m-score").textContent = status === "empty" ? "—" : score;
  const bar = $("#score-bar");
  bar.style.width = status === "empty" ? "0%" : `${score}%`;
  bar.style.background = score >= 70 ? "var(--ok)" : score >= 40 ? "var(--warn)" : "var(--crit)";

  const nb = $("#exam-next"), nx = nextExam();
  nb.hidden = !(S.examMode && nx);
  if (nx) nb.textContent = `📚 Exam season: ${nx.subject} in ${daysUntil(nx.date)} day(s) (${nx.date}). Limits adjusted for exam mode.`;

  const msg = {
    empty: "Nothing scheduled for this day yet — add activities in the Planner tab.",
    critical: "⚠️ CRITICAL: High cognitive load with too little recovery. Schedule rest now.",
    warning: "⚡ WARNING: Balance is tilting. Add a workout, walk or reading session.",
    optimal: "✅ OPTIMAL: Your routine is balanced and sustainable.",
  }[status];
  const el = $("#status");
  el.className = `status ${status}`;
  el.textContent = msg;

  const box = $("#tips-box");
  box.hidden = status === "empty";
  box.open = status === "critical" || status === "warning";
  $("#tips").innerHTML = suggestions(st, latestMood()).map((t) => `<li>${t}</li>`).join("");

  const parts = CATS.map((c) => ({ n: c, c: COLORS[c], v: S.schedule.filter((e) => e.date === viewDate && e.category === c).reduce((a, e) => a + e.hours, 0) }));
  $("#donut").innerHTML = donutSVG(parts, donutSel) + donutDetail(viewDate, donutSel);
  $("#week").innerHTML = weekSVG(viewDate);
}

function renderPlanner() {
  const all = $("#filter").value === "all";
  const rows = S.schedule.filter((e) => all || e.date === viewDate).sort((a, b) => b.date.localeCompare(a.date));
  $("#empty-rows").hidden = rows.length > 0;
  $("#rows").innerHTML = rows.map((e) => `
    <tr data-id="${esc(e.id)}"${e.src === "plan" ? ' class="plan" title="Added by the study plan generator"' : ""}>
      <td><input type="date" data-f="date" value="${esc(e.date)}" aria-label="Date"></td>
      <td><input type="text" data-f="task" maxlength="80" value="${esc(e.task)}" aria-label="Task"></td>
      <td><select data-f="category" aria-label="Category">${CATS.map((c) => `<option${c === e.category ? " selected" : ""}>${c}</option>`).join("")}</select></td>
      <td class="n"><input type="number" data-f="hours" min="0" max="24" step="0.5" value="${e.hours}" aria-label="Hours"></td>
      <td class="n"><input type="number" data-f="intensity" min="1" max="5" step="1" value="${e.intensity}" aria-label="Intensity"></td>
      <td><button class="x" data-del aria-label="Delete">✕</button></td>
    </tr>`).join("");
}

function renderMood() {
  $("#mood-chart").innerHTML = moodSVG();
  $("#mood-hist-box").hidden = !S.moods.length;
  $("#mood-hist").innerHTML = S.moods.slice().reverse().slice(0, 30)
    .map((m) => `<li>${esc(m.time.replace("T", " "))} — <b>${esc(m.mood)}</b>${m.note ? " · " + esc(m.note) : ""}</li>`).join("");
}

function renderSettings() {
  $("#s-max").value = S.settings.maxLoad;
  $("#s-min").value = S.settings.minRecovery;
  $("#s-ratio").value = S.settings.ratio;
}

function renderAll() { renderDashboard(); renderPlanner(); renderExams(); renderMood(); renderSettings(); }

/* ------------------------------------------------------------ exam season */
function generatePlan() {
  const t = today(), notes = [], touched = new Set();
  S.schedule = S.schedule.filter((e) => !(e.src === "plan" && e.date >= t));
  const exams = S.exams.filter((x) => x.date > t).sort((a, b) => a.date.localeCompare(b.date));
  if (!exams.length) return "Add at least one upcoming exam first.";

  exams.forEach((x) => {
    const days = [];
    for (let d = t; d < x.date; d = addDays(d, 1)) days.push(d);
    const perHour = x.difficulty / 3;
    const caps = days.map((d) => Math.min(6, Math.max(0, (eff().maxLoad - dayStats(d).load) / perHour)));
    const alloc = days.map(() => 0);
    let left = x.hours, progress = true;
    while (left >= 0.5 && progress) {
      progress = false;
      for (let i = 0; i < days.length && left >= 0.5; i++) {
        if (alloc[i] + 0.5 <= caps[i] + 1e-9) { alloc[i] += 0.5; left -= 0.5; progress = true; }
      }
    }
    days.forEach((d, i) => {
      if (alloc[i] > 0) {
        S.schedule.push(cleanEntry({ date: d, task: `Study: ${x.subject}`, category: "Deep Work", hours: alloc[i], intensity: x.difficulty, src: "plan", examId: x.id }));
        touched.add(d);
      }
    });
    if (left >= 0.5) notes.push(`${x.subject}: ${round1(left)}h could not fit under your limits before the exam. Start earlier, cut the target, or raise your limits.`);
  });

  touched.forEach((d) => {
    const need = recoveryNeeded(dayStats(d));
    if (need > 0) {
      const half = Math.max(0.5, Math.ceil(need) / 2);
      S.schedule.push(cleanEntry({ date: d, task: "Walk / stretch break", category: "Physical Recovery", hours: half, intensity: 2, src: "plan", examId: "recovery" }));
      S.schedule.push(cleanEntry({ date: d, task: "Screen-off reading / music", category: "Mental Rest", hours: half, intensity: 1, src: "plan", examId: "recovery" }));
    }
  });
  save(); renderAll();
  const planned = S.schedule.filter((e) => e.src === "plan" && e.examId !== "recovery").reduce((a, e) => a + e.hours, 0);
  return `Plan created: ${round1(planned)}h of study across ${touched.size} day(s), with recovery blocks added automatically. ` + notes.join(" ");
}

function renderExams() {
  $("#exam-mode").checked = S.examMode;
  const list = S.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
  $("#exam-list").innerHTML = list.length ? list.map((x) => {
    const n = daysUntil(x.date);
    const planned = S.schedule.filter((e) => e.examId === x.id).reduce((a, e) => a + e.hours, 0);
    return `<div class="exam${n >= 0 && n <= 3 ? " urgent" : ""}" data-id="${esc(x.id)}">
      <div class="days">${n < 0 ? "done" : n}<small>${n < 0 ? "" : "days left"}</small></div>
      <div class="info"><b>${esc(x.subject)}</b><small>${esc(x.date)} · difficulty ${x.difficulty}/5 · ${x.hours}h needed · ${round1(planned)}h planned</small></div>
      <button class="x" data-del-exam aria-label="Delete exam">✕</button></div>`;
  }).join("") : '<p class="muted">No exams yet. Add one on the left.</p>';
}

function initExams() {
  $("#x-date").value = addDays(today(), 7);
  $("#x-hours").addEventListener("input", (e) => ($("#o-xh").textContent = e.target.value));
  $("#x-diff").addEventListener("input", (e) => ($("#o-xd").textContent = e.target.value));
  $("#exam-mode").addEventListener("change", (e) => { S.examMode = e.target.checked; save(); renderAll(); });
  $("#exam-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const subject = $("#x-subject").value.trim(), err = $("#x-err");
    if (!subject) { err.textContent = "Enter the subject."; err.hidden = false; return; }
    if (!isDate($("#x-date").value)) { err.textContent = "Pick the exam date."; err.hidden = false; return; }
    err.hidden = true;
    S.exams.push(cleanExam({ subject, date: $("#x-date").value, hours: $("#x-hours").value, difficulty: $("#x-diff").value }));
    S.examMode = true;
    $("#x-subject").value = "";
    save(); renderAll();
  });
  $("#exam-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-del-exam]");
    if (!b) return;
    const id = b.closest(".exam").dataset.id;
    S.exams = S.exams.filter((x) => x.id !== id);
    S.schedule = S.schedule.filter((e) => e.examId !== id);
    save(); renderAll();
  });
  $("#plan-btn").addEventListener("click", () => { $("#plan-msg").textContent = generatePlan(); });
}

/* --------------------------------------------------------------- actions */
function addEntry(e, follow = false) {
  const entry = cleanEntry(e);
  S.schedule.push(entry);
  // If the activity is for another day, jump to that day so it is visible straight away.
  if (follow && entry.date !== viewDate) { viewDate = entry.date; $("#viewDate").value = viewDate; }
  save(); renderDashboard(); renderPlanner();
  return entry;
}

function initTabs() {
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${b.dataset.tab}`));
    }));
}

function initPlanner() {
  $("#f-cat").innerHTML = CATS.map((c) => `<option>${c}</option>`).join("");
  $("#f-date").value = viewDate;
  $("#f-hours").addEventListener("input", (e) => ($("#o-hours").textContent = Number(e.target.value).toFixed(1)));
  $("#f-int").addEventListener("input", (e) => ($("#o-int").textContent = e.target.value));
  $("#filter").addEventListener("change", renderPlanner);

  $("#add-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = $("#f-task"), err = $("#form-err"), ok = $("#form-ok");
    const task = input.value.trim();
    ok.hidden = true;
    if (!task) { err.textContent = "Give the activity a name."; err.hidden = false; input.focus(); return; }
    err.hidden = true;
    const entry = addEntry({ task, category: $("#f-cat").value, date: $("#f-date").value, hours: $("#f-hours").value, intensity: $("#f-int").value }, true);
    input.value = "";
    ok.textContent = `✅ Added "${entry.task}" on ${entry.date}.`;
    ok.hidden = false;
    clearTimeout(ok._t); ok._t = setTimeout(() => (ok.hidden = true), 4000);
    input.focus();
  });
  $("#f-task").addEventListener("input", () => ($("#form-err").hidden = true));

  const tbody = $("#rows");
  tbody.addEventListener("change", (ev) => {
    const tr = ev.target.closest("tr"), f = ev.target.dataset.f;
    if (!tr || !f) return;
    const e = S.schedule.find((x) => x.id === tr.dataset.id);
    if (!e) return;
    S.schedule[S.schedule.indexOf(e)] = cleanEntry({ ...e, [f]: ev.target.value });
    save(); renderDashboard(); renderPlanner();
  });
  tbody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-del]");
    if (!btn) return;
    const id = btn.closest("tr").dataset.id;
    S.schedule = S.schedule.filter((x) => x.id !== id);
    save(); renderDashboard(); renderPlanner();
  });
}

function initMood() {
  $("#mood-labels").innerHTML = MOODS.map((m) => `<span>${m}</span>`).join("");
  $("#mood-range").value = MOODS.indexOf(latestMood() || "Neutral");
  $("#mood-log").addEventListener("click", () => {
    const mood = MOODS[Number($("#mood-range").value)];
    const now = new Date();
    S.moods.push({ time: `${fmt(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, mood, note: $("#mood-note").value.trim().slice(0, 120) });
    S.moods = S.moods.slice(-200);
    $("#mood-note").value = "";
    save(); renderMood(); renderDashboard();
    $("#mood-feedback").innerHTML = `<p>Mood logged: <b>${esc(mood)}</b>.</p><ul>${suggestions(dayStats(viewDate), mood).slice(0, 2).map((t) => `<li>${t}</li>`).join("")}</ul>`;
  });
}

/* ------------------------------------------------------------ focus timer */
const T = { running: false, mode: "focus", end: 0, total: 0, completed: 0, iv: null, msg: "" };
const presetMins = () => $("#t-preset").value.split("/").map(Number);

function renderTimer() {
  const rem = T.running ? Math.max(0, Math.ceil((T.end - Date.now()) / 1000)) : presetMins()[0] * 60;
  const text = `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`;
  $("#t-display").textContent = text;
  $("#t-bar").style.width = T.running ? `${clamp((1 - rem / Math.max(T.total, 1)) * 100, 0, 100)}%` : "0%";
  $("#t-start").hidden = T.running;
  $("#t-stop").hidden = !T.running;
  $("#t-preset").disabled = T.running;
  $("#t-msg").textContent = T.running ? (T.mode === "focus" ? "🎯 Focus" : "☕ Break") : T.msg;
  $("#t-count").textContent = `Focus blocks completed this session: ${T.completed}`;
  document.title = T.running ? `${text} · Cognitive Balance` : "Cognitive Balance 2.0";
}

function stopTimer(msg = "") {
  clearInterval(T.iv); T.iv = null; T.running = false; T.mode = "focus"; T.msg = msg; renderTimer();
}

function tick() {
  if (!T.running || Date.now() < T.end) return renderTimer();
  const [f, b] = presetMins();
  if (T.mode === "focus") {
    T.completed++;
    addEntry({ task: "Focus session (Pomodoro)", category: "Deep Work", hours: Math.round((f / 60) * 100) / 100, intensity: 4, date: today() });
    T.mode = "break"; T.total = b * 60; T.end = Date.now() + T.total * 1000;
    T.msg = "";
    $("#t-msg").textContent = "";
    renderTimer();
  } else {
    stopTimer("☕ Break over. Start another focus block when ready.");
  }
}

function initTimer() {
  $("#t-start").addEventListener("click", () => {
    const [f] = presetMins();
    T.running = true; T.mode = "focus"; T.total = f * 60; T.end = Date.now() + T.total * 1000; T.msg = "";
    clearInterval(T.iv); T.iv = setInterval(tick, 500);
    renderTimer();
  });
  $("#t-stop").addEventListener("click", () => stopTimer());
  $("#t-preset").addEventListener("change", renderTimer);
  renderTimer();
}

/* -------------------------------------------------------------- breathing */
let breathing = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBreathing() {
  if (breathing) return;
  breathing = true;
  const btn = $("#breath-start"), circle = $("#breath-circle"), label = $("#breath-label");
  btn.disabled = true;
  const cycles = Number($("#cycles").value);
  const phases = [["Breathe in", 4, 1], ["Hold", 7, 1], ["Breathe out", 8, 0.5]];
  for (let c = 0; c < cycles; c++) {
    for (const [name, secs, scale] of phases) {
      circle.style.transition = name === "Hold" ? "none" : `transform ${secs}s linear`;
      circle.style.transform = `scale(${scale})`;
      for (let i = secs; i > 0; i--) { label.textContent = `Cycle ${c + 1}/${cycles} · ${name} · ${i}s`; await sleep(1000); }
    }
  }
  label.textContent = "✅ Reset complete. You are ready to focus.";
  btn.disabled = false; breathing = false;
}

/* ----------------------------------------------------------- settings/data */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function resetEverything() {
  stopTimer(); T.completed = 0; T.msg = "";
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  S = { schedule: [], moods: [], exams: [], examMode: false, settings: { ...DEFAULTS } };
  save();
  viewDate = today(); donutSel = null;
  $("#viewDate").value = viewDate; $("#f-date").value = viewDate; $("#x-date").value = addDays(viewDate, 7);
  $("#filter").value = "day";
  ["#f-task", "#mood-note", "#x-subject"].forEach((id) => ($(id).value = ""));
  $("#mood-range").value = 2;
  $("#f-hours").value = 1; $("#o-hours").textContent = "1.0";
  $("#f-int").value = 3; $("#o-int").textContent = "3";
  $("#x-hours").value = 10; $("#o-xh").textContent = "10";
  $("#x-diff").value = 3; $("#o-xd").textContent = "3";
  $("#mood-feedback").innerHTML = ""; $("#plan-msg").textContent = "";
  $("#form-err").hidden = true; $("#x-err").hidden = true;
  document.title = "Cognitive Balance 2.0";
  renderAll(); renderTimer();
}

function initSettings() {
  const upd = () => {
    S.settings = cleanState({ settings: { maxLoad: $("#s-max").value, minRecovery: $("#s-min").value, ratio: $("#s-ratio").value } }).settings;
    save(); renderDashboard();
  };
  ["#s-max", "#s-min", "#s-ratio"].forEach((id) => $(id).addEventListener("change", upd));

  const msg = (t) => ($("#d-msg").textContent = t);
  $("#d-json").addEventListener("click", () => download("cognitive_balance_backup.json", JSON.stringify(S, null, 2), "application/json"));
  $("#d-csv").addEventListener("click", () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = ["Date,Task,Category,Hours,Intensity", ...S.schedule.map((e) => [e.date, q(e.task), e.category, e.hours, e.intensity].join(","))];
    download("schedule.csv", lines.join("\n"), "text/csv");
  });
  $("#d-restore").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || !Array.isArray(raw.schedule)) throw new Error("bad");
      S = cleanState(raw); save(); renderAll(); msg("Backup restored.");
    } catch { msg("That file isn't a valid Cognitive Balance backup."); }
    ev.target.value = "";
  });
  let armed = null;
  const resetBtn = $("#d-reset"), idle = resetBtn.textContent;
  resetBtn.addEventListener("click", () => {
    if (!armed) { // two-step confirm (window.confirm can be blocked in some browsers)
      resetBtn.textContent = "⚠ Click again to erase everything";
      armed = setTimeout(() => { armed = null; resetBtn.textContent = idle; }, 4000);
      return;
    }
    clearTimeout(armed); armed = null; resetBtn.textContent = idle;
    resetEverything();
    msg("Everything was erased. You're starting fresh.");
  });
}

/* ------------------------------------------------------------------ boot */
function initDonut() {
  const dn = $("#donut");
  dn.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-close]")) { donutSel = null; return renderDashboard(); }
    const t = ev.target.closest("[data-cat]");
    if (!t) return;
    const c = t.dataset.cat;
    donutSel = donutSel === c ? (c === "all" ? null : "all") : c;
    renderDashboard();
  });
  dn.addEventListener("keydown", (ev) => {
    const t = ev.target.closest("[data-cat]");
    if (t && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); t.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });
}

function init() {
  const dp = $("#viewDate");
  dp.value = viewDate;
  dp.addEventListener("change", () => {
    if (!isDate(dp.value)) return;
    viewDate = dp.value; $("#f-date").value = viewDate;
    renderDashboard(); renderPlanner(); $("#mood-feedback").innerHTML = "";
  });
  initTabs(); initPlanner(); initExams(); initDonut(); initMood(); initTimer(); initSettings();
  $("#breath-start").addEventListener("click", runBreathing);
  renderAll();
}

init();
