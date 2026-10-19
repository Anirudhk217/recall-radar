import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keywords, barcodesIn, barcodeMatches, matchItem, formatDate } from '../site/match.js';

const { recalls } = JSON.parse(readFileSync(new URL('../site/data/recalls.json', import.meta.url)));
const ids = (item) => matchItem(item, recalls).map((m) => m.recall.recall_number);

test('keywords drops short, generic and numeric words', () => {
  assert.deepEqual(keywords('Spicy Guacamole, 16 oz Fresh'), ['guacamole']);
});

test('barcodesIn reads spaced and hyphenated UPCs', () => {
  assert.deepEqual(barcodesIn('Net Wt. 5.0 oz (142 g) UPC 0 87906-01018'), ['8790601018']);
});

test('barcode matches with or without the check digit', () => {
  const text = 'UPC 0 87906-01018';
  assert.equal(barcodeMatches('087906010180', text), true); // full UPC-A with check digit
  assert.equal(barcodeMatches('08790601018', text), true);
  assert.equal(barcodeMatches('0087906010180', text), true); // EAN-13 form
  assert.equal(barcodeMatches('012345678905', text), false);
});

test('barcode match beats name matching', () => {
  const m = matchItem({ name: 'Sprout snack', barcode: '087906010180' }, recalls);
  assert.equal(m[0].kind, 'barcode');
  assert.equal(m[0].recall.recall_number, 'H-1339-2026');
});

test('name match needs two product words, or the brand plus one', () => {
  assert.deepEqual(ids({ name: 'Protein sprout mix' }), ['H-1339-2026']);
  assert.deepEqual(ids({ name: 'Protein bar' }), []);
  assert.deepEqual(ids({ name: 'Granola bites', brand: 'Everything Sprouts' }), []);
  assert.deepEqual(ids({ name: 'Crunchy sprouts', brand: 'Everything Sprouts' }), ['H-1339-2026']);
});

test('single-word items match on that word', () => {
  assert.ok(ids({ name: 'Guacamole' }).includes('H-1351-2026'));
  assert.ok(ids({ name: 'Mangoes' }).includes('H-1342-2026'));
  assert.ok(ids({ name: 'Mango' }).includes('H-1342-2026'));
});

test('ingredient lists do not cause matches', () => {
  assert.deepEqual(ids({ name: 'Whole milk' }), []);
});

test('unrelated items do not match', () => {
  for (const name of ['Nutella hazelnut spread', 'Oat milk', 'Basmati rice', 'Peanut butter']) {
    assert.deepEqual(ids({ name }), [], name);
  }
});

test('formatDate turns openFDA dates into readable ones', () => {
  assert.match(formatDate('20260923'), /^23 Sept? 2026$/);
  assert.equal(formatDate(''), '');
});
