// Shared calendar helpers — used by KalenderPage and the Home
// "Heute anstehend" card so the type colours/icons stay in sync.

export const TERMIN_TYPES = {
  warenannahme: { icon: 'truck',     color: '#9b6bd9', labelKey: 'kal_type_warenannahme' },
  montage:      { icon: 'refresh',   color: '#4a90d9', labelKey: 'kal_type_montage' },
  kundentermin: { icon: 'building',  color: '#4caf6e', labelKey: 'kal_type_kundentermin' },
  projekt:      { icon: 'user',      color: '#e8821c', labelKey: 'kal_type_projekt' },
  inventur:     { icon: 'box',       color: '#3fb6c4', labelKey: 'kal_type_inventur' },
  sonstiges:    { icon: 'clipboard', color: '#9aa3ad', labelKey: 'kal_type_sonstiges' },
}

export const terminMeta = (typ) => TERMIN_TYPES[typ] ?? TERMIN_TYPES.sonstiges

// Postgres `time` comes back as 'HH:MM:SS' — trim to 'HH:MM'.
export const fmtUhrzeit = (u) => (u ? u.slice(0, 5) : null)

// A not-yet-done appointment whose date is already in the past.
export const isOverdue = (tm) => !tm.erledigt && tm.datum < `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

// Local 'YYYY-MM-DD' key (never via toISOString, which shifts by the
// UTC offset and can land a late-evening date on the wrong day).
export const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Earlier time first; all-day (no uhrzeit) events sort to the top.
export const byUhrzeit = (a, b) => (a.uhrzeit || '').localeCompare(b.uhrzeit || '')

// 42-cell (6-week) grid starting on the Monday on/before the 1st.
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(year, month, 1 - startOffset)
  const days = []
  for (let i = 0; i < 42; i++) days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  return days
}
