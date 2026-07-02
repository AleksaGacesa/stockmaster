import * as XLSX from 'xlsx'
import { downloadBlob } from './csv'

// Real .xlsx instead of a semicolon CSV — Excel always renders proper
// columns this way regardless of the user's regional/list-separator
// settings, and numeric cells stay actual numbers (sortable, summable)
// instead of locale-formatted text.
export const buildXlsxBlob = (sheetName, headers, rows) => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export const downloadXlsx = (filename, sheetName, headers, rows) => {
  downloadBlob(filename, buildXlsxBlob(sheetName, headers, rows))
}
