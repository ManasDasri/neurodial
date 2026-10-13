// NeuroDial results dashboard. Loads the latest published results bundle
// from the Med-EEG repository on every visit (and every few minutes), so a
// new analysis run appears here as soon as it is pushed. No dependencies.
"use strict";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/ManasDasri/Med-EEG/main/results/latest/results.json";
const DATA_URL = new URLSearchParams(location.search).get("data") || DEFAULT_URL;
const REFRESH_MS = 5 * 60 * 1000;
const SVG = "http://www.w3.org/2000/svg";

const TASKS = {
  expertise: {
    title: "Expert vs novice",
    metric: "Accuracy across people",
    asPercent: true,
    about: "Can a model tell an experienced meditator from a novice? One answer per person (23 people), so accuracy moves in steps of about 4%.",
  },
  concentration: {
    title: "Concentration",
    metric: "Within-person AUC",
    asPercent: false,
    about: "Within each person's session, can EEG tell their deeper-concentration moments from their shallower ones? 0.5 is a coin flip.",
  },
  mind_wandering: {
    title: "Mind wandering",
    metric: "Within-person AUC",
    asPercent: false,
    about: "Within each person's session, can EEG tell moments with more mind wandering from moments with less? 0.5 is a coin flip.",
  },
};

const state = { data: null, task: "expertise", stripModel: {}, lastChecked: null };

// ---------- small helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}
function sv(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
function fmt(v, digits = 3) { return isNum(v) ? v.toFixed(digits) : "–"; }
function fmtScore(v, task) {
  if (!isNum(v)) return "–";
  return TASKS[task]?.asPercent ? `${(v * 100).toFixed(1)}%` : v.toFixed(3);
}
function fmtP(p) {
  if (!isNum(p)) return "not tested";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}
// Escape data-derived text before it goes into tooltip HTML.
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function shortSha(sha) { return sha ? String(sha).slice(0, 7) : "unknown"; }
function when(iso) {
  if (!iso) return "unknown time";
  // provenance stamps look like 20261013T035644868320Z
  const m = String(iso).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ---------- tooltip ----------
const tip = document.getElementById("tooltip");
function showTip(evt, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = evt.target.getBoundingClientRect?.() || { left: 0, top: 0, width: 0 };
  const x = evt.clientX ?? r.left + r.width / 2;
  const y = evt.clientY ?? r.top;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 12))}px`;
  tip.style.top = `${Math.max(8, y - h - 12)}px`;
}
function hideTip() { tip.hidden = true; }
function hoverable(node, html) {
  node.setAttribute("tabindex", "0");
  node.addEventListener("pointermove", (e) => showTip(e, html));
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("focus", (e) => showTip(e, html));
  node.addEventListener("blur", hideTip);
  return node;
}

// ---------- theme ----------
function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}
try { applyTheme(localStorage.getItem("theme")); } catch (_) { /* storage blocked */ }
document.getElementById("theme").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const current = document.documentElement.getAttribute("data-theme") || (dark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (_) { /* ignore */ }
});

// ---------- loading ----------
function validBundle(d) {
  return d && typeof d === "object" && d.tasks && typeof d.tasks === "object"
    && d.replication && Array.isArray(d.replication.rows) && d.qc;
}
async function load() {
  const status = document.getElementById("live-status");
  const dot = document.getElementById("live-dot");
  status.textContent = state.data ? "Checking for new results…" : "Loading results…";
  try {
    const sep = DATA_URL.includes("?") ? "&" : "?";
    const res = await fetch(`${DATA_URL}${sep}t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!validBundle(data)) throw new Error("the results file doesn't have the expected structure");
    const changed = !state.data || state.data.published_at !== data.published_at;
    state.data = data;
    state.lastChecked = new Date();
    document.getElementById("error").hidden = true;
    dot.className = "dot ok" + (changed && state.lastChecked ? " flash" : "");
    status.textContent = changed ? "Live: latest published results" : "Live: no new results";
    if (changed) render();
    renderMeta();
  } catch (err) {
    dot.className = "dot err";
    status.textContent = "Couldn't load results";
    const box = document.getElementById("error");
    box.hidden = false;
    box.textContent = `Couldn't load the results bundle (${err.message}). ` +
      (state.data ? "Showing the last results that loaded." : "Try Refresh in a minute.");
  }
}
function renderMeta() {
  const d = state.data;
  const sources = [...Object.values(d.tasks).map((t) => t.source), d.replication.source].filter(Boolean);
  const shas = [...new Set(sources.map((s) => shortSha(s.code_revision)))];
  document.getElementById("live-meta").textContent =
    `Published ${when(d.published_at)} · analysis code ${shas.join(", ")} · ` +
    `checked ${state.lastChecked.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
}
document.getElementById("refresh").addEventListener("click", load);
setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.lastChecked
      && Date.now() - state.lastChecked > REFRESH_MS) load();
});

// ---------- verdicts ----------
const STATUS = {
  good: { color: "var(--good)", icon: "✓" },
  warning: { color: "var(--warning)", icon: "–" },
  serious: { color: "var(--serious)", icon: "!" },
  neutral: { color: "var(--muted)", icon: "?" },
};
function verdictPill(kind, text, why) {
  const s = STATUS[kind];
  return el("div", {},
    el("div", { class: "verdict" },
      el("span", { class: "icon", style: `background:${s.color}`, "aria-hidden": "true" }, s.icon),
      el("p", {}, text)),
    why ? el("p", { class: "verdict-why" }, why) : null);
}
function taskVerdict(task, t) {
  const h = t.headline;
  const best = t.models.find((m) => m.model === h.best_model);
  const base = t.models.find((m) => m.model === h.best_baseline);
  if (!best || !isNum(best.p_corrected)) {
    return verdictPill("neutral", "No significance test in this run",
      "The published run has no permutation test, so these scores have no chance comparison yet.");
  }
  if (h.beats_chance && h.beats_best_baseline) {
    return verdictPill("good", "EEG beats chance and the no-EEG baseline",
      `${best.label} reaches ${fmtScore(best.score, task)} (corrected p ${fmtP(best.p_corrected)}), and its paired comparison with ${base?.label ?? "the baseline"} excludes zero.`);
  }
  if (h.beats_chance) {
    return verdictPill("serious", `Above chance, but not better than ${base?.label.toLowerCase() ?? "a no-EEG baseline"}`,
      `${best.label} reaches ${fmtScore(best.score, task)} (corrected p ${fmtP(best.p_corrected)}), but ${base?.label ?? "a no-EEG baseline"} scores ${fmtScore(base?.score, task)} without any EEG, so the EEG result can't be credited to brain activity.`);
  }
  return verdictPill("warning", "Not distinguishable from chance",
    `The best EEG model, ${best.label}, scores ${fmtScore(best.score, task)}; after correcting for the number of models tested, p = ${fmtP(best.p_corrected)}.` +
    (base ? ` For comparison, ${base.label.toLowerCase()} scores ${fmtScore(base.score, task)}.` : ""));
}

// ---------- charts ----------
function xScale(lo, hi, x0, x1) { return (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0); }
function ticks(lo, hi, step) {
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
}
function colorFor(kind) { return kind === "baseline" ? "var(--series-base)" : "var(--series-eeg)"; }

function modelChart(task, t) {
  const rows = t.models;
  const W = 960, left = 290, right = 70, rowH = 40, top = 30, bottom = 34;
  const H = top + rows.length * rowH + bottom;
  const vals = rows.flatMap((m) => [m.ci_low, m.ci_high, m.chance, m.score]).filter(isNum);
  const lo = Math.max(0, Math.floor((Math.min(0.5, ...vals) - 0.05) * 10) / 10);
  const hi = Math.min(1, Math.ceil((Math.max(0.5, ...vals) + 0.05) * 10) / 10);
  const x = xScale(lo, hi, left, W - right);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `${TASKS[task].metric} for each model, with 95% intervals and shuffled-label chance` });
  for (const v of ticks(lo, hi, 0.1)) {
    svg.append(sv("line", { class: "grid", x1: x(v), x2: x(v), y1: top - 6, y2: H - bottom }),
      sv("text", { x: x(v), y: H - bottom + 18, "text-anchor": "middle" },
        TASKS[task].asPercent ? `${Math.round(v * 100)}%` : v.toFixed(1)));
  }
  svg.append(sv("line", { class: "ref", x1: x(0.5), x2: x(0.5), y1: top - 12, y2: H - bottom }),
    sv("text", { x: x(0.5) + 6, y: top - 14 }, "coin flip"));
  rows.forEach((m, i) => {
    const cy = top + i * rowH + rowH / 2;
    const c = colorFor(m.kind);
    svg.append(sv("text", { class: "t1", x: left - 14, y: cy + 4, "text-anchor": "end" }, m.label));
    if (isNum(m.ci_low) && isNum(m.ci_high)) {
      svg.append(sv("line", { class: "whisker", x1: x(m.ci_low), x2: x(m.ci_high), y1: cy, y2: cy, stroke: c }));
    }
    if (isNum(m.chance)) {
      svg.append(sv("line", { class: "chance-tick", x1: x(m.chance), x2: x(m.chance), y1: cy - 8, y2: cy + 8 }));
    }
    if (isNum(m.score)) {
      svg.append(sv("circle", { class: "pt", cx: x(m.score), cy, r: 6, fill: c }),
        sv("text", { class: "t1", x: x(Math.min(hi, isNum(m.ci_high) ? m.ci_high : m.score)) + 10, y: cy + 4 },
          fmtScore(m.score, task)));
    }
    svg.append(hoverable(sv("rect", { class: "hit", x: 0, y: cy - rowH / 2, width: W, height: rowH,
      "aria-label": `${m.label}: ${fmtScore(m.score, task)}` }),
      `<b>${esc(m.label)}</b>${TASKS[task].metric}: ${fmtScore(m.score, task)}<br>` +
      `95% interval: ${fmtScore(m.ci_low, task)} – ${fmtScore(m.ci_high, task)}<br>` +
      `Shuffled-label chance: ${fmtScore(m.chance, task)}<br>` +
      `p = ${fmtP(m.p_value)} · corrected p = ${fmtP(m.p_corrected)}<br>` +
      `<span class="muted">${m.kind === "baseline" ? "No EEG used" : "EEG model"} · ${m.n_subjects ?? "?"} people</span>`));
  });
  return svg;
}

function stripChart(task, scores, kind) {
  const W = 960, left = 30, right = 30, top = 24, bottom = 34, r = 5, bin = 0.02;
  const stacks = new Map();
  const placed = scores.filter((s) => isNum(s.score)).map((s) => {
    const b = Math.round(s.score / bin);
    const n = stacks.get(b) || 0;
    stacks.set(b, n + 1);
    return { ...s, level: n };
  });
  const maxStack = Math.max(1, ...stacks.values());
  const H = top + maxStack * (2 * r + 2) + bottom + 8;
  const x = xScale(0, 1, left, W - right);
  const base = H - bottom;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `Score for each person, ${placed.length} people` });
  for (const v of ticks(0, 1, 0.1)) {
    svg.append(sv("line", { class: "grid", x1: x(v), x2: x(v), y1: top - 6, y2: base }),
      sv("text", { x: x(v), y: base + 18, "text-anchor": "middle" },
        TASKS[task].asPercent ? (v === 0 ? "wrong" : v === 1 ? "right" : "") : v.toFixed(1)));
  }
  svg.append(sv("line", { class: "axis", x1: left, x2: W - right, y1: base, y2: base }),
    sv("line", { class: "ref", x1: x(0.5), x2: x(0.5), y1: top - 12, y2: base }));
  for (const p of placed) {
    const cx = x(Math.round(p.score / bin) * bin), cy = base - r - 1 - p.level * (2 * r + 2);
    svg.append(hoverable(sv("circle", { class: "pt", cx, cy, r, fill: colorFor(kind),
      "aria-label": `${p.subject}: ${fmtScore(p.score, task)}` }),
      `<b>${esc(p.subject)}</b>${TASKS[task].asPercent ? (p.score >= 0.5 ? "Classified correctly" : "Classified wrongly")
        : `Within-person AUC: ${p.score.toFixed(3)}`}`));
  }
  return svg;
}

// Binary per-person outcome (right/wrong): one dot per person, filled = right.
function personDots(task, scores, kind) {
  const people = scores.filter((s) => isNum(s.score))
    .sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject));
  const right = people.filter((s) => s.score >= 0.5).length;
  const W = 960, r = 9, gap = 10, perRow = Math.floor((W - 20) / (2 * r + gap));
  const rows = Math.ceil(people.length / perRow);
  const H = 44 + rows * (2 * r + gap);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `${right} of ${people.length} people classified correctly` });
  svg.append(sv("text", { class: "t1", x: 10, y: 18, "font-weight": "600" },
    `${right} of ${people.length} people classified correctly`));
  const c = colorFor(kind);
  people.forEach((p, i) => {
    const cx = 10 + r + (i % perRow) * (2 * r + gap), cy = 44 + r + Math.floor(i / perRow) * (2 * r + gap);
    const ok = p.score >= 0.5;
    svg.append(hoverable(sv("circle", { cx, cy, r, fill: ok ? c : "var(--surface)",
      stroke: c, "stroke-width": 2, "aria-label": `${p.subject}: ${ok ? "correct" : "wrong"}` }),
      `<b>${esc(p.subject)}</b>${ok ? "Classified correctly" : "Classified wrongly"}`));
  });
  return svg;
}

function forestChart(rep) {
  const rows = rep.rows.filter((r) => isNum(r.estimate) && isNum(r.ci_low) && isNum(r.ci_high));
  const W = 960, left = 330, right = 80, rowH = 36, top = 34, bottom = 36;
  const H = top + rows.length * rowH + bottom;
  const vals = rows.flatMap((r) => [r.ci_low, r.ci_high]).concat([0, rep.reference_estimate]);
  const lo = Math.floor((Math.min(...vals) - 0.02) * 20) / 20;
  const hi = Math.ceil((Math.max(...vals) + 0.02) * 20) / 20;
  const x = xScale(lo, hi, left, W - right);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": "Replication estimates with 95% intervals; negative means lower depth with higher gamma/theta ratio" });
  for (const v of ticks(lo, hi, 0.05)) {
    svg.append(sv("line", { class: "grid", x1: x(v), x2: x(v), y1: top - 6, y2: H - bottom }),
      sv("text", { x: x(v), y: H - bottom + 18, "text-anchor": "middle" }, v.toFixed(2)));
  }
  svg.append(sv("line", { class: "axis", x1: x(0), x2: x(0), y1: top - 14, y2: H - bottom }),
    sv("text", { x: x(0) + 6, y: top - 18 }, "no effect"),
    sv("line", { class: "ref", x1: x(rep.reference_estimate), x2: x(rep.reference_estimate), y1: top - 14, y2: H - bottom }),
    sv("text", { x: x(rep.reference_estimate) - 6, y: top - 18, "text-anchor": "end" }, "discovery effect (−0.21)"));
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const invalid = r.fit_valid === false;
    const primary = /^PRIMARY/.test(r.analysis);
    const label = r.analysis.replace(/^PRIMARY: /, "Primary: ").replace(/^CROSS-CHECK: /, "Cross-check: ")
      .replace(/^ORIGINAL /, "Original ") + (invalid ? " (invalid fit)" : "");
    svg.append(sv("text", { class: "t1", x: left - 14, y: cy + 4, "text-anchor": "end",
      "font-weight": primary ? "700" : "400" }, label));
    const c = invalid ? "var(--muted)" : "var(--series-eeg)";
    svg.append(sv("line", { class: "whisker", x1: x(r.ci_low), x2: x(r.ci_high), y1: cy, y2: cy, stroke: c }),
      sv("circle", { class: "pt", cx: x(r.estimate), cy, r: 6, fill: invalid ? "var(--surface)" : c,
        stroke: invalid ? "var(--muted)" : null, "stroke-width": invalid ? 2 : null }),
      sv("text", { class: "t1", x: x(r.ci_high) + 10, y: cy + 4 }, r.estimate.toFixed(3)));
    svg.append(hoverable(sv("rect", { class: "hit", x: 0, y: cy - rowH / 2, width: W, height: rowH,
      "aria-label": `${label}: ${r.estimate.toFixed(3)}` }),
      `<b>${esc(label)}</b>Estimate: ${r.estimate.toFixed(3)} (95% ${r.ci_low.toFixed(3)} to ${r.ci_high.toFixed(3)})<br>` +
      `One-sided p (negative): ${invalid ? "withheld, model didn't converge" : fmtP(r.p_one_sided_negative)}<br>` +
      `<span class="muted">${esc(r.method)}${isNum(r.n_reports) ? ` · ${r.n_reports} reports` : ""} · ${r.n_participants ?? "?"} people</span>`));
  });
  return svg;
}

// Charts keep a readable minimum width and scroll inside their card on phones.
const scroller = (svg) => el("div", { class: "chart-scroll" }, svg);

function table(headers, rows) {
  return el("div", { class: "table-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, headers.map(([h, num]) => el("th", { class: num ? "num" : null }, h)))),
    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v, i) =>
      el("td", { class: headers[i][1] ? "num" : null }, v ?? "–")))))));
}

// ---------- sections ----------
function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren(...Object.keys(TASKS).filter((k) => state.data.tasks[k]).map((k) =>
    el("button", { type: "button", role: "tab", "aria-selected": String(k === state.task),
      onclick: () => { state.task = k; renderTabs(); renderTask(); } }, TASKS[k].title)));
}

function renderTask() {
  const task = state.task, t = state.data.tasks[task], info = TASKS[task];
  const h = t.headline;
  const best = t.models.find((m) => m.model === h.best_model);
  const base = t.models.find((m) => m.model === h.best_baseline);
  const chance = best && isNum(best.chance) ? best.chance : t.chance_reference;
  const eegModels = t.models.filter((m) => m.kind === "eeg");
  const choice = state.stripModel[task] && t.subject_scores[state.stripModel[task]]
    ? state.stripModel[task] : h.best_model;
  const chosen = t.models.find((m) => m.model === choice);

  const tiles = el("div", { class: "tiles" },
    el("div", { class: "tile" }, el("div", { class: "label" }, el("span", { class: "swatch", style: "background:var(--series-eeg)" }), "Best EEG model"),
      el("div", { class: "value" }, fmtScore(best?.score, task)), el("div", { class: "sub" }, best?.label ?? "–")),
    el("div", { class: "tile" }, el("div", { class: "label" }, el("span", { class: "swatch", style: "background:var(--series-base)" }), "Best without EEG"),
      el("div", { class: "value" }, fmtScore(base?.score, task)), el("div", { class: "sub" }, base?.label ?? "no baseline")),
    el("div", { class: "tile" }, el("div", { class: "label" }, "Chance (shuffled labels)"),
      el("div", { class: "value" }, fmtScore(chance, task)),
      el("div", { class: "sub" }, isNum(best?.chance) ? "what luck alone scores" : "theoretical; no permutation run")));

  const legend = el("div", { class: "legend" },
    el("span", {}, el("span", { class: "swatch", style: "background:var(--series-eeg)" }), "EEG model"),
    el("span", {}, el("span", { class: "swatch", style: "background:var(--series-base)" }), "No EEG (baseline)"),
    el("span", {}, "● score  ─ 95% interval  | shuffled-label chance"));

  const picker = el("select", { "aria-label": "Model for the per-person chart",
    onchange: (e) => { state.stripModel[task] = e.target.value; renderTask(); } },
    t.models.filter((m) => t.subject_scores[m.model]).map((m) =>
      el("option", { value: m.model, selected: m.model === choice ? "" : null }, m.label)));

  const scores = t.subject_scores[choice] || [];
  document.getElementById("task-panel").replaceChildren(
    el("p", { class: "section-note" }, info.about),
    tiles,
    taskVerdict(task, t),
    el("div", { class: "card" },
      el("div", { class: "chart-head" }, el("h3", {}, `${info.metric}, every model`), legend),
      scroller(modelChart(task, t)),
      el("details", {}, el("summary", {}, "Show as a table"),
        table([["Model"], ["Score", 1], ["95% interval", 1], ["Chance", 1], ["p", 1], ["Corrected p", 1]],
          t.models.map((m) => [m.label, fmtScore(m.score, task),
            `${fmtScore(m.ci_low, task)} – ${fmtScore(m.ci_high, task)}`, fmtScore(m.chance, task),
            fmtP(m.p_value), fmtP(m.p_corrected)])))),
    el("div", { class: "card" },
      el("div", { class: "chart-head" }, el("h3", {}, "Each person"), picker),
      info.asPercent ? scroller(personDots(task, scores, chosen?.kind ?? "eeg"))
        : scroller(stripChart(task, scores, chosen?.kind ?? "eeg")),
      info.asPercent ? el("div", { class: "legend" }, el("span", {}, "● classified correctly   ○ classified wrongly")) : null,
      el("details", {}, el("summary", {}, "Show as a table"),
        table([["Person"], [TASKS[task].asPercent ? "Result" : "Within-person AUC", 1]],
          scores.map((s) => [s.subject, TASKS[task].asPercent
            ? (s.score >= 0.5 ? "correct" : "wrong") : fmt(s.score)])))));
}

function renderReplication() {
  const rep = state.data.replication;
  const replicated = /^REPLICATED/.test(rep.verdict);
  const inconclusive = /^INCONCLUSIVE/.test(rep.verdict);
  const primary = rep.rows.find((r) => /^PRIMARY/.test(r.analysis));
  const signs = rep.rows.find((r) => /^S6/.test(r.analysis));
  const pill = verdictPill(replicated ? "good" : inconclusive ? "neutral" : "warning",
    replicated ? "Replicated" : inconclusive ? "Inconclusive" : "Not replicated",
    `Pre-registered prediction: in experienced meditators, a higher gamma/theta ratio at Fz + Pz goes with lower reported meditation depth. ` +
    (primary ? `Primary estimate ${primary.estimate.toFixed(3)} (95% ${primary.ci_low.toFixed(3)} to ${primary.ci_high.toFixed(3)}), one-sided p = ${fmtP(primary.p_one_sided_negative)}; the rule needed p < ${rep.alpha_one_sided}.` : "") +
    (signs?.note ? ` Per-person slopes: ${signs.note}.` : ""));
  document.getElementById("replication").replaceChildren(
    el("p", { class: "section-note" }, "39 experienced Vipassana meditators from a different lab, EEG system and rating scale. The test was written down and committed before any of this data was analysed."),
    pill,
    el("div", { class: "card" },
      el("div", { class: "chart-head" }, el("h3", {}, "Estimates (within-person SD units)"),
        el("div", { class: "legend" }, el("span", {}, "● estimate  ─ 95% interval  · left of zero = as predicted"))),
      scroller(forestChart(rep)),
      el("details", {}, el("summary", {}, "Show as a table"),
        table([["Analysis"], ["Estimate", 1], ["95% interval", 1], ["One-sided p", 1], ["People", 1], ["Note"]],
          rep.rows.map((r) => [r.analysis, fmt(r.estimate), isNum(r.ci_low) ? `${fmt(r.ci_low)} – ${fmt(r.ci_high)}` : "–",
            r.fit_valid === false ? "withheld" : fmtP(r.p_one_sided_negative), r.n_participants, r.note ?? r.method ?? ""])))));
}

function renderQC() {
  const names = { ds001787: "Discovery (ds001787)", ds008836: "Replication (ds008836)" };
  document.getElementById("qc").replaceChildren(...Object.entries(state.data.qc).map(([k, q]) => {
    const excluded = Array.isArray(q.excluded_recordings) ? q.excluded_recordings.length : q.excluded_recordings;
    return el("div", { class: "tile" },
      el("div", { class: "label" }, names[k] ?? k),
      el("div", { class: "value" }, `${q.subjects} people`),
      el("div", { class: "sub" }, `${q.recordings} recordings · ${q.probes_kept.toLocaleString()} self-reports`),
      el("div", { class: "sub" }, `median ${(q.median_reject_rate * 100).toFixed(1)}% of 2-s segments rejected · ${q.median_bad_channels} bad channels repaired`),
      el("div", { class: "sub" }, `${excluded} recording${excluded === 1 ? "" : "s"} excluded by the pre-set quality rule`));
  }));
}

function render() {
  const d = state.data;
  const any = Object.values(d.tasks)[0];
  document.getElementById("discovery-note").textContent =
    `Delorme & Brandmeyer meditation study, ${any?.models?.[0]?.n_subjects ?? "23"} people after quality exclusion. ` +
    `Each score comes from models that never saw the person they're scoring.`;
  if (!d.tasks[state.task]) state.task = Object.keys(d.tasks)[0];
  renderTabs();
  renderTask();
  renderReplication();
  renderQC();
}

load();
