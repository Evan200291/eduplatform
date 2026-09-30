/* Prototype helpers: tiny HTML builders so every page is short and consistent. */
const PAGES = [];
const reg = (p) => PAGES.push(p);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tag = (t, tone = '') => `<span class="tag ${tone}">${t}</span>`;
const chip = (emoji, tint = 'var(--c-sunken)', cls = '') => `<span class="chip-ico ${cls}" style="--tint:${tint}">${emoji}</span>`;
const bar = (pct, cls = '', label = '') =>
  `${label ? `<div class="row" style="justify-content:space-between;font-weight:800"><span>${label}</span><span class="muted tabular">${pct}%</span></div>` : ''}<div class="bar ${cls}" role="progressbar" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
const btn = (label, cls = '', extra = '') => `<button class="btn ${cls}" ${extra}>${label}</button>`;
const card = (inner, cls = '', extra = '') => `<div class="card ${cls}" ${extra}>${inner}</div>`;
const cardHead = (title, right = '', sub = '') =>
  `<div class="card-title"><div><h3>${title}</h3>${sub ? `<p class="muted" style="font-size:.9em;margin-top:2px">${sub}</p>` : ''}</div>${right}</div>`;
const alertBox = (text, tone = '', ico = 'ℹ️') => `<div class="alert ${tone}"><span>${ico}</span><div>${text}</div></div>`;
const field = (label, control, hint = '', err = '') =>
  `<div class="field"><label>${label}</label>${control}${hint ? `<span class="hint">${hint}</span>` : ''}${err ? `<span class="err">${err}</span>` : ''}</div>`;
const input = (ph = '', val = '', cls = '') => `<input class="input ${cls}" placeholder="${esc(ph)}" value="${esc(val)}">`;
const select = (opts, sel = 0) => `<select class="select">${opts.map((o, i) => `<option ${i === sel ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
const textarea = (ph = '', val = '') => `<textarea class="textarea" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const check = (label, on = false) => `<div class="check ${on ? 'on' : ''}"><i>${on ? '✓' : ''}</i>${label}</div>`;
const sw = (on = false) => `<span class="switch ${on ? 'on' : ''}"></span>`;
const seg = (opts, on = 0) => `<div class="seg">${opts.map((o, i) => `<button class="${i === on ? 'on' : ''}">${o}</button>`).join('')}</div>`;
const tabs = (opts, on = 0) => `<div class="tabs">${opts.map((o, i) => `<a class="${i === on ? 'on' : ''}">${o}</a>`).join('')}</div>`;
const empty = (emoji, title, text, action = '') =>
  `<div class="empty">${emoji.startsWith('<svg') ? emoji : `<div style="font-size:54px">${emoji}</div>`}<h3>${title}</h3><p class="muted">${text}</p>${action}</div>`;
const modal = (title, body, footer = '', mid = false) =>
  `<div class="modal-back ${mid ? 'mid' : ''}"><div class="modal ${mid ? 'center' : ''}"><div class="row" style="justify-content:space-between"><h2>${title}</h2><button class="close-x" aria-label="Close">×</button></div>${body}${footer ? `<div class="row wrap" style="justify-content:flex-end;gap:10px">${footer}</div>` : ''}</div></div>`;
const kpi = (label, value, tone = '', note = '') =>
  card(`<div class="kpi"><span class="eyebrow">${label}</span><b style="${tone ? `color:${tone}` : ''}">${value}</b>${note ? `<span class="muted" style="font-size:.85em">${note}</span>` : ''}</div>`, 'flat');

/* table(columns, rows, opts): rows are arrays of HTML strings. */
function table(cols, rows, o = {}) {
  const head = `<tr>${cols.map((c) => `<th${c.startsWith('#') ? ' class="num"' : ''}>${c.replace(/^#/, '')}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr class="${o.click ? 'click' : ''}">${r.map((c, i) => `<td${cols[i].startsWith('#') ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap">${o.toolbar ? `<div class="toolbar">${o.toolbar}</div>` : ''}<table class="tbl" aria-label="${esc(o.caption || '')}"><thead>${head}</thead><tbody>${body}</tbody></table>${o.pager === false ? '' : `<div class="pager"><span>${o.pagerText || `Showing 1–${rows.length}`}</span><span class="row"><button class="btn sm white">Back</button><button class="btn sm white">Next</button></span></div>`}</div>`;
}
const pageHead = (title, desc = '', actions = '') =>
  `<div class="row wrap" style="justify-content:space-between;align-items:flex-start;gap:14px"><div><h1>${title}</h1>${desc ? `<p class="muted" style="margin-top:6px">${desc}</p>` : ''}</div><div class="row wrap">${actions}</div></div>`;
const person = (name, sub = '', tone = 'var(--c-grape)') =>
  `<div class="row"><span class="avatar sm" style="width:34px;height:34px;background:${tone};box-shadow:none;font-size:13px">${name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span><div><b>${name}</b>${sub ? `<div class="muted" style="font-size:.85em">${sub}</div>` : ''}</div></div>`;

/* ---------- chrome ---------- */
const SCHOOL = 'Northgate Academy';

const LEARNER_TABS = [
  ['home', '🏠', 'Home'], ['learn', '📚', 'Learn'], ['missions', '🚩', 'Missions'],
  ['buddy', '🦉', 'Buddy'], ['scores', '🏆', 'Top scores'], ['progress', '📈', 'My progress'],
];
function learnerFrame(active, inner, o = {}) {
  const top = `<div class="topbar"><span class="brand-dot">N</span><div class="grow"><b style="font-family:var(--font-display)">${SCHOOL}</b></div>
    <span class="stat-pill fire" title="Day streak">🔥 3</span><span class="stat-pill sun" title="Points">⭐ 120</span>
    <span style="position:relative;font-size:22px">🔔<i style="position:absolute;top:-2px;right:-4px;width:12px;height:12px;border-radius:50%;background:var(--c-bad);border:2px solid #fff"></i></span></div>`;
  const nav = `<nav class="tabbar" aria-label="Main">${LEARNER_TABS.map(([k, e, l]) => `<a class="${k === active ? 'on' : ''}"><span class="t-ico">${e}</span><span style="text-align:center;line-height:1.1">${l}</span></a>`).join('')}</nav>`;
  return `${o.noTop ? '' : top}<div class="screen">${inner}</div>${o.noNav ? '' : nav}`;
}

const NAV = {
  teacher: [
    ['', [['📊', 'Dashboard']]],
    ['My classes', [['🏫', 'Classes'], ['🧑‍🎓', 'Students']]],
    ['Teaching', [['🧭', 'Learning paths'], ['📝', 'Homework']]],
    ['Suggestions', [['✅', 'To approve']]],
    ['Insight', [['📈', 'Reports'], ['💬', 'Messages']]],
  ],
  admin: [
    ['', [['🏠', 'Overview']]],
    ['People', [['👥', 'Users'], ['🔑', 'Roles & access']]],
    ['School', [['🎓', 'Grades & classes'], ['📚', 'Curriculum'], ['🖼️', 'Media library'], ['📋', 'Assessment'], ['🎮', 'Rewards & buddy']]],
    ['Configuration', [['🎨', 'Branding'], ['🎚️', 'Features'], ['⚙️', 'Settings']]],
    ['Insight', [['📈', 'Analytics'], ['🧾', 'Subscription'], ['🛟', 'Support'], ['🚩', 'Moderation'], ['©️', 'Content ownership'], ['🔒', 'Privacy & consent'], ['🛡️', 'Audit & safety']]],
    ['Platform', [['🏢', 'Organizations'], ['🏫', 'Schools'], ['🤝', 'Agreements'], ['🌐', 'Operations']]],
  ],
};
function adultFrame(kind, activeLabel, inner, o = {}) {
  const top = `<div class="topbar"><span class="brand-dot">N</span><div class="grow"><b style="font-family:var(--font-display)">${SCHOOL}</b><div class="muted" style="font-size:12px">Northgate Trust</div></div>
    ${kind === 'admin' ? '<span class="tag blue">School admin</span>' : '<span class="tag grape">Teacher</span>'}<span style="font-size:20px">🔔</span>
    <span class="avatar" style="width:36px;height:36px;font-size:13px">${kind === 'admin' ? 'DW' : 'PR'}</span><b style="font-size:14px">${kind === 'admin' ? 'Daniel Whitfield' : 'Priya Raman'}</b></div>`;
  const side = `<aside class="side">${NAV[kind].map(([g, items]) => `${g ? `<div class="grp eyebrow">${g}</div>` : ''}${items.map(([e, l]) => `<a class="${l === activeLabel ? 'on' : ''}"><span>${e}</span>${l}</a>`).join('')}`).join('')}</aside>`;
  return `${top}<div class="body">${side}<main class="main">${inner}</main></div>${o.modal || ''}`;
}
const authFrame = (inner) => `<div class="screen" style="justify-content:center;align-items:center;background:var(--c-canvas)"><div style="width:100%;max-width:440px" class="stack">${inner}</div></div>`;
