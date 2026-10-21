import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, mergeCells, splitCells, resizeTable, instantiateTables } from '../lib/instrumentTables.mjs';

function assertCoverage(t) {
  for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) {
    assert.equal(t.cells.filter(c => row >= c.row && row < c.row + c.rowSpan && col >= c.col && col < c.col + c.colSpan).length, 1);
  }
}
test('rectangular merges span rows and columns, reject holes, split without losing coverage', () => {
  const t = createTable();
  assert.equal(mergeCells(t, ['0:0', '1:1']), null);
  const merged = mergeCells(t, ['0:0', '0:1', '1:0', '1:1']);
  assertCoverage(merged);
  const cell = merged.cells.find(c => c.row === 0 && c.col === 0);
  assert.equal(cell.rowSpan, 2); assert.equal(cell.colSpan, 2);
  const split = splitCells(merged, ['0:0']);
  assertCoverage(split); assert.equal(split.cells.length, 9);
});
test('resizing merged tables preserves exact grid coverage and remaining content', () => {
  let t = createTable(); t.cells[0].text = 'Fixed heading';
  t = mergeCells(t, ['0:0', '0:1', '1:0', '1:1']);
  for (const [rows, cols] of [[1,1], [4,5], [2,2]]) {
    t = resizeTable(t, rows, cols); assertCoverage(t);
    assert.equal(t.cells.find(c => c.row === 0 && c.col === 0).text, 'Fixed heading');
  }
});
test('patient snapshots keep fixed text, clear result cells, and remain independent', () => {
  const t = createTable(); t.cells[0].text = 'Heading';
  t.cells[1].editable = true; t.cells[1].text = 'Template text';
  const snapshot = instantiateTables([t]);
  assert.equal(snapshot[0].cells[0].text, 'Heading'); assert.equal(snapshot[0].cells[1].text, '');
  snapshot[0].cells[1].text = '42'; t.cells[0].text = 'Changed heading';
  assert.equal(snapshot[0].cells[0].text, 'Heading'); assert.equal(t.cells[1].text, 'Template text');
});
