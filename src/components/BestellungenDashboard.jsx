import { useMemo, useState, useEffect } from 'react'
import Card from './Card'
import DonutChart from './DonutChart'
import CountUp from './CountUp'
import { useLanguage } from '../hooks/useLanguage'
import { fmt, fmtDt, bestellungTotal, buildLastPurchaseMap, lieferantStats } from '../lib/bestellungHelpers'

const COLORS = ['#e8821c', '#4caf6e', '#4a90d9', '#9b6bd9', '#d96b8f']

export default function BestellungenDashboard({ bestellungen, lieferanten, articles, onJumpToLieferant }) {
  const { t, lang } = useLanguage()
  const offen = bestellungen.filter(b => b.status !== 'eingetroffen')
  const offenWert = offen.reduce((s, b) => s + bestellungTotal(b), 0)

  const lastPurchase = useMemo(() => buildLastPurchaseMap(bestellungen), [bestellungen])
  const stats = lieferantStats(lieferanten, bestellungen)
  const maxWert = Math.max(...stats.map(s => s.gesamtwert), 1)

  // Bars/donut animate in from zero once mounted, instead of snapping
  // straight to their final size.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const donutData = useMemo(() =>
    stats.filter(s => s.gesamtwert > 0).slice(0, 5).map((s, i) => ({
      label: s.lieferant.name, value: mounted ? s.gesamtwert : 0, color: COLORS[i % COLORS.length],
    }))
  , [stats, mounted])

  const recentPurchases = useMemo(() => {
    return Object.entries(lastPurchase)
      .map(([artikelId, info]) => {
        const a = articles.find(x => x.id === Number(artikelId))
        return a ? { artikel: a, ...info } : null
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
  }, [lastPurchase, articles])

  const monat = useMemo(() => {
    const now = new Date()
    const isThisMonth = (d) => {
      const dt = new Date(d)
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
    }
    const bestellt = bestellungen.filter(b => isThisMonth(b.created_at))
    const bestelltWert = bestellt.reduce((s, b) => s + bestellungTotal(b), 0)
    const erhalten = bestellungen.filter(b => b.status === 'eingetroffen' && b.eingetroffen_at && isThisMonth(b.eingetroffen_at))
    const erhaltenWert = erhalten.reduce((s, b) => s + bestellungTotal(b), 0)
    const offenWertMonat = bestellt.filter(b => b.status !== 'eingetroffen').reduce((s, b) => s + bestellungTotal(b), 0)

    const byLieferant = {}
    bestellt.forEach(b => { byLieferant[b.lieferant_id] = (byLieferant[b.lieferant_id] ?? 0) + bestellungTotal(b) })
    const topEntry = Object.entries(byLieferant).sort((a, b) => b[1] - a[1])[0]
    const topLieferant = topEntry ? lieferanten.find(l => l.id === Number(topEntry[0])) : null

    let teuersterArtikel = null
    bestellt.forEach(b => (b.positionen ?? []).forEach(p => {
      const wert = p.menge * (p.preis ?? 0)
      if (!teuersterArtikel || wert > teuersterArtikel.wert) teuersterArtikel = { name: p.artikel_name, wert }
    }))

    return { anzahl: bestellt.length, bestelltWert, erhaltenWert, offenWertMonat, topLieferant, teuersterArtikel }
  }, [bestellungen, lieferanten])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('home_open_orders')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={offen.length} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('bd_money_in_transit')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={offenWert} format={fmt} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('nav_lieferanten')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={lieferanten.length} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('bd_orders_total')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={bestellungen.length} /></div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-3">{t('bd_monthly_report')} — {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { month: 'long', year: 'numeric' })}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted mb-0.5">{t('bd_ordered')} ({monat.anzahl})</div>
            <div className="font-mono font-semibold">{fmt(monat.bestelltWert)}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">{t('bd_received')}</div>
            <div className="font-mono font-semibold text-green">{fmt(monat.erhaltenWert)}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">{t('bd_still_open')}</div>
            <div className="font-mono font-semibold text-amber">{fmt(monat.offenWertMonat)}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">{t('bd_top_supplier')}</div>
            <div className="font-medium truncate">{monat.topLieferant?.name ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">{t('bd_most_expensive_item')}</div>
            <div className="font-medium truncate">{monat.teuersterArtikel ? `${monat.teuersterArtikel.name} (${fmt(monat.teuersterArtikel.wert)})` : '—'}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-3">{t('bd_recently_ordered')}</h3>
        {recentPurchases.length === 0 ? (
          <p className="text-muted text-sm">{t('bd_no_orders_yet')}</p>
        ) : (
          <div className="space-y-1.5">
            {recentPurchases.map(r => (
              <div key={r.artikel.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.artikel.name}</div>
                  <div className="text-xs text-muted font-mono">{r.artikel.nummer}</div>
                </div>
                <div className="text-right shrink-0 text-xs">
                  <div className="text-secondary">{fmtDt(r.created_at)}</div>
                  <div className="font-mono">{r.menge} {r.artikel.einheit} · {fmt(r.preis ?? 0)}/{r.artikel.einheit}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-4">{t('bd_supplier_stats')}</h3>
        {stats.length === 0 ? (
          <p className="text-muted text-sm">{t('bd_no_suppliers')}</p>
        ) : (
          <>
            {donutData.length > 0 && (
              <div className="flex items-center gap-5 flex-wrap mb-5 pb-5 border-b border-border">
                <DonutChart data={donutData} size={130} />
                <div className="flex-1 min-w-[140px] space-y-2">
                  {donutData.map(d => (
                    <div key={d.label} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-secondary flex-1 truncate">{d.label}</span>
                      <span className="font-mono font-medium">{fmt(stats.find(s => s.lieferant.name === d.label)?.gesamtwert ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3.5">
              {stats.map((s, i) => (
                <button key={s.lieferant.id} onClick={() => onJumpToLieferant(s.lieferant.id)}
                        className="w-full text-left group">
                  <div className="flex items-center justify-between text-sm mb-1 gap-2">
                    <span className="font-medium truncate group-hover:text-amber transition-colors">{s.lieferant.name}</span>
                    <span className="font-mono text-xs shrink-0">{fmt(s.gesamtwert)}</span>
                  </div>
                  <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 ease-out"
                         style={{
                           width: mounted ? `${Math.max((s.gesamtwert / maxWert) * 100, 2)}%` : '0%',
                           background: COLORS[i % COLORS.length],
                         }} />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted mt-1.5 flex-wrap">
                    <span>{s.anzahl} {t('bd_orders_word')}</span>
                    {s.offenAnzahl > 0 && <span className="text-amber">· {s.offenAnzahl} {t('bd_open_word')}</span>}
                    {s.pctPaetlich !== null && (
                      <span className={`· ${s.pctPaetlich >= 90 ? 'text-green' : s.pctPaetlich >= 70 ? 'text-amber' : 'text-red'}`}>
                        {s.pctPaetlich}% {t('bd_on_time')}
                      </span>
                    )}
                    {s.verspaetungenAnzahl > 0 && <span>· Ø {s.avgVerspaetung} {t('bd_avg_days_late')}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
