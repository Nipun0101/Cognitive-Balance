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
  };
}

function cleanState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    schedule: Array.isArray(r.schedule) ? r.schedule.map(cleanEntry) : sampleSchedule(),
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
  const s = S.settings;
  if (st.work === 0 && st.recovery === 0) return "empty";
  if (st.load > s.maxLoad && st.recovery < s.minRecovery) return "critical";
  if (st.load > st.recovery * s.ratio) return "warning";
  return "optimal";
}

function balanceScore(st) {
  const s = S.settings;
  let score = 100;
  score -= Math.max(0, st.load - s.maxLoad) * 12;
  score -= Math.max(0, s.minRecovery - st.recovery) * 15;
  score -= Math.max(0, st.load - st.recovery * s.ratio) * 5;
  return Math.round(clamp(score, 0, 100));
}

function recoveryNeeded(st) {
  const s = S.settings;
  return Math.max(0, s.minRecovery - st.recovery, st.load / s.ratio - st.recovery);
}

function suggestions(st, mood) {
  const s = S.settings, tips = [], need = recoveryNeeded(st);
  if (need > 0) tips.push(`Add about <b>${round1(need)} hr</b> of recovery to get back in range.`);
  if (st.load >= 3 && st.mental === 0) tips.push("No mental rest scheduled — try 30–60 min of reading, music or a walk without a screen.");
  if (st.load >= 3 && st.phys === 0) tips.push("No physical recovery yet — even a 20-minute walk or stretch helps reset focus.");
  if (st.load > s.maxLoad) tips.push("Your load is above your daily limit. Consider moving one deep-work block to another day.");
  if ((mood === "Exhausted" || mood === "Stressed") && st.load >= s.maxLoad * 0.6)
    tips.push(`You logged <b>${esc(mood)}</b> and the day is heavy — shorten the next focus block and take a break first.`);
  if (!tips.length) tips.push("Nothing to fix — keep the rhythm and protect your recovery time.");
  return tips;
}

const latestMood = () => (S.moods.length ? S.moods[S.moods.length - 1].mood : null);

/* ----------------------------------------------------------------- charts */
function donutSVG(parts) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return '<p class="muted">No hours logged.</p>';
  let off = 25, rings = "";
  for (const p of parts) {
    if (!p.v) continue;
    const pct = (p.v / total) * 100;
    rings += `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${p.c}" stroke-width="6" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${off}"><title>${esc(p.n)}: ${round1(p.v)} hrs</title></circle>`;
    off -= pct;
  }
  const legend = parts.map((p) => `<span><i class="dot" style="background:${p.c}"></i>${esc(p.n)} ${round1(p.v)}h</span>`).join("");
  return `<svg viewBox="0 0 42 42" width="170" height="170" role="img" aria-label="Today's hours by category">${rings}<text x="21" y="22.5" text-anchor="middle" style="font-size:6px;fill:var(--text)">${round1(total)}h</text></svg><div class="legend">${legend}</div>`;
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
  const st = dayStats(viewDate), status = classify(st), score = balanceScore(st), s = S.settings;
  $("#m-load").textContent = `${round1(st.load)} hrs`;
  const diff = round1(st.load - s.maxLoad);
  $("#m-load-sub").textContent = `${diff > 0 ? "+" : ""}${diff} vs limit · raw ${round1(st.work)}h`;
  $("#m-phys").textContent = `${round1(st.phys)} hrs`;
  $("#m-mental").textContent = `${round1(st.mental)} hrs`;
  $("#m-score").textContent = status === "empty" ? "—" : score;
  const bar = $("#score-bar");
  bar.style.width = status === "empty" ? "0%" : `${score}%`;
  bar.style.background = score >= 70 ? "var(--ok)" : score >= 40 ? "var(--warn)" : "var(--crit)";

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

  $("#donut").innerHTML = donutSVG(CATS.map((c) => ({ n: c, c: COLORS[c], v: S.schedule.filter((e) => e.date === viewDate && e.category === c).reduce((a, e) => a + e.hours, 0) })));
  $("#week").innerHTML = weekSVG(viewDate);
}

function renderPlanner() {
  const all = $("#filter").value === "all";
  const rows = S.schedule.filter((e) => all || e.date === viewDate).sort((a, b) => b.date.localeCompare(a.date));
  $("#empty-rows").hidden = rows.length > 0;
  $("#rows").innerHTML = rows.map((e) => `
    <tr data-id="${esc(e.id)}">
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

function renderAll() { renderDashboard(); renderPlanner(); renderMood(); renderSettings(); }

/* --------------------------------------------------------------- actions */
function addEntry(e) {
  S.schedule.push(cleanEntry(e));
  save(); renderDashboard(); renderPlanner();
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
    const task = $("#f-task").value.trim(), err = $("#form-err");
    if (!task) { err.textContent = "Give the activity a name."; err.hidden = false; return; }
    err.hidden = true;
    addEntry({ task, category: $("#f-cat").value, date: $("#f-date").value, hours: $("#f-hours").value, intensity: $("#f-int").value });
    $("#f-task").value = "";
  });

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
  $("#d-reset").addEventListener("click", () => {
    if (!confirm("Delete all schedule, mood and settings data from this browser?")) return;
    localStorage.removeItem(KEY); S = cleanState(null); save(); renderAll(); msg("Everything reset.");
  });
}

/* ------------------------------------------------------------------ boot */
function init() {
  const dp = $("#viewDate");
  dp.value = viewDate;
  dp.addEventListener("change", () => {
    if (!isDate(dp.value)) return;
    viewDate = dp.value; $("#f-date").value = viewDate;
    renderDashboard(); renderPlanner(); $("#mood-feedback").innerHTML = "";
  });
  initTabs(); initPlanner(); initMood(); initTimer(); initSettings();
  $("#breath-start").addEventListener("click", runBreathing);
  renderAll();
}

init();
