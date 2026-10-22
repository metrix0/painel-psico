"use client";

import { useState } from 'react';
import { resizeTable, mergeCells, splitCells } from '../lib/instrumentTables.mjs';

export function InstrumentTable({ table, onChange, readOnly = false }) {
  return <div className="instrument-table-wrap"><table className="instrument-table">
    <caption>{table.title}</caption>
    <tbody>{Array.from({ length: table.rows }, (_, row) => <tr key={row}>
      {table.cells.filter(c => c.row === row).sort((a, b) => a.col - b.col).map(c => <td key={c.col} rowSpan={c.rowSpan} colSpan={c.colSpan}>
        {c.editable && !readOnly ? <input aria-label={`${table.title}, linha ${row + 1}, coluna ${c.col + 1}`} value={c.text}
          onChange={e => onChange({ ...table, cells: table.cells.map(cell => cell === c ? { ...cell, text: e.target.value } : cell) })} /> : <span>{c.text || '—'}</span>}
      </td>)}
    </tr>)}</tbody>
  </table></div>;
}

export function TableEditor({ table, onChange, onRemove }) {
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const key = c => `${c.row}:${c.col}`;
  const toggle = c => { setError(''); setSelected(prev => prev.includes(key(c)) ? prev.filter(k => k !== key(c)) : [...prev, key(c)]); };
  function selectGroup(keys) {
    setError('');
    setSelected(prev => keys.every(item => prev.includes(item))
      ? prev.filter(item => !keys.includes(item))
      : [...new Set([...prev, ...keys])]);
  }
  function patchCells(patch) {
    onChange({ ...table, cells: table.cells.map(c => selected.includes(key(c)) ? { ...c, ...patch } : c) });
  }
  function resize(rows, cols) {
    if ((rows < table.rows || cols < table.cols) &&
      !window.confirm('Reduzir a tabela? Células fora do novo tamanho serão removidas.')) return;
    onChange(resizeTable(table, rows, cols)); setSelected([]);
  }
  return <div className="table-editor">
    <div className="table-toolbar">
      <label className="field"><span>Título da tabela</span><input value={table.title} onChange={e => onChange({ ...table, title: e.target.value })} /></label>
      <label className="field"><span>Linhas</span><select value={table.rows} onChange={e => resize(Number(e.target.value), table.cols)}>{Array.from({ length: 30 }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</select></label>
      <label className="field"><span>Colunas</span><select value={table.cols} onChange={e => resize(table.rows, Number(e.target.value))}>{Array.from({ length: 15 }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</select></label>
    </div>
    <p className="muted table-help">Digite diretamente nas células de texto fixo. Use o botão <strong>Texto fixo / Resultado</strong> em cada célula para definir onde serão preenchidas as respostas do paciente. Para editar várias células ou mesclar, marque as caixas ou clique nos números das linhas e colunas.</p>
    <div className="table-actions-group">
      <span className="table-selection-count" aria-live="polite">
        {selected.length ? selected.length + (selected.length === 1 ? " célula selecionada" : " células selecionadas") : "Nenhuma célula selecionada"}
      </span>
      <div className="actions table-actions">
        <button type="button" className="btn" disabled={!selected.length} onClick={() => patchCells({ editable: false })}>Texto fixo</button>
        <button type="button" className="btn soft" disabled={!selected.length} onClick={() => patchCells({ editable: true })}>Resultado</button>
        <button type="button" className="btn" disabled={selected.length < 2} onClick={() => {
          const merged = mergeCells(table, selected);
          if (!merged) { setError('Selecione células que formem um retângulo completo.'); return; }
          onChange(merged); setSelected([]); setError('');
        }}>Mesclar</button>
        <button type="button" className="btn" disabled={!selected.length} onClick={() => { onChange(splitCells(table, selected)); setSelected([]); }}>Desmesclar</button>
        {selected.length > 0 && <button type="button" className="text-btn" onClick={() => setSelected([])}>Limpar seleção</button>}
      </div>
    </div>
    {error && <p role="alert" className="muted">{error}</p>}
    <div className="instrument-table-wrap"><table className="instrument-table table-builder">
      <thead><tr><th><button type="button" aria-label="Selecionar toda a tabela" onClick={() => selectGroup(table.cells.map(key))}>Tudo</button></th>
        {Array.from({ length: table.cols }, (_, col) => <th key={col}><button aria-label={`Selecionar coluna ${col + 1}`}
          onClick={() => selectGroup(table.cells.filter(c => col >= c.col && col < c.col + c.colSpan).map(key))}>{col + 1}</button></th>)}
      </tr></thead>
      <tbody>{Array.from({ length: table.rows }, (_, row) => <tr key={row}>
        <th><button aria-label={`Selecionar linha ${row + 1}`} onClick={() => selectGroup(table.cells.filter(c => row >= c.row && row < c.row + c.rowSpan).map(key))}>{row + 1}</button></th>
        {table.cells.filter(c => c.row === row).sort((a, b) => a.col - b.col).map(c => <td key={c.col} rowSpan={c.rowSpan} colSpan={c.colSpan}
          className={(c.editable ? 'result-cell ' : '') + (selected.includes(key(c)) ? 'selected-cell' : '')}>
          <div className="table-cell-controls">
            <label className="cell-select"><input type="checkbox" checked={selected.includes(key(c))}
              onChange={() => toggle(c)} aria-label={`Selecionar célula ${row + 1}, ${c.col + 1}`} />
              <span>Selecionar</span></label>
            <button type="button" className={"table-cell-type" + (c.editable ? " is-result" : "")}
              aria-label={`Célula ${row + 1}, ${c.col + 1}: ${c.editable ? "Resultado" : "Texto fixo"}. Clique para alternar.`}
              aria-pressed={c.editable} title="Alternar entre texto fixo e resultado"
              onClick={() => onChange({ ...table, cells: table.cells.map(cell => cell === c ? { ...cell, editable: !c.editable } : cell) })}>
              {c.editable ? "Resultado" : "Texto fixo"}
            </button>
          </div>
          {c.editable
            ? <span className="table-result-hint">Preenchido no paciente</span>
            : <input aria-label={`Texto da célula ${row + 1}, ${c.col + 1}`} placeholder="Digite o texto fixo" value={c.text}
                onChange={e => onChange({ ...table, cells: table.cells.map(cell => cell === c ? { ...cell, text: e.target.value } : cell) })} />}
        </td>)}
      </tr>)}</tbody>
    </table></div>
    <button className="text-btn" onClick={onRemove}>Remover tabela</button>
  </div>;
}
