// Shared by AuftraegePage and the Dashboard's Aufträge face — pure
// data helpers, no JSX, so both can import cheaply.

export const fmt   = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
export const fmtDt = (d) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

export const STATUS_META = {
  geplant:       { label: 'Geplant',       color: '#9aa3ad' },
  aktiv:         { label: 'Aktiv',         color: '#4a90d9' },
  pausiert:      { label: 'Pausiert',      color: '#e8821c' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#4caf6e' },
  storniert:     { label: 'Storniert',     color: '#e0524a' },
}

export const isOffen = (status) => status !== 'abgeschlossen' && status !== 'storniert'
export const isSpaet = (p) => p.rok && isOffen(p.status) && new Date(p.rok) < new Date(new Date().toDateString())

export const materialGeplantWert = (p) => (p.material ?? []).reduce((s, m) => s + m.geplant_menge * m.preis, 0)

// The clock only runs while a project is "Aktiv" — each row in
// zeiterfassung is one uninterrupted stretch at a fixed headcount. A
// currently-running stretch (ended_at null) counts up to now().
const segmentStundenRoh = (seg) => {
  const start = new Date(seg.started_at)
  const end = seg.ended_at ? new Date(seg.ended_at) : new Date()
  return Math.max((end - start) / 3600000, 0)
}

// Man-hours (elapsed × Anzahl Arbeiter) — a raw effort metric, shown
// on the stat card so "3 Leute für 2 Std." reads as 6 Arbeitsstunden.
export const projektArbeitsstunden = (p) => (p.zeiterfassung ?? []).reduce(
  (sum, seg) => sum + segmentStundenRoh(seg) * (seg.arbeiter_anzahl ?? 1), 0
)

// projekt.stundensatz holds the CURRENT combined €/h of the whole
// crew (sum of each worker's own rate, entered individually in the
// UI) — not a per-person rate. So cost is elapsed hours × that total,
// with no extra multiplication by headcount (that's already baked
// into the sum). Like the old flat-rate model, this uses today's
// stundensatz for every past stretch too — there's no per-segment
// snapshot column, so a rate change also (slightly) reshapes already-
// logged history. Acceptable trade-off to avoid a schema change.
export const projektArbeitskosten = (p) => projektElapsedStunden(p) * Number(p.stundensatz ?? 24)

export const projektElapsedStunden = (p) => (p.zeiterfassung ?? []).reduce((sum, seg) => sum + segmentStundenRoh(seg), 0)

export const projektGesamtkosten = (p) => materialGeplantWert(p) + projektArbeitskosten(p)
export const projektGewinn = (p) => Number(p.verkaufspreis ?? 0) - projektGesamtkosten(p)

export const offeneSegmente = (p) => (p.zeiterfassung ?? []).filter(s => !s.ended_at)
export const offenesSegment = (p) => offeneSegmente(p)[0] ?? null

// Earliest start among currently-open segments — feeds the live
// ticking "Aktiv seit" clock. Null while nothing is running.
export const projektAktivSeit = (p) => {
  const offene = offeneSegmente(p)
  return offene.length > 0 ? Math.min(...offene.map(s => new Date(s.started_at).getTime())) : null
}

export const fmtDauer = (ms) => {
  const totalMinutes = Math.max(Math.floor(ms / 60000), 0)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}T ${hours}Std`
  if (hours > 0) return `${hours}Std ${minutes}Min`
  return `${minutes}Min`
}

// Wall-clock days from the first time this project ever went Aktiv
// until it was Abgeschlossen (or until now, if it's still running) —
// "how long did/does this project take", not labor-hours.
export const projektLaufzeitTage = (p) => {
  const segments = p.zeiterfassung ?? []
  if (segments.length === 0) return null
  const earliest = Math.min(...segments.map(s => new Date(s.started_at).getTime()))
  const end = p.abgeschlossen_at ? new Date(p.abgeschlossen_at).getTime() : Date.now()
  return Math.max((end - earliest) / 86400000, 0)
}

// Average profit margin (%) across finished projects with a sale
// price — a quick "are we pricing jobs right" health check.
export const durchschnittGewinnmarge = (projekte, verbrauchMap, articles) => {
  const done = projekte.filter(p => p.status === 'abgeschlossen' && Number(p.verkaufspreis) > 0)
  if (done.length === 0) return null
  const margins = done.map(p => (projektRealisierterGewinn(p, verbrauchMap, articles) / Number(p.verkaufspreis)) * 100)
  return margins.reduce((s, m) => s + m, 0) / margins.length
}

// Realized profit uses what was actually issued via Warenausgang
// (verbrauchMap), not the original material plan — a finished project
// should reflect reality, not the estimate. Labor cost is always
// "real" since it comes from actual elapsed time. Falls back to the
// article's current price for material that was never explicitly
// planned.
export const projektRealisierterGewinn = (p, verbrauchMap, articles) => {
  const vb = verbrauchMap[p.id] ?? {}
  const materialIstWert = Object.entries(vb).reduce((s, [artikelId, menge]) => {
    const line = (p.material ?? []).find(m => m.artikel_id === Number(artikelId))
    const preis = line ? line.preis : (articles.find(a => a.id === Number(artikelId))?.preis ?? 0)
    return s + menge * preis
  }, 0)
  return Number(p.verkaufspreis ?? 0) - materialIstWert - projektArbeitskosten(p)
}

// For every artikel_id: how much is still "spoken for" by OPEN
// projects (geplant minus whatever that same project already
// consumed), excluding one project if given (so a project doesn't
// see its own planned material as "reserved by someone else").
export const buildReservierungMap = (projekte, verbrauchMap, excludeProjektId = null) => {
  const map = {}
  projekte
    .filter(p => isOffen(p.status) && p.id !== excludeProjektId)
    .forEach(p => {
      const vb = verbrauchMap[p.id] ?? {}
      ;(p.material ?? []).forEach(m => {
        const verbraucht = vb[m.artikel_id] ?? 0
        const nochOffen = Math.max(m.geplant_menge - verbraucht, 0)
        if (nochOffen > 0) map[m.artikel_id] = (map[m.artikel_id] ?? 0) + nochOffen
      })
    })
  return map
}
