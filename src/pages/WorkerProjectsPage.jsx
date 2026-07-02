import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StatusDot from '../components/StatusDot'
import LiveDuration from '../components/LiveDuration'
import {
  STATUS_META, isOffen, isSpaet, fmtDt, fmtDauer,
  projektArbeitsstunden, projektAktivSeit,
} from '../lib/auftraegeHelpers'

function StatusBadge({ status }) {
  const { t } = useLanguage()
  const m = STATUS_META[status] ?? STATUS_META.geplant
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <StatusDot color={m.color} pulse={status === 'aktiv'} size={6} />
      {t('status_' + status)}
    </span>
  )
}

/* ══ PROJECT DETAIL — read-only, no prices ══ */
function ProjektDetail({ projekt, verbrauch, onBack }) {
  const { t } = useLanguage()
  const rows = (projekt.material ?? []).map(m => ({
    ...m, verbrauchtMenge: verbrauch[m.artikel_id] ?? 0,
  }))
  const materialGeplant = rows.reduce((s, r) => s + r.geplant_menge, 0)
  const materialVerbraucht = rows.reduce((s, r) => s + r.verbrauchtMenge, 0)
  const fortschritt = materialGeplant > 0 ? Math.min(Math.round((materialVerbraucht / materialGeplant) * 100), 100) : 0
  const arbeitsstunden = projektArbeitsstunden(projekt)
  const aktivSeit = projektAktivSeit(projekt)

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-2xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-secondary text-sm mb-4 hover:text-primary transition-colors">
        <Icon name="chevronLeft" size={16} color="currentColor" /> {t('common_back')}
      </button>

      <div className="mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-3 flex-wrap">
          {projekt.name}
          <StatusBadge status={projekt.status} />
          {isSpaet(projekt) && (
            <span className="text-xs font-medium px-2 py-1 rounded-md bg-red-dim text-red">{t('ad_late')}</span>
          )}
        </h1>
        <p className="text-secondary text-sm mt-1">
          {projekt.kunde || '—'}{projekt.rok ? ` · ${t('auf_field_deadline')}: ${fmtDt(projekt.rok)}` : ''}{projekt.verantwortlich_name ? ` · ${projekt.verantwortlich_name}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('auf_work_hours')}</div>
          <div className="text-lg font-bold font-mono">{arbeitsstunden.toFixed(1)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('wp_status')}</div>
          {aktivSeit ? (
            <LiveDuration since={aktivSeit} className="text-base font-bold" />
          ) : (
            <div className="text-lg font-bold font-mono">—</div>
          )}
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-secondary">{t('auf_material_consumed')}</span>
          <span className="font-mono">{materialVerbraucht} / {materialGeplant}</span>
        </div>
        <div className="h-2.5 bg-bg-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${fortschritt}%`, background: fortschritt > 100 ? '#e0524a' : '#4a90d9' }} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-medium text-sm">{t('wp_planned_material')}</h3>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">{t('wp_no_material')}</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(r => {
              const pct = r.geplant_menge > 0 ? Math.min(Math.round((r.verbrauchtMenge / r.geplant_menge) * 100), 100) : 0
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate">{r.artikel_name}</span>
                    <span className="text-xs font-mono text-secondary shrink-0">{r.verbrauchtMenge} / {r.geplant_menge} {r.einheit}</span>
                  </div>
                  <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${pct}%`, background: pct >= 100 ? '#4caf6e' : '#4a90d9' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══ MAIN PAGE ══ */
export default function WorkerProjectsPage() {
  const { t } = useLanguage()
  const [projekte, setProjekte] = useState([])
  const [verbrauchMap, setVerbrauchMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('offen')
  const [activeId, setActiveId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: moves }] = await Promise.all([
      supabase.from('projekte').select('*, material:projekt_material(*), zeiterfassung:projekt_zeiterfassung(*)').order('created_at', { ascending: false }),
      supabase.from('warenbewegungen').select('projekt_id, artikel_id, menge').eq('typ', 'ausgang').not('projekt_id', 'is', null),
    ])
    setProjekte(p ?? [])
    const vm = {}
    ;(moves ?? []).forEach(m => {
      vm[m.projekt_id] = vm[m.projekt_id] ?? {}
      vm[m.projekt_id][m.artikel_id] = (vm[m.projekt_id][m.artikel_id] ?? 0) + Number(m.menge)
    })
    setVerbrauchMap(vm)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const active = projekte.find(p => p.id === activeId)
  if (active) return <ProjektDetail projekt={active} verbrauch={verbrauchMap[active.id] ?? {}} onBack={() => setActiveId(null)} />

  const q = search.toLowerCase()
  const filtered = projekte.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.kunde ?? '').toLowerCase().includes(q)) &&
    (filterStatus === 'Alle' || (filterStatus === 'offen' ? isOffen(p.status) : p.status === filterStatus))
  )

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('nav_projekte')}</h1>
        <p className="text-secondary text-sm">{t('wp_subtitle')}</p>
      </div>

      <Card className="p-3 mb-5">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Icon name="search" size={14} color="#6b7480" />
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
                   placeholder={t('common_search')}
                   className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm text-secondary outline-none">
            <option value="offen">{t('wp_filter_open')}</option>
            <option value="Alle">{t('auf_all_status')}</option>
            {Object.entries(STATUS_META).map(([k]) => <option key={k} value={k}>{t('status_' + k)}</option>)}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Icon name="clipboard" size={28} color="#6b7480" />
          <p className="text-secondary text-sm mt-3">{t('auf_no_projects')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const vb = verbrauchMap[p.id] ?? {}
            const geplant = (p.material ?? []).reduce((s, m) => s + m.geplant_menge, 0)
            const verbraucht = (p.material ?? []).reduce((s, m) => s + (vb[m.artikel_id] ?? 0), 0)
            const pct = geplant > 0 ? Math.min(Math.round((verbraucht / geplant) * 100), 100) : 0
            const aktivSeit = projektAktivSeit(p)
            return (
              <Card key={p.id} className="p-4 cursor-pointer" onClick={() => setActiveId(p.id)}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <p className="text-xs text-muted truncate">{p.kunde || '—'}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-secondary mb-3">
                  <span>{p.rok ? fmtDt(p.rok) : t('auf_no_deadline')}</span>
                  {isSpaet(p) && <span className="text-red font-medium">{t('ad_late')}</span>}
                </div>
                {aktivSeit && <LiveDuration since={aktivSeit} className="text-xs mb-3" />}
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{t('auf_material_consumed')}</span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${pct}%`, background: pct >= 100 ? '#4caf6e' : '#4a90d9' }} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
