export const newCell = (row, col) => ({ row, col, rowSpan: 1, colSpan: 1, text: '', editable: false });
export function createTable() {
  return { id: crypto.randomUUID(), title: 'Nova tabela', rows: 3, cols: 3,
    cells: Array.from({ length: 9 }, (_, n) => newCell(Math.floor(n / 3), n % 3)) };
}
export function resizeTable(table, rows, cols) {
  const cells = table.cells.filter(c => c.row < rows && c.col < cols).map(c => ({ ...c,
    rowSpan: Math.min(c.rowSpan, rows - c.row), colSpan: Math.min(c.colSpan, cols - c.col) }));
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    if (!cells.some(c => row >= c.row && row < c.row + c.rowSpan && col >= c.col && col < c.col + c.colSpan)) cells.push(newCell(row, col));
  }
  return { ...table, rows, cols, cells };
}
export function mergeCells(table, selected) {
  const cells = table.cells.filter(c => selected.includes(`${c.row}:${c.col}`));
  if (cells.length < 2) return null;
  const top = Math.min(...cells.map(c => c.row)), left = Math.min(...cells.map(c => c.col));
  const bottom = Math.max(...cells.map(c => c.row + c.rowSpan)), right = Math.max(...cells.map(c => c.col + c.colSpan));
  const area = cells.reduce((n, c) => n + c.rowSpan * c.colSpan, 0);
  if (area !== (bottom - top) * (right - left)) return null;
  const first = cells.find(c => c.row === top && c.col === left);
  return { ...table, cells: [...table.cells.filter(c => !cells.includes(c)),
    { ...first, rowSpan: bottom - top, colSpan: right - left, text: cells.map(c => c.text).filter(Boolean).join(' ') }] };
}
export function splitCells(table, selected) {
  return { ...table, cells: table.cells.flatMap(c => {
    if (!selected.includes(`${c.row}:${c.col}`)) return [c];
    return Array.from({ length: c.rowSpan * c.colSpan }, (_, n) => ({ ...newCell(c.row + Math.floor(n / c.colSpan), c.col + n % c.colSpan),
      text: n === 0 ? c.text : '', editable: c.editable }));
  }) };
}
export function instantiateTables(tables) {
  return tables.map(t => ({ ...t, cells: t.cells.map(c => ({ ...c, text: c.editable ? '' : c.text })) }));
}
