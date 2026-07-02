// Shared by LieferantenPage and DashboardPage — pure data helpers for
// Bestellungen/Lieferanten, no JSX so both pages can import cheaply.

export const fmt   = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
export const fmtDt = (d) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

export const STATUS_META = {
  entwurf:      { label: 'Entwurf',     color: '#e8821c' },
  gesendet:     { label: 'Gesendet',    color: '#4a90d9' },
  bestaetigt:   { label: 'Bestätigt',   color: '#4a90d9' },
  eingetroffen: { label: 'Eingetroffen', color: '#4caf6e' },
}

export const bestellungTotal = (b) => (b.positionen ?? []).reduce((s, p) => s + p.menge * (p.preis ?? 0), 0)

// Netto-Bestellwert × Steuersatz → Netto / MwSt / Brutto
export const bestellungBrutto = (b) => {
  const netto = bestellungTotal(b)
  const satz = b.lieferant?.steuersatz ?? 19
  const mwst = netto * (satz / 100)
  return { netto, mwst, brutto: netto + mwst, satz }
}

// For every artikel_id: the most recent Bestellung-Position across all
// Bestellungen (any status), used for "last purchase" hints and the
// duplicate-order warning.
export const buildLastPurchaseMap = (bestellungen) => {
  const map = {}
  for (const b of bestellungen) {
    for (const p of (b.positionen ?? [])) {
      if (!p.artikel_id) continue
      const existing = map[p.artikel_id]
      if (!existing || new Date(b.created_at) > new Date(existing.created_at)) {
        map[p.artikel_id] = { created_at: b.created_at, menge: p.menge, preis: p.preis, bestellung_id: b.id }
      }
    }
  }
  return map
}

// For every artikel_id: total Menge sitting in orders that haven't
// arrived yet ("unterwegs").
export const buildUnterwegsMap = (bestellungen) => {
  const map = {}
  for (const b of bestellungen) {
    if (b.status === 'eingetroffen') continue
    for (const p of (b.positionen ?? [])) {
      if (!p.artikel_id) continue
      map[p.artikel_id] = (map[p.artikel_id] ?? 0) + Number(p.menge)
    }
  }
  return map
}

export const daysAgo = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

export const lieferantStats = (lieferanten, bestellungen) => lieferanten.map(l => {
  const bs = bestellungen.filter(b => b.lieferant_id === l.id)
  const offen = bs.filter(b => b.status !== 'eingetroffen')

  // On-time delivery: only Bestellungen that have both an
  // erwartete_lieferung (set when marked "gesendet") and actually
  // arrived can be judged.
  const bewertbar = bs.filter(b => b.status === 'eingetroffen' && b.erwartete_lieferung && b.eingetroffen_at)
  const paetlich  = bewertbar.filter(b => new Date(b.eingetroffen_at) <= new Date(b.erwartete_lieferung + 'T23:59:59'))
  const verspaetungenTage = bewertbar
    .filter(b => new Date(b.eingetroffen_at) > new Date(b.erwartete_lieferung + 'T23:59:59'))
    .map(b => Math.ceil((new Date(b.eingetroffen_at) - new Date(b.erwartete_lieferung)) / 86400000))

  return {
    lieferant: l,
    anzahl: bs.length,
    gesamtwert: bs.reduce((s, b) => s + bestellungTotal(b), 0),
    offenAnzahl: offen.length,
    offenWert: offen.reduce((s, b) => s + bestellungTotal(b), 0),
    bewertbarAnzahl: bewertbar.length,
    pctPaetlich: bewertbar.length > 0 ? Math.round((paetlich.length / bewertbar.length) * 100) : null,
    verspaetungenAnzahl: verspaetungenTage.length,
    avgVerspaetung: verspaetungenTage.length > 0
      ? Math.round((verspaetungenTage.reduce((s, d) => s + d, 0) / verspaetungenTage.length) * 10) / 10
      : 0,
  }
}).sort((a, b) => b.gesamtwert - a.gesamtwert)

export const lowStockForLieferant = (articles, lieferant) => articles.filter(a =>
  a.menge < a.mindestbestand &&
  (a.lieferant_id === lieferant.id || (!a.lieferant_id && (a.lieferant || '').trim() === lieferant.name))
)
