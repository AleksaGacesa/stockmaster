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
import { isOffen, isSpaet } from '../lib/auftraegeHelpers'

const fmt    = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDay = (d) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(d))
const fmtTime = (d) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(d))

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
                      color={m.typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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

/* ══ PROJECT TIMELINE — how much of each open project's planned time
   has elapsed, with a live warning for anything past its deadline ══ */
function ProjectTimelineCard({ projekte, navigate }) {
  const { t } = useLanguage()
  const rows = useMemo(() => projekte
    .filter(p => isOffen(p.status) && p.rok && (p.geplanter_beginn || p.created_at))
    .map(p => {
      // Planned start, not creation date — a job quoted well in advance
      // shouldn't look like it's already burning through its timeline
      // before work has even begun.
      const start = new Date(p.geplanter_beginn ? p.geplanter_beginn + 'T00:00:00' : p.created_at).getTime()
      const end = new Date(p.rok + 'T23:59:59').getTime()
      const totalMs = Math.max(end - start, 1)
      const elapsedMs = Math.min(Math.max(Date.now() - start, 0), totalMs)
      const pct = Math.round((elapsedMs / totalMs) * 100)
      const late = isSpaet(p)
      const daysLeft = Math.ceil((end - Date.now()) / 86400000)
      return { p, pct, late, daysLeft }
    })
    .sort((a, b) => new Date(a.p.rok) - new Date(b.p.rok))
    .slice(0, 5)
  , [projekte])

  return (
    <Card className="p-5">
      <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
        <Icon name="chart" size={15} color="#d96b8f" /> {t('home_project_timeline')}
      </h3>
      {rows.length === 0 ? (
        <p className="text-muted text-sm">{t('home_no_project_deadlines')}</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ p, pct, late, daysLeft }) => (
            <button key={p.id} onClick={() => navigate(`/auftraege?projekt=${p.id}`)}
                    className="w-full text-left group">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium truncate group-hover:text-amber transition-colors">{p.name}</span>
                {late ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red shrink-0">
                    <StatusDot color="#e0524a" pulse size={6} />
                    {t('home_overdue')}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted font-mono shrink-0">
                    {daysLeft === 0
                      ? t('home_due_today')
                      : `${t('home_due_in')} ${daysLeft} ${daysLeft === 1 ? t('home_day_word') : t('home_days_word')}`}
                  </span>
                )}
              </div>
              <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${late ? 100 : pct}%`, background: late ? '#e0524a' : pct > 80 ? '#e8821c' : '#4a90d9' }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ══ UPCOMING STARTS — projects still "geplant" (not yet marked
   Aktiv) whose planned start date is close or already passed ══ */
function UpcomingStartsCard({ projekte, navigate }) {
  const { t } = useLanguage()
  const rows = useMemo(() => projekte
    .filter(p => p.status === 'geplant' && p.geplanter_beginn)
    .map(p => {
      const start = new Date(p.geplanter_beginn + 'T00:00:00').getTime()
      const daysUntil = Math.ceil((start - Date.now()) / 86400000)
      return { p, daysUntil, overdue: daysUntil < 0 }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5)
  , [projekte])

  if (rows.length === 0) return null

  return (
    <Card className="p-5">
      <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
        <Icon name="clipboard" size={15} color="#9b6bd9" /> {t('home_upcoming_starts')}
      </h3>
      <div className="space-y-3">
        {rows.map(({ p, daysUntil, overdue }) => (
          <button key={p.id} onClick={() => navigate(`/auftraege?projekt=${p.id}`)}
                  className="w-full flex items-center justify-between gap-2 group">
            <span className="text-sm font-medium truncate group-hover:text-amber transition-colors">{p.name}</span>
            {overdue ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red shrink-0">
                <StatusDot color="#e0524a" pulse size={6} />
                {t('home_start_overdue')}
              </span>
            ) : daysUntil === 0 ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber shrink-0">
                <StatusDot color="#e8821c" pulse size={6} />
                {t('home_starts_today')}
              </span>
            ) : (
              <span className="text-[11px] text-muted font-mono shrink-0">
                {t('home_due_in')} {daysUntil} {daysUntil === 1 ? t('home_day_word') : t('home_days_word')}
              </span>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
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

  // A lightweight teaser of the Bestellungen/Aufträge dashboards —
  // just enough to summarize on Home without pulling in their full
  // page logic. Owner-only, since both features are owner-gated.
  const [bestellungen, setBestellungen] = useState([])
  const [projekte, setProjekte]         = useState([])
  useEffect(() => {
    if (!isManager) return
    Promise.all([
      supabase.from('bestellungen').select('id, status, positionen:bestellung_positionen(menge, preis)').neq('status', 'eingetroffen'),
      supabase.from('projekte').select('id, name, status, rok, geplanter_beginn, created_at, verkaufspreis, material:projekt_material(geplant_menge, preis)').in('status', ['geplant', 'aktiv', 'pausiert']),
    ]).then(([{ data: best }, { data: proj }]) => {
      setBestellungen(best ?? [])
      setProjekte(proj ?? [])
    })
  }, [isManager])

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
            {quickLinks.map(q => (
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
                              color={m.typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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
      <div className="hidden sm:block p-6 lg:p-8 space-y-6">
        {/* Hero */}
        <div className="rounded-2xl border border-border overflow-hidden relative"
             style={{ background: 'linear-gradient(135deg, rgb(var(--bg-1)) 0%, rgb(var(--bg-0)) 100%)' }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 pointer-events-none"
               style={{ background: 'radial-gradient(circle,#e8821c 0%,transparent 70%)', transform: 'translate(30%,-30%)' }} />
          <div className="p-6 relative">
            <div className="flex items-center gap-3 mb-3">
              <Logo size="lg" />
              <div>
                <div className="font-extrabold text-xl">Stock<span className="text-amber">Master</span></div>
                <Tagline size="lg" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold mb-1">
              {t('home_welcome_back')}, {profile?.display_name?.split(' ')[0]}
            </h1>
            <p className="text-secondary text-sm">
              {isManager ? t('home_owner_subtitle') : t('home_worker_subtitle')}
            </p>
          </div>
        </div>

        {/* Quick access */}
        <section>
          <h2 className="text-sm font-medium text-secondary mb-3">{t('home_quick_access')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {quickLinks.map(q => (
              <button key={q.to} onClick={() => navigate(q.to)}
                      className="bg-bg-1 border border-border rounded-xl p-4 text-left flex flex-col gap-3 hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition-all duration-150">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                     style={{ background: q.accent + '1a' }}>
                  <Icon name={q.icon} size={18} color={q.accent} />
                </div>
                <div>
                  <div className="font-medium text-sm text-primary mb-0.5">{t(q.labelKey)}</div>
                  <div className="text-xs text-secondary leading-tight">{t(q.descKey)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="bg-red-dim border border-red/40 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Icon name="alert" size={17} color="#e0524a" />
                <span className="font-semibold text-red text-sm">{lowStock.length} {t('home_low_stock')}</span>
              </div>
              <button onClick={() => navigate('/uebersicht?bestand=Niedrig')}
                      className="bg-red text-white text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
                {t('home_view_all')}
              </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {lowStock.map((a, i) => (
                <button key={a.id} onClick={() => openLowStock(a)}
                        className="shrink-0 w-32 bg-bg-1 border border-red/30 rounded-xl p-3 text-left hover:border-red hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
                        style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="font-mono text-[10px] text-red font-semibold mb-1.5 truncate">{a.nummer}</div>
                  <div className="text-xs font-medium truncate mb-2 leading-tight">{a.name}</div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-sm font-bold text-red">{a.menge}</span>
                    <span className="text-[10px] text-muted">/ {a.mindestbestand} {a.einheit}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Project starting soon alert */}
        {startingSoon.length > 0 && (
          <div className="bg-amber-dim border border-amber/40 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <StatusDot color="#e8821c" pulse size={10} />
                <span className="font-semibold text-amber text-sm">{startingSoon.length} {t('home_projects_starting_soon')}</span>
              </div>
              <button onClick={() => navigate('/auftraege')}
                      className="bg-amber text-bg-0 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
                {t('home_view_all')}
              </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {startingSoon.map(({ p, daysUntil }, i) => (
                <button key={p.id} onClick={() => navigate(`/auftraege?projekt=${p.id}`)}
                        className="shrink-0 w-40 bg-bg-1 border border-amber/30 rounded-xl p-3 text-left hover:border-amber hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
                        style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="text-xs font-medium truncate mb-2 leading-tight">{p.name}</div>
                  <div className={`text-sm font-bold font-mono ${daysUntil < 0 ? 'text-red' : 'text-amber'}`}>
                    {daysUntil < 0 ? t('home_start_overdue') : daysUntil === 0 ? t('home_starts_today') : `${t('home_due_in')} ${daysUntil} ${daysUntil === 1 ? t('home_day_word') : t('home_days_word')}`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Owner stats + charts */}
        {isManager && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: t('home_articles_total'),   value: articles.length,  icon: 'package', color: '#4a90d9' },
                { label: t('home_stock_value'),       value: totalValue,       icon: 'chart',   color: '#4caf6e', format: fmt },
                { label: t('home_low_stock_full'),    value: lowStock.length,  icon: 'alert',   color: '#e0524a' },
                { label: t('home_movements_today'),   value: todayMoves.length,icon: 'truck',   color: '#e8821c', onClick: () => setShowToday(true) },
              ].map(s => (
                <Card key={s.label} className="p-4" onClick={s.onClick}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs text-secondary">{s.label}</span>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: s.color + '1a' }}>
                      <Icon name={s.icon} size={14} color={s.color} />
                    </div>
                  </div>
                  <div className="text-xl font-bold font-mono"><CountUp value={s.value} format={s.format} /></div>
                </Card>
              ))}
            </div>

            {/* Bestellungen / Aufträge teaser — smaller cards pulled
                from the two other Dashboard faces */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-4" onClick={() => navigate('/lieferanten?tab=bestellungen')}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-secondary">{t('home_open_orders')}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#9b6bd91a' }}>
                    <Icon name="building" size={14} color="#9b6bd9" />
                  </div>
                </div>
                <div className="text-xl font-bold font-mono"><CountUp value={bestellungen.length} /></div>
              </Card>
              <Card className="p-4" onClick={() => navigate('/lieferanten?tab=bestellungen')}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-secondary">{t('home_orders_value')}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#9b6bd91a' }}>
                    <Icon name="truck" size={14} color="#9b6bd9" />
                  </div>
                </div>
                <div className="text-xl font-bold font-mono"><CountUp value={bestellwertUnterwegs} format={fmt} /></div>
              </Card>
              <Card className="p-4" onClick={() => navigate('/auftraege')}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-secondary">{t('home_active_projects')}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#d96b8f1a' }}>
                    <Icon name="clipboard" size={14} color="#d96b8f" />
                  </div>
                </div>
                <div className="text-xl font-bold font-mono"><CountUp value={aktiveProjekte} /></div>
              </Card>
              <Card className="p-4" onClick={() => navigate('/auftraege')}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-secondary">{t('home_expected_profit')}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#d96b8f1a' }}>
                    <Icon name="chart" size={14} color="#d96b8f" />
                  </div>
                </div>
                <div className="text-xl font-bold font-mono"><CountUp value={erwarteterGewinnAuftraege} format={fmt} /></div>
              </Card>
            </div>

            <UpcomingStartsCard projekte={projekte} navigate={navigate} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ProjectTimelineCard projekte={projekte} navigate={navigate} />

              <Card className="p-5">
                <h3 className="font-medium text-sm mb-4">{t('home_recent_activity')}</h3>
                {recentMoves.length === 0 ? (
                  <p className="text-muted text-sm">{t('home_no_movements')}</p>
                ) : (
                  <div className="space-y-3">
                    {recentMoves.map(m => (
                      <div key={m.id} className="flex items-center gap-3">
                        <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={14}
                              color={m.typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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
          </>
        )}
      </div>

      {showToday && <TodayMovementsPopup moves={todayMoves} onClose={() => setShowToday(false)} />}
    </>
  )
}
