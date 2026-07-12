import { useMemo } from 'react'
import Card from './Card'
import Icon from './Icon'
import CountUp from './CountUp'
import LiveDuration from './LiveDuration'
import StatusDot from './StatusDot'
import { useLanguage } from '../hooks/useLanguage'
import {
  fmt, fmtDt, fmtDauer, STATUS_META, isOffen, isSpaet,
  projektGewinn, projektRealisierterGewinn, projektLaufzeitTage,
  durchschnittGewinnmarge, projektAktivSeit,
} from '../lib/auftraegeHelpers'

export default function AuftraegeDashboard({ projekte, verbrauchMap, articles, monsBy = {}, onOpenProjekt }) {
  const { t } = useLanguage()
  const aktiveCount = projekte.filter(p => p.status === 'aktiv').length
  const kasneCount  = projekte.filter(isSpaet).length
  const realGewinn  = (p) => projektRealisierterGewinn(p, verbrauchMap, articles, monsBy[p.id])

  const erwarteterGewinn   = projekte.filter(p => isOffen(p.status)).reduce((s, p) => s + projektGewinn(p), 0)
  const realisierterGewinn = projekte.filter(p => p.status === 'abgeschlossen').reduce((s, p) => s + realGewinn(p), 0)
  const gewinnmarge = durchschnittGewinnmarge(projekte, verbrauchMap, articles, monsBy)

  // Projects with someone actually out on a montage right now — each
  // gets its own live, second-by-second ticking stopwatch.
  const liveProjekte = useMemo(() =>
    projekte
      .map(p => ({ p, seit: projektAktivSeit(monsBy[p.id]) }))
      .filter(x => x.seit !== null)
      .sort((a, b) => a.seit - b.seit)
  , [projekte, monsBy])

  const anstehendeFristen = useMemo(() =>
    projekte
      .filter(p => isOffen(p.status) && p.rok)
      .sort((a, b) => new Date(a.rok) - new Date(b.rok))
      .slice(0, 6)
  , [projekte])

  // Projects still "geplant" (never marked Aktiv) whose planned start
  // date is close or already passed without anyone starting the clock.
  const anstehendeStarts = useMemo(() =>
    projekte
      .filter(p => p.status === 'geplant' && p.geplanter_beginn)
      .sort((a, b) => new Date(a.geplanter_beginn) - new Date(b.geplanter_beginn))
      .slice(0, 6)
  , [projekte])

  const verspaeteteProjekte = useMemo(() =>
    projekte
      .filter(isSpaet)
      .sort((a, b) => new Date(a.rok) - new Date(b.rok))
  , [projekte])

  const statusVerteilung = useMemo(() => {
    const counts = {}
    projekte.forEach(p => { counts[p.status] = (counts[p.status] ?? 0) + 1 })
    return Object.entries(STATUS_META).map(([k, m]) => ({ key: k, label: t('status_' + k), color: m.color, count: counts[k] ?? 0 }))
  }, [projekte, t])
  const maxStatusCount = Math.max(...statusVerteilung.map(s => s.count), 1)

  // Wall-clock days from first "Aktiv" to Abgeschlossen (or now) — how
  // long jobs actually take, not labor-hours. Only projects the clock
  // has ever run for show up here.
  const laufzeiten = useMemo(() => {
    return projekte
      .map(p => ({ p, tage: projektLaufzeitTage(p, monsBy[p.id]) }))
      .filter(x => x.tage !== null)
      .sort((a, b) => b.tage - a.tage)
      .slice(0, 7)
  }, [projekte, monsBy])
  const maxLaufzeit = Math.max(...laufzeiten.map(x => x.tage), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('ad_active_projects')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={aktiveCount} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('ad_late')}</div>
          <div className={`text-lg sm:text-xl font-bold font-mono ${kasneCount > 0 ? 'text-red' : ''}`}><CountUp value={kasneCount} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('ad_expected_profit')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={erwarteterGewinn} format={fmt} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('ad_realized_profit')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-green"><CountUp value={realisierterGewinn} format={fmt} /></div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted mb-1">{t('ad_avg_margin')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono">{gewinnmarge === null ? '—' : <CountUp value={gewinnmarge} format={n => `${n.toFixed(0)}%`} />}</div>
        </Card>
      </div>

      {liveProjekte.length > 0 && (
        <Card className="p-4 border-blue/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue" />
            </span>
            <h3 className="font-medium text-sm">{t('ad_live_now')}</h3>
          </div>
          <div className="space-y-1.5">
            {liveProjekte.map(({ p, seit }) => (
              <button key={p.id} onClick={() => onOpenProjekt(p.id)}
                      className="w-full flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-left hover:bg-bg-3 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted truncate">{p.kunde || '—'}</div>
                </div>
                <LiveDuration since={seit} className="text-xs text-blue shrink-0" />
                <Icon name="chevronRight" size={14} color="#6b7480" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-3">{t('ad_by_status')}</h3>
        <div className="space-y-2.5">
          {statusVerteilung.map(s => (
            <div key={s.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-secondary flex items-center gap-1.5">
                  <StatusDot color={s.color} pulse={s.key === 'aktiv'} size={6} />
                  {s.label}
                </span>
                <span className="font-mono">{s.count}</span>
              </div>
              <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${(s.count / maxStatusCount) * 100}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {anstehendeStarts.length > 0 && (
        <Card className="p-4">
          <h3 className="font-medium text-sm mb-3">{t('home_upcoming_starts')}</h3>
          <div className="space-y-1.5">
            {anstehendeStarts.map(p => {
              const daysUntil = Math.ceil((new Date(p.geplanter_beginn + 'T00:00:00') - Date.now()) / 86400000)
              const overdue = daysUntil < 0
              return (
                <button key={p.id} onClick={() => onOpenProjekt(p.id)}
                        className="w-full flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-left hover:bg-bg-3 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted truncate">{p.kunde || '—'}</div>
                  </div>
                  {overdue ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-red shrink-0">
                      <StatusDot color="#e0524a" pulse size={6} />
                      {t('home_start_overdue')}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-secondary shrink-0">{fmtDt(p.geplanter_beginn)}</span>
                  )}
                  <Icon name="chevronRight" size={14} color="#6b7480" />
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-3">{t('ad_upcoming_deadlines')}</h3>
        {anstehendeFristen.length === 0 ? (
          <p className="text-muted text-sm">{t('ad_no_open_deadlines')}</p>
        ) : (
          <div className="space-y-1.5">
            {anstehendeFristen.map(p => (
              <button key={p.id} onClick={() => onOpenProjekt(p.id)}
                      className="w-full flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-left hover:bg-bg-3 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted truncate">{p.kunde || '—'}</div>
                </div>
                <span className={`text-xs font-mono shrink-0 ${isSpaet(p) ? 'text-red font-semibold' : 'text-secondary'}`}>
                  {fmtDt(p.rok)}
                </span>
                <Icon name="chevronRight" size={14} color="#6b7480" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {verspaeteteProjekte.length > 0 && (
        <Card className="p-4 border-red/30 bg-red-dim">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="alert" size={15} color="#e0524a" />
            <h3 className="font-medium text-sm text-red">{t('ad_late_projects')} ({verspaeteteProjekte.length})</h3>
          </div>
          <div className="space-y-1.5">
            {verspaeteteProjekte.map(p => {
              const tageZuSpaet = Math.floor((Date.now() - new Date(p.rok).getTime()) / 86400000)
              return (
                <button key={p.id} onClick={() => onOpenProjekt(p.id)}
                        className="w-full flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-left hover:bg-bg-3 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted truncate">{p.kunde || '—'} · {t('ad_deadline')} {fmtDt(p.rok)}</div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-red shrink-0">
                    {tageZuSpaet}T {t('ad_overdue')}
                  </span>
                  <Icon name="chevronRight" size={14} color="#6b7480" />
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {laufzeiten.length > 0 && (
        <Card className="p-4">
          <h3 className="font-medium text-sm mb-3">{t('ad_runtimes')}</h3>
          <div className="space-y-2.5">
            {laufzeiten.map(({ p, tage }) => (
              <button key={p.id} onClick={() => onOpenProjekt(p.id)} className="w-full text-left group">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-secondary group-hover:text-primary transition-colors truncate">
                    {p.name}{p.status === 'aktiv' ? ` ${t('ad_running')}` : ''}
                  </span>
                  <span className="font-mono shrink-0 ml-2">{fmtDauer(tage * 86400000)}</span>
                </div>
                <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{ width: `${(tage / maxLaufzeit) * 100}%`, background: p.status === 'aktiv' ? '#4a90d9' : '#4caf6e' }} />
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}
