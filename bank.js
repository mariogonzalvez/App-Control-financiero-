'use strict';

/* =========================================================
   Lectura del extracto de Trade Republic (PDF)
   Todo se procesa en el iPhone: el archivo no sale del dispositivo.
   ========================================================= */

const BANK_MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };

let pdfjsReady = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsReady) {
    pdfjsReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsReady = null; reject(new Error('No se ha podido cargar el lector de PDF')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsReady;
}

const parseEuro = s => {
  const n = Number(String(s).replace(/[€\s .]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/* Devuelve { rows: [{date, tipo, desc, amount (+entrada / −salida), balance}], finalBalance, from, to } */
async function parseBankPdf(data) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data }).promise;
  const rows = [];
  let initialBalance = null, finalBalance = null;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const items = (await page.getTextContent()).items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

    // Resumen: balance inicial y final
    const summaryValue = label => {
      const h = items.find(i => i.s === label);
      if (!h) return null;
      const v = items.filter(i => /€$/.test(i.s) && i.y < h.y && h.y - i.y < 30).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
      return v ? parseEuro(v.s) : null;
    };
    if (initialBalance === null) initialBalance = summaryValue('BALANCE INICIAL');
    if (finalBalance === null) finalBalance = summaryValue('BALANCE FINAL');

    // Cabecera de la tabla de transacciones de esta página
    const tipo = items.find(i => i.s === 'TIPO');
    if (!tipo) continue;
    const headY = tipo.y;
    const col = name => items.find(i => i.s.startsWith(name) && Math.abs(i.y - headY) < 8);
    const fechaX = (col('FECHA') || { x: tipo.x - 28 }).x;
    const descX = (col('DESCRIP') || { x: tipo.x + 49 }).x;
    const salidaX = (col('SALIDA') || { x: descX + 295 }).x;
    const footer = items.find(i => /^Trade Republic Bank GmbH, Sucursal/.test(i.s));
    const bottomY = footer ? footer.y + 4 : 0;

    const body = items.filter(i => i.y < headY - 4 && i.y > bottomY);
    const inFecha = i => Math.abs(i.x - fechaX) < 6;
    // Cada movimiento empieza con el día ("01 ene" o "01" y debajo "sept")
    const starts = body.filter(i => inFecha(i) && /^\d{1,2}( |$)/.test(i.s)).sort((a, b) => b.y - a.y);
    starts.forEach((st, k) => {
      const top = st.y + 2;
      const nextTop = k + 1 < starts.length ? starts[k + 1].y + 2 : -Infinity;
      const own = body.filter(i => i.y <= top && i.y > nextTop).sort((a, b) => b.y - a.y || a.x - b.x);
      const fecha = own.filter(inFecha).map(i => i.s).join(' ').toLowerCase().replace(/\./g, '');
      const fm = fecha.match(/^(\d{1,2}) ([a-zé]{3,4}) (\d{4})/);
      const m = fm && BANK_MONTHS[fm[2]];
      if (!m) return;
      // A veces el importe viene pegado al final de la descripción
      const texts = [];
      const money = [];
      for (const i of own.filter(i => !inFecha(i) && i.x >= descX - 4)) {
        const tail = i.s.match(/^(.*?)\s*(-?[\d.]+,\d{2} €)$/);
        if (/^-?[\d.]+,\d{2} €$/.test(i.s)) money.push(i);
        else if (tail && tail[1]) { texts.push(tail[1]); money.push({ s: tail[2], x: salidaX - 30, glued: true }); }
        else texts.push(i.s);
      }
      if (!money.length) return;
      money.sort((a, b) => a.x - b.x);
      const bal = money[money.length - 1];
      const amt = money.length > 1 ? money[money.length - 2] : null;
      rows.push({
        date: `${fm[3]}-${String(m).padStart(2, '0')}-${fm[1].padStart(2, '0')}`,
        tipo: own.filter(i => i.x >= tipo.x - 4 && i.x < descX - 4).map(i => i.s).join(' '),
        desc: texts.join(' '),
        abs: amt ? parseEuro(amt.s) : NaN,
        colSign: amt && !amt.glued ? (amt.x < salidaX - 8 ? 1 : -1) : 0,
        balance: parseEuro(bal.s),
      });
    });
  }
  // El importe exacto (y si entra o sale) sale de la diferencia de saldos entre filas
  let prev = initialBalance;
  for (const r of rows) {
    if (prev !== null && Number.isFinite(r.balance)) r.amount = Math.round((r.balance - prev) * 100) / 100;
    else r.amount = (r.colSign || -1) * r.abs;
    prev = r.balance;
    delete r.abs; delete r.colSign;
  }
  if (!rows.length) throw new Error('No he encontrado movimientos. ¿Es el extracto de cuenta de Trade Republic?');
  return { rows, finalBalance: finalBalance ?? rows[rows.length - 1].balance, from: rows[0].date, to: rows[rows.length - 1].date };
}

/* Texto limpio para mostrar y clave para recordar cómo clasificaste cada comercio */
function bankCleanDesc(desc) {
  return String(desc)
    .replace(/null$/i, '')
    .replace(/\s*\((ES|[A-Z]{2})\d{10,}\)/g, '')
    .replace(/\s*\(\+?\d[\d\s-]{6,}\)/g, '')
    .replace(/^Incoming transfer from /i, 'Transferencia de ')
    .replace(/^Outgoing transfer for /i, 'Transferencia a ')
    .replace(/^Sepa Direct Debit transfer to /i, 'Recibo ')
    .replace(/^Savings plan execution \S+ /i, 'Plan de inversión: ')
    .replace(/^Buy trade \S+ /i, 'Compra: ')
    .replace(/^Sell trade \S+ /i, 'Venta: ')
    .replace(/, quantity: [\d.]+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function bankKey(desc) {
  return norm(bankCleanDesc(desc))
    .replace(/\b(pending|null)\b/g, '')
    .replace(/[\d*.,:#/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 4).join(' ');
}

/* =========================================================
   Clasificación automática
   ========================================================= */

/* Palabras del comercio → comienzo del nombre de la categoría */
const BANK_RULES = [
  ['restauracion', /uber\W*eats|glovo|just ?eat|deliveroo|restaur|\bbar\b|cafe|cafeteria|kebap|kebab|burger|pizz|helader|taberna|lounge|beerland|cervece|tapas|sushi|mcdonald|telepizza|domino|kfc|bocater|asador|churrer|xinesa|bodega/],
  ['comida', /mercadona|consum|lidl|carrefour|aldi\b|supermerc|supercor|hipercor|charter|mercaplaya|carnicer|panader|fruter|eroski|alcampo|\bdia\b|spar\b|masymas|ahorramas|mercado/],
  ['gasolina', /plenergy|\be ?s bp\b|\bbp\b|repsol|cepsa|galp|texaco|ballenoil|petro|shell|gasoliner|parking|renfe|alsa\b|\bemt\b|\buber\b|cabify|bolt|lavadero|autopista|peaje|itv\b/],
  ['salud', /farmac|barber|peluquer|clinic|dental|optic|fisio|hsn|medic|hospital|parafarm/],
  ['ropa', /zara|bershka|pull ?bear|stradivarius|\bhm\b|\bh m\b|mango|shein|timberland|perfum|druni|sephora|primark|jd sports|nike|adidas|decathlon|massimo|springfield|lefties/],
  ['ocio', /spotify|primevideo|prime video|netflix|\bhbo\b|max\.com|disney|cine|sala magma|amnesia|estanco|steam|playstation|nintendo|xbox|ticket|entradas|discoteca|concierto/],
  ['inversion', /bitvavo|binance|coinbase|kraken/],
];

function catByRoot(root) {
  const cats = S.categories.filter(c => c.kind === 'normal' || c.kind === 'inversion');
  if (root === 'inversion') return cats.find(c => c.kind === 'inversion') || null;
  return cats.find(c => norm(c.name).startsWith(root)) || null;
}
function guessAction(row, holder) {
  const key = bankKey(row.desc);
  const remembered = S.bankRules && S.bankRules[key];
  if (remembered && (remembered === 'i' || remembered === 'x' || catById(remembered.slice(2)))) return remembered;
  const d = norm(row.desc);
  const t = norm(row.tipo);
  if (row.amount > 0) {
    if (/interes|bonificacion|rentabilidad/.test(t)) return 'i';
    if (/operar/.test(t)) return 'x'; // venta de inversión: el dinero vuelve a la cuenta
    if (holder && d.includes(holder)) return 'x'; // transferencia desde otra cuenta tuya
    if (/transacci/.test(t)) { const c = guessCat(d); return c ? 'd:' + c.id : 'i'; } // devolución con tarjeta
    return 'i';
  }
  if (/operar/.test(t)) { const c = catByRoot('inversion'); return c ? 'g:' + c.id : ''; }
  if (/impuesto|manual/.test(t)) return 'x';
  if (holder && d.includes(holder)) return 'x';
  if (/revolut/.test(d)) return 'x';
  const c = guessCat(d);
  return c ? 'g:' + c.id : '';
}
function guessCat(d) {
  for (const [root, re] of BANK_RULES) if (re.test(d)) { const c = catByRoot(root); if (c) return c; }
  return null;
}

/* ¿Ya está apuntado en la app? (gastos fijos y movimientos manuales) */
function findExisting(row, used) {
  const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
  const abs = Math.abs(row.amount);
  return S.movements.find(m => {
    if (used.has(m.id) || m.account !== 'cuenta' || m.bankId) return false;
    if (Math.abs(m.amount - abs) > 0.005) return false;
    if (m.type === 'fijo') {
      // Un fijo solo se empareja con recibos o cargos que no son de un comercio conocido (no un Mercadona de 10 €)
      if (row.amount > 0 || days(m.date, row.date) > 7) return false;
      const d = norm(row.desc);
      return d.includes(norm(m.note).split(' ')[0]) || (!guessCat(d) && days(m.date, row.date) <= 5);
    }
    if (m.type === 'gasto' || m.type === 'aportacion') return row.amount < 0 && days(m.date, row.date) <= 3;
    if (m.type === 'ingreso') return row.amount > 0 && days(m.date, row.date) <= 3;
    return false;
  }) || null;
}

/* =========================================================
   Pantallas de importación
   ========================================================= */
function openBankImport() {
  openSheet('Importar extracto', `
    <div class="infobox" style="margin-top:0;line-height:1.5">
      <b>1.</b> En la app de Trade Republic: <b>Perfil → Actividad o Documentos → Extracto de cuenta</b> y descárgalo (PDF).<br>
      <b>2.</b> Toca el botón de abajo y elige ese PDF (está en <b>Archivos → Descargas</b> o donde lo guardaste).<br>
      El archivo se lee en tu iPhone y no se envía a ningún sitio.
    </div>
    <input type="file" id="f-pdf" accept="application/pdf,.pdf" hidden>
    <div class="sheet-actions"><button class="btn btn-primary" id="f-pick">Elegir PDF</button></div>`, sh => {
    $('#f-pick', sh).addEventListener('click', () => $('#f-pdf', sh).click());
    $('#f-pdf', sh).addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const btn = $('#f-pick', sh);
      btn.disabled = true; btn.textContent = 'Leyendo extracto…';
      try {
        const res = await parseBankPdf(new Uint8Array(await file.arrayBuffer()));
        res.holder = await bankHolder(file);
        openBankReview(res);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Elegir PDF';
        toast(esc(err.message || 'No se ha podido leer el PDF'), 'bad');
      }
    });
  });
}

/* Nombre del titular (para reconocer transferencias entre tus cuentas) */
async function bankHolder(file) {
  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items.filter(i => i.str.trim());
    const fecha = items.find(i => i.str.trim() === 'FECHA');
    const h = fecha && items.find(i => i.transform[4] < 150 && Math.abs(i.transform[5] - fecha.transform[5]) < 3);
    return h ? norm(h.str) : '';
  } catch (e) { return ''; }
}

function actionOptions(row, value) {
  const cats = S.categories.filter(c => c.kind === 'normal' || c.kind === 'inversion');
  const opt = (v, label) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(label)}</option>`;
  let html = value ? '' : opt('', 'Elegir…');
  if (row.amount < 0) {
    html += `<optgroup label="Gasto">${cats.map(c => opt('g:' + c.id, c.name)).join('')}</optgroup>`;
  } else {
    html += opt('i', 'Ingreso');
    html += `<optgroup label="Devolución (resta del gasto de)">${cats.map(c => opt('d:' + c.id, c.name)).join('')}</optgroup>`;
  }
  html += opt('x', 'No contar (solo ajusta el saldo)');
  if (row.existing) html += opt('dup', 'Ya apuntado en la app');
  return html;
}

function openBankReview(res) {
  const seen = new Set(S.bankSeen || []);
  const from = S.setupDate || res.from;
  const t = todayISO();
  const used = new Set();
  const all = res.rows.map(r => ({ ...r, id: `${r.date}|${r.amount}|${r.balance}` }));
  const before = all.filter(r => r.date < from).length;
  const rows = all.filter(r => r.date >= from && r.date <= t && !seen.has(r.id) && !S.movements.some(m => m.bankId === r.id));
  for (const r of rows) {
    r.existing = findExisting(r, used);
    if (r.existing) used.add(r.existing.id);
    r.action = r.existing ? 'dup' : guessAction(r, res.holder);
  }
  rows.sort((a, b) => (a.action ? 1 : 0) - (b.action ? 1 : 0) || (a.date < b.date ? 1 : -1));

  const rowHtml = (r, i) => `<div class="imp-row ${r.action ? '' : 'todo'}" data-r="${i}">
      <div class="imp-top"><span class="imp-desc">${esc(bankCleanDesc(r.desc))}</span><span class="num imp-amt ${r.amount > 0 ? 'pos' : ''}">${fmt(r.amount, { sign: true })}</span></div>
      <div class="imp-bottom"><span class="dim small">${esc(fmtDay(r.date))}${r.existing ? ' · ya apuntado: ' + esc(mvInfo(r.existing).title) : ''}</span>
        <select class="imp-sel" data-i="${i}">${actionOptions(r, r.action)}</select></div>
    </div>`;

  const pending = () => rows.filter(r => !r.action).length;
  openSheet('Revisar extracto', `
    <div class="small muted" style="margin:-6px 0 10px;line-height:1.5">
      ${rows.length ? `<b>${rows.length}</b> movimientos nuevos desde el ${esc(fmtDay(from))}.` : 'No hay movimientos nuevos.'}
      ${before ? ` Se omiten ${before} anteriores a que empezaras a usar la app (ya están en tu saldo inicial).` : ''}
      Revisa la categoría de cada uno: la app recordará tus elecciones para la próxima vez.
    </div>
    <div id="imp-pending"></div>
    <div id="imp-list">${rows.map(rowHtml).join('')}</div>
    <div class="sheet-actions"><button class="btn btn-primary" id="f-imp">Importar</button></div>`, sh => {
    const upd = () => {
      const p = pending();
      $('#imp-pending', sh).innerHTML = p ? `<div class="warnbox" style="margin:0 0 10px">Te falta elegir la categoría de <b>${p}</b> ${p === 1 ? 'movimiento' : 'movimientos'} (marcados en naranja).</div>` : '';
      $('#f-imp', sh).textContent = rows.length ? `Importar ${rows.length} movimientos` : 'Comprobar saldo';
    };
    $$('.imp-sel', sh).forEach(sel => sel.addEventListener('change', () => {
      const r = rows[Number(sel.dataset.i)];
      r.action = sel.value;
      r.touched = true;
      sel.closest('.imp-row').classList.toggle('todo', !r.action);
      // Aplica la misma elección a los demás movimientos del mismo comercio aún sin tocar
      const key = bankKey(r.desc);
      rows.forEach((o, j) => {
        if (o === r || o.touched || o.existing || bankKey(o.desc) !== key || Math.sign(o.amount) !== Math.sign(r.amount)) return;
        o.action = r.action;
        const s2 = $(`.imp-sel[data-i="${j}"]`, sh);
        s2.innerHTML = actionOptions(o, o.action);
        s2.closest('.imp-row').classList.toggle('todo', !o.action);
      });
      upd();
    }));
    upd();
    $('#f-imp', sh).addEventListener('click', () => {
      if (pending()) return toast('Elige qué es cada movimiento marcado en naranja', 'warn');
      applyBankImport(rows, res);
    });
  });
}

function applyBankImport(rows, res) {
  S.bankRules = S.bankRules || {};
  S.bankSeen = S.bankSeen || [];
  let n = 0;
  for (const r of rows) {
    const [kind, catId] = r.action.split(':');
    if (kind !== 'dup') S.bankRules[bankKey(r.desc)] = r.action;
    S.bankSeen.push(r.id);
    if (kind === 'dup') { r.existing.bankId = r.id; continue; }
    if (kind === 'x') { S.initial.cuenta = round2(S.initial.cuenta + r.amount); continue; }
    const base = { id: uid(), date: r.date, account: 'cuenta', note: bankCleanDesc(r.desc), bankId: r.id, createdAt: Date.now() };
    if (kind === 'i') S.movements.push({ ...base, type: 'ingreso', amount: round2(r.amount) });
    else S.movements.push({ ...base, type: 'gasto', amount: round2(-r.amount), categoryId: catId }); // g: positivo, d: negativo
    n++;
  }
  S.bankSeen = S.bankSeen.slice(-5000);
  S.lastBankImport = Date.now();
  save(); closeSheet(); render();
  setTimeout(() => openBankCheck(res, n), 420);
}

/* Cuadre: saldo del banco al final del extracto frente al saldo de la app ese mismo día */
function openBankCheck(res, imported) {
  const last = res.to;
  let app = Number(S.initial.cuenta) || 0;
  for (const m of S.movements) if (m.date <= last) app += deltaFor(m, 'cuenta');
  app = round2(app);
  const bank = round2(res.finalBalance);
  const diff = round2(bank - app);
  // Gastos fijos que la app ya ha restado y que el banco aún no ha cargado (o con otro día/importe)
  const monthStart = `${last.slice(0, 7)}-01`;
  const pendFixed = S.movements.filter(m => m.type === 'fijo' && !m.bankId && m.date <= last && m.date >= monthStart);
  const pendSum = round2(sum(pendFixed, m => m.amount));
  const rest = round2(diff - pendSum);
  const ok = Math.abs(diff) < 0.01;
  const okWithFixed = !ok && Math.abs(rest) < 0.01;
  openSheet(ok || okWithFixed ? '¡Todo cuadra!' : 'Cuadre de saldo', `
    ${imported ? `<div class="muted" style="margin:-6px 0 12px">${imported} movimientos importados.</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="l">Banco (${esc(fmtDay(last))})</div><div class="v num">${fmt(bank)}</div></div>
      <div class="stat"><div class="l">App, mismo día</div><div class="v num">${fmt(app)}</div></div>
      <div class="stat wide ${ok || okWithFixed ? 'accent' : ''}"><div class="l">${okWithFixed ? 'Diferencia (solo gastos fijos pendientes)' : 'Diferencia'}</div><div class="v num ${ok || okWithFixed ? 'pos' : 'neg'}">${ok ? '✓ 0,00 €' : fmt(diff, { sign: true })}</div></div>
    </div>
    ${!ok && pendFixed.length ? `<div class="infobox">${okWithFixed ? 'La diferencia son' : `<b>${fmt(pendSum)}</b> de la diferencia son`} gastos fijos que la app ya ha restado este mes pero el banco todavía no ha cobrado: ${pendFixed.map(m => esc(m.note)).join(', ')}. Se cuadrarán solos cuando lleguen en el próximo extracto. Si algún día de cobro no coincide, cámbialo en <b>Ajustes → Gastos fijos</b>.</div>` : ''}
    ${!ok && !okWithFixed ? `<div class="infobox">${pendFixed.length ? `Quedan <b>${fmt(rest, { sign: true })}</b> sin explicar. ` : ''}Puede deberse a movimientos que apuntaste a mano con otro importe o a un saldo inicial distinto. Si ajustas, la cuenta de la app pasa a coincidir con el banco sin crear gastos ni ingresos.</div>` : ''}
    <div class="sheet-actions">${ok || okWithFixed ? '<button class="btn btn-primary" id="f-ok">Perfecto</button>' : `<button class="btn" id="f-ok">Dejarlo así</button><button class="btn btn-primary" id="f-fix">Ajustar ${fmt(rest, { sign: true })}</button>`}</div>`, sh => {
    $('#f-ok', sh).addEventListener('click', closeSheet);
    $('#f-fix', sh)?.addEventListener('click', () => {
      S.initial.cuenta = round2(S.initial.cuenta + rest);
      save(); closeSheet(); render();
      toast('Saldo de la cuenta ajustado al del banco', 'ok');
    });
  });
}
