// Downloads recent FDA food and drug recalls from openFDA and writes them to
// site/data/recalls.json for the app to read. Runs in GitHub Actions on a schedule.
//
// Usage: node scripts/fetch-recalls.mjs [days=120]
// Set OPENFDA_API_KEY to raise the rate limit (optional).

import { writeFile, mkdir } from 'node:fs/promises';

const DAYS = Number(process.argv[2] || 120);
const OUT = new URL('../site/data/recalls.json', import.meta.url);
const PAGE = 1000;
const MAX_PER_SOURCE = 5000;
const FIELDS = [
  'recall_number', 'report_date', 'recall_initiation_date', 'classification', 'status',
  'recalling_firm', 'product_description', 'reason_for_recall', 'distribution_pattern', 'code_info',
];

function ymd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function getJson(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    // openFDA answers 404 when a search has no results.
    if (res.status === 404) return { results: [], meta: { results: { total: 0 } } };
    if (res.ok) return res.json();
    if (attempt === 4) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function fetchSource(kind) {
  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86400000);
  const key = process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : '';
  const out = [];
  for (let skip = 0; skip < MAX_PER_SOURCE; skip += PAGE) {
    const url = `https://api.fda.gov/${kind}/enforcement.json?search=report_date:[${ymd(from)}+TO+${ymd(to)}]` +
      `&sort=report_date:desc&limit=${PAGE}&skip=${skip}${key}`;
    const data = await getJson(url);
    for (const r of data.results) {
      const row = { type: kind };
      for (const f of FIELDS) row[f] = r[f] ?? '';
      out.push(row);
    }
    const total = data.meta?.results?.total ?? 0;
    if (skip + PAGE >= total) break;
  }
  return out;
}

const [food, drug] = await Promise.all([fetchSource('food'), fetchSource('drug')]);
const recalls = [...food, ...drug].sort((a, b) => b.report_date.localeCompare(a.report_date));
await mkdir(new URL('../site/data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({
  fetched_at: new Date().toISOString(),
  days: DAYS,
  source: 'openFDA food and drug enforcement reports (https://open.fda.gov)',
  recalls,
}));
console.log(`Wrote ${recalls.length} recalls (${food.length} food, ${drug.length} drug) to ${OUT.pathname}`);
