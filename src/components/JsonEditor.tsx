"use client"

import React from 'react'

interface JsonEditorTableCellProps {
  cell: any;
  rowIdx: number;
  colIdx: number;
  path: string[];
  updateNestedValue: (path: string[], newValue: any) => void;
}

const JsonEditorTableCell: React.FC<JsonEditorTableCellProps> = ({ cell, rowIdx, colIdx, path, updateNestedValue }) => {
  return (
    <td className="px-2 py-1 border-r border-slate-200 dark:border-slate-800 align-top">
      <textarea
        value={String(cell)}
        onChange={(e) => updateNestedValue([...path, 'rows', String(rowIdx), String(colIdx)], e.target.value)}
        className="w-full bg-transparent outline-none resize-y min-h-[40px] focus:bg-slate-100 dark:focus:bg-slate-800 rounded p-1 transition-colors"
      />
    </td>
  );
};

interface JsonEditorTableRowProps {
  row: any[];
  rowIdx: number;
  path: string[];
  updateNestedValue: (path: string[], newValue: any) => void;
  removeTableRow: (path: string[], rowIdx: number) => void;
}

const JsonEditorTableRow: React.FC<JsonEditorTableRowProps> = ({ row, rowIdx, path, updateNestedValue, removeTableRow }) => {
  return (
    <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <td className="w-8 border-r border-slate-200 dark:border-slate-800 text-center align-middle">
        <button
          onClick={() => removeTableRow(path, rowIdx)}
          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
          title="Remove Row"
        >
          <span className="material-symbols-outlined text-[16px]">remove_circle</span>
        </button>
      </td>
      {row.map((cell: any, colIdx: number) => (
        <JsonEditorTableCell
          key={colIdx}
          cell={cell}
          rowIdx={rowIdx}
          colIdx={colIdx}
          path={path}
          updateNestedValue={updateNestedValue}
        />
      ))}
    </tr>
  );
};

interface JsonEditorTableProps {
  value: any;
  path: string[];
  updateNestedValue: (path: string[], newValue: any) => void;
  addTableRow: (path: string[], rowLength: number) => void;
  removeTableRow: (path: string[], rowIdx: number) => void;
}

const JsonEditorTable: React.FC<JsonEditorTableProps> = ({ value, path, updateNestedValue, addTableRow, removeTableRow }) => {
  return (
    <div className="space-y-2 mt-2">
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-md shadow-sm custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs uppercase">
            <tr>
              <th className="w-8 border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"></th>
              {value.headers.map((h: string, colIdx: number) => (
                <th key={colIdx} className="min-w-[150px] px-2 py-2 border-b border-r border-slate-200 dark:border-slate-700 align-top">
                  <textarea
                    value={String(h)}
                    onChange={(e) => updateNestedValue([...path, 'headers', String(colIdx)], e.target.value)}
                    className="w-full bg-transparent outline-none resize-y min-h-[40px] font-bold"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row: any[], rowIdx: number) => (
              <JsonEditorTableRow
                key={rowIdx}
                row={row}
                rowIdx={rowIdx}
                path={path}
                updateNestedValue={updateNestedValue}
                removeTableRow={removeTableRow}
              />
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => addTableRow(path, value.headers.length)}
        className="mt-2 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 px-3 py-1.5 rounded flex items-center gap-1 transition-colors border border-[var(--color-primary)]/20 shadow-sm"
      >
        <span className="material-symbols-outlined text-[14px]">add</span>
        ADD ROW
      </button>
    </div>
  );
};

interface JsonEditorProps {
  data: any
  onUpdate: (newData: any) => void
}

export function JsonEditor({ data, onUpdate }: JsonEditorProps) {
  const updateNestedValue = (path: string[], newValue: any) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }
    const lastKey = path[path.length - 1]
    const oldValue = current[lastKey]

    if (typeof oldValue === 'number' && !isNaN(Number(newValue)) && newValue !== '') {
      current[lastKey] = Number(newValue)
    } else {
      current[lastKey] = newValue
    }
    onUpdate(newData)
  }

  const addTableRow = (path: string[], rowLength: number) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData
    for (const key of path) { current = current[key] }
    current.rows.push(Array(rowLength).fill(""))
    onUpdate(newData)
  }

  const removeTableRow = (path: string[], rowIdx: number) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData
    for (const key of path) { current = current[key] }
    current.rows.splice(rowIdx, 1)
    onUpdate(newData)
  }

  const renderValue = (value: any, path: string[] = []): React.ReactNode => {
    if (value === null || value === undefined) {
      return (
        <input
          type="text"
          value=""
          onChange={(e) => updateNestedValue(path, e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] shadow-sm"
          placeholder="Empty value"
        />
      )
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return (
        <textarea
          value={String(value)}
          onChange={(e) => updateNestedValue(path, e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] resize-y shadow-sm"
          rows={String(value).length > 80 ? 4 : 1}
        />
      )
    }

    if (typeof value === 'boolean') {
      return (
        <select
          value={String(value)}
          onChange={(e) => updateNestedValue(path, e.target.value === 'true')}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] shadow-sm"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      )
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-xs italic text-slate-500">Empty List</span>;
      return (
        <div className="space-y-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700 mt-2">
          {value.map((item, idx) => (
            <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm relative">
              <span className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">Item {idx + 1}</span>
              {renderValue(item, [...path, String(idx)])}
            </div>
          ))}
        </div>
      )
    }

    if (typeof value === 'object') {
      // Spreadsheet Table View Detection
      if (Array.isArray(value.headers) && Array.isArray(value.rows)) {
        return (
          <JsonEditorTable
            value={value}
            path={path}
            updateNestedValue={updateNestedValue}
            addTableRow={addTableRow}
            removeTableRow={removeTableRow}
          />
        )
      }

      return (
        <div className="space-y-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700 mt-2">
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 mt-1">
                {key.replace(/_/g, ' ')}
              </label>
              {renderValue(val, [...path, key])}
            </div>
          ))}
        </div>
      )
    }

    return <span className="text-xs text-slate-500">Unsupported type</span>
  }

  // Hide the initial outer key and render directly if it's a single key object wrapper
  const keys = Object.keys(data);
  const isWrapper = keys.length === 1 && typeof data[keys[0]] === 'object';

  const contentToRender = isWrapper ? data[keys[0]] : data;
  const initialPath = isWrapper ? [keys[0]] : [];

  return (
    <div className="space-y-4 mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--color-primary)] mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">edit_note</span>
        {isWrapper ? keys[0].replace(/_/g, ' ').toUpperCase() : 'Data Attributes'}
      </h3>
      <div className="pt-2">
        {typeof contentToRender === 'object' && !Array.isArray(contentToRender) ? (
          Object.entries(contentToRender).map(([key, value]) => (
            <div key={key} className="space-y-1 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-100 dark:border-slate-800 mb-4 shadow-sm">
              <label className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider block mb-2">
                {key.replace(/_/g, ' ')}
              </label>
              {renderValue(value, [...initialPath, key])}
            </div>
          ))
        ) : (
          renderValue(contentToRender, initialPath)
        )}
      </div>
    </div>
  )
}
