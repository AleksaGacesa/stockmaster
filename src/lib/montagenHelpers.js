// Pure time/cost math for Montagen entries — shared by MontagenPage
// (punch clock + dashboard) and the Aufträge cost calculation, which
// since the Montagen rework derives project labor costs from these
// entries instead of the old 24h crew clock.

// Outbound drive, fixed once the worker taps "Angekommen". Entries
// started with "Arbeit starten" (no paid drive that day) have no
// abfahrt_at — their Fahrzeit is simply none.
export const montageFahrzeitMin = (m) => (m.ankunft_at && m.abfahrt_at)
  ? Math.max((new Date(m.ankunft_at) - new Date(m.abfahrt_at)) / 60000, 0)
  : null

// The entry's reference start for sorting/day-grouping: the drive start
// if there was one, otherwise the moment work began. Never null — every
// entry has at least one of the two.
export const montageStartAt = (m) => m.abfahrt_at ?? m.ankunft_at ?? m.arbeit_start_at

// Net working time (work start → end/now, minus the reported break).
// Work now starts explicitly ("Arbeit starten"), separate from arrival,
// so the anchor is arbeit_start_at. Legacy rows never had that column —
// for a completed legacy row we fall back to ankunft_at so old totals
// stay identical; a row that has only arrived (arbeit_start_at null,
// not finished) counts no work time yet.
export const montageArbeitMin = (m) => {
  const start = m.arbeit_start_at ?? (m.ende_at ? m.ankunft_at : null)
  if (!start) return 0
  const ende = m.ende_at ? new Date(m.ende_at) : new Date()
  return Math.max((ende - new Date(start)) / 60000 - Number(m.pause_min ?? 0), 0)
}

export const montageMinuten = (m) => (montageFahrzeitMin(m) ?? 0) + montageArbeitMin(m)

// Cost of a COMPLETED entry from the rates frozen at Feierabend.
// (Running entries have no snapshot yet — the Montagen page previews
// them with live rates; project totals only count completed days.)
export const montageKosten = (m) =>
  (montageMinuten(m) / 60) * Number(m.stundensatz ?? 0) + Number(m.km ?? 0) * Number(m.km_satz ?? 0)

export const montageArbeitskosten = (m) => (montageMinuten(m) / 60) * Number(m.stundensatz ?? 0)
export const montageFahrtkosten = (m) => Number(m.km ?? 0) * Number(m.km_satz ?? 0)

export const fmtMin = (min) => {
  if (min === null || min === undefined) return '—'
  const v = Math.max(Math.round(min), 0)
  const h = Math.floor(v / 60), mm = v % 60
  return h > 0 ? `${h} Std ${mm} Min` : `${mm} Min`
}
export const fmtH = (min) => min === null || min === undefined
  ? '—' : `${(min / 60).toFixed(1).replace('.', ',')} h`

// Great-circle distance in meters — for the GPS check-in ("did the
// worker actually arrive at the site the boss pinned on the map?").
export const distanzMeter = (lat1, lng1, lat2, lng2) => {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

export const fmtDistanz = (m) => m >= 1000
  ? `${(m / 1000).toFixed(1).replace('.', ',')} km`
  : `${Math.round(m)} m`
