"use strict";

const CATS = ["Drone/UAS purchases", "Parts and payloads", "Drone services", "R&D and grants", "Counter-UAS and robotics"];
const NOT = "Not drone related";
const DAY = 86400000;
const num = new Intl.NumberFormat("en-US");
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const D = (iso) => new Date(iso + "T00:00:00Z");
const fmtDate = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtShort = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const daysBetween = (a, b) => Math.round((D(a) - D(b)) / DAY);
const pct1 = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const catColor = (c) => `var(--c${Math.max(0, CATS.indexOf(c))})`;
const keyOf = (b) => (b.agency + "|" + b.title).toLowerCase();
const state = { cat: "", grp: "" };
let ctx = null;

// Only https links are ever rendered as links.
function link(url, text) {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  const a = el("a", "lnk", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const index = await getJSON("data/index.json");
  const snaps = index.snapshots;
  if (!snaps.length) throw new Error("No snapshots found in data/index.json");
  const want = new URLSearchParams(location.search).get("d");
  const i = Math.max(0, snaps.findIndex((s) => s.date === want));
  const prev = snaps[i + 1];
  const [data, prevData] = await Promise.all([
    getJSON("data/" + snaps[i].file),
    prev ? getJSON("data/" + prev.file).catch(() => null) : Promise.resolve(null),
  ]);
  ctx = build(data, prevData, snaps, i);
  renderAll();
}

// Derive everything the page shows from one snapshot.
function build(data, prevData, snaps, i) {
  const snap = data.snapshot_date;
  const rank = (b) => (!b.due ? 3 : b.due < snap ? 2 : 1);
  const drone = data.bids
    .filter((b) => b.category !== NOT)
    .map((b) => ({ ...b, daysLeft: b.due ? daysBetween(b.due, snap) : null }))
    .sort((a, b) => rank(a) - rank(b) || String(a.due).localeCompare(String(b.due)));
  const other = data.bids.filter((b) => b.category === NOT);
  const sum = (k) => data.reports.reduce((a, r) => a + r[k], 0);
  const prevKeys = prevData ? new Set(prevData.bids.filter((b) => b.category !== NOT).map(keyOf)) : null;
  const total = (dim) => (data.parts.find((p) => p.dimension === "total" && p.bucket === dim) || {}).count || 0;
  const dates = data.reports.map((r) => r.report_date).sort();
  return {
    data, snaps, i, snap, drone, other, prevKeys,
    listings: sum("listings"), partsListings: sum("parts"), otherListings: sum("other"),
    partsUnique: total("unique"),
    closing14: drone.filter((b) => b.due && b.due >= snap && daysBetween(b.due, snap) <= 14).length,
    range: dates.length ? (dates[0] === dates[dates.length - 1] ? fmtShort(dates[0]) : fmtShort(dates[0]) + " to " + fmtShort(dates[dates.length - 1])) : "",
  };
}

function renderAll() {
  const c = ctx;
  document.title = "GovBid | Drone bid watch | " + fmtShort(c.snap);
  $("takeaway").textContent =
    `${c.drone.length} of ${num.format(c.listings)} listings in the BidMatch reports for ${c.range} are drone related, and ${c.closing14} of those close within 14 days of the snapshot. ` +
    `${pct1(c.partsListings, c.listings)}% of all listings are spare-part buys for manned aircraft that the keyword profile also catches.`;
  $("meta").textContent = `Profile ${c.data.profile || ""} · snapshot taken ${fmtDate(c.snap)}`;
  renderSnapshotMenu();
  renderKpis();
  renderMix();
  renderCategoryMenu();
  renderDrone();
  renderTimeline();
  renderGroupMenu();
  renderOther();
  renderParts();
  renderCoverage();
  renderArchive();
}

function renderSnapshotMenu() {
  const sel = $("snap");
  sel.replaceChildren(...ctx.snaps.map((s, k) => new Option(fmtDate(s.date) + (k === 0 ? " (latest)" : ""), s.date)));
  sel.value = ctx.snap;
  sel.onchange = () => { location.search = sel.value === ctx.snaps[0].date ? "" : "?d=" + sel.value; };
}

function renderKpis() {
  const c = ctx;
  const fed = c.drone.filter((b) => b.level === "Federal").length;
  const tiles = [
    ["Listings reviewed", num.format(c.listings), "across all date-wise reports"],
    ["Drone related", c.drone.length, `Federal ${fed} · State and local ${c.drone.length - fed}`],
    ["Closing within 14 days", c.closing14, "drone related bids, from the snapshot date"],
    ["Other non-drone bids", num.format(c.otherListings), `${c.other.length} unique bids after removing repeats`],
    ["Manned-aircraft parts buys", num.format(c.partsListings), `${num.format(c.partsUnique)} unique solicitations`],
  ];
  $("kpis").replaceChildren(...tiles.map(([lab, val, cap]) => {
    const t = el("div", "tile");
    t.append(el("span", "lab", lab), el("span", "val", String(val)), el("span", "cap", cap));
    return t;
  }));
}

function renderMix() {
  const c = ctx;
  const items = [
    ["Drone related", c.drone.length, "var(--c0)"],
    ["Other non-drone", c.otherListings, "var(--c1)"],
    ["Manned-aircraft parts buys", c.partsListings, "var(--cmuted)"],
  ];
  const bar = el("div", "comp");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", "Share of listings: " + items.map(([l, n]) => `${l} ${n}`).join(", "));
  const legend = el("div", "legend");
  items.forEach(([label, n, color]) => {
    const seg = el("div", "seg");
    seg.style.flex = `${n} 1 0`;
    seg.style.background = color;
    seg.title = `${label}: ${num.format(n)} listings, ${pct1(n, c.listings)}%`;
    bar.append(seg);
    const it = el("span", "it");
    const sw = el("span", "sw");
    sw.style.background = color;
    it.append(sw, el("span", "", label), el("b", "n", num.format(n)), el("span", "muted", pct1(n, c.listings) + "%"));
    legend.append(it);
  });
  $("mix").replaceChildren(bar, legend);
}

// Horizontal bars built from plain HTML so they resize with the page.
function bars(host, rows) {
  host.replaceChildren();
  const max = Math.max(1, ...rows.map((r) => r.value));
  rows.forEach((r) => {
    const row = el(r.onClick ? "button" : "div", "brow");
    if (r.onClick) row.type = "button";
    const fill = el("span", "bf");
    fill.style.width = Math.max(0.6, (r.value / max) * 100) + "%";
    fill.style.background = r.color || "var(--c0)";
    if (r.dim) fill.style.opacity = 0.35;
    const track = el("span", "bt");
    track.append(fill);
    row.append(el("span", "bl", r.label), track, el("span", "bv", num.format(r.value)));
    if (r.tip) row.title = r.tip;
    if (r.onClick) row.addEventListener("click", r.onClick);
    host.append(row);
  });
}

function renderCategoryMenu() {
  const sel = $("cat");
  sel.replaceChildren(new Option("All categories", ""), ...CATS.map((c) => new Option(c, c)));
  sel.value = state.cat;
  sel.onchange = () => { state.cat = sel.value; renderCategoryMenu(); renderDrone(); };
}

function renderDrone() {
  const c = ctx;
  bars($("catbars"), CATS.map((cat) => {
    const rows = c.drone.filter((b) => b.category === cat);
    const fed = rows.filter((b) => b.level === "Federal").length;
    return {
      label: cat, value: rows.length, color: catColor(cat), dim: !!state.cat && state.cat !== cat,
      tip: `${cat}: ${rows.length} bids (${fed} federal, ${rows.length - fed} state or local). ${state.cat === cat ? "Click to show all" : "Click to filter"}`,
      onClick: () => { state.cat = state.cat === cat ? "" : cat; renderCategoryMenu(); renderDrone(); },
    };
  }));
  const rows = c.drone.filter((b) => !state.cat || b.category === state.cat);
  $("cards").replaceChildren(...(rows.length ? rows.map(card) : [el("p", "muted", "No bids in this category.")]));
}

function daysText(n) {
  if (n == null) return "No due date in the entry";
  if (n < 0) return "Date passed";
  if (n === 0) return "Due on the snapshot date";
  return n + (n === 1 ? " day left" : " days left");
}

function card(b) {
  const c = el("article", "card");
  const top = el("div", "top");
  const cat = el("span", "pill cat", b.category);
  cat.style.borderColor = catColor(b.category);
  top.append(cat, el("span", "pill", b.level));
  if (ctx.prevKeys && !ctx.prevKeys.has(keyOf(b))) top.append(el("span", "pill new", "New"));
  const when = el("div", "when");
  const cls = b.daysLeft == null || b.daysLeft < 0 ? "left passed" : b.daysLeft <= 7 ? "left urgent" : "left";
  when.append(el("span", cls, daysText(b.daysLeft)));
  if (b.due) when.append(el("span", "", "Due " + fmtDate(b.due)));
  top.append(when);
  const org = el("p", "org", b.agency + (b.location ? " · " + b.location : ""));
  const dl = el("dl");
  [["Set-aside", b.set_aside], ["NAICS", b.naics], ["Matched keywords", b.keywords], ["BidMatch report", b.report ? fmtShort(b.report) : ""]]
    .forEach(([k, v]) => dl.append(el("dt", "", k), el("dd", "", v || "Not stated")));
  const links = el("div", "links");
  [link(b.notice_url, "Notice"), link(b.bidmatch_url, "BidMatch entry")].filter(Boolean).forEach((a) => links.append(a));
  c.append(top, el("h3", "ttl", b.title), org, el("p", "note", b.note), dl, links);
  return c;
}

// Deadline timeline made of positioned HTML, so it works at any width.
function renderTimeline() {
  const c = ctx, host = $("timeline");
  host.replaceChildren();
  const bids = c.drone.filter((b) => b.due);
  if (!bids.length) { host.append(el("p", "muted", "No due dates to show.")); return; }
  const snapT = +D(c.snap), minT = snapT - 4 * DAY;
  const upcoming = bids.filter((b) => +D(b.due) >= minT).map((b) => +D(b.due));
  const maxT = (upcoming.length ? Math.max(...upcoming) : snapT + 30 * DAY) + 5 * DAY;
  const pos = (t) => Math.min(100, Math.max(0, ((t - minT) / (maxT - minT)) * 100));
  const span = (maxT - minT) / DAY;
  const narrow = host.clientWidth < 600;
  const step = (span <= 60 ? 7 : span <= 120 ? 14 : 30) * (narrow && span <= 60 ? 2 : 1);
  const ticks = [];
  for (let t = snapT + step * DAY; t <= maxT; t += step * DAY) ticks.push(t);

  const track = () => {
    const t = el("div", "tl-track");
    ticks.forEach((tk) => { const i = el("i", "tl-tick"); i.style.left = pos(tk) + "%"; t.append(i); });
    const s = el("i", "tl-snap"); s.style.left = pos(snapT) + "%"; t.append(s);
    return t;
  };
  const cats = [...new Set(bids.map((b) => b.category))];
  const chips = el("div", "chips");
  cats.forEach((cat) => {
    const it = el("span", "it"), sw = el("span", "sw");
    sw.style.background = catColor(cat);
    it.append(sw, document.createTextNode(cat));
    chips.append(it);
  });
  host.append(chips);

  const axis = el("div", "tl-row tl-axis");
  const at = track();
  const addLabel = (t, text, cls) => { const s = el("span", cls || "", text); s.style.left = pos(t) + "%"; at.append(s); };
  addLabel(snapT, "Snapshot " + fmtShort(c.snap), "snaplab");
  ticks.forEach((tk) => addLabel(tk, fmtShort(new Date(tk).toISOString().slice(0, 10))));
  axis.append(el("div", "tl-lab"), at);
  host.append(axis);

  bids.forEach((b) => {
    const row = el("div", "tl-row");
    const lab = el("div", "tl-lab", b.title);
    const tr = track();
    const passed = +D(b.due) < minT;
    const dot = el("i", "tl-dot" + (passed ? " hollow" : ""));
    dot.style.left = (passed ? 0 : pos(+D(b.due))) + "%";
    dot.style.borderColor = catColor(b.category);
    dot.style.background = catColor(b.category);
    tr.append(dot);
    if (passed) { const n = el("span", "tl-note", "passed " + fmtShort(b.due)); n.style.left = "0"; tr.append(n); }
    row.title = `${b.title}\n${b.category} · ${b.level}\nDue ${fmtDate(b.due)} · ${daysText(b.daysLeft)}`;
    row.append(lab, tr);
    host.append(row);
  });
}

function renderGroupMenu() {
  const groups = [...new Set(ctx.other.map((b) => b.group))].sort();
  const sel = $("grp");
  sel.replaceChildren(new Option("All groups", ""), ...groups.map((g) => new Option(g, g)));
  sel.value = groups.includes(state.grp) ? state.grp : "";
  sel.onchange = () => { state.grp = sel.value; renderOther(); };
}

function cell(tr, text, cls) {
  const td = el("td", cls || "", text);
  tr.append(td);
  return td;
}

function renderOther() {
  const rows = ctx.other
    .filter((b) => !state.grp || b.group === state.grp)
    .sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due).localeCompare(String(b.due)) || a.title.localeCompare(b.title));
  $("otherbody").replaceChildren(...rows.map((b) => {
    const tr = el("tr");
    cell(tr, b.group, "nw");
    const t = cell(tr, b.title, "wide");
    if (b.note) t.append(el("div", "muted", b.note));
    cell(tr, b.level, "nw");
    cell(tr, b.agency);
    cell(tr, b.due ? fmtDate(b.due) : "—", "nw");
    cell(tr, b.set_aside, "nw");
    cell(tr, b.report ? fmtShort(b.report) : "", "nw");
    const l = cell(tr, "", "nw");
    const a = link(b.bidmatch_url, "Open");
    if (a) l.append(a);
    return tr;
  }));
}

function renderParts() {
  const c = ctx, parts = c.data.parts;
  $("partsdesc").textContent =
    `Mostly Defense Logistics Agency spare-part buys for manned military aircraft, caught by the FSC 1560 and 1680 codes. Shown as counts only. ` +
    `${num.format(c.partsListings)} listings collapse to ${num.format(c.partsUnique)} unique solicitations because many appear in two feeds.`;
  const dimRows = (dim) => parts.filter((p) => p.dimension === dim).sort((a, b) => a.order - b.order);
  const toBars = (rows) => {
    const total = rows.reduce((a, r) => a + r.count, 0);
    return rows.map((r) => ({ label: r.label, value: r.count, tip: `${r.label}: ${r.count} unique solicitations (${pct1(r.count, total)}%)` }));
  };
  // Group due dates by the Monday of their week.
  const mondayOf = (iso) => { const d = D(iso); return new Date(+d - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };
  const weeks = new Map();
  dimRows("due_date").forEach((p) => {
    const k = p.bucket === "none" ? "none" : mondayOf(p.bucket);
    weeks.set(k, (weeks.get(k) || 0) + p.count);
  });
  const weekRows = [...weeks].sort((a, b) => (a[0] === "none") - (b[0] === "none") || a[0].localeCompare(b[0]))
    .map(([k, n]) => ({ label: k === "none" ? "No due date in the entry" : "Week of " + fmtShort(k), count: n }));
  bars($("p-weeks"), toBars(weekRows));
  bars($("p-sa"), toBars(dimRows("set_aside")));
  bars($("p-fsc"), toBars(dimRows("fsc")));
  bars($("p-feed"), toBars(dimRows("feed")));
}

function renderCoverage() {
  $("reportbody").replaceChildren(...ctx.data.reports.slice().sort((a, b) => b.report_date.localeCompare(a.report_date)).map((r) => {
    const tr = el("tr");
    cell(tr, r.label, "nw");
    [r.listings, r.drone, r.other, r.parts].forEach((v) => cell(tr, num.format(v), "num"));
    const l = cell(tr, "", "nw");
    const a = link(r.report_url, "Open report");
    if (a) l.append(a);
    return tr;
  }));
}

function renderArchive() {
  $("archivebody").replaceChildren(...ctx.snaps.map((s, k) => {
    const tr = el("tr", s.date === ctx.snap ? "current" : "");
    cell(tr, fmtDate(s.date) + (k === 0 ? " (latest)" : ""), "nw");
    [s.listings, s.drone, s.closing14, s.other, s.parts].forEach((v) => cell(tr, num.format(v), "num"));
    const l = cell(tr, "", "nw");
    const a = el("a", "lnk", s.date === ctx.snap ? "Viewing" : "Open");
    if (s.date !== ctx.snap) a.href = k === 0 ? "./" : "?d=" + s.date;
    l.append(a);
    return tr;
  }));
}

main().catch((err) => {
  $("takeaway").textContent = "Could not load the snapshot data. " + err.message;
});
