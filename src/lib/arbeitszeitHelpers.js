// Attendance math for the Zeiterfassung page. A worker's day is the
// UNION of their explicit Kommen→Gehen stamp and their montage spans
// (so a field worker who drives straight to site is counted from the
// montage's Abfahrt without stamping Kommen — "Abfahrt zählt als
// Kommen"), minus all pauses. Union (not sum) means overlapping
// office + montage time is never double-counted.

// Minutes of the live/closed pause segments in an arbeitszeit.
export const pausenMin = (az) => {
  if (az?.pause_override_min != null) return Math.max(Number(az.pause_override_min), 0)
  const segs = Array.isArray(az?.pausen) ? az.pausen : []
  return segs.reduce((sum, p) => {
    if (!p?.s) return sum
    const start = new Date(p.s).getTime()
    const end = p.e ? new Date(p.e).getTime() : Date.now()
    return sum + Math.max((end - start) / 60000, 0)
  }, 0)
}

// Is a pause currently running (last segment open)?
export const pauseLaeuft = (az) => {
  const segs = Array.isArray(az?.pausen) ? az.pausen : []
  return segs.length > 0 && !segs[segs.length - 1].e
}

const mergeIntervals = (ivs) => {
  const sorted = ivs.filter(Boolean).sort((a, b) => a[0] - b[0])
  const out = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([...iv])
  }
  return out
}

// One merged attendance day for a worker. `azInput` may be a single
// arbeitszeiten row, an array of them (multiple Kommen/Gehen sessions
// the same day — someone clocked out and back in), or null. Union of
// all session + montage spans, so gaps between sessions aren't paid.
export const arbeitstag = (azInput, montagen = []) => {
  const azList = Array.isArray(azInput) ? azInput.filter(Boolean) : (azInput ? [azInput] : [])
  const now = Date.now()
  const ivs = []
  let offen = false
  azList.forEach(az => {
    if (!az?.kommen_at) return
    const end = az.gehen_at ? new Date(az.gehen_at).getTime() : now
    if (!az.gehen_at) offen = true
    ivs.push([new Date(az.kommen_at).getTime(), end])
  })
  montagen.forEach(m => {
    const end = m.ende_at ? new Date(m.ende_at).getTime() : now
    if (!m.ende_at) offen = true
    ivs.push([new Date(m.abfahrt_at).getTime(), end])
  })
  if (ivs.length === 0) return { bruttoMin: 0, pauseMin: 0, nettoMin: 0, offen: false, start: null, ende: null, quellen: [] }

  const merged = mergeIntervals(ivs)
  const bruttoMin = merged.reduce((s, [a, b]) => s + (b - a) / 60000, 0)
  const pauseMin = azList.reduce((s, az) => s + pausenMin(az), 0) +
    montagen.reduce((s, m) => s + Math.max(Number(m.pause_min ?? 0), 0), 0)
  const nettoMin = Math.max(bruttoMin - pauseMin, 0)

  const quellen = []
  if (azList.some(az => az?.kommen_at)) quellen.push('stempel')
  if (montagen.length > 0) quellen.push('montage')

  return {
    bruttoMin, pauseMin, nettoMin, offen,
    start: Math.min(...merged.map(m => m[0])),
    ende: offen ? null : Math.max(...merged.map(m => m[1])),
    quellen,
  }
}

export const fmtStd = (min) => {
  const v = Math.max(Math.round(min), 0)
  const h = Math.floor(v / 60), mm = v % 60
  return `${h}:${String(mm).padStart(2, '0')}`
}
export const fmtStdDezimal = (min) => `${(Math.max(min, 0) / 60).toFixed(2).replace('.', ',')} h`
export const fmtUhr = (d) => d
  ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(d))
  : '—'

// Monday-based week start, N weeks back.
export const wochenStart = (offset = 0) => {
  const d = new Date(); const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day - offset * 7)
  return d
}
