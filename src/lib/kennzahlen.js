// Reconstructs the six Home headline figures for past points in time
// from the movement/order/project log, so the dashboard can show a
// real trend the moment the feature ships — before enough live daily
// snapshots have been recorded. It's approximate only in that it
// prices past stock at today's prices and can't see historical status
// changes (a project is treated as "active" while it existed and
// wasn't yet finished). The most recent point is always overwritten
// with the exact live figures by the caller so the sparkline ends on
// the same number shown big on the card.

// End-of-month timestamps for the last `count` months, oldest first;
// the final entry is "now" so the series ends at the current moment.
export function monthlyCutoffs(count = 6, now = new Date()) {
  const out = []
  for (let i = count - 1; i >= 1; i--) {
    out.push(new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59))
  }
  out.push(now)
  return out
}

const monthLabel = (d, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'de-DE', { month: 'short' }).format(d)

export function reconstructSeries({ articles, moves, allBestellungen, allProjekte }, lang, count = 6) {
  const cutoffs = monthlyCutoffs(count)
  return cutoffs.map(cutoff => {
    const t = cutoff.getTime()

    // Walk each article's stock backwards by undoing every movement
    // logged after this cutoff.
    const revDelta = {}
    for (const m of moves) {
      if (new Date(m.created_at).getTime() > t) {
        revDelta[m.artikel_id] = (revDelta[m.artikel_id] ?? 0) + (m.typ === 'eingang' ? -1 : 1) * Number(m.menge)
      }
    }

    let artikel_anzahl = 0, lagerwert = 0, niedriger_bestand = 0
    for (const a of articles) {
      if (a.created_at && new Date(a.created_at).getTime() > t) continue // didn't exist yet
      artikel_anzahl++
      const stock = Math.max(a.menge + (revDelta[a.id] ?? 0), 0)
      lagerwert += stock * a.preis
      if (stock < a.mindestbestand) niedriger_bestand++
    }

    const offene_bestellungen = allBestellungen.filter(b =>
      new Date(b.created_at).getTime() <= t &&
      (!b.eingetroffen_at || new Date(b.eingetroffen_at).getTime() > t)
    ).length

    const aktiveProjekte = allProjekte.filter(p =>
      new Date(p.created_at).getTime() <= t &&
      (!p.abgeschlossen_at || new Date(p.abgeschlossen_at).getTime() > t) &&
      p.status !== 'storniert'
    )
    const erwarteter_gewinn = aktiveProjekte.reduce((s, p) => {
      const material = (p.material ?? []).reduce((s2, m) => s2 + Number(m.geplant_menge) * Number(m.preis), 0)
      return s + (Number(p.verkaufspreis ?? 0) - material)
    }, 0)

    return {
      label: monthLabel(cutoff, lang),
      artikel_anzahl,
      lagerwert,
      niedriger_bestand,
      offene_bestellungen,
      aktive_projekte: aktiveProjekte.length,
      erwarteter_gewinn,
    }
  })
}

// Percentage change of the latest point vs. the first point of the
// series (≈ one month per step). Returns null when there's no
// meaningful baseline to compare against.
export function trendFor(series, key) {
  if (!series || series.length < 2) return null
  const now = series[series.length - 1][key]
  const prev = series[series.length - 2][key]
  if (prev === 0 && now === 0) return null
  const abs = now - prev
  const pct = prev !== 0 ? (abs / Math.abs(prev)) * 100 : null
  return { abs, pct, up: abs > 0, down: abs < 0 }
}
