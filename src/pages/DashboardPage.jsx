import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import Icon from '../components/Icon'
import DonutChart from '../components/DonutChart'
import CountUp from '../components/CountUp'
import BestellungenDashboard from '../components/BestellungenDashboard'
import AuftraegeDashboard from '../components/AuftraegeDashboard'
import { useLanguage } from '../hooks/useLanguage'

const fmt    = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDay = (d) => new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit' }).format(new Date(d))

const COLORS = ['#e8821c','#4caf6e','#4a90d9','#9b6bd9','#d96b8f']

// A few cheap, genuinely useful heuristics computed from data already
// on screen — not a real "AI" call, just the kind of thing an
// experienced Lagerleiter would notice at a glance. Each tip only
// shows up if there's actually enough data behind it.
function SmartInsightsCard({ articles, moves, byKategorie, totalValue }) {
  const { t, lang } = useLanguage()

  const tips = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000
    const recentAusgang = moves.filter(m => m.typ === 'ausgang' && new Date(m.created_at).getTime() >= cutoff)
    const byArtikel = {}
    recentAusgang.forEach(m => { byArtikel[m.artikel_id] = (byArtikel[m.artikel_id] ?? 0) + Number(m.menge) })

    const out = []

    const topMovedEntry = Object.entries(byArtikel).sort((a, b) => b[1] - a[1])[0]
    const topMoved = topMovedEntry ? articles.find(a => a.id === Number(topMovedEntry[0])) : null
    if (topMoved) {
      out.push({
        icon: 'truck', color: '#4a90d9',
        text: lang === 'en'
          ? `"${topMoved.name}" moved the most in the last 30 days — ${Math.round(topMovedEntry[1])} ${topMoved.einheit} out.`
          : `"${topMoved.name}" wurde in den letzten 30 Tagen am häufigsten bewegt — ${Math.round(topMovedEntry[1])} ${topMoved.einheit} Ausgang.`,
      })
    }

    let runOutSoonest = null
    Object.entries(byArtikel).forEach(([artikelId, menge]) => {
      const artikel = articles.find(a => a.id === Number(artikelId))
      if (!artikel) return
      const dailyRate = menge / 30
      if (dailyRate <= 0) return
      const daysLeft = artikel.menge / dailyRate
      if (daysLeft < 30 && (!runOutSoonest || daysLeft < runOutSoonest.daysLeft)) runOutSoonest = { artikel, daysLeft }
    })
    if (runOutSoonest) {
      const days = Math.max(Math.round(runOutSoonest.daysLeft), 0)
      out.push({
        icon: 'alert', color: '#e0524a',
        text: lang === 'en'
          ? `At the current pace, "${runOutSoonest.artikel.name}" runs out in about ${days} day${days === 1 ? '' : 's'}.`
          : `Bei aktuellem Verbrauch geht "${runOutSoonest.artikel.name}" in etwa ${days} Tag${days === 1 ? '' : 'en'} aus.`,
      })
    }

    if (byKategorie.length > 0 && totalValue > 0) {
      const [kat, val] = byKategorie[0]
      const pct = Math.round((val / totalValue) * 100)
      if (pct >= 25) {
        out.push({
          icon: 'chart', color: '#4caf6e',
          text: lang === 'en'
            ? `"${kat}" alone makes up ${pct}% of your total stock value.`
            : `"${kat}" macht allein ${pct}% Ihres gesamten Lagerwerts aus.`,
        })
      }
    }

    return out
  }, [articles, moves, byKategorie, totalValue, lang])

  if (tips.length === 0) return null

  return (
    <Card className="p-5">
      <h3 className="font-medium text-sm mb-3.5 flex items-center gap-2">
        <Icon name="chart" size={15} color="#e8821c" /> {t('dash_insights_title')}
      </h3>
      <div className="space-y-2.5">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: tip.color + '1a' }}>
              <Icon name={tip.icon} size={13} color={tip.color} />
            </div>
            <span className="text-secondary leading-relaxed">{tip.text}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function MagazinDashboard({ articles, moves }) {
  const { t, lang } = useLanguage()
  const totalValue  = articles.reduce((s, a) => s + a.menge * a.preis, 0)
  const lowStock    = articles.filter(a => a.menge < a.mindestbestand)
  const todayMoves  = moves.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString())
  const recentMoves = moves.slice(0, 8)

  const byKategorie = useMemo(() => {
    const map = {}
    articles.forEach(a => { map[a.kategorie] = (map[a.kategorie] || 0) + a.menge * a.preis })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [articles])
  const maxKat = Math.max(...byKategorie.map(([, v]) => v), 1)
  const donutData = byKategorie.map(([label, value], i) => ({ label, value, color: COLORS[i] }))

  const topValue = useMemo(() =>
    [...articles].sort((a, b) => b.menge * b.preis - a.menge * a.preis).slice(0, 5)
  , [articles])

  const weekData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toDateString()
      const dm = moves.filter(m => new Date(m.created_at).toDateString() === key)
      days.push({
        label: d.toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { weekday: 'short' }),
        eingang: dm.filter(m => m.typ === 'eingang').reduce((s, m) => s + Number(m.menge), 0),
        ausgang: dm.filter(m => m.typ === 'ausgang').reduce((s, m) => s + Number(m.menge), 0),
      })
    }
    return days
  }, [moves, lang])
  const maxDay = Math.max(...weekData.map(d => Math.max(d.eingang, d.ausgang)), 1)

  const stats = [
    { label: t('home_articles_total'), value: articles.length,   icon: 'package', color: '#4a90d9' },
    { label: t('home_stock_value'),    value: totalValue,        icon: 'chart',   color: '#4caf6e', format: fmt },
    { label: t('home_low_stock_full'), value: lowStock.length,   icon: 'alert',   color: '#e0524a' },
    { label: t('home_movements_today'),value: todayMoves.length, icon: 'truck',   color: '#e8821c' },
  ]

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {stats.map(s => (
            <Card key={s.label} className="p-3">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-xs text-secondary leading-tight">{s.label}</span>
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 ml-1" style={{ background: s.color + '1a' }}>
                  <Icon name={s.icon} size={12} color={s.color} />
                </div>
              </div>
              <div className="text-lg font-bold font-mono"><CountUp value={s.value} format={s.format} /></div>
            </Card>
          ))}
        </div>

        <Card className="p-3">
          <h3 className="text-xs font-medium text-secondary mb-3">{t('dash_stock_by_category')}</h3>
          <div className="space-y-2.5">
            {byKategorie.map(([kat, val], i) => (
              <div key={kat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-secondary truncate mr-2">{kat}</span>
                  <span className="font-mono shrink-0">{fmt(val)}</span>
                </div>
                <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(val / maxKat) * 100}%`, background: COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-secondary">{t('dash_last_7_days')}</h3>
            <div className="flex gap-2 text-[10px] text-muted">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green" /> {t('dash_in')}</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red" /> {t('dash_out')}</span>
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-20">
            {weekData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 h-14">
                  <div className="w-2.5 rounded-t bg-green"
                       style={{ height: `${(d.eingang / maxDay) * 100}%`, minHeight: d.eingang > 0 ? 3 : 0 }} />
                  <div className="w-2.5 rounded-t bg-red"
                       style={{ height: `${(d.ausgang / maxDay) * 100}%`, minHeight: d.ausgang > 0 ? 3 : 0 }} />
                </div>
                <span className="text-[9px] text-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <SmartInsightsCard articles={articles} moves={moves} byKategorie={byKategorie} totalValue={totalValue} />

        {recentMoves.length > 0 && (
          <Card className="p-3">
            <h3 className="text-xs font-medium text-secondary mb-2">{t('home_recent_activity')}</h3>
            <div className="space-y-2">
              {recentMoves.slice(0, 5).map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={12}
                        color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{m.artikel_name}</div>
                    {m.von_user && <div className="text-[11px] text-muted">{m.von_user}</div>}
                  </div>
                  <span className="text-[11px] text-muted font-mono shrink-0">{fmtDay(m.created_at)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <Card key={s.label} className="p-4 border-t-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" style={{ borderTopColor: s.color }}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs text-secondary">{s.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                     style={{ background: `linear-gradient(135deg, ${s.color}2e, ${s.color}0f)` }}>
                  <Icon name={s.icon} size={14} color={s.color} />
                </div>
              </div>
              <div className="text-xl font-bold font-mono"><CountUp value={s.value} format={s.format} /></div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-medium text-sm mb-4">{t('dash_stock_by_category')}</h3>
            <div className="flex items-center gap-5 flex-wrap">
              <DonutChart data={donutData} size={150} />
              <div className="flex-1 min-w-[140px] space-y-2.5">
                {donutData.map((d, i) => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-secondary flex-1 truncate">{d.label}</span>
                    <span className="font-mono font-medium">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">{t('dash_movements_7_days')}</h3>
              <div className="flex gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-green" /> {t('dash_incoming')}</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-red" /> {t('dash_outgoing')}</span>
              </div>
            </div>
            <div className="flex items-end gap-2 h-28">
              {weekData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-end gap-0.5 h-20">
                    <div className="w-3 rounded-t bg-green"
                         style={{ height: `${(d.eingang / maxDay) * 100}%`, minHeight: d.eingang > 0 ? 3 : 0 }} />
                    <div className="w-3 rounded-t bg-red"
                         style={{ height: `${(d.ausgang / maxDay) * 100}%`, minHeight: d.ausgang > 0 ? 3 : 0 }} />
                  </div>
                  <span className="text-[10px] text-muted">{d.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <SmartInsightsCard articles={articles} moves={moves} byKategorie={byKategorie} totalValue={totalValue} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-xs font-medium text-muted mb-3">{t('dash_highest_value')}</h3>
            <div className="space-y-2">
              {topValue.slice(0, 3).map((a, i) => (
                <div key={a.id} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-muted font-mono w-3">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                  </div>
                  <span className="font-mono text-xs text-secondary shrink-0">{fmt(a.menge * a.preis)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-medium text-sm mb-4">{t('home_recent_activity')}</h3>
            {recentMoves.length === 0 ? (
              <p className="text-muted text-sm">{t('home_no_movements')}</p>
            ) : (
              <div className="space-y-3">
                {recentMoves.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={14}
                          color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{m.artikel_name}</div>
                      {m.von_user && <div className="text-xs text-muted">{m.von_user}</div>}
                    </div>
                    <span className="text-xs text-muted font-mono shrink-0">{fmtDay(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

const FACE_ORDER = ['magazin', 'bestellungen', 'auftraege']

export default function DashboardPage({ articles, moves }) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const FACE_META = {
    magazin:      { title: t('dash_face_magazin_title'),      subtitle: t('dash_face_magazin_subtitle') },
    bestellungen: { title: t('dash_face_bestellungen_title'), subtitle: t('dash_face_bestellungen_subtitle') },
    auftraege:    { title: t('dash_face_auftraege_title'),    subtitle: t('dash_face_auftraege_subtitle') },
  }
  const [displayFace, setDisplayFace] = useState('magazin') // what's actually rendered right now
  const [angle, setAngle]             = useState(0)         // -90..90, reset at the invisible midpoint so we never show a true backface
  const [animateAngle, setAnimateAngle] = useState(true)
  const [flipping, setFlipping]       = useState(false)

  const [lieferanten, setLieferanten] = useState([])
  const [bestellungen, setBestellungen] = useState([])
  const [loadingBestellungen, setLoadingBestellungen] = useState(true)

  const [projekte, setProjekte] = useState([])
  const [verbrauchMap, setVerbrauchMap] = useState({})
  const [loadingAuftraege, setLoadingAuftraege] = useState(true)

  const loadBestellungenData = useCallback(async () => {
    const [{ data: l }, { data: b }] = await Promise.all([
      supabase.from('lieferanten').select('*').order('name'),
      supabase.from('bestellungen')
        .select('*, lieferant:lieferanten(id,name,email,telefon,adresse,bestellnachricht,steuersatz), positionen:bestellung_positionen(*)')
        .order('created_at', { ascending: false }),
    ])
    if (l) setLieferanten(l)
    if (b) setBestellungen(b)
    setLoadingBestellungen(false)
  }, [])

  const loadAuftraegeData = useCallback(async () => {
    const [{ data: p }, { data: moves }] = await Promise.all([
      supabase.from('projekte').select('*, material:projekt_material(*), zeiterfassung:projekt_zeiterfassung(*)').order('created_at', { ascending: false }),
      supabase.from('warenbewegungen').select('projekt_id, artikel_id, menge').eq('typ', 'ausgang').not('projekt_id', 'is', null),
    ])
    if (p) setProjekte(p)
    const vm = {}
    ;(moves ?? []).forEach(m => {
      vm[m.projekt_id] = vm[m.projekt_id] ?? {}
      vm[m.projekt_id][m.artikel_id] = (vm[m.projekt_id][m.artikel_id] ?? 0) + Number(m.menge)
    })
    setVerbrauchMap(vm)
    setLoadingAuftraege(false)
  }, [])

  useEffect(() => { loadBestellungenData(); loadAuftraegeData() }, [loadBestellungenData, loadAuftraegeData])

  const flip = () => {
    if (flipping) return
    setFlipping(true)
    setAnimateAngle(true)
    setAngle(90) // rotate face-on content to edge-on (invisible sliver) — first half of the spin
    setTimeout(() => {
      // At the edge-on moment: swap content and snap to -90 with no transition,
      // so the second half continues spinning the same direction instead of
      // rewinding back through the content we just showed.
      setDisplayFace(f => FACE_ORDER[(FACE_ORDER.indexOf(f) + 1) % FACE_ORDER.length])
      setAnimateAngle(false)
      setAngle(-90)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimateAngle(true)
          setAngle(0) // second half of the spin, edge-on back to face-on
        })
      })
    }, 350)
    setTimeout(() => setFlipping(false), 700)
  }

  const jumpToLieferant = (lieferantId) => navigate(`/lieferanten?tab=bestellungen&lieferant=${lieferantId}`)
  const jumpToProjekt   = (projektId) => navigate(`/auftraege?projekt=${projektId}`)

  const nextFace = FACE_ORDER[(FACE_ORDER.indexOf(displayFace) + 1) % FACE_ORDER.length]

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-base sm:text-2xl font-semibold">{FACE_META[displayFace].title}</h1>
          <p className="text-secondary text-sm hidden sm:block mt-1">{FACE_META[displayFace].subtitle}</p>
        </div>
        <button onClick={flip} disabled={flipping}
                className="flex items-center gap-2 bg-bg-2 border border-border px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-secondary hover:bg-bg-3 transition-colors disabled:opacity-60 shrink-0">
          <Icon name="refresh" size={14} color="#9aa3ad" />
          {FACE_META[nextFace].title}
        </button>
      </div>

      <div style={{ perspective: '2000px' }}>
        <div style={{
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d',
          transition: animateAngle ? 'transform 0.35s cubic-bezier(0.45,0.05,0.55,0.95)' : 'none',
          transform: `rotateY(${angle}deg)`,
        }}>
          {displayFace === 'magazin' && (
            <MagazinDashboard articles={articles} moves={moves} />
          )}
          {displayFace === 'bestellungen' && (
            loadingBestellungen ? (
              <div className="flex items-center justify-center min-h-64">
                <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <BestellungenDashboard
                bestellungen={bestellungen} lieferanten={lieferanten} articles={articles}
                onJumpToLieferant={jumpToLieferant}
              />
            )
          )}
          {displayFace === 'auftraege' && (
            loadingAuftraege ? (
              <div className="flex items-center justify-center min-h-64">
                <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <AuftraegeDashboard
                projekte={projekte} verbrauchMap={verbrauchMap} articles={articles}
                onOpenProjekt={jumpToProjekt}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
