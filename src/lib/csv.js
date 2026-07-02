// German Excel expects ";" as the field separator and "," as the
// decimal mark — a plain comma-CSV opens as one garbled column. The
// UTF-8 BOM is what makes Excel render ä/ö/ü/ß correctly instead of
// mangling them.
const escapeField = (v) => {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const deNum = (n) => Number(n ?? 0).toFixed(2).replace('.', ',')

export const buildCsv = (headers, rows) => {
  const lines = [headers, ...rows].map(row => row.map(escapeField).join(';'))
  return '﻿' + lines.join('\r\n')
}

export const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadCsv = (filename, headers, rows) => {
  downloadBlob(filename, new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' }))
}
