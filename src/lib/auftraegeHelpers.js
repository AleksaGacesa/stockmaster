// Shared by AuftraegePage and the Dashboard's Aufträge face — pure
// data helpers, no JSX, so both can import cheaply.
import { montageMinuten, montageKosten } from './montagenHelpers'

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

// ── LEGACY crew clock (projekt_zeiterfassung) ──
// Replaced by the per-worker Montagen punch clock: the old clock ran
// 24h/day while a project was "Aktiv", which inflated labor costs.
// It survives only as a FALLBACK for projects finished before the
// Montagen rework (segments exist, montage entries don't).
const segmentStundenRoh = (seg) => {
  const start = new Date(seg.started_at)
  const end = seg.ended_at ? new Date(seg.ended_at) : new Date()
  return Math.max((end - start) / 3600000, 0)
}
const legacyArbeitsstunden = (p) => (p.zeiterfassung ?? []).reduce(
  (sum, seg) => sum + segmentStundenRoh(seg) * (seg.arbeiter_anzahl ?? 1), 0
)
export const projektElapsedStunden = (p) => (p.zeiterfassung ?? []).reduce((sum, seg) => sum + segmentStundenRoh(seg), 0)
const legacyArbeitskosten = (p) => projektElapsedStunden(p) * Number(p.stundensatz ?? 24)

// ── Montagen-based labor (the real model) ──
// `montagen` = this project's punch-clock entries. Only COMPLETED days
// count: their hourly and km rates were frozen at Feierabend, so the
// figures never shift retroactively.
const beendeteMontagen = (montagen) => (montagen ?? []).filter(m => m.ende_at)

export const projektArbeitsstunden = (p, montagen) => {
  const done = beendeteMontagen(montagen)
  if (done.length > 0) return done.reduce((s, m) => s + montageMinuten(m), 0) / 60
  return legacyArbeitsstunden(p)
}

export const projektArbeitskosten = (p, montagen) => {
  const done = beendeteMontagen(montagen)
  if (done.length > 0) return done.reduce((s, m) => s + montageKosten(m), 0)
  return (p.zeiterfassung ?? []).length > 0 ? legacyArbeitskosten(p) : 0
}

// Uses the labor cost frozen at project creation (geplante_arbeitskosten
// — crew × weekly-hours target × weeks until deadline), not the live
// elapsed-time figure — a "planned" cost that changes when the crew
// shrinks or grows mid-project isn't a plan at all. See
// projektArbeitskosten for the live equivalent and
// projektRealisierterGewinn for the fully-realized one.
export const projektGesamtkosten = (p) => materialGeplantWert(p) + Number(p.geplante_arbeitskosten ?? 0)
export const projektGewinn = (p) => Number(p.verkaufspreis ?? 0) - projektGesamtkosten(p)

// Earliest departure among currently-RUNNING montagen of a project —
// feeds the live "Im Einsatz seit" clock. Null while nobody is out.
export const projektAktivSeit = (montagen) => {
  const laufend = (montagen ?? []).filter(m => !m.ende_at)
  return laufend.length > 0 ? Math.min(...laufend.map(m => new Date(m.abfahrt_at).getTime())) : null
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

// Wall-clock days from the first montage day (or, for legacy projects,
// the first crew-clock segment) until Abgeschlossen/now — "how long
// did/does this project take", not labor-hours.
export const projektLaufzeitTage = (p, montagen) => {
  const starts = [
    ...(montagen ?? []).map(m => new Date(m.abfahrt_at).getTime()),
    ...(p.zeiterfassung ?? []).map(s => new Date(s.started_at).getTime()),
  ]
  if (starts.length === 0) return null
  const end = p.abgeschlossen_at ? new Date(p.abgeschlossen_at).getTime() : Date.now()
  return Math.max((end - Math.min(...starts)) / 86400000, 0)
}

// Average profit margin (%) across finished projects with a sale
// price — a quick "are we pricing jobs right" health check.
export const durchschnittGewinnmarge = (projekte, verbrauchMap, articles, montagenByProjekt = {}) => {
  const done = projekte.filter(p => p.status === 'abgeschlossen' && Number(p.verkaufspreis) > 0)
  if (done.length === 0) return null
  const margins = done.map(p =>
    (projektRealisierterGewinn(p, verbrauchMap, articles, montagenByProjekt[p.id]) / Number(p.verkaufspreis)) * 100)
  return margins.reduce((s, m) => s + m, 0) / margins.length
}

// Realized profit uses what was actually issued via Warenausgang
// (verbrauchMap), not the original material plan — a finished project
// should reflect reality, not the estimate. Labor cost is always
// "real" since it comes from actual elapsed time. Falls back to the
// article's current price for material that was never explicitly
// planned.
export const projektRealisierterGewinn = (p, verbrauchMap, articles, montagen) => {
  const vb = verbrauchMap[p.id] ?? {}
  const materialIstWert = Object.entries(vb).reduce((s, [artikelId, menge]) => {
    const line = (p.material ?? []).find(m => m.artikel_id === Number(artikelId))
    const preis = line ? line.preis : (articles.find(a => a.id === Number(artikelId))?.preis ?? 0)
    return s + menge * preis
  }, 0)
  return Number(p.verkaufspreis ?? 0) - materialIstWert - projektArbeitskosten(p, montagen)
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
