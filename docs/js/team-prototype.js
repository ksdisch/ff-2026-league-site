// PROTOTYPE — ticket 05 (Team page layout). Throwaway. See team.html's header.
//
// Three variants of the Team page, switchable via ?variant=A|B|C:
//   A "Dashboard"   analytics tiles up top, Standings chart reused (this team
//                   lit, others dimmed), head-to-head as a grouping of the
//                   week table, footnote under the projection tile, My Team +
//                   twelve-team picker as the empty state.
//   B "Ledger"      team-only line vs the cutoff, week table first with the
//                   head-to-head record as its own block, analytics in full
//                   cards below, footnote at the page foot, consistency hidden
//                   before four weeks, Teams index as the empty state.
//   C "Locker room" roster and position breakdown first in two columns, chart
//                   reused without the legend, compact analytics, week table
//                   last, footnote as a marker beside the number.
//
// The analytics block (ticket 06) is STUBBED: week 1 is real; ?weeks=N
// synthesizes weeks 2..N deterministically so the same numbers come back on
// every reload.

const PARAMS = new URLSearchParams(location.search);
const VARIANTS = {
  A: "Dashboard", B: "Ledger", C: "Locker room",
};
const variant = VARIANTS[PARAMS.get("variant")] ? PARAMS.get("variant") : "A";
const managerParam = PARAMS.get("manager") || "";
const stubWeeks = Math.max(1, Math.min(14, Number(PARAMS.get("weeks")) || 6));
const CONSISTENCY_MIN_WEEKS = 4; // variant B hides consistency before this

const PALETTE = [
  "#2f7d4f", "#2b5c8a", "#b0402f", "#d1791f", "#1f8a86", "#7a4fa3",
  "#b8892b", "#566270", "#a8324a", "#6b7a2f", "#8a5a3c", "#a0498f",
];
const AXIS = "#7c7862", GRID = "#e6dcc4", CUTOFF = "#c8a23c";
const HEADSHOT_BASE = "https://a.espncdn.com/i/headshots/nfl/players/full/";
const TEAM_LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500/";

const slug = s => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "")
  .trim().replace(/\s+/g, "-");
const pts = n => (Math.round(n * 10) / 10).toFixed(1);
const signed = n => (n > 0 ? "+" : "") + (Math.round(n * 10) / 10).toFixed(1);
const recordText = r => !r ? "" : r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function html(tag, cls, inner) { const n = el(tag, cls); n.innerHTML = inner; return n; }

// ── deterministic stub randomness ──
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Round-robin so every stubbed week pairs each team with exactly one other.
function roundRobin(ids, week) {
  const n = ids.length, arr = ids.slice();
  const fixed = arr.shift();
  for (let r = 1; r < week; r++) arr.unshift(arr.pop());
  const ring = [fixed, ...arr];
  const pairs = [];
  for (let i = 0; i < n / 2; i++) pairs.push([ring[i], ring[n - 1 - i]]);
  return pairs;
}

/**
 * Extend the real data to `weeks` counted weeks and hang a stubbed
 * `analytics` block on every team. Week 1 is the real week; everything after
 * is synthesized. Mutates `data` in place.
 */
function stubAnalytics(data, week1, weeks) {
  const teams = data.teams;
  const ids = teams.map(t => t.team_id).sort((a, b) => a - b);
  const byId = Object.fromEntries(teams.map(t => [t.team_id, t]));
  const real = data.metadata.completed_weeks || 0;

  // Real opponents for week 1.
  const opp = {};
  if (week1) for (const m of week1.matchups || []) {
    if (m.home && m.away) { opp[m.home.team_id] = { 1: m.away.team_id }; opp[m.away.team_id] = { 1: m.home.team_id }; }
  }

  // Synthesize scores for weeks real+1..weeks.
  for (let w = real + 1; w <= weeks; w++) {
    const scores = {};
    for (const t of teams) {
      const r = rng(t.team_id * 7919 + w * 104729);
      scores[t.team_id] = Math.round((85 + r() * 65) * 100) / 100;
    }
    const order = ids.slice().sort((a, b) => scores[b] - scores[a]);
    order.forEach((id, i) => {
      const t = byId[id];
      t.scores_by_week[w - 1] = scores[id];
      t.ranking_points_by_week[w - 1] = 12 - i;
      t.cumulative_points_by_week[w - 1] = (t.cumulative_points_by_week[w - 2] || 0) + 12 - i;
    });
    for (const [a, b] of roundRobin(ids, w)) {
      (opp[a] = opp[a] || {})[w] = b;
      (opp[b] = opp[b] || {})[w] = a;
    }
    // position scores for the position breakdown
    const posRow = {};
    for (const t of teams) {
      const r = rng(t.team_id * 31 + w * 17);
      const parts = { QB: 14 + r() * 20, RB: 10 + r() * 30, WR: 10 + r() * 30, FLEX: 4 + r() * 22, TE: 3 + r() * 20, "D/ST": 2 + r() * 16, K: 4 + r() * 12 };
      posRow[t.abbrev] = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10]));
    }
    data.position_scores_by_week[w - 1] = posRow;
  }
  // Re-rank and normalize after the extension.
  teams.sort((a, b) => b.cumulative_points_by_week[weeks - 1] - a.cumulative_points_by_week[weeks - 1] || a.team_id - b.team_id);
  const cutoffIdx = data.metadata.playoff_cutoff - 1;
  for (let w = 0; w < weeks; w++) {
    const sorted = teams.map(t => t.cumulative_points_by_week[w]).sort((a, b) => b - a);
    const cut = sorted[cutoffIdx];
    teams.forEach(t => { t.normalized_by_week[w] = t.cumulative_points_by_week[w] - cut; });
  }
  teams.forEach((t, i) => { t.rank = i + 1; t.total_ranking_points = t.cumulative_points_by_week[weeks - 1]; });
  data.metadata.completed_weeks = weeks;

  // Analytics rows + summaries.
  const consist = [];
  for (const t of teams) {
    const r = rng(t.team_id * 2654435761);
    const rows = [];
    for (let w = 1; w <= weeks; w++) {
      const o = byId[(opp[t.team_id] || {})[w]];
      const s = t.scores_by_week[w - 1], os = o ? o.scores_by_week[w - 1] : null;
      const result = os == null ? "T" : s > os ? "W" : s < os ? "L" : "T";
      const rp = t.ranking_points_by_week[w - 1];
      const luck = result === "W" && rp <= 6 ? "lucky-win" : result === "L" && rp >= 7 ? "unlucky-loss" : null;
      const lob = Math.round(Math.max(0, r() * 30 - 6) * 100) / 100;
      rows.push({
        opponent_team_id: o ? o.team_id : null, result,
        left_on_bench: lob,
        best_swap: lob > 0 ? { out_player_id: 0, out_name: "(starter)", in_player_id: 0, in_name: "(bench)", gain: Math.round(lob * (0.6 + r() * 0.4) * 100) / 100 } : null,
        luck,
        projection_gap: Math.round((r() * 45 - 20) * 100) / 100,
      });
    }
    const scores = t.scores_by_week.slice(0, weeks);
    const mean = scores.reduce((a, b) => a + b, 0) / weeks;
    const stdev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / weeks);
    t.analytics = {
      weeks: rows,
      left_on_bench_total: Math.round(rows.reduce((a, x) => a + x.left_on_bench, 0) * 100) / 100,
      expected_wins: Math.round((t.ranking_points_by_week.slice(0, weeks).reduce((a, b) => a + b, 0) - weeks) / 11 * 100) / 100,
      consistency: { min: Math.min(...scores), max: Math.max(...scores), mean: Math.round(mean * 100) / 100, stdev: Math.round(stdev * 100) / 100, rank: 0 },
      projection_gap_total: Math.round(rows.reduce((a, x) => a + x.projection_gap, 0) * 100) / 100,
      projection_gap_avg: 0,
    };
    t.analytics.projection_gap_avg = Math.round(t.analytics.projection_gap_total / weeks * 100) / 100;
    consist.push(t);
  }
  const byStdev = consist.slice().sort((a, b) => a.analytics.consistency.stdev - b.analytics.consistency.stdev);
  byStdev.forEach((t, i) => {
    const prev = byStdev[i - 1];
    t.analytics.consistency.rank = prev && prev.analytics.consistency.stdev === t.analytics.consistency.stdev ? prev.analytics.consistency.rank : i + 1;
  });
}

// ── data ──
async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// ── page assembly ──
const main = document.getElementById("main");
function section(id, title, opts = {}) {
  const s = el("section"); s.id = id;
  if (title) {
    if (opts.control) {
      const head = el("div", "section-head");
      head.appendChild(el("h2", null, title));
      head.appendChild(opts.control);
      s.appendChild(head);
    } else s.appendChild(el("h2", null, title));
  }
  return s;
}

function teamSide(weekFile, teamId) {
  for (const m of weekFile.matchups || []) for (const side of [m.home, m.away]) if (side && side.team_id === teamId) return side;
  return null;
}

function teamHeader(t, meta, side) {
  const card = el("div", "team-card");
  if (side && side.logo_url) {
    const logo = el("img", "team-card-logo"); logo.src = side.logo_url; logo.alt = "";
    logo.addEventListener("error", () => logo.remove());
    card.appendChild(logo);
  }
  const id = el("div", "team-card-id");
  id.appendChild(el("span", "team-card-name", t.team_name));
  id.appendChild(el("span", "team-card-mgr", t.managers.map(m => m.name).join(" & ")));
  if (side && side.record) {
    const rec = el("span", "team-card-record", `ESPN record ${recordText(side.record)}`);
    rec.title = "ESPN's head-to-head record. The standings do not use it.";
    id.appendChild(rec);
  }
  card.appendChild(id);

  const norm = t.normalized_by_week[meta.completed_weeks - 1];
  const stats = el("div", "team-card-stats");
  const stat = (label, value, cls, sub) => {
    const s = el("div", "stat");
    s.appendChild(el("span", "stat-label", label));
    s.appendChild(el("span", `stat-value ${cls || ""}`, value));
    if (sub) s.appendChild(el("span", "stat-sub", sub));
    return s;
  };
  stats.appendChild(stat("Rank", `#${t.rank}`, "", `of ${meta.num_teams}`));
  stats.appendChild(stat("Points", pts(t.total_ranking_points), "", `${meta.completed_weeks} wk${meta.completed_weeks > 1 ? "s" : ""}`));
  const dist = norm > 0 ? `${pts(norm)} clear of the cutoff` : norm < 0 ? `${pts(-norm)} back of the cutoff` : "on the cutoff";
  stats.appendChild(stat("Norm", signed(norm), norm >= 0 ? "pos" : "neg", dist));
  card.appendChild(stats);
  return card;
}

// ── trajectory ──
function fade(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
const atCutoff = ctx => ctx.tick && ctx.tick.value === 0;
function chartOptions(legend) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: "#20302a", boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y > 0 ? "+" : ""}${c.parsed.y}` } },
    },
    scales: {
      x: { ticks: { color: AXIS }, grid: { color: GRID } },
      y: { ticks: { color: AXIS },
        grid: { color: ctx => (atCutoff(ctx) ? CUTOFF : GRID), lineWidth: ctx => (atCutoff(ctx) ? 2 : 1) },
        title: { display: true, text: "Points vs. playoff cutoff", color: AXIS } },
    },
  };
}
function chartSection(teams, team, meta, mode) {
  const s = section("chart-section", mode === "solo" ? "Season so far" : "Playoff position by week");
  const wrap = el("div", "chart-wrap");
  if (mode === "solo") wrap.style.height = "260px";
  const canvas = el("canvas"); wrap.appendChild(canvas); s.appendChild(wrap);
  const labels = Array.from({ length: meta.completed_weeks }, (_, i) => `W${i + 1}`);
  let datasets;
  if (mode === "solo") {
    datasets = [{ label: team.team_name, data: team.normalized_by_week, borderColor: "#2f7d4f", backgroundColor: "#2f7d4f",
      borderWidth: 3.5, pointRadius: 4, tension: 0.25, fill: { target: "origin", above: "rgba(47,125,79,.10)", below: "rgba(176,64,47,.10)" } }];
  } else {
    datasets = teams.map((t, i) => {
      const lit = t.team_id === team.team_id, hue = PALETTE[i % PALETTE.length];
      return { label: t.team_name, data: t.normalized_by_week, backgroundColor: hue,
        borderColor: lit ? hue : fade(hue, 0.22), pointBackgroundColor: lit ? hue : fade(hue, 0.22),
        pointBorderColor: lit ? hue : fade(hue, 0.22), pointBorderWidth: lit ? 1 : 0,
        borderWidth: lit ? 3.5 : 2, pointRadius: lit ? 4 : 2, tension: 0.25, order: lit ? 0 : 1 };
    });
  }
  requestAnimationFrame(() => new Chart(canvas, { type: "line", data: { labels, datasets }, options: chartOptions(mode === "legend") }));
  return s;
}

// ── week-by-week table ──
function weekRow(team, w, row, byId, meta) {
  const o = byId[row.opponent_team_id];
  const s = team.scores_by_week[w - 1], os = o ? o.scores_by_week[w - 1] : null;
  const rp = team.ranking_points_by_week[w - 1];
  const rank = 13 - rp, rankText = Number.isInteger(rank) ? `${rank}` : `T${Math.floor(rank)}`;
  const norm = team.normalized_by_week[w - 1];
  const tr = el("tr", "row-link");
  const href = `matchup.html?week=${w}&team=${encodeURIComponent(team.abbrev)}`;
  tr.addEventListener("click", e => { if (e.target.tagName !== "A") location.href = href; });
  tr.innerHTML =
    `<td class="rk">${w}</td>` +
    `<td class="left opp">${o ? `<a href="team.html?manager=${o.managers[0].key}&variant=${variant}&weeks=${stubWeeks}">${o.team_name}</a>` : "—"}</td>` +
    `<td><span class="res ${row.result}">${row.result}</span>${row.luck ? `<span class="luck-tag ${row.luck}">${row.luck.replace("-", " ")}</span>` : ""}</td>` +
    `<td class="pts">${pts(s)}</td><td class="mut">${os == null ? "—" : pts(os)}</td>` +
    `<td>${pts(rp)}</td><td class="mut">${rankText}</td>` +
    `<td class="${norm >= 0 ? "pos" : "neg"}">${signed(norm)}</td>` +
    `<td class="mut">${row.left_on_bench > 0 ? pts(row.left_on_bench) : "—"}</td>` +
    `<td class="${row.projection_gap >= 0 ? "pos" : "neg"}">${signed(row.projection_gap)}</td>` +
    `<td><a href="${href}" class="mini-btn" style="text-decoration:none">Box</a></td>`;
  return tr;
}
function weekTable(team, teams, meta, { grouping }) {
  const byId = Object.fromEntries(teams.map(t => [t.team_id, t]));
  const rows = team.analytics.weeks;
  let byOpponent = false;
  let control = null;
  if (grouping) {
    control = el("div", "pivot-toggle");
    const b1 = el("button", "pivot-toggle-btn active", "By week"), b2 = el("button", "pivot-toggle-btn", "By opponent");
    control.append(b1, b2);
    b1.onclick = () => { byOpponent = false; b1.classList.add("active"); b2.classList.remove("active"); render(); };
    b2.onclick = () => { byOpponent = true; b2.classList.add("active"); b1.classList.remove("active"); render(); };
  }
  const s = section("week-section", "Week by week", { control });
  const wrap = el("div", "table-wrap");
  const table = el("table"); table.id = "week-table";
  table.innerHTML = `<thead><tr><th>Wk</th><th class="left">Opponent</th><th class="left">Result</th><th>Score</th><th>Opp</th>
    <th title="Ranking points">Rk pts</th><th title="Week rank">Wk rank</th><th title="Normalized points after the week">Norm</th>
    <th title="Left on the bench">Bench</th><th title="Projection gap">Gap</th><th></th></tr></thead>`;
  const tbody = el("tbody"); table.appendChild(tbody); wrap.appendChild(table); s.appendChild(wrap);
  function render() {
    tbody.innerHTML = "";
    if (!byOpponent) {
      rows.forEach((row, i) => tbody.appendChild(weekRow(team, i + 1, row, byId, meta)));
      return;
    }
    for (const g of h2hGroups(team, rows, byId)) {
      const head = el("tr", "opp-group");
      head.innerHTML = `<td colspan="11">vs ${g.opponent.team_name} · ${g.record}</td>`;
      tbody.appendChild(head);
      g.weeks.forEach(w => tbody.appendChild(weekRow(team, w, rows[w - 1], byId, meta)));
    }
  }
  render();
  return s;
}
function h2hGroups(team, rows, byId) {
  const groups = new Map();
  rows.forEach((row, i) => {
    if (row.opponent_team_id == null) return;
    const g = groups.get(row.opponent_team_id) || { opponent: byId[row.opponent_team_id], weeks: [], w: 0, l: 0, t: 0 };
    g.weeks.push(i + 1);
    if (row.result === "W") g.w++; else if (row.result === "L") g.l++; else g.t++;
    groups.set(row.opponent_team_id, g);
  });
  return [...groups.values()].map(g => ({ ...g, record: g.t ? `${g.w}-${g.l}-${g.t}` : `${g.w}-${g.l}` }))
    .sort((a, b) => (b.w - b.l) - (a.w - a.l) || a.opponent.team_name.localeCompare(b.opponent.team_name));
}
function h2hSection(team, teams, weekFile) {
  const byId = Object.fromEntries(teams.map(t => [t.team_id, t]));
  const s = section("h2h-section", "Head-to-head record");
  const grid = el("div", "h2h");
  for (const g of h2hGroups(team, team.analytics.weeks, byId)) {
    const a = el("a", "h2h-card");
    a.href = `team.html?manager=${g.opponent.managers[0].key}&variant=${variant}&weeks=${stubWeeks}`;
    const side = teamSide(weekFile, g.opponent.team_id);
    if (side && side.logo_url) { const img = el("img", "h2h-logo"); img.src = side.logo_url; img.alt = ""; img.addEventListener("error", () => img.remove()); a.appendChild(img); }
    a.appendChild(el("span", "h2h-name", g.opponent.team_name));
    a.appendChild(el("span", "h2h-weeks", g.weeks.map(w => `W${w}`).join(" ")));
    a.appendChild(el("span", `h2h-rec ${g.w > g.l ? "up" : g.w < g.l ? "down" : ""}`, g.record));
    grid.appendChild(a);
  }
  s.appendChild(grid);
  return s;
}

// ── analytics ──
const FOOTNOTE = "Lineup projection is what the manager saw at lock time: the last projection fetched before kickoff, up to 15 minutes stale on game day.";
function analyticsSection(team, meta, opts) {
  const a = team.analytics, n = a.weeks.length;
  const wins = a.weeks.reduce((s, r) => s + (r.result === "W" ? 1 : r.result === "T" ? 0.5 : 0), 0);
  const luck = Math.round((wins - a.expected_wins) * 100) / 100;
  const last = a.weeks[n - 1];
  const s = section("analytics-section", opts.title || "Analytics");
  const tiles = el("div", "tiles");
  const tile = (label, value, cls, foot, extra) => {
    const t = el("div", `tile ${extra || ""}`);
    t.appendChild(el("span", "stat-label", label));
    const v = el("span", `stat-value ${cls || ""}`); v.innerHTML = value; t.appendChild(v);
    if (foot) { const f = el("div", "tile-foot"); f.innerHTML = foot; t.appendChild(f); }
    return t;
  };
  tiles.appendChild(tile("Expected wins", `${a.expected_wins.toFixed(2)} <span class="stat-sub">vs ${wins} actual</span>`, "",
    `Luck <b class="${luck > 0 ? "pos" : luck < 0 ? "neg" : ""}">${signed(luck)}</b> · ${a.weeks.filter(r => r.luck === "lucky-win").length} lucky win${a.weeks.filter(r => r.luck === "lucky-win").length === 1 ? "" : "s"}, ${a.weeks.filter(r => r.luck === "unlucky-loss").length} unlucky loss${a.weeks.filter(r => r.luck === "unlucky-loss").length === 1 ? "" : "es"}`));
  tiles.appendChild(tile("Left on the bench", pts(a.left_on_bench_total), "neg",
    last && last.best_swap ? `Week ${n} best swap: ${last.best_swap.in_name} for ${last.best_swap.out_name}, +${pts(last.best_swap.gain)}` : `Week ${n}: nothing left on the bench`));
  if (opts.hideConsistencyBefore && n < opts.hideConsistencyBefore) {
    tiles.appendChild(tile("Consistency", "—", "", `Shown after ${opts.hideConsistencyBefore} counted weeks (${n} so far)`, "muted"));
  } else {
    const c = a.consistency;
    tiles.appendChild(tile("Consistency", `#${c.rank} <span class="stat-sub">of ${meta.num_teams}</span>`, "",
      `σ ${c.stdev.toFixed(1)} · low ${pts(c.min)} · high ${pts(c.max)} · avg ${pts(c.mean)}`));
  }
  const gapFoot = opts.footnote === "tile" ? `${signed(a.projection_gap_avg)} per week · <span style="color:var(--mut)">${FOOTNOTE}</span>`
    : `${signed(a.projection_gap_avg)} per week`;
  tiles.appendChild(tile(opts.footnote === "marker" ? `Projection gap <sup class="fn" title="${FOOTNOTE}">?</sup>` : "Projection gap",
    signed(a.projection_gap_total), a.projection_gap_total >= 0 ? "pos" : "neg", gapFoot));
  s.appendChild(tiles);
  if (opts.footnote === "section") s.appendChild(el("p", "footnote", FOOTNOTE));
  return s;
}

// ── roster ──
function headshot(p) {
  const img = el("img", "shot"); img.alt = ""; img.loading = "lazy";
  img.src = p.slot === "TQB" || p.position === "D/ST"
    ? `${TEAM_LOGO_BASE}${(p.pro_team || "").toLowerCase()}.png` : `${HEADSHOT_BASE}${p.player_id}.png`;
  img.addEventListener("error", () => img.remove());
  return img;
}
function rosterSection(side, weekFile) {
  const status = { final: "Final", "in-progress": "In progress", upcoming: "Upcoming" }[weekFile.status] || "";
  const s = section("roster-section", `Roster · week ${weekFile.week} · ${status}`);
  if (!side) { s.appendChild(el("p", "footnote", "No roster in this week's file.")); return s; }
  const wrap = el("div", "table-wrap");
  const table = el("table"); table.id = "roster-table";
  table.innerHTML = `<thead><tr><th class="left">Slot</th><th class="left">Player</th><th class="left">Game</th><th>Proj</th><th>Pts</th></tr></thead>`;
  const tbody = el("tbody"); table.appendChild(tbody); wrap.appendChild(table); s.appendChild(wrap);
  const group = label => { const tr = el("tr", "group"); tr.innerHTML = `<td colspan="5">${label}</td>`; tbody.appendChild(tr); };
  const row = (p, cls) => {
    const tr = el("tr", cls);
    const player = el("td", "player"); player.appendChild(headshot(p)); player.appendChild(document.createTextNode(p.name));
    if (p.injury) player.appendChild(el("span", "injury-tag", p.injury));
    tr.appendChild(el("td", "slot", p.slot === "RB/WR/TE" ? "FLEX" : p.slot === "BE" ? "Bench" : p.slot));
    tr.appendChild(player);
    tr.appendChild(el("td", "meta", `${p.pro_team} ${p.position} · ${p.on_bye ? "BYE" : p.opponent ? "vs " + p.opponent : ""}`));
    tr.appendChild(el("td", "mut", pts(p.projected)));
    tr.appendChild(el("td", "pts", p.played ? pts(p.actual) : "—"));
    tbody.appendChild(tr);
  };
  group(`Lineup · ${pts(side.score)} pts · projected ${pts(side.projected_total)}`);
  (side.lineup || []).forEach(p => row(p, "starter"));
  const bench = (side.bench || []).filter(p => p.slot !== "IR"), ir = (side.bench || []).filter(p => p.slot === "IR");
  group("Bench"); bench.forEach(p => row(p, "bench"));
  if (ir.length) { group("IR"); ir.forEach(p => row(p, "ir")); }
  return s;
}

// ── position breakdown ──
function positionSection(team, teams, data, meta) {
  const s = section("position-section", "Points by position");
  const POS = ["QB", "RB", "WR", "TE", "FLEX", "D/ST", "K"];
  const weeks = data.position_scores_by_week.slice(0, meta.completed_weeks);
  const totals = t => Object.fromEntries(POS.map(p => [p, weeks.reduce((a, w) => a + ((w[t.abbrev] || {})[p] || 0), 0)]));
  const all = teams.map(t => ({ t, tot: totals(t) }));
  const mine = all.find(x => x.t.team_id === team.team_id).tot;
  const wrap = el("div", "table-wrap");
  const table = el("table"); table.id = "pos-table";
  table.innerHTML = `<thead><tr><th class="left">Pos</th><th>Points</th><th>Lg avg</th><th>Rank</th><th class="left">vs field</th></tr></thead>`;
  const tbody = el("tbody"); table.appendChild(tbody); wrap.appendChild(table); s.appendChild(wrap);
  for (const p of POS) {
    const vals = all.map(x => x.tot[p]);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length, max = Math.max(...vals);
    const rank = vals.filter(v => v > mine[p]).length + 1;
    const tr = el("tr");
    tr.innerHTML = `<td class="left"><b>${p}</b></td><td class="pts">${pts(mine[p])}</td><td class="mut">${pts(avg)}</td>
      <td class="${rank <= 6 ? "pos" : "neg"}">#${rank}</td>
      <td class="bar"><div class="bar-wrap"><div class="bar-fill" style="width:${max ? mine[p] / max * 100 : 0}%"></div><div class="bar-avg" style="left:${max ? avg / max * 100 : 0}%"></div></div></td>`;
    tbody.appendChild(tr);
  }
  s.appendChild(html("p", "footnote", "Green bar is this team; the gold tick is the league average."));
  return s;
}

// ── empty states ──
function pickerState(teams, weekFile, mode) {
  main.innerHTML = "";
  document.getElementById("page-title").textContent = mode === "index" ? "Teams" : "My Team";
  document.getElementById("subtitle").textContent = mode === "index" ? "Every team this season. Pick one." : "Pick your team once; the site remembers it.";
  if (mode === "index") {
    const s = section("index-section", null);
    const grid = el("div", "index-cards");
    const lit = resolveHighlight(teams.map(t => t.abbrev));
    teams.forEach((t, i) => {
      const a = el("a", `index-card${t.abbrev === lit ? " highlight" : ""}${i + 1 === 6 ? " cutoff" : ""}`);
      a.href = `team.html?manager=${t.managers[0].key}&variant=${variant}&weeks=${stubWeeks}`;
      const side = teamSide(weekFile, t.team_id);
      a.appendChild(el("span", "index-rank", `${t.rank}`));
      if (side && side.logo_url) { const img = el("img", "index-logo"); img.src = side.logo_url; img.alt = ""; a.appendChild(img); }
      const id = el("span", "index-id");
      id.appendChild(el("span", "index-name", t.team_name));
      id.appendChild(el("span", "index-mgr", t.managers.map(m => m.name).join(" & ")));
      a.appendChild(id);
      const norm = t.normalized_by_week[t.normalized_by_week.length - 1];
      a.appendChild(el("span", `index-norm ${norm >= 0 ? "pos" : "neg"}`, signed(norm)));
      grid.appendChild(a);
    });
    s.appendChild(grid); main.appendChild(s);
    return;
  }
  const s = section("empty-state", null);
  const card = el("div", "empty-card");
  card.appendChild(html("h2", null, "Which team is yours? 🏈"));
  card.appendChild(el("p", null, "Choosing here also highlights your team on the Standings and Scoreboard."));
  const grid = el("div", "picker");
  teams.forEach(t => {
    const a = el("a", "pick");
    a.href = `team.html?manager=${t.managers[0].key}&variant=${variant}&weeks=${stubWeeks}`;
    a.addEventListener("click", () => writeRemembered(t.abbrev));
    const side = teamSide(weekFile, t.team_id);
    if (side && side.logo_url) { const img = el("img", "pick-logo"); img.src = side.logo_url; img.alt = ""; a.appendChild(img); }
    const id = el("span"); id.appendChild(el("span", "pick-name", t.team_name)); id.appendChild(el("span", "pick-mgr", t.managers.map(m => m.name).join(" & ")));
    a.appendChild(id);
    grid.appendChild(a);
  });
  card.appendChild(grid); s.appendChild(card); main.appendChild(s);
}

// ── variants ──
function renderVariant(v, ctx) {
  const { team, teams, meta, data, side, weekFile } = ctx;
  main.innerHTML = "";
  main.appendChild(teamHeader(team, meta, side));
  if (v === "A") {
    main.appendChild(analyticsSection(team, meta, { footnote: "tile" }));
    main.appendChild(chartSection(teams, team, meta, "legend"));
    main.appendChild(weekTable(team, teams, meta, { grouping: true }));
    main.appendChild(rosterSection(side, weekFile));
    main.appendChild(positionSection(team, teams, data, meta));
  } else if (v === "B") {
    main.appendChild(chartSection(teams, team, meta, "solo"));
    main.appendChild(weekTable(team, teams, meta, { grouping: false }));
    main.appendChild(h2hSection(team, teams, weekFile));
    main.appendChild(analyticsSection(team, meta, { footnote: "page", hideConsistencyBefore: CONSISTENCY_MIN_WEEKS }));
    main.appendChild(rosterSection(side, weekFile));
    main.appendChild(positionSection(team, teams, data, meta));
    main.appendChild(el("p", "footnote-page", `Projection gap: ${FOOTNOTE}`));
  } else {
    const cols = el("div", "two-col");
    cols.appendChild(rosterSection(side, weekFile));
    const right = el("div");
    right.appendChild(positionSection(team, teams, data, meta));
    right.appendChild(analyticsSection(team, meta, { footnote: "marker", title: "Season analytics" }));
    cols.appendChild(right);
    main.appendChild(cols);
    main.appendChild(chartSection(teams, team, meta, "nolegend"));
    main.appendChild(weekTable(team, teams, meta, { grouping: false }));
    main.appendChild(h2hSection(team, teams, weekFile));
  }
}

// ── prototype bar ──
function setupBar(teams) {
  const keys = Object.keys(VARIANTS), i = keys.indexOf(variant);
  document.getElementById("proto-label").textContent = `${variant} · ${VARIANTS[variant]}`;
  const go = (patch) => {
    const url = new URL(location.href);
    for (const [k, val] of Object.entries(patch)) val ? url.searchParams.set(k, val) : url.searchParams.delete(k);
    location.href = url;
  };
  document.getElementById("proto-prev").onclick = () => go({ variant: keys[(i + keys.length - 1) % keys.length] });
  document.getElementById("proto-next").onclick = () => go({ variant: keys[(i + 1) % keys.length] });
  document.addEventListener("keydown", e => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft") document.getElementById("proto-prev").click();
    if (e.key === "ArrowRight") document.getElementById("proto-next").click();
  });
  const wk = document.getElementById("proto-weeks"); wk.value = String(stubWeeks);
  if (wk.value !== String(stubWeeks)) { const o = el("option", null, String(stubWeeks)); o.value = stubWeeks; wk.appendChild(o); wk.value = String(stubWeeks); }
  wk.onchange = () => go({ weeks: wk.value });
  const tm = document.getElementById("proto-team");
  teams.forEach(t => { const o = el("option", null, `${t.team_name} (${t.managers[0].key})`); o.value = t.managers[0].key; tm.appendChild(o); });
  tm.value = managerParam; tm.onchange = () => go({ manager: tm.value });
}

async function run() {
  let data, weekFile, week1;
  try {
    data = await loadJSON("data/league_data.json");
    const meta = data.metadata;
    const week = meta.week_files.includes(meta.current_week) ? meta.current_week : meta.week_files[meta.week_files.length - 1];
    weekFile = await loadJSON(`data/week_${week}.json`);
    // Third fetch, prototype only: the real week-1 opponents. Production gets
    // them from analytics.weeks[].opponent_team_id.
    week1 = week === 1 ? weekFile : await loadJSON("data/week_1.json").catch(() => null);
  } catch (e) {
    main.innerHTML = `<section><div class="empty-card"><h2>Couldn't load league data yet.</h2></div></section>`;
    return;
  }
  const meta = data.metadata;
  document.getElementById("updated").textContent = meta.updated_at ? `Updated ${meta.updated_at} · PROTOTYPE, analytics stubbed` : "";
  // Ticket 01's managers list does not exist in the data yet: derive it.
  data.teams.forEach(t => { t.abbrev = t.team_abbrev || t.abbrev || t.team_name; t.managers = [{ key: slug(t.owner), name: (t.owner || "").replace(/\s+/g, " ") }]; });
  stubAnalytics(data, week1, stubWeeks);
  const teams = data.teams;
  setupBar(teams);

  // Nav entry: A and C carry "My Team" (resolved through the highlight);
  // B carries "Teams" (the index).
  const nav = document.getElementById("nav-team");
  const lit = resolveHighlight(teams.map(t => t.abbrev));
  const litTeam = teams.find(t => t.abbrev === lit);
  if (variant === "B") { nav.textContent = "Teams"; nav.href = `team.html?variant=B&weeks=${stubWeeks}`; }
  else { nav.textContent = "My Team"; nav.href = litTeam ? `team.html?manager=${litTeam.managers[0].key}&variant=${variant}&weeks=${stubWeeks}` : `team.html?variant=${variant}&weeks=${stubWeeks}`; }

  const team = teams.find(t => t.managers.some(m => m.key === managerParam));
  if (!team) { pickerState(teams, weekFile, variant === "B" ? "index" : "picker"); return; }
  document.getElementById("page-title").textContent = team.team_name;
  document.getElementById("subtitle").textContent = `${meta.season} season · ${team.managers.map(m => m.name).join(" & ")} · ${meta.completed_weeks} counted week${meta.completed_weeks > 1 ? "s" : ""}`;
  const side = teamSide(weekFile, team.team_id);
  if (team.analytics.weeks.length === 0) { main.innerHTML = `<section><div class="empty-card"><h2>No counted weeks yet 🏈</h2><p>The page fills in once Week 1 is final.</p></div></section>`; return; }
  renderVariant(variant, { team, teams, meta, data, side, weekFile });
}
run();
