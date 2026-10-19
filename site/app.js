import { matchItem, formatDate } from './match.js';

const STORE_KEY = 'recall-radar:v1';
const PAGE_SIZE = 20;

// ---------- state ----------

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.items)) return { dismissed: {}, seen: {}, ...s };
  } catch { /* storage blocked or corrupt: start empty */ }
  return { items: [], dismissed: {}, seen: {} };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const state = load();
// Matches already seen before this visit; anything else is labelled "New" until the next visit.
const seenBefore = { ...state.seen };
let recalls = [];
let recentShown = PAGE_SIZE;

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// ---------- data ----------

async function loadRecalls() {
  try {
    const res = await fetch('data/recalls.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    recalls = data.recalls || [];
    const when = new Date(data.fetched_at);
    const label = data.sample
      ? 'Sample data'
      : `${recalls.length.toLocaleString()} recalls · updated ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    $('data-status').textContent = label;
    $('data-status').className = data.sample ? 'chip warn' : 'chip';
  } catch {
    $('data-status').textContent = 'Recalls unavailable';
    $('data-status').className = 'chip bad';
  }
  render();
}

// Open Food Facts lookup: barcode -> product name and brand.
async function lookupBarcode(code) {
  const status = $('lookup-status');
  status.textContent = 'Looking up the product…';
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity`);
    const data = await res.json();
    if (data.status === 1 && data.product?.product_name) {
      const p = data.product;
      $('f-name').value = [p.product_name, p.quantity].filter(Boolean).join(', ');
      $('f-brand').value = (p.brands || '').split(',')[0].trim();
      status.textContent = 'Found it. Check the name, then add it.';
    } else {
      status.textContent = 'Not in the product database. Type the name and it will still be checked by barcode.';
    }
  } catch {
    status.textContent = "Couldn't reach the product database. Type the name instead.";
  }
}

// ---------- matching ----------

function matchesFor(item) {
  return matchItem(item, recalls).filter((m) => !state.dismissed[`${item.id}|${m.recall.recall_number}`]);
}

// ---------- rendering ----------

function recallSummary(r) {
  return `${r.recalling_firm}: ${r.reason_for_recall}`;
}

// The product name without its ingredient list, cut to a readable length.
function shortName(description) {
  const name = String(description || '').split(/ingredients?\s*:/i)[0].trim().replace(/[.;,]$/, '');
  return name.length > 110 ? `${name.slice(0, 107)}…` : name;
}

function recallDetails(r) {
  return el('details', {},
    el('summary', {}, 'Details'),
    el('p', {}, r.product_description),
    el('p', {}, `Codes: ${r.code_info || 'none given'}`),
    el('p', {}, `Sold in: ${r.distribution_pattern || 'not stated'}`),
    el('p', {}, `${r.classification} · ${r.status} · reported ${formatDate(r.report_date)} · ${r.recall_number}`),
  );
}

function render() {
  renderAlerts();
  renderPantry();
  renderRecent();
}

function renderAlerts() {
  const box = $('alerts');
  box.replaceChildren();
  for (const item of state.items) {
    for (const m of matchesFor(item)) {
      const key = `${item.id}|${m.recall.recall_number}`;
      const isNew = !seenBefore[key];
      box.append(el('div', { class: 'alert' },
        el('span', { class: 't' }, `${isNew ? 'New: ' : ''}${m.kind === 'barcode' ? 'Recall matches' : 'Possible recall for'} your ${item.name}`),
        el('span', { class: 's' }, `${m.recall.classification}. ${recallSummary(m.recall)}`),
        el('span', { class: 's' }, m.kind === 'barcode'
          ? 'Matched by barcode. Check the lot code on your package.'
          : `Matched on: ${m.words.join(', ')}. Check the brand, size and lot code on your package.`),
        el('button', { class: 'btn small', onclick: () => { state.dismissed[key] = true; save(); render(); } }, 'Not mine'),
      ));
    }
  }
  // Remember what was shown, so "New" only appears on the first visit that shows it.
  for (const item of state.items) for (const m of matchItem(item, recalls)) state.seen[`${item.id}|${m.recall.recall_number}`] = true;
  save();
}

function renderPantry() {
  const list = $('pantry');
  list.replaceChildren();
  $('pantry-count').textContent = state.items.length ? `${state.items.length} item${state.items.length > 1 ? 's' : ''}` : '';
  if (!state.items.length) {
    list.append(el('div', { class: 'empty' }, 'Nothing here yet. Add the things in your fridge, cupboard and medicine cabinet, and they will be checked against every new recall.'));
    return;
  }
  for (const item of state.items) {
    const m = matchesFor(item);
    const chip = m.length
      ? el('span', { class: 'chip bad' }, `${m.length} recall${m.length > 1 ? 's' : ''}`)
      : el('span', { class: 'chip good' }, 'No recalls');
    const meta = [item.brand, item.barcode && `barcode ${item.barcode}`].filter(Boolean).join(' · ');
    list.append(el('div', { class: `item${m.length ? ' hit' : ''}` },
      el('div', { class: 'item-top' }, el('span', { class: 't' }, item.name), chip),
      meta ? el('span', { class: 's' }, meta) : null,
      el('div', { class: 'actions' },
        el('button', { class: 'btn ghost small', onclick: () => removeItem(item.id) }, 'Remove')),
    ));
  }
}

function renderRecent() {
  const filter = $('recent-filter').value;
  const q = $('recent-search').value.trim().toLowerCase();
  const rows = recalls.filter((r) =>
    (filter === 'all' || r.type === filter) &&
    (!q || `${r.product_description} ${r.recalling_firm} ${r.reason_for_recall}`.toLowerCase().includes(q)));
  const list = $('recent');
  list.replaceChildren();
  if (!rows.length) list.append(el('div', { class: 'empty' }, q ? `No recalls mention "${q}".` : 'No recalls loaded.'));
  for (const r of rows.slice(0, recentShown)) {
    const cls = r.classification === 'Class I' ? 'chip bad' : 'chip';
    list.append(el('div', { class: 'item' },
      el('div', { class: 'item-top' },
        el('span', { class: 't' }, shortName(r.product_description)),
        el('span', { class: cls }, r.classification)),
      el('span', { class: 's' }, `${formatDate(r.report_date)} · ${r.type === 'drug' ? 'Drug' : 'Food'} · ${recallSummary(r)}`),
      recallDetails(r),
    ));
  }
  $('recent-more').hidden = rows.length <= recentShown;
}

// ---------- actions ----------

function addItem(e) {
  e.preventDefault();
  const name = $('f-name').value.trim();
  if (!name) return;
  state.items.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    brand: $('f-brand').value.trim(),
    barcode: $('f-barcode').value.replace(/\D/g, ''),
    added: new Date().toISOString(),
  });
  save();
  $('add-form').reset();
  $('lookup-status').textContent = '';
  render();
}

function removeItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  save();
  render();
}

// ---------- barcode scanning ----------

let scanner = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
}

async function openScanner() {
  const dlg = $('scanner');
  const status = $('scan-status');
  dlg.showModal();
  status.textContent = 'Starting the camera…';
  try {
    if (!window.Html5Qrcode) await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode('reader', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false });
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, (text) => {
      $('f-barcode').value = text;
      closeScanner();
      lookupBarcode(text);
    });
    status.textContent = 'Point the camera at the barcode.';
  } catch {
    status.textContent = "Couldn't open the camera. Allow camera access, or type the barcode number instead.";
  }
}

async function closeScanner() {
  try { if (scanner?.isScanning) await scanner.stop(); } catch { /* already stopped */ }
  scanner = null;
  $('scanner').close();
}

// ---------- wire up ----------

$('add-form').addEventListener('submit', addItem);
$('scan-btn').addEventListener('click', openScanner);
$('scan-close').addEventListener('click', closeScanner);
$('scanner').addEventListener('cancel', (e) => { e.preventDefault(); closeScanner(); });
$('f-barcode').addEventListener('change', () => {
  const code = $('f-barcode').value.replace(/\D/g, '');
  if (code.length >= 8) lookupBarcode(code);
});
$('recent-filter').addEventListener('change', () => { recentShown = PAGE_SIZE; renderRecent(); });
$('recent-search').addEventListener('input', () => { recentShown = PAGE_SIZE; renderRecent(); });
$('recent-more').addEventListener('click', () => { recentShown += PAGE_SIZE; renderRecent(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
loadRecalls();
