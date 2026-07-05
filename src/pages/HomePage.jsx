import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/Card'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import Tagline from '../components/Tagline'
import CountUp from '../components/CountUp'
import StatusDot from '../components/StatusDot'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import { supabase } from '../lib/supabase'
import { isOffen } from '../lib/auftraegeHelpers'
import { reconstructSeries, trendFor } from '../lib/kennzahlen'
import { terminMeta, fmtUhrzeit, byUhrzeit, dateKey } from '../lib/termine'

const fmt    = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDay = (d) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(d))
const fmtTime = (d) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(d))
const fmtFull = (d, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

// A movement tied to a real project shows that project's PROJ-2026-xxxxxx
// number — free-typed project text (no linked project row) stays as-is.
const movementProjectLabel = (m) => m.projekte?.dokument_nr
  ? `${m.projekte.dokument_nr}${m.projekt ? ' · ' + m.projekt : ''}`
  : (m.projekt || '')

/* ══ TODAY'S MOVEMENTS POPUP ══ */
function TodayMovementsPopup({ moves, onClose }) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState('Alle')
  const eingang = moves.filter(m => m.typ === 'eingang')
  const ausgang = moves.filter(m => m.typ === 'ausgang')
  const filtered = filter === 'Alle' ? moves : filter === 'eingang' ? eingang : ausgang

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85dvh] sm:max-h-[80vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{t('home_movements_today')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="flex gap-2 px-5 pt-3 pb-1 shrink-0">
          {[
            ['Alle', t('common_all'), moves.length],
            ['eingang', t('bew_incoming'), eingang.length],
            ['ausgang', t('bew_outgoing'), ausgang.length],
          ].map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)}
                    className={`flex-1 text-xs font-medium px-2 py-2 rounded-lg border transition-colors ${
                      filter === key ? 'border-amber text-amber bg-amber-dim' : 'border-border text-secondary bg-bg-2'
                    }`}>
              {label} · {count}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">{t('bew_no_articles_found')}</p>
          ) : (
            filtered.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-bg-2 border border-border rounded-xl">
                <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={14}
                      color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{m.artikel_name}</div>
                  <div className="text-[11px] text-muted">{m.von_user || '—'}{movementProjectLabel(m) ? ` · ${movementProjectLabel(m)}` : ''}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-semibold">{m.menge}</div>
                  <div className="text-[10px] text-muted">{fmtTime(m.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ══ MINI SPARKLINE — tiny trend line for a stat card ══ */
function MiniSpark({ data, color }) {
  if (!data || data.length < 2) return null
  const W = 66, H = 30
  const max = Math.max(...data), min = Math.min(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1) * W).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

/* ══ STAT CARD — icon chip + label + big number, colored top border,
   optional sparkline + "vs. Vormonat" trend from the snapshot series ══ */
function StatCard({ label, value, format, icon, color, onClick, spark, trend, trendMode = 'pct' }) {
  const { t } = useLanguage()
  let trendEl = null
  if (trend && (trend.up || trend.down)) {
    const good = trend.up
    const txt = trendMode === 'pct' && trend.pct !== null
      ? `${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(1)}%`
      : `${trend.abs > 0 ? '+' : ''}${trend.abs}`
    trendEl = (
      <div className={`flex items-center gap-1 text-[11px] font-medium ${good ? 'text-green' : 'text-red'}`}>
        <Icon name={trend.up ? 'arrowUp' : 'arrowDown'} size={11} color={good ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
        {txt}<span className="text-muted font-normal">{t('home_vs_last_month')}</span>
      </div>
    )
  }
  return (
    <Card className="p-4 border-t-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" style={{ borderTopColor: color }} onClick={onClick}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: `linear-gradient(135deg, ${color}2e, ${color}0f)` }}>
          <Icon name={icon} size={15} color={color} />
        </div>
        <span className="text-xs text-secondary leading-tight">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl font-bold font-mono truncate"><CountUp value={value} format={format} /></div>
          {trendEl}
        </div>
        <MiniSpark data={spark} color={color} />
      </div>
    </Card>
  )
}

/* ══ LAGERWERT VERLAUF — SVG area/line chart. Values are reconstructed
   from the movement log (current stock reversed month by month, priced
   at today's article prices) — a real trend, approximate only in that
   it can't know past prices. Capped to whatever moves are loaded, so
   very old months on a busy dataset may under-count. ══ */
function LagerwertChart({ points }) {
  if (points.length < 2) return null
  const W = 600, H = 210, padL = 6, padR = 6, padT = 14, padB = 26
  const max = Math.max(...points.map(p => p.value), 1)
  const xFor = (i) => padL + (i / (points.length - 1)) * (W - padL - padR)
  const yFor = (v) => padT + (1 - v / max) * (H - padT - padB)
  const linePts = points.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ')
  const areaPts = `${xFor(0).toFixed(1)},${(H - padB)} ${linePts} ${xFor(points.length - 1).toFixed(1)},${(H - padB)}`
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lwFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-green))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(var(--color-green))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((v, i) => (
        <line key={i} x1={padL} x2={W - padR} y1={yFor(v)} y2={yFor(v)}
              stroke="rgb(var(--border))" strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
      ))}
      <polygon points={areaPts} fill="url(#lwFill)" />
      <polyline points={linePts} fill="none" stroke="rgb(var(--color-green))" strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r="3" fill="rgb(var(--color-green))" />
      ))}
      {points.map((p, i) => (
        <text key={i} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--text-muted))">{p.label}</text>
      ))}
    </svg>
  )
}

// Time-of-day greeting to match the hero banner ("Guten Morgen" etc.).
const greetingKey = () => {
  const h = new Date().getHours()
  return h < 11 ? 'home_greeting_morning' : h < 18 ? 'home_greeting_day' : 'home_greeting_evening'
}

/* ══ HERO WAREHOUSE — a self-contained SVG aisle (no external image,
   works offline, looks the same in both themes). A left→right dark
   gradient over it keeps the greeting legible. ══ */
function HeroWarehouse() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 260" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hwSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2028" /><stop offset="1" stopColor="#0c0f13" />
        </linearGradient>
        <radialGradient id="hwGlow" cx="0.6" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#f4a63a" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#c96a0f" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hwBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c98a4a" /><stop offset="1" stopColor="#8a5a2c" />
        </linearGradient>
      </defs>
      <rect width="1200" height="260" fill="url(#hwSky)" />
      <ellipse cx="720" cy="110" rx="330" ry="150" fill="url(#hwGlow)" />
      <g stroke="#e8821c" strokeOpacity="0.10" strokeWidth="1.4">
        <line x1="720" y1="120" x2="120" y2="260" />
        <line x1="720" y1="120" x2="470" y2="260" />
        <line x1="720" y1="120" x2="960" y2="260" />
        <line x1="720" y1="120" x2="1320" y2="260" />
      </g>
      {/* far silhouette racks near the vanishing point */}
      <g fill="#0a0d10">
        <rect x="640" y="70" width="26" height="90" />
        <rect x="778" y="70" width="26" height="90" />
      </g>
      {/* mid rack */}
      <g>
        <g fill="#141a20"><rect x="760" y="86" width="8" height="120" /><rect x="856" y="86" width="8" height="120" /></g>
        <g fill="#1a2028"><rect x="760" y="120" width="104" height="6" /><rect x="760" y="170" width="104" height="6" /></g>
        <rect x="775" y="96" width="34" height="24" fill="#8a5a2c" />
        <rect x="815" y="146" width="34" height="24" fill="#a5713a" />
      </g>
      {/* right foreground rack */}
      <g>
        <g fill="#171c22"><rect x="880" y="40" width="12" height="200" /><rect x="1150" y="40" width="12" height="200" /></g>
        <g fill="#20262e">
          <rect x="880" y="70" width="282" height="8" /><rect x="880" y="140" width="282" height="8" /><rect x="880" y="210" width="282" height="8" />
        </g>
        <g>
          <rect x="905" y="40" width="48" height="30" rx="1" fill="url(#hwBox)" />
          <rect x="965" y="44" width="40" height="26" rx="1" fill="#a5713a" />
          <rect x="1055" y="40" width="52" height="30" rx="1" fill="url(#hwBox)" />
          <rect x="905" y="110" width="44" height="30" rx="1" fill="#9c6a38" />
          <rect x="1000" y="108" width="56" height="32" rx="1" fill="url(#hwBox)" />
          <rect x="1080" y="112" width="40" height="28" rx="1" fill="#a5713a" />
          <rect x="915" y="180" width="52" height="30" rx="1" fill="url(#hwBox)" />
          <rect x="1035" y="182" width="48" height="28" rx="1" fill="#9c6a38" />
        </g>
      </g>
    </svg>
  )
}

const ORDER_STATUS_STYLE = {
  entwurf:      { color: '#9aa3ad', key: 'status_entwurf' },
  gesendet:     { color: '#4a90d9', key: 'status_gesendet' },
  bestaetigt:   { color: '#e8821c', key: 'status_bestaetigt' },
  eingetroffen: { color: '#4caf6e', key: 'status_eingetroffen' },
}

const OWNER_LINKS = [
  { to: '/uebersicht',    labelKey: 'nav_uebersicht',  descKey: 'desc_uebersicht_owner', icon: 'box',       accent: '#4a90d9' },
  { to: '/bewegung',      labelKey: 'nav_bewegung',    descKey: 'desc_bewegung_owner',   icon: 'truck',     accent: '#4caf6e' },
  { to: '/inventur',      labelKey: 'nav_inventur',    descKey: 'desc_inventur_owner',   icon: 'filter',    accent: '#e8821c' },
  { to: '/lieferanten',   labelKey: 'nav_lieferanten', descKey: 'desc_lieferanten',      icon: 'building',  accent: '#9b6bd9' },
  { to: '/dashboard',     labelKey: 'nav_dashboard',   descKey: 'desc_dashboard',        icon: 'chart',     accent: '#4a90d9' },
  { to: '/auftraege',     labelKey: 'nav_auftraege',   descKey: 'desc_auftraege',        icon: 'clipboard', accent: '#d96b8f' },
  { to: '/import',        labelKey: 'nav_import',      descKey: 'desc_import',           icon: 'upload',    accent: '#4caf6e' },
  { to: '/einstellungen', labelKey: 'nav_einstellungen', descKey: 'desc_einstellungen',  icon: 'settings',  accent: '#9aa3ad' },
]
const WORKER_LINKS = [
  { to: '/uebersicht', labelKey: 'nav_uebersicht', descKey: 'desc_uebersicht_worker', icon: 'box',    accent: '#4a90d9' },
  { to: '/bewegung',   labelKey: 'nav_bewegung',   descKey: 'desc_bewegung_worker',   icon: 'scan',   accent: '#e8821c' },
  { to: '/inventur',   labelKey: 'nav_inventur',   descKey: 'desc_inventur_worker',   icon: 'filter', accent: '#4caf6e' },
]

export default function HomePage({ articles = [], moves = [] }) {
  const { profile, isManager } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [showToday, setShowToday] = useState(false)

  // Owners get sent straight into "Bestellen" for that article with a
  // suggested quantity already filled in; workers can't create orders,
  // so they just see it in the article list instead.
  const openLowStock = (a) => navigate(isManager ? `/lieferanten?tab=bestellen&artikel=${a.id}` : '/uebersicht')

  const lowStock   = articles.filter(a => a.menge < a.mindestbestand)
  const totalValue = articles.reduce((s, a) => s + a.menge * a.preis, 0)
  const todayMoves = moves.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString())
  const recentMoves = moves.slice(0, 5)
  const quickLinks = isManager ? OWNER_LINKS : WORKER_LINKS
  // Import is desktop-only (no mobile UI for it, hidden from the mobile
  // nav too) — drop it from the mobile Quick Access grid so it doesn't
  // dangle as a tile leading nowhere useful on a phone.
  const mobileQuickLinks = quickLinks.filter(q => q.to !== '/import')

  // A lightweight teaser of the Bestellungen/Aufträge dashboards —
  // just enough to summarize on Home without pulling in their full
  // page logic. Owner-only, since both features are owner-gated.
  const [bestellungen, setBestellungen] = useState([])
  const [recentBestellungen, setRecentBestellungen] = useState([])
  const [projekte, setProjekte]         = useState([])
  // Full order/project history — only for the trend reconstruction, so
  // past snapshot points can be rebuilt from real data.
  const [allBestellungen, setAllBestellungen] = useState([])
  const [allProjekte, setAllProjekte]         = useState([])
  const [heuteTermine, setHeuteTermine]       = useState([])
  useEffect(() => {
    if (!isManager) return
    const heute = dateKey(new Date())
    Promise.all([
      supabase.from('bestellungen').select('id, status, positionen:bestellung_positionen(menge, preis)').neq('status', 'eingetroffen'),
      supabase.from('projekte').select('id, name, status, rok, geplanter_beginn, created_at, verkaufspreis, material:projekt_material(geplant_menge, preis)').in('status', ['geplant', 'aktiv', 'pausiert']),
      supabase.from('bestellungen')
        .select('id, dokument_nr, status, created_at, erwartete_lieferung, eingetroffen_at, lieferant:lieferanten(name)')
        .order('created_at', { ascending: false }).limit(6),
      supabase.from('bestellungen').select('created_at, eingetroffen_at, status'),
      supabase.from('projekte').select('created_at, abgeschlossen_at, status, verkaufspreis, material:projekt_material(geplant_menge, preis)'),
      supabase.from('termine').select('*, projekt:projekte(name)').eq('datum', heute),
    ]).then(([{ data: best }, { data: proj }, { data: recent }, { data: allB }, { data: allP }, { data: term }]) => {
      setBestellungen(best ?? [])
      setProjekte(proj ?? [])
      setRecentBestellungen(recent ?? [])
      setAllBestellungen(allB ?? [])
      setAllProjekte(allP ?? [])
      setHeuteTermine((term ?? []).sort(byUhrzeit))
    })
  }, [isManager])

  // Open projects with an elapsed-time progress %, same reference as
  // the timeline card (planned start -> deadline).
  const projektFortschritt = useMemo(() => projekte
    .filter(p => isOffen(p.status))
    .map(p => {
      const start = new Date(p.geplanter_beginn ? p.geplanter_beginn + 'T00:00:00' : p.created_at).getTime()
      const end = p.rok ? new Date(p.rok + 'T23:59:59').getTime() : null
      const pct = end && end > start ? Math.min(Math.max(Math.round(((Date.now() - start) / (end - start)) * 100), 0), 100) : 0
      return { p, pct }
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5)
  , [projekte])

  const bestellwertUnterwegs = bestellungen.reduce((s, b) =>
    s + (b.positionen ?? []).reduce((s2, p) => s2 + p.menge * (p.preis ?? 0), 0), 0)
  const aktiveProjekte = projekte.filter(p => p.status === 'aktiv').length
  const erwarteterGewinnAuftraege = projekte.reduce((s, p) => {
    const materialWert = (p.material ?? []).reduce((s2, m) => s2 + m.geplant_menge * m.preis, 0)
    return s + (Number(p.verkaufspreis ?? 0) - materialWert)
  }, 0)

  // Never-started projects whose planned start is within 2 weeks (or
  // already passed) — a loud reminder, same treatment as low stock,
  // so a start date doesn't just quietly slip by unnoticed.
  const startingSoon = useMemo(() => projekte
    .filter(p => p.status === 'geplant' && p.geplanter_beginn)
    .map(p => ({ p, daysUntil: Math.ceil((new Date(p.geplanter_beginn + 'T00:00:00') - Date.now()) / 86400000) }))
    .filter(x => x.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil)
  , [projekte])

  // 6-month reconstructed series for the stat-card sparklines/trends;
  // the last point is overwritten with the exact live figures so the
  // sparkline ends on the same number shown big on each card.
  const kennzahlenSeries = useMemo(() => {
    if (articles.length === 0) return []
    const series = reconstructSeries({ articles, moves, allBestellungen, allProjekte }, lang)
    const last = series.length - 1
    series[last] = {
      label: series[last].label,
      artikel_anzahl: articles.length,
      lagerwert: totalValue,
      niedriger_bestand: lowStock.length,
      offene_bestellungen: bestellungen.length,
      aktive_projekte: aktiveProjekte,
      erwarteter_gewinn: erwarteterGewinnAuftraege,
    }
    return series
  }, [articles, moves, allBestellungen, allProjekte, lang, totalValue, lowStock.length, bestellungen.length, aktiveProjekte, erwarteterGewinnAuftraege])

  const lagerwertVerlauf = useMemo(() => kennzahlenSeries.map(s => ({ label: s.label, value: s.lagerwert })), [kennzahlenSeries])

  // Record today's exact figures once the data has settled — one row
  // per day (idempotent), so real history accumulates for the future.
  useEffect(() => {
    if (!isManager || articles.length === 0) return
    supabase.from('kennzahlen_snapshots').upsert({
      datum: new Date().toISOString().slice(0, 10),
      artikel_anzahl: articles.length,
      lagerwert: totalValue,
      niedriger_bestand: lowStock.length,
      offene_bestellungen: bestellungen.length,
      aktive_projekte: aktiveProjekte,
      erwarteter_gewinn: erwarteterGewinnAuftraege,
    }, { onConflict: 'datum' }).then(() => {})
  }, [isManager, articles.length, totalValue, lowStock.length, bestellungen.length, aktiveProjekte, erwarteterGewinnAuftraege])

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Hero compact */}
          <div className="rounded-xl border border-border p-4 relative overflow-hidden"
               style={{ background: 'linear-gradient(135deg, rgb(var(--bg-1)) 0%, rgb(var(--bg-0)) 100%)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 pointer-events-none"
                 style={{ background: 'radial-gradient(circle,#e8821c 0%,transparent 70%)', transform: 'translate(30%,-30%)' }} />
            <div className="flex items-center gap-3 mb-2">
              <Logo size="sm" />
              <div>
                <div className="font-extrabold text-sm">Stock<span className="text-amber">Master</span></div>
                <Tagline size="sm" />
              </div>
            </div>
            <h1 className="text-base font-semibold">
              {t('home_welcome')}, {profile?.display_name?.split(' ')[0]}
            </h1>
          </div>

          {/* Quick access — 2 cols on mobile */}
          <div className="grid grid-cols-2 gap-2">
            {mobileQuickLinks.map(q => (
              <button key={q.to} onClick={() => navigate(q.to)}
                      className="bg-bg-1 border border-border rounded-xl p-3 text-left flex flex-col gap-2 active:scale-95 transition-transform">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                     style={{ background: q.accent + '1a' }}>
                  <Icon name={q.icon} size={16} color={q.accent} />
                </div>
                <div>
                  <div className="font-medium text-xs leading-tight">{t(q.labelKey)}</div>
                  <div className="text-[11px] text-muted mt-0.5 leading-tight">{t(q.descKey)}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Low stock alert */}
          {lowStock.length > 0 && (
            <div className="bg-red-dim border border-red/40 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Icon name="alert" size={15} color="#e0524a" />
                <span className="font-semibold text-red text-sm">{lowStock.length} {t('home_low_stock')}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-2.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {lowStock.map((a, i) => (
                  <button key={a.id} onClick={() => openLowStock(a)}
                          className="shrink-0 w-24 bg-bg-1 border border-red/30 rounded-xl p-2 text-left active:scale-95 transition-transform animate-fade-up"
                          style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="font-mono text-[9px] text-red font-semibold mb-1 truncate">{a.nummer}</div>
                    <div className="text-[11px] font-medium truncate mb-1 leading-tight">{a.name}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-xs font-bold text-red">{a.menge}</span>
                      <span className="text-[9px] text-muted">/{a.mindestbestand}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => navigate('/uebersicht?bestand=Niedrig')}
                      className="w-full bg-red text-white text-xs font-medium px-3 py-2 rounded-lg">
                {t('home_view_all')}
              </button>
            </div>
          )}

          {/* Project starting soon alert */}
          {startingSoon.length > 0 && (
            <div className="bg-amber-dim border border-amber/40 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <StatusDot color="#e8821c" pulse size={9} />
                <span className="font-semibold text-amber text-sm">{startingSoon.length} {t('home_projects_starting_soon')}</span>
              </div>
              <div className="space-y-1.5 mb-2.5">
                {startingSoon.map(({ p, daysUntil }, i) => (
                  <button key={p.id} onClick={() => navigate(`/auftraege?projekt=${p.id}`)}
                          className="w-full flex items-center justify-between gap-2 bg-bg-1 border border-amber/30 rounded-lg px-3 py-2 text-left active:scale-95 transition-transform animate-fade-up"
                          style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="text-xs font-medium truncate">{p.name}</span>
                    <span className={`text-[11px] font-mono font-semibold shrink-0 ${daysUntil < 0 ? 'text-red' : 'text-amber'}`}>
                      {daysUntil < 0 ? t('home_start_overdue') : daysUntil === 0 ? t('home_starts_today') : `${daysUntil}${lang === 'en' ? 'd' : 'T'}`}
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={() => navigate('/auftraege')}
                      className="w-full bg-amber text-bg-0 text-xs font-medium px-3 py-2 rounded-lg">
                {t('home_view_all')}
              </button>
            </div>
          )}

          {/* Owner stats — 2x2 grid */}
          {isManager && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('home_articles_short'),    value: articles.length,   color: '#4a90d9', icon: 'package' },
                  { label: t('home_stock_value'),        value: totalValue,        color: '#4caf6e', icon: 'chart', format: fmt },
                  { label: t('home_low_stock_short'),    value: lowStock.length,   color: '#e0524a', icon: 'alert' },
                  { label: t('home_today'),              value: todayMoves.length, color: '#e8821c', icon: 'truck', onClick: () => setShowToday(true) },
                ].map(s => (
                  <Card key={s.label} className="p-3" onClick={s.onClick}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-secondary">{s.label}</span>
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: s.color + '1a' }}>
                        <Icon name={s.icon} size={12} color={s.color} />
                      </div>
                    </div>
                    <div className="text-lg font-bold font-mono"><CountUp value={s.value} format={s.format} /></div>
                  </Card>
                ))}
              </div>

              {/* Bestellungen / Aufträge teaser — 2x2 grid */}
              <div className="grid grid-cols-2 gap-2">
                <Card className="p-3 cursor-pointer" onClick={() => navigate('/lieferanten?tab=bestellungen')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-secondary">{t('home_open_orders')}</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#9b6bd91a' }}>
                      <Icon name="building" size={12} color="#9b6bd9" />
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono"><CountUp value={bestellungen.length} /></div>
                </Card>
                <Card className="p-3 cursor-pointer" onClick={() => navigate('/lieferanten?tab=bestellungen')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-secondary">{t('home_orders_value')}</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#9b6bd91a' }}>
                      <Icon name="truck" size={12} color="#9b6bd9" />
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono"><CountUp value={bestellwertUnterwegs} format={fmt} /></div>
                </Card>
                <Card className="p-3 cursor-pointer" onClick={() => navigate('/auftraege')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-secondary">{t('home_active_projects')}</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#d96b8f1a' }}>
                      <Icon name="clipboard" size={12} color="#d96b8f" />
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono"><CountUp value={aktiveProjekte} /></div>
                </Card>
                <Card className="p-3 cursor-pointer" onClick={() => navigate('/auftraege')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-secondary">{t('home_expected_profit')}</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#d96b8f1a' }}>
                      <Icon name="chart" size={12} color="#d96b8f" />
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono"><CountUp value={erwarteterGewinnAuftraege} format={fmt} /></div>
                </Card>
              </div>

              {/* Letzte Aktivität compact */}
              {recentMoves.length > 0 && (
                <Card className="p-3">
                  <h3 className="text-xs font-medium text-secondary mb-2">{t('home_recent_activity')}</h3>
                  <div className="space-y-2">
                    {recentMoves.map(m => (
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
            </>
          )}
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:px-8 lg:py-5 space-y-3.5">
        {/* Hero banner — warehouse aisle with a legibility gradient */}
        <div className="relative overflow-hidden rounded-2xl border border-border h-24 lg:h-28 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.5)]">
          <HeroWarehouse />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,10,13,0.95) 0%, rgba(8,10,13,0.82) 34%, rgba(8,10,13,0.35) 62%, rgba(8,10,13,0) 100%)' }} />
          <div className="relative h-full flex items-center justify-between px-7 lg:px-9">
            <div>
              <h1 className="text-[26px] lg:text-[30px] leading-tight font-semibold tracking-tight text-white">
                {t(greetingKey())}, <span className="text-amber">{profile?.display_name?.split(' ')[0]}</span>! <span className="align-middle">👋</span>
              </h1>
              <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.72)' }}>
                {isManager ? t('home_owner_subtitle') : t('home_worker_subtitle')}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2.5 px-4 py-2.5 rounded-xl shrink-0"
                 style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Icon name="clipboard" size={17} color="rgba(255,255,255,0.75)" />
              <div>
                <div className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>{t('home_today')}</div>
                <div className="text-sm font-semibold font-mono text-white">{fmtFull(new Date(), lang)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Starting-soon slim alert (kept — the mockup's cards don't
            otherwise surface an upcoming project start) */}
        {isManager && startingSoon.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-dim border border-amber/40 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <StatusDot color="#e8821c" pulse size={9} />
              <span className="font-semibold text-amber text-sm truncate">{startingSoon.length} {t('home_projects_starting_soon')}</span>
            </div>
            <button onClick={() => navigate('/auftraege')}
                    className="bg-amber text-bg-0 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
              {t('home_view_all')}
            </button>
          </div>
        )}

        {isManager ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label={t('home_articles_total')} value={articles.length} icon="package" color="#4a90d9" onClick={() => navigate('/uebersicht')}
                        spark={kennzahlenSeries.map(s => s.artikel_anzahl)} trend={trendFor(kennzahlenSeries, 'artikel_anzahl')} trendMode="pct" />
              <StatCard label={t('home_stock_value')} value={totalValue} format={fmt} icon="chart" color="#4caf6e"
                        spark={kennzahlenSeries.map(s => s.lagerwert)} trend={trendFor(kennzahlenSeries, 'lagerwert')} trendMode="pct" />
              <StatCard label={t('home_low_stock_full')} value={lowStock.length} icon="alert" color="#e0524a" onClick={() => navigate('/uebersicht?bestand=Niedrig')}
                        spark={kennzahlenSeries.map(s => s.niedriger_bestand)} trend={trendFor(kennzahlenSeries, 'niedriger_bestand')} trendMode="abs" />
              <StatCard label={t('home_open_orders')} value={bestellungen.length} icon="building" color="#9b6bd9" onClick={() => navigate('/lieferanten?tab=bestellungen')}
                        spark={kennzahlenSeries.map(s => s.offene_bestellungen)} trend={trendFor(kennzahlenSeries, 'offene_bestellungen')} trendMode="abs" />
              <StatCard label={t('home_active_projects')} value={aktiveProjekte} icon="clipboard" color="#4a90d9" onClick={() => navigate('/auftraege')}
                        spark={kennzahlenSeries.map(s => s.aktive_projekte)} trend={trendFor(kennzahlenSeries, 'aktive_projekte')} trendMode="abs" />
              <StatCard label={t('home_expected_profit')} value={erwarteterGewinnAuftraege} format={fmt} icon="chart" color="#e8821c" onClick={() => navigate('/auftraege')}
                        spark={kennzahlenSeries.map(s => s.erwarteter_gewinn)} trend={trendFor(kennzahlenSeries, 'erwarteter_gewinn')} trendMode="pct" />
            </div>

            {/* Middle row: low stock table · orders · today (soon) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Niedriger Lagerbestand */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Icon name="alert" size={15} color="#e0524a" /> {t('home_low_stock_card')}
                  </h3>
                  {lowStock.length > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-dim text-red">{lowStock.length} {t('home_articles_short')}</span>
                  )}
                </div>
                {lowStock.length === 0 ? (
                  <p className="text-muted text-sm py-4">{t('home_tip_all_good')}</p>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] text-muted">
                          <th className="text-left font-medium pb-2">{t('home_col_article')}</th>
                          <th className="text-right font-medium pb-2">{t('home_col_stock')}</th>
                          <th className="text-right font-medium pb-2">{t('home_col_min')}</th>
                          <th className="text-right font-medium pb-2">{t('home_col_action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.slice(0, 5).map(a => (
                          <tr key={a.id} className="border-t border-border">
                            <td className="py-2 pr-2 min-w-0">
                              <div className="font-medium truncate max-w-[150px]">{a.name}</div>
                            </td>
                            <td className="py-2 text-right font-mono text-red font-semibold whitespace-nowrap">{a.menge} {a.einheit}</td>
                            <td className="py-2 text-right font-mono text-muted whitespace-nowrap">{a.mindestbestand} {a.einheit}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => openLowStock(a)}
                                      className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-red-dim text-red hover:bg-red hover:text-white transition-colors">
                                {t('home_order_now')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button onClick={() => navigate('/uebersicht?bestand=Niedrig')}
                            className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-3">
                      {t('home_view_all_articles').replace('{n}', lowStock.length)} <Icon name="chevronRight" size={13} color="#e8821c" />
                    </button>
                  </>
                )}
              </Card>

              {/* Bestellungen & Lieferungen */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                  <Icon name="truck" size={15} color="#9b6bd9" /> {t('home_orders_deliveries')}
                </h3>
                {recentBestellungen.length === 0 ? (
                  <p className="text-muted text-sm py-4">{t('home_no_open_orders')}</p>
                ) : (
                  <div className="space-y-1">
                    {recentBestellungen.map(b => {
                      const st = ORDER_STATUS_STYLE[b.status] ?? ORDER_STATUS_STYLE.entwurf
                      const datum = b.status === 'eingetroffen' ? b.eingetroffen_at : (b.erwartete_lieferung || b.created_at)
                      return (
                        <button key={b.id} onClick={() => navigate('/lieferanten?tab=bestellungen')}
                                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-bg-2 transition-colors text-left">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                               style={{ background: `linear-gradient(135deg, ${st.color}2e, ${st.color}0f)` }}>
                            <Icon name="truck" size={14} color={st.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{b.lieferant?.name || '—'}</div>
                            <div className="text-[11px] text-muted font-mono">{b.dokument_nr || `${t('home_order_hash')} #${b.id}`}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: st.color + '22', color: st.color }}>{t(st.key)}</span>
                            <div className="text-[10px] text-muted font-mono mt-0.5">{datum ? fmtDay(datum) : '—'}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <button onClick={() => navigate('/lieferanten?tab=bestellungen')}
                        className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-3">
                  {t('home_all_orders')} <Icon name="chevronRight" size={13} color="#e8821c" />
                </button>
              </Card>

              {/* Heute anstehend — today's calendar appointments */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                  <Icon name="clipboard" size={15} color="#4a90d9" /> {t('home_today_schedule')}
                </h3>
                {heuteTermine.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-2">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                         style={{ background: 'linear-gradient(135deg, #4a90d92e, #4a90d90f)' }}>
                      <Icon name="clipboard" size={20} color="#4a90d9" />
                    </div>
                    <div className="text-sm font-semibold text-secondary">{t('home_no_termine')}</div>
                    <p className="text-xs text-muted max-w-[200px]">{t('home_no_termine_desc')}</p>
                  </div>
                ) : (
                  <div className="relative pl-4 space-y-3">
                    {/* timeline spine */}
                    <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" />
                    {heuteTermine.map(tm => {
                      const meta = terminMeta(tm.typ)
                      return (
                        <button key={tm.id} onClick={() => navigate('/kalender')}
                                className={`relative w-full text-left flex items-start gap-3 group ${tm.erledigt ? 'opacity-55' : ''}`}>
                          <span className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-bg-1" style={{ background: meta.color }} />
                          <span className="text-xs font-mono font-semibold w-11 shrink-0" style={{ color: meta.color }}>
                            {fmtUhrzeit(tm.uhrzeit) || t('kal_allday')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate group-hover:text-amber transition-colors ${tm.erledigt ? 'line-through' : ''}`}>{tm.titel}</div>
                            {(tm.ort || tm.projekt?.name) && (
                              <div className="text-[11px] text-muted truncate">{[tm.ort, tm.projekt?.name].filter(Boolean).join(' · ')}</div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <button onClick={() => navigate('/kalender')}
                        className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-3">
                  {t('home_to_calendar')} <Icon name="chevronRight" size={13} color="#e8821c" />
                </button>
              </Card>
            </div>

            {/* Bottom row: stock-value trend · projects · activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Lagerwert Verlauf */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm">{t('home_stockvalue_trend')}</h3>
                  <span className="text-[11px] text-muted px-2 py-1 rounded-md bg-bg-2 border border-border">{t('home_last_6_months')}</span>
                </div>
                <div className="text-2xl font-bold font-mono mb-2">{fmt(totalValue)}</div>
                <LagerwertChart points={lagerwertVerlauf} />
                <button onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-3">
                  {t('home_to_report')} <Icon name="chevronRight" size={13} color="#e8821c" />
                </button>
              </Card>

              {/* Projektübersicht */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <h3 className="font-medium text-sm mb-4">{t('home_project_overview')}</h3>
                {projektFortschritt.length === 0 ? (
                  <p className="text-muted text-sm py-4">{t('home_no_project_deadlines')}</p>
                ) : (
                  <div className="space-y-3.5">
                    {projektFortschritt.map(({ p, pct }) => (
                      <button key={p.id} onClick={() => navigate(`/auftraege?projekt=${p.id}`)} className="w-full text-left group">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-medium truncate group-hover:text-amber transition-colors">{p.name}</span>
                          <span className="text-[11px] font-mono text-muted shrink-0">{pct}%</span>
                        </div>
                        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                               style={{ width: `${pct}%`, background: pct >= 90 ? 'rgb(var(--color-red))' : pct > 66 ? '#e8821c' : '#4a90d9' }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => navigate('/auftraege')}
                        className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-4">
                  {t('home_all_projects')} <Icon name="chevronRight" size={13} color="#e8821c" />
                </button>
              </Card>

              {/* Letzte Aktivitäten */}
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
                <h3 className="font-medium text-sm mb-3">{t('home_recent_activity')}</h3>
                {recentMoves.length === 0 ? (
                  <p className="text-muted text-sm py-4">{t('home_no_movements')}</p>
                ) : (
                  <div className="space-y-2.5">
                    {recentMoves.map(m => (
                      <div key={m.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                             style={{ background: m.typ === 'eingang' ? 'var(--color-green-dim)' : 'var(--color-red-dim)' }}>
                          <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={14}
                                color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{m.artikel_name}</div>
                          {m.von_user && <div className="text-[11px] text-muted truncate">{m.von_user}</div>}
                        </div>
                        <span className="text-[11px] text-muted font-mono shrink-0">{fmtDay(m.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => navigate('/bewegung')}
                        className="flex items-center gap-1.5 text-xs font-medium text-amber hover:gap-2.5 transition-all mt-auto pt-3">
                  {t('home_all_activities')} <Icon name="chevronRight" size={13} color="#e8821c" />
                </button>
              </Card>
            </div>

            {/* Tipp des Tages */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border"
                 style={{ background: 'linear-gradient(135deg,#9b6bd914,#9b6bd908)', borderColor: '#9b6bd940' }}>
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: 'linear-gradient(135deg, #9b6bd92e, #9b6bd90f)' }}>
                  <Icon name="alert" size={15} color="#9b6bd9" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t('home_tip_title')}</div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {lowStock.length > 0 ? t('home_tip_lowstock').replace('{n}', lowStock.length) : t('home_tip_all_good')}
                  </p>
                </div>
              </div>
              {lowStock.length > 0 && (
                <button onClick={() => navigate('/uebersicht?bestand=Niedrig')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  <Icon name="truck" size={15} color="#181c20" /> {t('home_create_orderlist')}
                </button>
              )}
            </div>
          </>
        ) : (
          /* Worker desktop — quick access + low stock essentials */
          <>
            <section>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('home_quick_access')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quickLinks.map(q => (
                  <button key={q.to} onClick={() => navigate(q.to)}
                          style={{ '--accent': q.accent }}
                          className="group bg-bg-1 border border-border rounded-xl p-4 text-left flex flex-col gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-10px_rgba(0,0,0,0.3)] transition-all duration-200">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center ring-1 ring-inset"
                         style={{ background: `linear-gradient(135deg, ${q.accent}2e, ${q.accent}0f)`, '--tw-ring-color': `${q.accent}33` }}>
                      <Icon name={q.icon} size={18} color={q.accent} />
                    </div>
                    <div>
                      <div className="font-medium text-sm text-primary mb-0.5 group-hover:text-[var(--accent)] transition-colors">{t(q.labelKey)}</div>
                      <div className="text-xs text-secondary leading-tight">{t(q.descKey)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {lowStock.length > 0 && (
              <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                  <Icon name="alert" size={15} color="#e0524a" /> {lowStock.length} {t('home_low_stock')}
                </h3>
                <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                  {lowStock.map(a => (
                    <button key={a.id} onClick={() => openLowStock(a)}
                            className="shrink-0 w-32 bg-bg-2 border border-red/30 rounded-xl p-3 text-left hover:border-red transition-colors">
                      <div className="font-mono text-[10px] text-red font-semibold mb-1.5 truncate">{a.nummer}</div>
                      <div className="text-xs font-medium truncate mb-2 leading-tight">{a.name}</div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-sm font-bold text-red">{a.menge}</span>
                        <span className="text-[10px] text-muted">/ {a.mindestbestand} {a.einheit}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {showToday && <TodayMovementsPopup moves={todayMoves} onClose={() => setShowToday(false)} />}
    </>
  )
}
