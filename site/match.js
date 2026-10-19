// Matching pantry items against recall records.
// Pure functions, shared by the browser app and the Node tests.

const STOP_WORDS = new Set([
  'and', 'the', 'with', 'for', 'from', 'brand', 'fresh', 'mild', 'medium', 'spicy', 'original',
  'natural', 'organic', 'classic', 'style', 'flavor', 'flavored', 'pack', 'size', 'family',
  'large', 'small', 'whole', 'mix', 'net', 'keep', 'refrigerated', 'frozen', 'ounce', 'ounces',
  'lbs', 'pkg', 'box', 'bag', 'can', 'jar', 'bottle', 'count', 'new',
]);

// Lowercase words of 3+ letters that say something about the product.
export function keywords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

// Barcode-like numbers in a recall notice, e.g. "UPC 0 87906-01018" -> "8790601018".
// Leading zeros are dropped so UPC-A and EAN-13 forms compare equal.
export function barcodesIn(text) {
  const runs = (text || '').match(/\d[\d -]{8,}\d/g) || [];
  return runs
    .map((r) => r.replace(/\D/g, '').replace(/^0+/, ''))
    .filter((d) => d.length >= 8);
}

// A scanned barcode matches a number in the notice when they are equal, or when
// the notice leaves out the final check digit, which recall notices often do.
export function barcodeMatches(barcode, recallText) {
  const code = (barcode || '').replace(/\D/g, '').replace(/^0+/, '');
  if (code.length < 8) return false;
  const withoutCheck = code.slice(0, -1);
  return barcodesIn(recallText).some((n) => n === code || n === withoutCheck || code === n.slice(0, -1));
}

function recallText(recall) {
  return [recall.product_description, recall.code_info].join(' ');
}

// Returns { recall, kind: 'barcode' | 'name', words } for each recall that matches the item.
// A name match needs the brand to appear plus one product word, or at least two product
// words (one is enough when the item name only has one).
export function matchItem(item, recalls) {
  const results = [];
  const nameWords = [...new Set(keywords(item.name))];
  const brandWords = [...new Set(keywords(item.brand))];
  for (const recall of recalls) {
    if (item.barcode && barcodeMatches(item.barcode, recallText(recall))) {
      results.push({ recall, kind: 'barcode', words: [] });
      continue;
    }
    // Ingredient lists are left out: "oats, milk" in a cookie notice is not a recall of milk.
    const productName = String(recall.product_description || '').split(/ingredients?\s*:/i)[0];
    const hay = ` ${keywords(`${productName} ${recall.recalling_firm}`).join(' ')} `;
    // Singular and plural forms count as the same word (mango, mangos, mangoes).
    const forms = (w) => [w, `${w}s`, `${w}es`, w.replace(/e?s$/, ''), w.replace(/s$/, '')];
    const hasWord = (w) => forms(w).some((f) => f.length >= 3 && hay.includes(` ${f} `));
    const nameHits = nameWords.filter(hasWord);
    const brandHit = brandWords.length > 0 && brandWords.every(hasWord);
    const needed = Math.min(2, nameWords.length);
    if (nameHits.length === 0) continue;
    if ((brandHit && nameHits.length >= 1) || nameHits.length >= needed) {
      results.push({ recall, kind: 'name', words: nameHits });
    }
  }
  // Barcode matches first, then the most recent.
  return results.sort((a, b) =>
    (a.kind === 'barcode' ? 0 : 1) - (b.kind === 'barcode' ? 0 : 1) ||
    String(b.recall.report_date).localeCompare(String(a.recall.report_date)));
}

// "20260923" -> "23 Sep 2026"
export function formatDate(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (!/^\d{8}$/.test(s)) return s;
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
