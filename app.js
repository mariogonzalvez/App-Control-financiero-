'use strict';

/* =========================================================
   Control Financiero — todo se guarda en este dispositivo
   ========================================================= */

const STORAGE_KEY = 'cf-data-v1';
const APP_VERSION = '4';
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER_COLOR = '#7d8aa5';
const FIXED_COLOR = '#5f7bb0';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const ymOf = iso => iso.slice(0, 7);
const curYM = () => ymOf(todayISO());
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function daysIn(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
}

/* Formato español: 1.234,56 € */
function fmt(n, { sign = false, decimals = 2 } = {}) {
  const v = round2(Number(n) || 0);
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = decimals ? `${grouped},${dec}` : grouped;
  const pre = neg ? '−' : (sign && v > 0 ? '+' : '');
  return `${pre}${s} €`;
}
function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',')} mil`;
  return String(Math.round(n));
}
function fmtPct(n) {
  return `${String(round2(n)).replace('.', ',')} %`;
}
/* Acepta 12,5 · 12.50 · 1.234,56 · 1234.56 */
function parseAmount(s) {
  s = String(s ?? '').trim().replace(/[\s€ ]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : NaN;
}
function amountToInput(n) {
  return n ? String(round2(n)).replace('.', ',') : '';
}
function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function fmtMonthShort(ym) {
  const [, m] = ym.split('-').map(Number);
  return MONTHS_SHORT[m - 1];
}
function fmtDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Hoy';
  if (iso === addDays(t, -1)) return 'Ayer';
  if (iso === addDays(t, 1)) return 'Mañana';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' });
  return `${wd} ${d} ${MONTHS_SHORT[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
}

/* ---------- Datos ---------- */
function defaultCategories() {
  const c = (name, pct, kind, color) => ({ id: uid(), name, pct, kind, color });
  return [
    c('Comida (nevera)', 25, 'normal', PALETTE[0]),
    c('Gasolina / transporte', 8, 'normal', PALETTE[1]),
    c('Salud y cuidado personal', 5, 'normal', PALETTE[2]),
    c('Restauración / comidas fuera', 8, 'normal', PALETTE[3]),
    c('Ropa y colonias', 7, 'normal', PALETTE[4]),
    c('Ocio', 5, 'normal', PALETTE[5]),
    c('Ahorro', 20, 'ahorro', PALETTE[6]),
    c('Inversión', 22, 'inversion', PALETTE[7]),
  ];
}
function defaultRecurring(start) {
  return [
    ['Coche', 251], ['Gimnasio', 27], ['Móvil', 32], ['Preparador', 110],
    ['iCloud', 10], ['Claude', 22], ['Harbiz', 28], ['Imprevistos', 30],
  ].map(([name, amount]) => ({ id: uid(), name, amount, day: 1, start }));
}
function defaultState() {
  return {
    v: 1,
    setup: false,
    setupDate: null,
    initial: { cuenta: 0, efectivo: 0 },
    movements: [],
    recurring: [],
    categories: defaultCategories(),
    investment: { value: 0, updatedAt: null },
    applied: {},
    imported: [],
    snapshots: {},
    lastYM: null,
    pendingClose: null,
    lastCat: null,
  };
}

let S = load();
const UI = { tab: 'inicio', acc: 'cuenta', viewYM: curYM(), listLimit: 25, donutSel: null, barsN: 12 };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* datos corruptos o almacenamiento bloqueado */ }
  return defaultState();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
  catch (e) { toast('No se han podido guardar los datos en el dispositivo', 'bad'); }
}

/* ---------- Cálculos ---------- */
const catById = id => S.categories.find(c => c.id === id);
const spendCats = () => S.categories.filter(c => c.kind === 'normal');
const invCat = () => S.categories.find(c => c.kind === 'inversion');
const pctTotal = cats => round2(sum(cats, c => Number(c.pct) || 0));
const fixedTotal = () => round2(sum(S.recurring, r => r.amount));
const setupYM = () => (S.setupDate ? ymOf(S.setupDate) : curYM());

function balances() {
  const b = { cuenta: Number(S.initial.cuenta) || 0, efectivo: Number(S.initial.efectivo) || 0 };
  const t = todayISO();
  for (const m of S.movements) {
    if (m.date > t) continue; // previsto: aún no ha ocurrido
    const a = Number(m.amount) || 0;
    if (m.type === 'ingreso') b[m.account] += a;
    else if (m.type === 'traspaso') { b[m.account] -= a; b[m.to] += a; }
    else b[m.account] -= a; // gasto, fijo, aportacion
  }
  b.cuenta = round2(b.cuenta);
  b.efectivo = round2(b.efectivo);
  b.total = round2(b.cuenta + b.efectivo);
  return b;
}

/* Delta de un movimiento sobre una cuenta concreta */
function deltaFor(m, acc) {
  if (m.type === 'ingreso') return m.account === acc ? m.amount : 0;
  if (m.type === 'traspaso') return m.account === acc ? -m.amount : (m.to === acc ? m.amount : 0);
  return m.account === acc ? -m.amount : 0;
}

function snapshotConfig() {
  return {
    cats: S.categories.map(c => ({ id: c.id, name: c.name, pct: c.pct, kind: c.kind, color: c.color })),
    fixedTotal: fixedTotal(),
  };
}
function monthConfig(ym) {
  return (ym < curYM() && S.snapshots[ym]) || snapshotConfig();
}

function monthStats(ym) {
  const cfg = monthConfig(ym);
  const ms = S.movements.filter(m => ymOf(m.date) === ym);
  const income = round2(sum(ms.filter(m => m.type === 'ingreso'), m => m.amount));
  const fixedPaid = round2(sum(ms.filter(m => m.type === 'fijo'), m => m.amount));
  const gastos = ms.filter(m => m.type === 'gasto');
  const spent = round2(sum(gastos, m => m.amount));
  const aport = round2(sum(ms.filter(m => m.type === 'aportacion'), m => m.amount));
  const disponible = round2(income - cfg.fixedTotal);
  const base = Math.max(0, disponible);
  const knownIds = new Set(cfg.cats.map(c => c.id));
  const cats = cfg.cats.map(c => {
    const limit = round2(base * (Number(c.pct) || 0) / 100);
    let used = 0;
    if (c.kind === 'normal') used = sum(gastos.filter(m => m.categoryId === c.id), m => m.amount);
    if (c.kind === 'inversion') used = aport;
    used = round2(used);
    return { ...c, limit, spent: used, left: round2(limit - used), ratio: limit > 0 ? used / limit : (used > 0 ? Infinity : 0) };
  });
  const orphan = round2(sum(gastos.filter(m => !knownIds.has(m.categoryId)), m => m.amount));
  const saved = round2(disponible - spent - aport);
  return { ym, cfg, ms, income, fixedTotal: cfg.fixedTotal, fixedPaid, spent, aport, disponible, cats, orphan, saved, pct: pctTotal(cfg.cats) };
}

function levelOf(ratio) {
  if (ratio > 1) return 'bad';
  if (ratio >= 0.8) return 'warn';
  return '';
}

/* ---------- Automatismos: gastos fijos y cambio de mes ---------- */
function applyRecurring() {
  if (!S.setup) return false;
  const t = todayISO();
  const cur = curYM();
  let changed = false;
  for (const r of S.recurring) {
    let ym = ymOf(r.start);
    while (ym <= cur) {
      const date = `${ym}-${pad(Math.min(Number(r.day) || 1, daysIn(ym)))}`;
      const key = `${r.id}|${ym}`;
      if (date >= r.start && date <= t && !S.applied[key]) {
        S.movements.push({ id: uid(), type: 'fijo', amount: round2(r.amount), date, account: 'cuenta', note: r.name, recurringId: r.id, createdAt: Date.now() });
        S.applied[key] = 1;
        changed = true;
      }
      ym = addMonths(ym, 1);
    }
  }
  return changed;
}

function rollMonth() {
  if (!S.setup) return false;
  const cur = curYM();
  if (!S.lastYM) { S.lastYM = cur; return true; }
  if (S.lastYM >= cur) return false;
  let ym = S.lastYM;
  while (ym < cur) {
    if (!S.snapshots[ym]) S.snapshots[ym] = snapshotConfig();
    ym = addMonths(ym, 1);
  }
  const prev = addMonths(cur, -1);
  if (prev >= setupYM()) S.pendingClose = prev;
  S.lastYM = cur;
  return true;
}

function tick() {
  const a = rollMonth();
  const b = applyRecurring();
  if (a || b) { save(); return true; }
  return false;
}

/* ---------- Avisos ---------- */
let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.className = kind;
  el.innerHTML = msg;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'bad' || kind === 'warn' ? 4800 : 2600);
}
$('#toast').addEventListener('click', () => $('#toast').classList.remove('show'));

/* Aviso de límite al registrar un gasto/aportación */
function limitWarning(catId, ym, before) {
  const st = monthStats(ym);
  const c = st.cats.find(x => x.id === catId);
  if (!c) return false;
  if (c.limit <= 0 && c.spent > 0) {
    toast(`⚠️ <b>${esc(c.name)}</b> no tiene presupuesto este mes (aún no hay ingresos registrados).`, 'warn');
    return true;
  }
  if (c.spent > c.limit) {
    const over = fmt(c.spent - c.limit);
    toast(before <= c.limit
      ? `🚨 Has superado el límite de <b>${esc(c.name)}</b> en ${over}.`
      : `🚨 Sigues por encima del límite de <b>${esc(c.name)}</b> (${over} de más).`, 'bad');
    return true;
  }
  if (c.ratio >= 0.8 && before < c.limit * 0.8) {
    toast(`🟠 Llevas el ${Math.round(c.ratio * 100)}&nbsp;% de <b>${esc(c.name)}</b>. Te quedan ${fmt(c.left)}.`, 'warn');
    return true;
  }
  return false;
}
function spentInCat(catId, ym) {
  const c = monthStats(ym).cats.find(x => x.id === catId);
  return c ? c.spent : 0;
}

/* ---------- Iconos ---------- */
const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  trend: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v6M9 14l3 3 3-3"/></svg>',
};

/* ---------- Movimientos: presentación ---------- */
function mvInfo(m) {
  const accName = a => (a === 'efectivo' ? 'Efectivo' : 'Cuenta');
  switch (m.type) {
    case 'gasto': {
      const c = catById(m.categoryId);
      return { title: c ? c.name : 'Otros', sub: [m.note, accName(m.account)], color: c ? c.color : OTHER_COLOR, ico: esc((c ? c.name : 'O').charAt(0)) };
    }
    case 'ingreso':
      return { title: m.note || 'Ingreso', sub: ['Ingreso', accName(m.account)], color: '#3DDC97', ico: ICON.plus };
    case 'traspaso':
      return { title: 'Traspaso', sub: [`${accName(m.account)} → ${accName(m.to)}`, m.note], color: '#8FB3FF', ico: ICON.swap };
    case 'fijo':
      return { title: m.note || 'Gasto fijo', sub: ['Gasto fijo', 'Cuenta'], color: '#8FB3FF', ico: ICON.repeat };
    case 'aportacion':
      return { title: 'Aportación a inversión', sub: [m.note, 'Cuenta'], color: invCat()?.color || PALETTE[7], ico: ICON.trend };
  }
  return { title: '?', sub: [], color: OTHER_COLOR, ico: '?' };
}
function sortMv(list) {
  return list.slice().sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
}
function mvRow(m, acc) {
  const i = mvInfo(m);
  if (m.date > todayISO()) i.sub.unshift('Previsto');
  let amt;
  if (acc) amt = deltaFor(m, acc);
  else amt = m.type === 'ingreso' ? m.amount : m.type === 'traspaso' ? null : -m.amount;
  const amtHtml = amt === null ? fmt(m.amount) : fmt(amt, { sign: true });
  return `<button class="mv" data-mv="${m.id}">
    <span class="mv-ico" style="color:${i.color};background:${i.color}1f">${i.ico}</span>
    <span class="mv-main"><div class="mv-title">${esc(i.title)}</div><div class="mv-sub">${i.sub.filter(Boolean).map(esc).join(' · ')}</div></span>
    <span class="mv-amt num ${amt > 0 ? 'pos' : ''}">${amtHtml}</span>
  </button>`;
}
function mvList(list, acc, limit = Infinity) {
  if (!list.length) return '<div class="empty">Sin movimientos todavía</div>';
  const sorted = sortMv(list).slice(0, limit);
  let html = '', day = null;
  for (const m of sorted) {
    if (m.date !== day) {
      if (day !== null) html += '</div>';
      day = m.date;
      html += `<div class="mv-group"><div class="mv-day">${esc(fmtDay(day))}</div>`;
    }
    html += mvRow(m, acc);
  }
  return html + '</div>';
}
function bindMvClicks(root) {
  $$('[data-mv]', root).forEach(b => b.addEventListener('click', () => {
    const m = S.movements.find(x => x.id === b.dataset.mv);
    if (m) openMovementForm(m.type, m);
  }));
}

/* ---------- Animación de números ---------- */
const lastShown = {};
function countUp(el, key, to) {
  const from = lastShown[key] ?? to;
  lastShown[key] = to;
  if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 650;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function animateBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.bar > i[data-w]', root).forEach(i => { i.style.width = i.dataset.w; });
  }));
}
function barHtml(ratio, cls = '') {
  const w = Math.max(0, Math.min(1, ratio || 0)) * 100;
  const lvl = cls || levelOf(ratio);
  return `<div class="bar"><i class="${lvl}" data-w="${w.toFixed(1)}%"></i></div>`;
}

/* =========================================================
   Vistas
   ========================================================= */
const view = $('#view');

function render() {
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === UI.tab));
  $('#tabbar').style.display = S.setup ? '' : 'none';
  $('.topbar').style.display = S.setup ? '' : 'none';
  const old = $('.actionbar');
  if (old) old.remove();
  view.classList.remove('has-actionbar');
  if (!S.setup) return renderWelcome();
  ({ inicio: renderHome, mes: renderMonth, inversion: renderInvestment, graficas: renderCharts, ajustes: renderSettings }[UI.tab])();
  animateBars(view);
}

function go(tab) {
  if (UI.tab !== tab) {
    UI.tab = tab;
    UI.listLimit = 25;
    render();
    view.scrollTop = 0;
  }
}
$$('#tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

/* ---------- Bienvenida (primera vez) ---------- */
function renderWelcome() {
  view.innerHTML = `<div class="welcome">
    <img src="icons/logo.svg" class="logo" alt="">
    <h1>Control Financiero</h1>
    <p>Para empezar, dime cuánto dinero tienes ahora mismo.</p>
    <div class="field"><label for="w-cuenta">Saldo en cuenta</label><input id="w-cuenta" class="input num" inputmode="decimal" placeholder="0,00 €" autocomplete="off"></div>
    <div class="field"><label for="w-efectivo">Efectivo</label><input id="w-efectivo" class="input num" inputmode="decimal" placeholder="0,00 €" autocomplete="off"></div>
    <div class="infobox">Ya tienes cargados tus gastos fijos (510&nbsp;€ al mes, todos el día 1) y el reparto por categorías. Puedes cambiarlos cuando quieras en <b>Ajustes</b>.</div>
    <button class="btn btn-primary btn-block" id="w-go" style="margin-top:18px">Empezar</button>
  </div>`;
  $('#w-go').addEventListener('click', () => {
    const c = parseAmount($('#w-cuenta').value || '0');
    const e = parseAmount($('#w-efectivo').value || '0');
    if (Number.isNaN(c) || Number.isNaN(e)) return toast('Revisa las cantidades', 'warn');
    const t = todayISO();
    S.setup = true;
    S.setupDate = t;
    S.initial = { cuenta: c, efectivo: e };
    // Solo se cobran automáticamente los fijos a partir de mañana: el saldo inicial ya refleja los anteriores.
    S.recurring = defaultRecurring(addDays(t, 1));
    S.lastYM = curYM();
    save();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    render();
    toast('¡Listo! Ya puedes registrar tus movimientos', 'ok');
  });
}

/* ---------- Inicio ---------- */
function renderHome() {
  const b = balances();
  const st = monthStats(curYM());
  const accMv = S.movements.filter(m => m.account === UI.acc || m.to === UI.acc);
  const cats = st.cats.filter(c => c.kind !== 'ahorro');
  view.innerHTML = `
    <section class="hero">
      <div class="hero-label">DINERO TOTAL</div>
      <div class="hero-amount num ${b.total < 0 ? 'neg' : ''}" id="h-total">${fmt(b.total)}</div>
      <div class="hero-sub num">Cuenta ${fmt(b.cuenta)} · Efectivo ${fmt(b.efectivo)}</div>
    </section>

    <div class="card">
      <div class="seg" id="acc-seg">
        <span class="thumb"></span>
        <button data-acc="cuenta" class="${UI.acc === 'cuenta' ? 'on' : ''}">Cuenta</button>
        <button data-acc="efectivo" class="${UI.acc === 'efectivo' ? 'on' : ''}">Efectivo</button>
      </div>
      <div class="acc-balance"><span class="muted">Saldo</span><span class="v num" id="h-acc">${fmt(b[UI.acc])}</span></div>
      <div id="acc-list">${mvList(accMv, UI.acc, UI.listLimit)}</div>
      ${accMv.length > UI.listLimit ? '<button class="btn btn-ghost btn-block btn-small" id="more" style="margin-top:10px">Ver más</button>' : ''}
    </div>

    <button class="chip-import" id="imp">${ICON.paste}<span>Importar gasto desde el atajo de iPhone</span></button>

    <div class="card">
      <div class="card-title"><span>Este mes · te queda</span><button class="link" id="to-month">Ver reparto</button></div>
      ${st.income <= 0 ? `<div class="infobox" style="margin:0 0 12px">Registra tus ingresos de ${MONTHS[Number(curYM().slice(5)) - 1]} para calcular los límites de cada categoría.</div>` : ''}
      <div class="mini-grid">
        ${cats.map(c => `<button class="mini" data-cat="${c.id}">
          <div class="n"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)}</span></div>
          <div class="v num ${levelOf(c.ratio)}">${fmt(c.left)}</div>
          ${barHtml(c.ratio)}
        </button>`).join('')}
      </div>
    </div>`;

  addActionBar();

  countUp($('#h-total'), 'total', b.total);
  countUp($('#h-acc'), 'acc-' + UI.acc, b[UI.acc]);
  placeThumb($('#acc-seg'));
  $$('#acc-seg button').forEach(btn => btn.addEventListener('click', () => {
    if (UI.acc === btn.dataset.acc) return;
    UI.acc = btn.dataset.acc;
    UI.listLimit = 25;
    renderHome();
    animateBars(view);
  }));
  bindMvClicks(view);
  $('#more')?.addEventListener('click', () => { UI.listLimit += 50; renderHome(); animateBars(view); });
  $('#to-month').addEventListener('click', () => { UI.viewYM = curYM(); go('mes'); });
  $$('[data-cat]', view).forEach(el => el.addEventListener('click', () => {
    const c = catById(el.dataset.cat);
    if (c && c.kind === 'inversion') return go('inversion');
    openMovementForm('gasto', null, { categoryId: el.dataset.cat });
  }));
  $('#imp').addEventListener('click', importFromClipboard);
}
/* Botones fijos abajo. En la vista Mes, la fecha propuesta es la del mes que estás viendo. */
function addActionBar(ym = null) {
  $$('.actionbar').forEach(el => el.remove());
  view.classList.add('has-actionbar');
  const bar = document.createElement('div');
  bar.className = 'actionbar';
  bar.innerHTML = `<button class="btn btn-primary" data-new="gasto">+ Gasto</button>
    <button class="btn" data-new="ingreso">+ Ingreso</button>
    <button class="btn" data-new="traspaso">Traspaso</button>`;
  $('#app').appendChild(bar);
  document.documentElement.style.setProperty('--tabbar-h', $('#tabbar').offsetHeight + 'px');
  $$('[data-new]', bar).forEach(b => b.addEventListener('click', () => {
    openMovementForm(b.dataset.new, null, ym ? { date: defaultDateFor(ym) } : {});
  }));
}
function defaultDateFor(ym) {
  const cur = curYM();
  if (ym === cur) return todayISO();
  if (ym > cur) return `${ym}-01`;
  return `${ym}-${pad(daysIn(ym))}`;
}
function placeThumb(seg) {
  const on = $('button.on', seg);
  const th = $('.thumb', seg);
  if (!on || !th) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 4}px)`;
}

/* ---------- Mes (reparto, cierre y movimientos) ---------- */
const MAX_AHEAD = 12;
function monthSelector() {
  const min = setupYM(), cur = curYM(), max = addMonths(cur, MAX_AHEAD);
  const label = UI.viewYM === cur ? 'Mes en curso' : UI.viewYM < cur ? 'Mes cerrado' : 'Previsión';
  return `<div class="monthsel">
    <button id="m-prev" ${UI.viewYM <= min ? 'disabled' : ''} aria-label="Mes anterior">${ICON.left}</button>
    <div class="m">${fmtMonth(UI.viewYM)}<small>${label}</small></div>
    <button id="m-next" ${UI.viewYM >= max ? 'disabled' : ''} aria-label="Mes siguiente">${ICON.right}</button>
  </div>`;
}
function bindMonthSelector(rerender) {
  $('#m-prev')?.addEventListener('click', () => { UI.viewYM = addMonths(UI.viewYM, -1); UI.donutSel = null; rerender(); animateBars(view); });
  $('#m-next')?.addEventListener('click', () => { UI.viewYM = addMonths(UI.viewYM, 1); UI.donutSel = null; rerender(); animateBars(view); });
}

function catRows(st) {
  return st.cats.map(c => {
    if (c.kind === 'ahorro') {
      return `<div class="cat"><div class="cat-head"><span class="cat-name"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)} · ${fmtPct(c.pct)}</span></span><span class="cat-rest num" style="color:var(--good)">${fmt(c.limit)}</span></div>
        <div class="cat-meta"><span>Se queda en tu cuenta</span><span>+ lo que sobre del resto</span></div>${barHtml(1, 'save')}</div>`;
    }
    const lvl = levelOf(c.ratio);
    return `<div class="cat"><div class="cat-head"><span class="cat-name"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)} · ${fmtPct(c.pct)}</span></span><span class="cat-rest num ${lvl}">${fmt(c.left)}</span></div>
      <div class="cat-meta num"><span>${c.kind === 'inversion' ? 'Aportado' : 'Gastado'} ${fmt(c.spent)} de ${fmt(c.limit)}</span><span>${c.limit > 0 ? Math.round(c.ratio * 100) + ' %' : ''}</span></div>${barHtml(c.ratio)}</div>`;
  }).join('') + (st.orphan > 0 ? `<div class="cat"><div class="cat-head"><span class="cat-name"><span class="dot" style="background:${OTHER_COLOR}"></span><span>Otros (categorías eliminadas)</span></span><span class="cat-rest num">−${fmt(st.orphan)}</span></div></div>` : '');
}

function closureCard(st, withTitle = true) {
  const spentCats = st.cats.filter(c => c.kind === 'normal');
  return `<div class="card" ${withTitle ? '' : 'style="margin-top:6px"'}>
    ${withTitle ? `<div class="card-title"><span>Cierre de ${MONTHS[Number(st.ym.slice(5)) - 1]}</span></div>` : ''}
    <div class="stats">
      <div class="stat"><div class="l">Ingresado</div><div class="v num pos">${fmt(st.income)}</div></div>
      <div class="stat"><div class="l">Gastos fijos</div><div class="v num">${fmt(st.fixedTotal)}</div></div>
      <div class="stat"><div class="l">Gastado (categorías)</div><div class="v num">${fmt(st.spent)}</div></div>
      <div class="stat"><div class="l">Invertido</div><div class="v num">${fmt(st.aport)}</div></div>
      <div class="stat wide accent"><div class="l">Ahorrado este mes</div><div class="v num ${st.saved >= 0 ? 'pos' : 'neg'}">${fmt(st.saved)}</div>
        <div class="small dim" style="margin-top:4px">Ahorro previsto + lo que sobró de cada categoría</div></div>
    </div>
    <div style="margin-top:12px">
      ${spentCats.map(c => `<div class="list-row"><span class="dot" style="background:${c.color}"></span><span class="t">${esc(c.name)}<small class="num">Límite ${fmt(c.limit)}</small></span><span class="r num ${c.left < 0 ? 'neg' : ''}" style="color:${c.left < 0 ? 'var(--bad)' : 'var(--good)'}">${c.left < 0 ? 'Pasado ' + fmt(-c.left) : 'Sobró ' + fmt(c.left)}</span></div>`).join('')}
    </div>
  </div>`;
}

function renderMonth() {
  const st = monthStats(UI.viewYM);
  const isCur = UI.viewYM === curYM();
  const isFuture = UI.viewYM > curYM();
  const mName = MONTHS[Number(UI.viewYM.slice(5)) - 1];
  view.innerHTML = `
    ${monthSelector()}
    ${isFuture ? `<div class="infobox">Estás planificando <b>${mName}</b>. Apunta ya los ingresos y gastos que sabes que tendrás: se calculan los límites, pero <b>no cambian tu saldo</b> hasta que llegue su fecha.</div>` : ''}
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="l">Ingresos</div><div class="v num pos">${fmt(st.income)}</div></div>
        <div class="stat"><div class="l">Gastos fijos</div><div class="v num">${fmt(st.fixedTotal)}</div></div>
        <div class="stat wide accent"><div class="l">Disponible para repartir</div><div class="v num ${st.disponible < 0 ? 'neg' : ''}">${fmt(st.disponible)}</div></div>
      </div>
      ${st.disponible < 0 ? '<div class="warnbox">Los ingresos de este mes todavía no cubren los gastos fijos.</div>' : ''}
      ${st.pct !== 100 ? `<div class="warnbox">⚠️ Los porcentajes suman ${fmtPct(st.pct)}, no 100&nbsp;%. Corrígelos en Ajustes.</div>` : ''}
    </div>
    <div class="card">
      <div class="card-title"><span>Reparto</span>${isCur || isFuture ? `<span class="small dim num">Ahorro estimado ${fmt(st.saved)}</span>` : ''}</div>
      ${catRows(st)}
    </div>
    ${!isCur && !isFuture ? closureCard(st) : ''}
    <div class="card">
      <div class="card-title"><span>Movimientos</span><span class="small dim">${st.ms.length}</span></div>
      ${mvList(st.ms, null, UI.listLimit)}
      ${st.ms.length > UI.listLimit ? '<button class="btn btn-ghost btn-block btn-small" id="more" style="margin-top:10px">Ver más</button>' : ''}
    </div>`;
  addActionBar(UI.viewYM);
  bindMonthSelector(renderMonth);
  bindMvClicks(view);
  $('#more')?.addEventListener('click', () => { UI.listLimit += 50; renderMonth(); animateBars(view); });
}

/* ---------- Inversión ---------- */
function renderInvestment() {
  const st = monthStats(curYM());
  const ic = st.cats.find(c => c.kind === 'inversion');
  const aports = S.movements.filter(m => m.type === 'aportacion');
  const totalAport = round2(sum(aports, m => m.amount));
  const upd = S.investment.updatedAt ? new Date(S.investment.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  view.innerHTML = `
    <section class="hero">
      <div class="hero-label">VALOR INVERTIDO</div>
      <div class="hero-amount num" id="i-val">${fmt(S.investment.value)}</div>
      <div class="hero-sub">${upd ? 'Actualizado el ' + upd : 'Aún no has indicado el valor'} · No suma al dinero total</div>
    </section>
    <div class="row2" style="margin-top:8px">
      <button class="btn btn-primary" id="i-aport">+ Aportación</button>
      <button class="btn" id="i-upd">Actualizar valor</button>
    </div>
    ${ic ? `<div class="card">
      <div class="card-title"><span>Este mes · ${fmtPct(ic.pct)}</span></div>
      <div class="cat-head"><span class="muted num">Aportado ${fmt(ic.spent)} de ${fmt(ic.limit)}</span><span class="cat-rest num ${levelOf(ic.ratio)}">${fmt(ic.left)}</span></div>
      ${barHtml(ic.ratio)}
    </div>` : ''}
    <div class="card">
      <div class="card-title"><span>Aportaciones</span><span class="small dim num">Total ${fmt(totalAport)}</span></div>
      ${mvList(aports, null)}
    </div>
    <div class="infobox">Las aportaciones salen de tu <b>cuenta</b> y cuentan contra el límite de inversión. Al aportar, el importe se suma al valor invertido; cuando quieras, pon el valor real que veas en tu app de inversión con <b>Actualizar valor</b>.</div>`;
  countUp($('#i-val'), 'inv', S.investment.value);
  bindMvClicks(view);
  $('#i-aport').addEventListener('click', () => openMovementForm('aportacion'));
  $('#i-upd').addEventListener('click', openInvestmentValue);
}

function openInvestmentValue() {
  openSheet('Valor invertido', `
    <div class="amount-input"><input id="f-amt" inputmode="decimal" placeholder="0" value="${amountToInput(S.investment.value)}" autocomplete="off"><span class="cur">€</span></div>
    <div class="infobox" style="margin-top:0">Pon el valor total actual de todo lo que tienes invertido.</div>
    <div class="sheet-actions"><button class="btn btn-primary" id="f-save">Guardar</button></div>`, sh => {
    const inp = $('#f-amt', sh);
    inp.focus();
    $('#f-save', sh).addEventListener('click', () => {
      const v = parseAmount(inp.value || '0');
      if (Number.isNaN(v) || v < 0) return toast('Cantidad no válida', 'warn');
      S.investment = { value: v, updatedAt: Date.now() };
      save(); closeSheet(); render();
      toast('Valor de la inversión actualizado', 'ok');
    });
  });
}

/* ---------- Gráficas ---------- */
function donutSvg(items, total) {
  const R = 80, W = 24;
  if (total <= 0) return `<svg viewBox="-110 -110 220 220"><circle r="${R}" fill="none" stroke="rgba(120,160,255,.12)" stroke-width="${W}"/></svg>`;
  const gap = items.length > 1 ? 2.5 : 0;
  let acc = 0, out = '';
  items.forEach((it, idx) => {
    const frac = it.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const gapA = Math.min(gap / R, (a1 - a0) / 3);
    const s = a0 + gapA / 2, e = a1 - gapA / 2;
    const large = e - s > Math.PI ? 1 : 0;
    const p = frac >= 0.9999
      ? `M 0 ${-R} A ${R} ${R} 0 1 1 -0.01 ${-R}`
      : `M ${R * Math.cos(s)} ${R * Math.sin(s)} A ${R} ${R} 0 ${large} 1 ${R * Math.cos(e)} ${R * Math.sin(e)}`;
    const sel = UI.donutSel === idx;
    const dim = UI.donutSel !== null && !sel;
    out += `<path d="${p}" fill="none" stroke="${it.color}" stroke-width="${sel ? W + 8 : W}" opacity="${dim ? .35 : 1}" data-i="${idx}"/>`;
  });
  return `<svg viewBox="-110 -110 220 220">${out}</svg>`;
}

function monthBreakdown(ym) {
  const st = monthStats(ym);
  const items = [];
  for (const c of st.cats.filter(c => c.kind === 'normal')) if (c.spent > 0) items.push({ name: c.name, value: c.spent, color: c.color });
  if (st.orphan > 0) items.push({ name: 'Otros', value: st.orphan, color: OTHER_COLOR });
  if (st.fixedPaid > 0) items.push({ name: 'Gastos fijos', value: st.fixedPaid, color: FIXED_COLOR });
  return items;
}

function barsSvg(months) {
  const W = 340, H = 190, padL = 44, padB = 22, padT = 8;
  const max = Math.max(1, ...months.map(m => Math.max(m.inc, m.exp)));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const s = [1, 2, 2.5, 5, 10].find(k => k * p >= max / 3) * p; return s; })();
  const top = Math.ceil(max / nice) * nice;
  const ih = H - padB - padT, iw = W - padL - 4;
  const gw = iw / months.length;
  const bw = Math.max(3, Math.min(14, gw / 2 - 3));
  let g = '';
  for (let v = 0; v <= top + 1e-6; v += nice) {
    const y = padT + ih - (v / top) * ih;
    g += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(120,160,255,${v === 0 ? .3 : .1})" stroke-width="1"/>`;
    g += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end">${fmtShort(v)}</text>`;
  }
  months.forEach((m, i) => {
    const cx = padL + gw * i + gw / 2;
    const bar = (v, x, color) => {
      const h = (v / top) * ih;
      if (h <= 0) return '';
      const r = Math.min(3, h, bw / 2);
      const y = padT + ih - h;
      return `<path d="M${x} ${padT + ih} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - r} Q${x + bw} ${y} ${x + bw} ${y + r} V${padT + ih} Z" fill="${color}"/>`;
    };
    const sel = UI.barSel === i;
    if (sel) g += `<rect x="${padL + gw * i + 1}" y="${padT}" width="${gw - 2}" height="${ih}" rx="6" fill="rgba(120,160,255,.08)"/>`;
    g += bar(m.inc, cx - bw - 1, '#3987e5') + bar(m.exp, cx + 1, '#d95926');
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" ${sel ? 'style="fill:#EAF1FF;font-weight:700"' : ''}>${fmtMonthShort(m.ym)}</text>`;
    g += `<rect x="${padL + gw * i}" y="0" width="${gw}" height="${H}" fill="transparent" data-b="${i}"/>`;
  });
  return `<svg class="bars-svg" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

function renderCharts() {
  const items = monthBreakdown(UI.viewYM);
  const total = round2(sum(items, i => i.value));
  const sel = UI.donutSel !== null ? items[UI.donutSel] : null;

  // Evolución: últimos 12 meses desde que usas la app
  const months = [];
  const start = setupYM();
  for (let i = UI.barsN - 1; i >= 0; i--) {
    const ym = addMonths(curYM(), -i);
    if (ym < start) continue;
    const st = monthStats(ym);
    months.push({ ym, inc: st.income, exp: round2(st.spent + st.fixedPaid) });
  }
  if (UI.barSel === undefined || UI.barSel >= months.length) UI.barSel = months.length - 1;
  const bm = months[UI.barSel];

  // Acumulado global
  const glob = {};
  for (const m of S.movements) {
    if (m.type === 'gasto') {
      const c = catById(m.categoryId);
      const k = c ? c.name : 'Otros';
      glob[k] = (glob[k] || 0) + m.amount;
    } else if (m.type === 'fijo') {
      const k = 'Fijo · ' + (m.note || 'Gasto fijo');
      glob[k] = (glob[k] || 0) + m.amount;
    }
  }
  const globArr = Object.entries(glob).map(([name, v]) => ({ name, v: round2(v) })).sort((a, b) => b.v - a.v);
  const globTotal = sum(globArr, x => x.v);
  const globMax = globArr[0]?.v || 1;

  view.innerHTML = `
    ${monthSelector()}
    <div class="card">
      <div class="card-title"><span>Gasto por categoría</span></div>
      <div class="donut-wrap" id="donut">${donutSvg(items, total)}
        <div class="donut-center"><div class="l">${sel ? esc(sel.name) : 'Total gastado'}</div><div class="v num">${fmt(sel ? sel.value : total)}</div></div>
      </div>
      ${items.length ? `<div class="legend ${sel ? 'has-sel' : ''}">${items.map((it, i) => `<button data-i="${i}" class="${UI.donutSel === i ? 'sel' : ''}">
        <span class="dot" style="background:${it.color}"></span><span class="nm">${esc(it.name)}</span>
        <span class="pc num">${Math.round(it.value / total * 100)}&nbsp;%</span><span class="am num">${fmt(it.value)}</span></button>`).join('')}</div>`
        : '<div class="empty">No hay gastos en este mes</div>'}
    </div>

    <div class="card">
      <div class="card-title"><span>Ingresos vs gastos</span></div>
      <div class="keys"><span><i style="background:#3987e5"></i>Ingresos</span><span><i style="background:#d95926"></i>Gastos (incl. fijos)</span></div>
      <div id="bars">${barsSvg(months)}</div>
      <div class="bars-tip num">${bm ? `<b style="text-transform:capitalize">${fmtMonth(bm.ym)}</b> · Ingresos <b>${fmt(bm.inc)}</b> · Gastos <b>${fmt(bm.exp)}</b> · Balance <b style="color:${bm.inc - bm.exp >= 0 ? 'var(--good)' : 'var(--bad)'}">${fmt(bm.inc - bm.exp, { sign: true })}</b>` : ''}</div>
    </div>

    <div class="card">
      <div class="card-title"><span>¿En qué se me va el dinero?</span><span class="small dim num">${fmt(globTotal)}</span></div>
      <div class="small dim" style="margin:-4px 0 6px">Acumulado desde que usas la app</div>
      ${globArr.length ? globArr.map(x => `<div class="hbar"><div class="top"><span>${esc(x.name)}</span><span class="num">${fmt(x.v)} <span class="dim small">${Math.round(x.v / globTotal * 100)}&nbsp;%</span></span></div>${barHtml(x.v / globMax, ' ')}</div>`).join('') : '<div class="empty">Aún no hay gastos</div>'}
    </div>`;

  bindMonthSelector(renderCharts);
  const pick = i => { UI.donutSel = UI.donutSel === i ? null : i; renderCharts(); animateBars(view); };
  $$('#donut path[data-i]').forEach(p => p.addEventListener('click', () => pick(Number(p.dataset.i))));
  $$('.legend button').forEach(b => b.addEventListener('click', () => pick(Number(b.dataset.i))));
  $$('#bars [data-b]').forEach(r => r.addEventListener('click', () => { UI.barSel = Number(r.dataset.b); renderCharts(); animateBars(view); }));
}

/* ---------- Ajustes ---------- */
function renderSettings() {
  const b = balances();
  const draft = S.categories.map(c => ({ ...c }));
  view.innerHTML = `
    <div class="section-label">Saldos</div>
    <div class="card">
      <button class="list-row" id="s-bal"><span class="t">Corregir saldos<small>Si tu saldo real no coincide con el de la app</small></span><span class="r num">${fmt(b.total)}</span>${ICON.chev}</button>
    </div>

    <div class="section-label">Gastos fijos · se cobran de la cuenta</div>
    <div class="card">
      ${S.recurring.length ? S.recurring.slice().sort((x, y) => x.day - y.day).map(r => `<button class="list-row" data-rec="${r.id}"><span class="t">${esc(r.name)}<small>Día ${r.day} de cada mes</small></span><span class="r num">${fmt(r.amount)}</span>${ICON.chev}</button>`).join('') : '<div class="empty">No hay gastos fijos</div>'}
      <div class="pct-total"><span>Total al mes</span><span class="num">${fmt(fixedTotal())}</span></div>
      <button class="btn btn-ghost btn-block btn-small" id="s-addrec" style="margin-top:12px">+ Añadir gasto fijo</button>
    </div>

    <div class="section-label">Reparto del disponible</div>
    <div class="card">
      <div id="pct-list">${draft.map(c => `<div class="pct-row">
        <button class="name" data-cedit="${c.id}"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)}</span></button>
        <span class="pin"><input data-pct="${c.id}" inputmode="decimal" value="${String(c.pct).replace('.', ',')}"><span class="muted">%</span></span>
      </div>`).join('')}</div>
      <div class="pct-total" id="pct-total"></div>
      <div class="row2" style="margin-top:12px">
        <button class="btn btn-ghost btn-small" id="s-addcat">+ Categoría</button>
        <button class="btn btn-primary btn-small" id="s-savepct">Guardar reparto</button>
      </div>
      <div class="small dim" style="margin-top:10px">Toca el nombre de una categoría para renombrarla o eliminarla.</div>
    </div>

    <div class="section-label">Atajo de iPhone</div>
    <div class="card howto">
      <div class="muted small" style="line-height:1.5">El atajo copia una frase como <code class="k">12,50 comida efectivo</code> y la app la importa con el botón <b>Importar gasto desde el atajo</b> de Inicio. Si no dices cuenta o efectivo, se apunta en la cuenta. Palabras que entiende para la categoría:</div>
      <div class="chips" style="margin-top:10px">${spendCats().map(c => `<code class="k">${esc(shortKey(c))}</code>`).join('')}</div>
    </div>

    <div class="section-label">Datos</div>
    <div class="card">
      <button class="list-row" id="s-reset" style="color:#FF8590"><span class="t">Borrar todos los datos</span>${ICON.chev}</button>
    </div>
    <div class="small dim" style="text-align:center;margin:18px 0 6px">Control Financiero · versión ${APP_VERSION}<br>Tus datos solo están en este iPhone</div>`;

  const updTotal = () => {
    const t = pctTotal(draft);
    const el = $('#pct-total');
    const ok = t === 100;
    el.className = 'pct-total ' + (ok ? 'ok' : 'ko');
    el.innerHTML = `<span>Total</span><span class="num">${fmtPct(t)} ${ok ? '✓' : '· debe sumar 100&nbsp;%'}</span>`;
    $('#s-savepct').disabled = !ok;
  };
  $$('[data-pct]').forEach(inp => inp.addEventListener('input', () => {
    const c = draft.find(x => x.id === inp.dataset.pct);
    const v = parseAmount(inp.value);
    c.pct = Number.isNaN(v) ? 0 : v;
    updTotal();
  }));
  updTotal();
  $('#s-savepct').addEventListener('click', () => {
    for (const d of draft) { const c = catById(d.id); if (c) c.pct = d.pct; }
    save();
    toast('Reparto guardado. Los límites del mes se han recalculado', 'ok');
  });
  $('#s-addcat').addEventListener('click', () => openCategoryForm(null));
  $$('[data-cedit]').forEach(b => b.addEventListener('click', () => openCategoryForm(catById(b.dataset.cedit))));
  $$('[data-rec]').forEach(b => b.addEventListener('click', () => openRecurringForm(S.recurring.find(r => r.id === b.dataset.rec))));
  $('#s-addrec').addEventListener('click', () => openRecurringForm(null));
  $('#s-bal').addEventListener('click', openBalanceFix);
  $('#s-reset').addEventListener('click', () => {
    if (!confirm('¿Seguro que quieres borrar TODOS tus datos? No se puede deshacer.')) return;
    if (!confirm('Última confirmación: se borrarán todos los movimientos y ajustes.')) return;
    localStorage.removeItem(STORAGE_KEY);
    S = defaultState();
    UI.tab = 'inicio';
    render();
  });
}

function shortKey(c) {
  return norm(c.name).split(/[\s/(]+/)[0];
}

function openBalanceFix() {
  const b = balances();
  openSheet('Corregir saldos', `
    <div class="infobox" style="margin-top:0">Escribe lo que tienes de verdad ahora mismo. La app ajustará el saldo sin crear gastos ni ingresos.</div>
    <div class="field"><label>Cuenta</label><input id="f-c" class="input num" inputmode="decimal" value="${amountToInput(b.cuenta) || '0'}"></div>
    <div class="field"><label>Efectivo</label><input id="f-e" class="input num" inputmode="decimal" value="${amountToInput(b.efectivo) || '0'}"></div>
    <div class="sheet-actions"><button class="btn btn-primary" id="f-save">Guardar</button></div>`, sh => {
    $('#f-save', sh).addEventListener('click', () => {
      const c = parseAmount($('#f-c', sh).value || '0');
      const e = parseAmount($('#f-e', sh).value || '0');
      if (Number.isNaN(c) || Number.isNaN(e)) return toast('Revisa las cantidades', 'warn');
      S.initial.cuenta = round2(S.initial.cuenta + (c - b.cuenta));
      S.initial.efectivo = round2(S.initial.efectivo + (e - b.efectivo));
      save(); closeSheet(); render();
      toast('Saldos corregidos', 'ok');
    });
  });
}

function openRecurringForm(r) {
  openSheet(r ? 'Editar gasto fijo' : 'Nuevo gasto fijo', `
    <div class="amount-input"><input id="f-amt" inputmode="decimal" placeholder="0" value="${r ? amountToInput(r.amount) : ''}" autocomplete="off"><span class="cur">€</span></div>
    <div class="field"><label>Nombre</label><input id="f-name" class="input" value="${r ? esc(r.name) : ''}" placeholder="Ej. Netflix" autocomplete="off"></div>
    <div class="field"><label>Día del mes</label><input id="f-day" class="input num" inputmode="numeric" value="${r ? r.day : 1}"></div>
    <div class="small dim" style="margin:8px 2px 0">Se resta automáticamente de la cuenta ese día. Si el mes tiene menos días, se cobra el último.</div>
    <div class="sheet-actions">${r ? '<button class="btn btn-danger" id="f-del">Eliminar</button>' : ''}<button class="btn btn-primary" id="f-save">Guardar</button></div>`, sh => {
    if (!r) $('#f-amt', sh).focus();
    $('#f-save', sh).addEventListener('click', () => {
      const amount = parseAmount($('#f-amt', sh).value);
      const name = $('#f-name', sh).value.trim();
      const day = parseInt($('#f-day', sh).value, 10);
      if (!(amount > 0)) return toast('Pon un importe', 'warn');
      if (!name) return toast('Pon un nombre', 'warn');
      if (!(day >= 1 && day <= 31)) return toast('El día debe estar entre 1 y 31', 'warn');
      if (r) Object.assign(r, { amount, name, day });
      else S.recurring.push({ id: uid(), name, amount, day, start: todayISO() });
      applyRecurring();
      save(); closeSheet(); render();
      toast('Gasto fijo guardado', 'ok');
    });
    $('#f-del', sh)?.addEventListener('click', () => {
      if (!confirm(`¿Eliminar "${r.name}"? Los cobros ya registrados se mantienen en el historial.`)) return;
      S.recurring = S.recurring.filter(x => x.id !== r.id);
      save(); closeSheet(); render();
    });
  });
}

function openCategoryForm(c) {
  const special = c && c.kind !== 'normal';
  openSheet(c ? 'Editar categoría' : 'Nueva categoría', `
    <div class="field" style="margin-top:0"><label>Nombre</label><input id="f-name" class="input" value="${c ? esc(c.name) : ''}" placeholder="Ej. Mascotas" autocomplete="off"></div>
    ${c ? '' : '<div class="field"><label>Porcentaje</label><input id="f-pct" class="input num" inputmode="decimal" value="0"></div><div class="small dim" style="margin:8px 2px 0">Recuerda ajustar el resto para que sumen 100&nbsp;%.</div>'}
    ${special ? `<div class="small dim" style="margin:10px 2px 0">${c.kind === 'ahorro' ? 'El ahorro' : 'La inversión'} es una categoría especial: se puede renombrar pero no eliminar.</div>` : ''}
    <div class="sheet-actions">${c && !special ? '<button class="btn btn-danger" id="f-del">Eliminar</button>' : ''}<button class="btn btn-primary" id="f-save">Guardar</button></div>`, sh => {
    $('#f-save', sh).addEventListener('click', () => {
      const name = $('#f-name', sh).value.trim();
      if (!name) return toast('Pon un nombre', 'warn');
      if (c) c.name = name;
      else {
        const pct = parseAmount($('#f-pct', sh).value || '0');
        const used = new Set(S.categories.map(x => x.color));
        const color = PALETTE.find(p => !used.has(p)) || OTHER_COLOR;
        const idx = S.categories.findIndex(x => x.kind !== 'normal');
        const cat = { id: uid(), name, pct: Number.isNaN(pct) ? 0 : pct, kind: 'normal', color };
        if (idx === -1) S.categories.push(cat); else S.categories.splice(idx, 0, cat);
      }
      save(); closeSheet(); render();
      if (pctTotal(S.categories) !== 100) toast(`Los porcentajes suman ${fmtPct(pctTotal(S.categories))}. Ajústalos para que sumen 100&nbsp;%`, 'warn');
    });
    $('#f-del', sh)?.addEventListener('click', () => {
      if (!confirm(`¿Eliminar "${c.name}"? Sus gastos se quedarán en el historial como "Otros".`)) return;
      S.categories = S.categories.filter(x => x.id !== c.id);
      save(); closeSheet(); render();
      if (pctTotal(S.categories) !== 100) toast(`Ahora los porcentajes suman ${fmtPct(pctTotal(S.categories))}. Reparte el ${fmtPct(c.pct)} que tenía`, 'warn');
    });
  });
}

/* =========================================================
   Hoja inferior y formularios de movimientos
   ========================================================= */
let sheetOnClose = null;
function openSheet(title, body, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grab"></div><div class="sheet-head"><h2>${title}</h2><button class="x" aria-label="Cerrar">✕</button></div>${body}`;
  sh.scrollTop = 0;
  const amt = $('.amount-input input', sh);
  if (amt) {
    // Mide el texto real con la misma fuente para que el importe nunca se corte
    const meter = document.createElement('span');
    meter.className = 'amount-meter';
    amt.parentNode.appendChild(meter);
    const fit = () => {
      meter.textContent = amt.value || amt.placeholder || '0';
      amt.style.width = Math.ceil(meter.getBoundingClientRect().width + 14) + 'px';
    };
    amt.addEventListener('input', fit);
    fit();
  }
  $('#sheet-backdrop').classList.add('open');
  sh.classList.add('open');
  $('.x', sh).addEventListener('click', closeSheet);
  if (onMount) onMount(sh);
}
function closeSheet() {
  document.activeElement?.blur?.();
  $('#sheet').classList.remove('open');
  $('#sheet-backdrop').classList.remove('open');
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}
$('#sheet-backdrop').addEventListener('click', closeSheet);
$('#sheet').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); $('#f-save, #f-go, #f-imp', $('#sheet'))?.click(); }
});
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fitKeyboard = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  };
  vv.addEventListener('resize', fitKeyboard);
  vv.addEventListener('scroll', fitKeyboard);
  fitKeyboard();
}
(() => { // deslizar hacia abajo para cerrar
  const sh = $('#sheet');
  let y0 = null, dy = 0;
  sh.addEventListener('touchstart', e => { if (sh.scrollTop <= 0 && !e.target.closest('input,textarea')) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sh.addEventListener('touchend', () => {
    if (y0 === null) return;
    sh.style.transition = ''; sh.style.transform = '';
    if (dy > 110) closeSheet();
    y0 = null;
  });
})();

const TITLES = { gasto: 'Gasto', ingreso: 'Ingreso', traspaso: 'Traspaso', fijo: 'Gasto fijo', aportacion: 'Aportación' };

function accSeg(id, val) {
  return `<div class="seg" id="${id}"><span class="thumb"></span>
    <button data-v="cuenta" class="${val === 'cuenta' ? 'on' : ''}">Cuenta</button>
    <button data-v="efectivo" class="${val === 'efectivo' ? 'on' : ''}">Efectivo</button></div>`;
}
function bindSeg(seg, onChange) {
  placeThumb(seg);
  $$('button', seg).forEach(b => b.addEventListener('click', () => {
    $$('button', seg).forEach(x => x.classList.toggle('on', x === b));
    placeThumb(seg);
    onChange(b.dataset.v);
  }));
}

function openMovementForm(type, m = null, preset = {}) {
  const editing = !!m;
  const f = {
    amount: m ? m.amount : null,
    date: m ? m.date : (preset.date || todayISO()),
    note: m ? m.note || '' : '',
    account: m ? m.account : (preset.account || (type === 'ingreso' ? 'cuenta' : UI.acc)),
    to: m && m.to ? m.to : null,
    categoryId: m ? m.categoryId : (preset.categoryId || (catById(S.lastCat)?.kind === 'normal' ? S.lastCat : spendCats()[0]?.id)),
  };
  if (type === 'fijo' || type === 'aportacion') f.account = 'cuenta';
  if (type === 'traspaso' && !m) { f.account = 'cuenta'; }

  const ymNow = ymOf(f.date);
  const st = monthStats(ymNow);
  let body = `<div class="amount-input"><input id="f-amt" inputmode="decimal" placeholder="0" value="${amountToInput(f.amount)}" autocomplete="off"><span class="cur">€</span></div>`;

  if (type === 'gasto') {
    const cats = spendCats();
    if (f.categoryId && !cats.find(c => c.id === f.categoryId) && editing) cats.push({ id: f.categoryId, name: 'Otros', color: OTHER_COLOR });
    body += `<div class="field" style="margin-top:4px"><span class="field-label">Categoría</span><div class="chips" id="f-cats">
      ${cats.map(c => { const sc = st.cats.find(x => x.id === c.id); return `<button class="chip ${c.id === f.categoryId ? 'on' : ''}" data-c="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${sc && sc.limit > 0 ? ` <span class="left num">${fmt(sc.left)}</span>` : ''}</button>`; }).join('')}
    </div></div>
    <div class="field"><span class="field-label">Pagado con</span>${accSeg('f-acc', f.account)}</div>`;
  }
  if (type === 'ingreso') {
    body += `<div class="field" style="margin-top:4px"><span class="field-label">Destino</span>${accSeg('f-acc', f.account)}</div>`;
  }
  if (type === 'traspaso') {
    body += `<div class="field" style="margin-top:4px"><span class="field-label">Desde</span>
      <div class="seg" id="f-dir"><span class="thumb"></span>
        <button data-v="cuenta" class="${f.account === 'cuenta' ? 'on' : ''}">Cuenta → Efectivo</button>
        <button data-v="efectivo" class="${f.account === 'efectivo' ? 'on' : ''}">Efectivo → Cuenta</button></div></div>`;
  }
  if (type === 'aportacion') {
    const ic = st.cats.find(c => c.kind === 'inversion');
    if (ic) body += `<div class="small dim num" style="text-align:center;margin-top:-4px">Sale de la cuenta · Te quedan ${fmt(ic.left)} del límite de inversión</div>`;
  }
  if (type === 'fijo') {
    body += `<div class="small dim" style="text-align:center;margin-top:-4px">Cobro automático de “${esc(f.note)}”. Para cambiar el importe de los próximos meses, ve a Ajustes.</div>`;
  }
  body += `<div class="field"><label for="f-date">Fecha</label><input id="f-date" type="date" class="input" value="${f.date}"></div>
    <div class="field"><label for="f-note">Nota</label><input id="f-note" class="input" value="${esc(f.note)}" placeholder="${type === 'ingreso' ? 'Ej. Tambora, asesoría…' : 'Opcional'}" autocomplete="off" enterkeyhint="done"></div>
    <div class="sheet-actions">${editing ? '<button class="btn btn-danger" id="f-del">Borrar</button>' : ''}<button class="btn btn-primary" id="f-save">${editing ? 'Guardar cambios' : 'Guardar ' + TITLES[type].toLowerCase()}</button></div>`;

  const NEW_TITLES = { gasto: 'Nuevo gasto', ingreso: 'Nuevo ingreso', traspaso: 'Traspaso', aportacion: 'Nueva aportación', fijo: 'Gasto fijo' };
  openSheet(editing ? 'Editar ' + TITLES[type].toLowerCase() : NEW_TITLES[type], body, sh => {
    const amt = $('#f-amt', sh);
    if (!editing) amt.focus();
    $$('#f-cats .chip', sh).forEach(ch => ch.addEventListener('click', () => {
      $$('#f-cats .chip', sh).forEach(x => x.classList.toggle('on', x === ch));
      f.categoryId = ch.dataset.c;
    }));
    const accEl = $('#f-acc', sh);
    if (accEl) bindSeg(accEl, v => { f.account = v; });
    const dirEl = $('#f-dir', sh);
    if (dirEl) bindSeg(dirEl, v => { f.account = v; });

    $('#f-save', sh).addEventListener('click', () => {
      const amount = parseAmount(amt.value);
      if (!(amount > 0)) { amt.focus(); return toast('Escribe una cantidad', 'warn'); }
      const date = $('#f-date', sh).value || todayISO();
      const note = $('#f-note', sh).value.trim();
      if (type === 'gasto' && !f.categoryId) return toast('Elige una categoría', 'warn');
      const target = editing ? m : { id: uid(), type, createdAt: Date.now() };
      const trackCat = type === 'gasto' ? f.categoryId : type === 'aportacion' ? invCat()?.id : null;
      const before = trackCat ? spentInCat(trackCat, ymOf(date)) - (editing && ymOf(m.date) === ymOf(date) && (type !== 'gasto' || m.categoryId === trackCat) ? m.amount : 0) : 0;
      const prevAmount = editing ? m.amount : 0;
      Object.assign(target, { amount, date, note, account: f.account });
      if (type === 'gasto') { target.categoryId = f.categoryId; S.lastCat = f.categoryId; }
      if (type === 'traspaso') target.to = f.account === 'cuenta' ? 'efectivo' : 'cuenta';
      if (type === 'aportacion') S.investment.value = round2((S.investment.value || 0) + amount - prevAmount);
      if (!editing) S.movements.push(target);
      save(); closeSheet(); render();
      const warned = trackCat ? limitWarning(trackCat, ymOf(date), before) : false;
      const future = date > todayISO() ? ' (previsto)' : '';
      if (!warned) toast(editing ? 'Cambios guardados' : `${TITLES[type]} de ${fmt(amount)} ${type === 'aportacion' ? 'añadida' : 'añadido'}${future}`, 'ok');
    });
    $('#f-del', sh)?.addEventListener('click', () => {
      if (!confirm('¿Borrar este movimiento?')) return;
      S.movements = S.movements.filter(x => x.id !== m.id);
      if (type === 'aportacion') S.investment.value = round2(Math.max(0, (S.investment.value || 0) - m.amount));
      save(); closeSheet(); render();
      toast('Movimiento borrado', 'ok');
    });
  });
}

/* =========================================================
   Importar gastos del atajo (portapapeles)
   Formato por línea: CF;20261023143005;12,50;comida;efectivo[;nota]
   ========================================================= */
function parseShortcutText(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!/^CF\s*;/i.test(line)) continue;
    const p = line.split(';').map(s => s.trim());
    const [, id, amountS, catS, accS, ...rest] = p;
    const amount = parseAmount(amountS);
    if (!id || !(amount > 0)) continue;
    const digits = id.replace(/\D/g, '');
    let date = todayISO();
    if (digits.length >= 8) {
      const d = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      if (!Number.isNaN(Date.parse(d))) date = d;
    }
    out.push({ id, amount, date, categoryId: matchCategory(catS), catText: catS || '', account: norm(accS).startsWith('efe') ? 'efectivo' : 'cuenta', note: rest.join(';') });
  }
  return out;
}
/* Palabras habituales que apuntan a una categoría (por el comienzo de su nombre) */
const CAT_ALIASES = {
  super: 'comida', mercadona: 'comida', compra: 'comida', nevera: 'comida', lidl: 'comida', carrefour: 'comida',
  gasolinera: 'gasolina', diesel: 'gasolina', coche: 'gasolina', transporte: 'gasolina', bus: 'gasolina', metro: 'gasolina', taxi: 'gasolina', tren: 'gasolina', parking: 'gasolina',
  farmacia: 'salud', medico: 'salud', peluqueria: 'salud', cuidado: 'salud',
  restaurante: 'restauracion', bar: 'restauracion', cena: 'restauracion', comida_fuera: 'restauracion', cafe: 'restauracion', copas: 'restauracion', fuera: 'restauracion',
  colonia: 'ropa', colonias: 'ropa', zapatillas: 'ropa', perfume: 'ropa',
  cine: 'ocio', concierto: 'ocio', viaje: 'ocio',
};
function parseFreeText(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\r\n]+/)) {
    const line = raw.trim();
    const m = line.match(/\d+(?:[.,]\d+)*/);
    if (!m) continue;
    const amount = parseAmount(m[0]);
    if (!(amount > 0)) continue;
    const words = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
      .replace(/€|\beuros?\b|\bcon\b|\ben\b|\bde\b/gi, ' ').split(/\s+/).filter(Boolean);
    let account = 'cuenta', categoryId = null;
    const noteWords = [];
    for (const w of words) {
      const n = norm(w);
      if (n.startsWith('efect') || n === 'cash' || n === 'metalico') { account = 'efectivo'; continue; }
      if (['cuenta', 'tarjeta', 'banco', 'bizum'].includes(n)) { account = 'cuenta'; continue; }
      if (!categoryId && n.length >= 3) {
        const id = matchCategory(CAT_ALIASES[n] || n);
        if (id) { categoryId = id; continue; }
      }
      noteWords.push(w);
    }
    out.push({ id: `T:${todayISO()}:${norm(line)}`, amount, date: todayISO(), categoryId, catText: words.join(' '), account, note: noteWords.join(' '), free: true });
  }
  return out;
}
function matchCategory(s) {
  const q = norm(s);
  if (!q) return null;
  const cats = spendCats();
  return (cats.find(c => norm(c.name) === q) || cats.find(c => norm(c.name).startsWith(q)) || cats.find(c => norm(c.name).includes(q)) || cats.find(c => q.startsWith(shortKey(c))))?.id || null;
}

async function importFromClipboard() {
  let text = null;
  try {
    if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
  } catch (e) { text = null; }
  if (text === null) return openPasteSheet();
  handleImportText(text, true);
}
function handleImportText(text, fromClipboard) {
  let items = parseShortcutText(text);
  if (!items.length) items = parseFreeText(text);
  if (!items.length) {
    if (fromClipboard) return openPasteSheet('No he encontrado ningún gasto en el portapapeles. Usa el atajo y vuelve a intentarlo, o escribe aquí el gasto (ej. <b>12,50 comida efectivo</b>):');
    return toast('No encuentro ningún importe en ese texto', 'warn');
  }
  const done = i => S.imported.includes(i.id) || S.movements.some(m => m.importId === i.id);
  const fresh = items.filter(i => !done(i));
  if (fresh.length) return openImportReview(fresh);
  // Frase libre ya importada hoy: puede ser un gasto repetido de verdad, se deja importar avisando
  if (items.every(i => i.free)) return openImportReview(items, true);
  toast('Ese gasto ya estaba importado', 'warn');
}
function openPasteSheet(msg) {
  openSheet('Importar del atajo', `
    <div class="infobox" style="margin-top:0">${msg || 'Mantén pulsado el recuadro y elige <b>Pegar</b>.'}</div>
    <div class="field"><textarea id="f-paste" class="input" placeholder="12,50 comida efectivo"></textarea></div>
    <div class="sheet-actions"><button class="btn btn-primary" id="f-go">Importar</button></div>`, sh => {
    $('#f-go', sh).addEventListener('click', () => handleImportText($('#f-paste', sh).value, false));
  });
}
function openImportReview(items, repeated = false) {
  const cats = spendCats();
  openSheet(items.length === 1 ? 'Gasto del atajo' : `${items.length} gastos del atajo`, `
    ${repeated ? '<div class="warnbox" style="margin:0 0 12px">Hoy ya importaste un gasto igual. Impórtalo solo si es otro gasto distinto.</div>' : ''}
    ${items.map((it, i) => `<div class="card" style="margin-top:${i ? 10 : 0}px">
      <div class="cat-head"><span class="cat-rest num" style="font-size:24px">${fmt(it.amount)}</span><span class="muted small">${esc(fmtDay(it.date))} · ${it.account === 'efectivo' ? 'Efectivo' : 'Cuenta'}</span></div>
      ${it.note ? `<div class="small dim" style="margin-top:4px">Nota: ${esc(it.note)}</div>` : ''}
      ${it.categoryId ? '' : `<div class="small" style="color:var(--warn);margin-top:6px">No reconozco la categoría “${esc(it.catText)}”. Elige una:</div>`}
      <div class="chips" style="margin-top:10px" data-imp="${i}">${cats.map(c => `<button class="chip ${c.id === it.categoryId ? 'on' : ''}" data-c="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}</div>
    </div>`).join('')}
    <div class="sheet-actions"><button class="btn btn-primary" id="f-imp">Importar ${items.length === 1 ? 'gasto' : items.length + ' gastos'}</button></div>`, sh => {
    $$('[data-imp]', sh).forEach(group => $$('.chip', group).forEach(ch => ch.addEventListener('click', () => {
      $$('.chip', group).forEach(x => x.classList.toggle('on', x === ch));
      items[Number(group.dataset.imp)].categoryId = ch.dataset.c;
    })));
    $('#f-imp', sh).addEventListener('click', () => {
      if (items.some(i => !i.categoryId)) return toast('Elige la categoría de cada gasto', 'warn');
      const befores = items.map(it => spentInCat(it.categoryId, ymOf(it.date)));
      for (const it of items) {
        S.movements.push({ id: uid(), type: 'gasto', amount: it.amount, date: it.date, account: it.account, categoryId: it.categoryId, note: it.note, importId: it.id, createdAt: Date.now() });
        if (!S.imported.includes(it.id)) S.imported.push(it.id);
      }
      S.imported = S.imported.slice(-500);
      save(); closeSheet(); render();
      let warned = false;
      items.forEach((it, i) => { if (!warned) warned = limitWarning(it.categoryId, ymOf(it.date), befores[i]); });
      if (!warned) toast(items.length === 1 ? 'Gasto importado' : `${items.length} gastos importados`, 'ok');
    });
  });
}

/* ---------- Resumen al cambiar de mes ---------- */
function maybeShowClosure() {
  if (!S.pendingClose) return;
  const st = monthStats(S.pendingClose);
  const ym = S.pendingClose;
  S.pendingClose = null;
  save();
  openSheet(`Cierre de ${MONTHS[Number(ym.slice(5)) - 1]}`, `
    <div class="muted" style="margin-top:-6px;margin-bottom:6px">Empieza un mes nuevo: los límites se reinician y lo que sobró cuenta como ahorro.</div>
    ${closureCard(st, false)}
    <div class="sheet-actions"><button class="btn btn-primary" id="f-ok">Entendido</button></div>`, sh => {
    $('#f-ok', sh).addEventListener('click', closeSheet);
  });
}

/* =========================================================
   Arranque
   ========================================================= */
function refresh() {
  if (UI.viewYM > addMonths(curYM(), MAX_AHEAD)) UI.viewYM = curYM();
  if (tick()) render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (tick()) render(); maybeShowClosure(); } });
window.addEventListener('resize', () => { $$('.seg').forEach(placeThumb); document.documentElement.style.setProperty('--tabbar-h', $('#tabbar').offsetHeight + 'px'); });
setInterval(refresh, 60 * 1000);

tick();
render();
setTimeout(() => {
  $('#splash').classList.add('hide');
  setTimeout(maybeShowClosure, 400);
}, 650);

if ('serviceWorker' in navigator) {
  // Si llega una versión nueva mientras la app está abierta, se recarga sola
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
