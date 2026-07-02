import { useState, useMemo, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQrScanner } from '../hooks/useQrScanner'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import QrScannerCard from '../components/QrScannerCard'

const fmt   = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDt = (d) => new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(d))

// A closed session's updated_at is only ever bumped by toggleStatus,
// so once abgeschlossen it doubles as "closed at" — combined with
// created_at that's enough for a "ran from X to Y" range without a
// dedicated column, and collapses to one date when it closed same-day.
const sessionDateRange = (s) => {
  if (s.status !== 'abgeschlossen') return fmtDt(s.created_at)
  const start = fmtDt(s.created_at)
  const end = fmtDt(s.updated_at)
  return start === end ? start : `${start} – ${end}`
}

/* ══ SESSION LIST ══ */
function SessionList({ sessions, articles, isManager, onOpen, onRefresh }) {
  const { t } = useLanguage()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const { profile } = useAuth()

  const create = async () => {
    if (!newName.trim()) return
    await supabase.from('inventur_sessions').insert({
      name: newName.trim(), status: 'aktiv', erstellt_von: profile?.display_name ?? '',
    })
    setNewName(''); setShowNew(false); onRefresh()
  }

  const del = async (id) => {
    await supabase.from('inventur_sessions').delete().eq('id', id)
    onRefresh()
  }

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh] overflow-y-auto">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">{t('inv_title')}</h1>
            {isManager && !showNew && (
              <button onClick={() => setShowNew(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                <Icon name="plus" size={12} color="#181c20" /> {t('inv_new')}
              </button>
            )}
          </div>

          {showNew && (
            <Card className="p-3">
              <label className="block text-xs text-secondary mb-1.5">{t('inv_name_label')}</label>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && create()}
                     placeholder={t('inv_name_ph_short')}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber mb-3" />
              <div className="flex gap-2">
                <button onClick={create}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  {t('inv_create')}
                </button>
                <button onClick={() => { setShowNew(false); setNewName('') }}
                        className="flex-1 py-2 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
                  {t('common_cancel')}
                </button>
              </div>
            </Card>
          )}

          {sessions.length === 0 ? (
            <Card className="p-8 text-center">
              <Icon name="filter" size={24} color="#6b7480" />
              <p className="text-secondary text-sm mt-2">{t('inv_none_yet')}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => {
                const pct = articles.length > 0 ? Math.round(((s.erfasst_count ?? 0) / articles.length) * 100) : 0
                return (
                  <div key={s.id} className="bg-bg-1 border border-border rounded-xl p-3"
                       onClick={() => onOpen(s.id)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted font-mono mt-0.5">{s.dokument_nr ? `${s.dokument_nr} · ` : ''}{sessionDateRange(s)}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-md font-medium ml-2 shrink-0 ${
                        s.status === 'aktiv' ? 'bg-amber-dim text-amber' : 'bg-green-dim text-green'
                      }`}>{s.status === 'aktiv' ? t('status_aktiv') : t('inv_status_done_short')}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-secondary">{s.erfasst_count ?? 0} / {articles.length}</span>
                      <span className="font-mono">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                           style={{ width: `${pct}%`, background: s.status === 'aktiv' ? '#e8821c' : '#4caf6e' }} />
                    </div>
                    {isManager && (
                      <button onClick={e => { e.stopPropagation(); del(s.id) }}
                              className="mt-2 flex items-center gap-1 text-xs text-muted px-2 py-1 rounded-lg border border-border bg-bg-2">
                        <Icon name="trash" size={11} color="currentColor" /> {t('common_delete')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('inv_title')}</h1>
            <p className="text-secondary text-sm">{t('inv_subtitle')}</p>
          </div>
          {isManager && !showNew && (
            <button onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              <Icon name="plus" size={15} color="#181c20" /> {t('inv_new')}
            </button>
          )}
        </div>

        {showNew && (
          <Card className="p-4 mb-5 max-w-md">
            <label className="block text-xs text-secondary mb-1.5">{t('inv_name_label')}</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && create()}
                   placeholder={t('inv_name_ph_long')}
                   className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber mb-3" />
            <div className="flex gap-2">
              <button onClick={create}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                {t('inv_create')}
              </button>
              <button onClick={() => { setShowNew(false); setNewName('') }}
                      className="px-4 py-2 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
                {t('common_cancel')}
              </button>
            </div>
          </Card>
        )}

        {sessions.length === 0 ? (
          <Card className="p-10 text-center">
            <Icon name="filter" size={28} color="#6b7480" />
            <p className="text-secondary text-sm mt-3">{t('inv_none_yet')}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map(s => {
              const pct = articles.length > 0 ? Math.round(((s.erfasst_count ?? 0) / articles.length) * 100) : 0
              return (
                <Card key={s.id} className="p-4 cursor-pointer hover:border-border-strong transition-colors"
                     onClick={() => onOpen(s.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{s.name}</h3>
                      <p className="text-xs text-muted font-mono mt-0.5">{s.dokument_nr ? `${s.dokument_nr} · ` : ''}{sessionDateRange(s)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                      s.status === 'aktiv' ? 'bg-amber-dim text-amber' : 'bg-green-dim text-green'
                    }`}>{s.status === 'aktiv' ? t('status_aktiv') : t('inv_status_done_full')}</span>
                  </div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-secondary">{s.erfasst_count ?? 0} {t('ueb_of')} {articles.length} {t('inv_captured')}</span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${pct}%`, background: s.status === 'aktiv' ? '#e8821c' : '#4caf6e' }} />
                  </div>
                  {isManager && (
                    <button onClick={e => { e.stopPropagation(); del(s.id) }}
                            className="mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-red border border-border px-2.5 py-1.5 rounded-lg hover:border-red transition-colors">
                      <Icon name="trash" size={12} color="currentColor" /> {t('common_delete')}
                    </button>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

/* ══ ZAEHLEN TAB ══ */
function ZaehlenTab({ session, articles, onUpdate }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [step, setStep]       = useState('method')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [count, setCount]     = useState(0)
  const [saved, setSaved]     = useState(false)

  const openArticle = useCallback((a) => {
    const existing = session.erfassungen?.find(e => e.artikel_id === a.id)
    setSelected(a); setCount(existing ? existing.gezaehlt : a.menge)
    setStep('count'); setSearch('')
  }, [session])

  const { scanning, scanError, videoRef, canvasRef, startScan: startScanning, stopScan } =
    useQrScanner(articles, openArticle)

  const startScan = () => { setStep('scan'); startScanning() }

  const results = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return articles.filter(a => a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q)).slice(0, 8)
  }, [articles, search])

  const reset = () => { stopScan(); setStep('method'); setSelected(null); setSearch('') }
  const isDone = (a) => session.erfassungen?.some(e => e.artikel_id === a.id)

  const confirmCount = async () => {
    await supabase.from('inventur_erfassungen').upsert({
      session_id: session.id, artikel_id: selected.id, gezaehlt: count,
      von_user: profile?.display_name ?? '', von_user_id: profile?.id ?? null,
    }, { onConflict: 'session_id,artikel_id' })
    setSaved(true); onUpdate()
    setTimeout(() => { setSaved(false); reset() }, 700)
  }

  if (step === 'method') return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
      {[
        { label: t('bew_scan_qr'), desc: t('inv_scan_article'), icon: 'scan',
          grad: 'linear-gradient(135deg,#f0982e,#c96a0f)', action: startScan },
        { label: t('bew_search_article'),  desc: t('inv_search_by_name'), icon: 'search',
          grad: 'linear-gradient(135deg,#5a9fe0,#3a6fb0)', action: () => setStep('search') },
      ].map(b => (
        <button key={b.label} onClick={b.action}
                className="flex-1 flex items-center sm:flex-col sm:items-center gap-4 sm:gap-4 p-4 sm:p-8 bg-bg-1 border border-border rounded-2xl transition-all hover:border-border-strong">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: b.grad }}>
            <Icon name={b.icon} size={24} color="#181c20" />
          </div>
          <div className="text-left sm:text-center">
            <div className="font-semibold text-sm sm:text-base">{b.label}</div>
            <div className="text-secondary text-xs sm:text-sm mt-0.5">{b.desc}</div>
          </div>
          <Icon name="chevronRight" size={16} color="#6b7480" className="ml-auto sm:hidden" />
        </button>
      ))}
    </div>
  )

  if (step === 'scan') return (
    <QrScannerCard scanning={scanning} scanError={scanError} videoRef={videoRef} canvasRef={canvasRef}
              onSearchFallback={() => setStep('search')} onClose={reset} />
  )

  if (step === 'search') return (
    <Card className="p-4 max-w-md">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-sm">{t('bew_search_article')}</span>
        <button onClick={reset} className="p-1.5 rounded-lg hover:bg-bg-2"><Icon name="x" size={15} color="#9aa3ad" /></button>
      </div>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Icon name="search" size={14} color="#6b7480" /></div>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={t('bew_search_ph')}
               className="w-full bg-bg-2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-amber" />
      </div>
      {results.length > 0 && (
        <div className="mt-2 border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(a => (
            <button key={a.id} onClick={() => openArticle(a)}
                    className="w-full text-left px-3 py-2.5 bg-bg-2 border-b border-border last:border-0 flex items-center gap-3 hover:bg-bg-3 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted font-mono">{a.nummer}</div>
              </div>
              {isDone(a) && <Icon name="check" size={15} color="#4caf6e" />}
            </button>
          ))}
        </div>
      )}
    </Card>
  )

  if (step === 'count' && selected) {
    const diff = count - selected.menge
    return (
      <div className="max-w-md space-y-3">
        <Card className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs text-amber">{selected.nummer}</div>
            <div className="font-semibold text-sm">{selected.name}</div>
            <div className="text-xs text-secondary">{selected.lagerort}</div>
          </div>
          <button onClick={reset} className="p-1.5 rounded-lg border border-border hover:bg-bg-2 shrink-0">
            <Icon name="x" size={14} color="#9aa3ad" />
          </button>
        </Card>
        <Card className="p-5 text-center">
          <div className="text-xs text-secondary mb-1">{t('inv_system_label')}: {selected.menge} {selected.einheit}</div>
          <div className="text-xs text-muted mb-5">{t('inv_counted_qty')}</div>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => setCount(c => Math.max(0, c - 1))}
                    className="w-14 h-14 rounded-2xl bg-bg-2 border border-border text-2xl hover:bg-bg-3 transition-colors">−</button>
            <div className="font-mono text-5xl font-bold min-w-[90px]">{count}</div>
            <button onClick={() => setCount(c => c + 1)}
                    className="w-14 h-14 rounded-2xl bg-bg-2 border border-border text-2xl hover:bg-bg-3 transition-colors">+</button>
          </div>
          <div className="flex justify-center gap-2 mb-4">
            {[-10, -5, +5, +10].map(d => (
              <button key={d} onClick={() => setCount(c => Math.max(0, c + d))}
                      className="bg-bg-2 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-secondary hover:bg-bg-3">
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          {diff !== 0 && (
            <div className={`text-sm mb-4 flex items-center justify-center gap-1.5 ${diff > 0 ? 'text-green' : 'text-red'}`}>
              <Icon name={diff > 0 ? 'arrowDown' : 'arrowUp'} size={14} color={diff > 0 ? '#4caf6e' : '#e0524a'} />
              {t('inv_difference')}: {diff > 0 ? '+' : ''}{diff} {selected.einheit}
            </div>
          )}
          {saved ? (
            <div className="flex items-center justify-center gap-2 text-green font-semibold">
              <Icon name="check" size={18} color="#4caf6e" /> {t('inv_saved')}
            </div>
          ) : (
            <button onClick={confirmCount}
                    className="w-full py-3 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              {diff === 0 ? t('inv_confirm_match') : t('inv_save_diff')}
            </button>
          )}
        </Card>
      </div>
    )
  }
  return null
}

/* ══ BERICHT TAB ══ */
function BerichtTab({ session, articles, setArticles, setMoves }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [confirmApply, setConfirmApply] = useState(false)
  const [applied, setApplied] = useState(false)

  const rows = useMemo(() => {
    return (session.erfassungen ?? []).map(e => {
      const a = articles.find(x => x.id === e.artikel_id)
      if (!a) return null
      const diff = e.gezaehlt - a.menge
      return { artikel: a, gezaehlt: e.gezaehlt, diff, diffValue: diff * a.preis, vonUser: e.von_user }
    }).filter(Boolean).sort((a, b) => Math.abs(b.diffValue) - Math.abs(a.diffValue))
  }, [session.erfassungen, articles])

  const onlyDiffs = rows.filter(r => r.diff !== 0)
  const totalDiff = onlyDiffs.reduce((s, r) => s + r.diffValue, 0)
  const notCounted = articles.length - rows.length

  const applyChanges = async () => {
    // Routed through book_movement (not a direct artikel update) so
    // Inventur-Korrekturen leave the same audit trail as every other
    // stock change — required for the Lagerbewegungen export/revizija
    // to actually be complete.
    const notiz = `Inventur-Korrektur: ${session.dokument_nr || session.name}`
    for (const r of onlyDiffs) {
      await supabase.rpc('book_movement', {
        p_artikel_id: r.artikel.id, p_typ: r.diff > 0 ? 'eingang' : 'ausgang', p_menge: Math.abs(r.diff),
        p_projekt: null, p_notiz: notiz,
        p_von_user: profile?.display_name ?? '', p_von_user_id: profile?.id ?? null,
      })
    }
    const [{ data }, { data: mov }] = await Promise.all([
      supabase.from('artikel').select('*').order('nummer'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
    ])
    if (data) setArticles(data)
    if (mov) setMoves?.(mov)
    setApplied(true); setConfirmApply(false)
    setTimeout(() => setApplied(false), 3000)
  }

  return (
    <div className="space-y-3">
      {/* Stats — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: t('inv_report_captured'),        value: rows.length,       color: '' },
          { label: t('inv_report_not_captured'),  value: notCounted,        color: notCounted > 0 ? 'text-amber' : '' },
          { label: t('inv_report_discrepancies'),   value: onlyDiffs.length,  color: onlyDiffs.length > 0 ? 'text-red' : 'text-green' },
          { label: t('inv_report_value_diff'),       value: (totalDiff >= 0 ? '+' : '') + fmt(totalDiff),
            color: totalDiff < 0 ? 'text-red' : totalDiff > 0 ? 'text-green' : '' },
        ].map(s => (
          <Card key={s.label} className="p-3 sm:p-4">
            <div className="text-xs text-muted mb-1">{s.label}</div>
            <div className={`text-base sm:text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {onlyDiffs.length > 0 && (
        <Card className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-secondary flex-1">
            {applied
              ? <span className="text-green flex items-center gap-2"><Icon name="check" size={15} color="#4caf6e" /> {t('inv_stock_applied')}</span>
              : t('inv_apply_prompt')
            }
          </p>
          {!applied && (
            confirmApply ? (
              <div className="flex gap-2">
                <button onClick={applyChanges}
                        className="px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  {t('inv_confirm_apply')}
                </button>
                <button onClick={() => setConfirmApply(false)}
                        className="px-3 py-2 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
                  {t('common_cancel')}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmApply(true)}
                      className="px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                {t('inv_apply_stock')}
              </button>
            )
          )}
        </Card>
      )}

      {/* Mobile list */}
      <div className="sm:hidden space-y-1.5">
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-muted text-sm">{t('inv_none_counted')}</Card>
        ) : rows.map(r => (
          <div key={r.artikel.id} className="bg-bg-1 border border-border rounded-xl px-3 py-2.5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-medium text-sm truncate flex-1">{r.artikel.name}</span>
              <span className={`font-mono text-sm font-semibold shrink-0 ${r.diff === 0 ? 'text-muted' : r.diff > 0 ? 'text-green' : 'text-red'}`}>
                {r.diff === 0 ? '✓' : (r.diff > 0 ? '+' : '') + r.diff}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="font-mono text-amber">{r.artikel.nummer}</span>
              <span>{t('inv_system_label')}: {r.artikel.menge}</span>
              <span>{t('inv_col_counted')}: {r.gezaehlt}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">{t('inv_none_counted')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-2">
                  {[t('bew_col_article'), t('inv_col_system'), t('inv_col_counted'), t('inv_difference'), t('inv_col_value'), t('inv_col_captured_by')].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.artikel.id} className="border-b border-border hover:bg-bg-2/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.artikel.name}</div>
                      <div className="font-mono text-xs text-muted">{r.artikel.nummer}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-secondary">{r.artikel.menge} {r.artikel.einheit}</td>
                    <td className="px-4 py-3 font-mono font-semibold">{r.gezaehlt} {r.artikel.einheit}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${r.diff === 0 ? 'text-muted' : r.diff > 0 ? 'text-green' : 'text-red'}`}>
                      {r.diff === 0 ? '—' : (r.diff > 0 ? '+' : '') + r.diff}
                    </td>
                    <td className={`px-4 py-3 font-mono ${r.diffValue === 0 ? 'text-muted' : r.diffValue > 0 ? 'text-green' : 'text-red'}`}>
                      {r.diffValue === 0 ? '—' : (r.diffValue > 0 ? '+' : '') + fmt(r.diffValue)}
                    </td>
                    <td className="px-4 py-3 text-secondary">{r.vonUser || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══ SESSION VIEW ══ */
function SessionView({ session, articles, setArticles, setMoves, isManager, onBack, onRefresh }) {
  const { t } = useLanguage()
  const [tab, setTab] = useState('zaehlen')
  const erfasst = session.erfassungen?.length ?? 0
  const pct     = articles.length > 0 ? Math.round((erfasst / articles.length) * 100) : 0

  const toggleStatus = async () => {
    const newStatus = session.status === 'aktiv' ? 'abgeschlossen' : 'aktiv'
    await supabase.from('inventur_sessions').update({ status: newStatus }).eq('id', session.id)
    onRefresh()
  }

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh]">
        <div className="px-3 pt-3 pb-2 border-b border-border bg-bg-0">
          <button onClick={onBack} className="flex items-center gap-1 text-secondary text-xs mb-2">
            <Icon name="chevronLeft" size={14} color="currentColor" /> {t('common_back')}
          </button>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-semibold truncate">{session.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-md font-medium shrink-0 ${
                session.status === 'aktiv' ? 'bg-amber-dim text-amber' : 'bg-green-dim text-green'
              }`}>{session.status === 'aktiv' ? t('status_aktiv') : t('inv_status_done_short')}</span>
            </div>
            {isManager && (
              <button onClick={toggleStatus}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-bg-2 border border-border text-secondary shrink-0 ml-2">
                {session.status === 'aktiv' ? t('inv_finish') : t('inv_reopen')}
              </button>
            )}
          </div>
          {session.dokument_nr && <div className="text-xs text-muted font-mono mb-1.5">{session.dokument_nr}</div>}
          <div className="text-xs text-muted mb-1.5">{sessionDateRange(session)}</div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-secondary">{erfasst} / {articles.length} {t('inv_captured')}</span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${pct}%`, background: session.status === 'aktiv' ? '#e8821c' : '#4caf6e' }} />
          </div>
          <div className="flex gap-1 mt-2">
            {[['zaehlen', t('inv_tab_count'), 'scan'], ...(isManager ? [['bericht', t('inv_tab_report'), 'chart']] : [])].map(([id, label, icon]) => (
              <button key={id} onClick={() => setTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                        tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent'
                      }`}>
                <Icon name={icon} size={13} color={tab === id ? '#e8821c' : '#6b7480'} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'zaehlen'
            ? <ZaehlenTab session={session} articles={articles} onUpdate={onRefresh} />
            : <BerichtTab session={session} articles={articles} setArticles={setArticles} setMoves={setMoves} />
          }
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <button onClick={onBack}
                className="flex items-center gap-1.5 text-secondary text-sm mb-4 hover:text-primary transition-colors">
          <Icon name="chevronLeft" size={16} color="currentColor" /> {t('inv_all_counts')}
        </button>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-3">
              {session.name}
              <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                session.status === 'aktiv' ? 'bg-amber-dim text-amber' : 'bg-green-dim text-green'
              }`}>{session.status === 'aktiv' ? t('status_aktiv') : t('inv_status_done_full')}</span>
            </h1>
            {session.dokument_nr && <p className="text-xs text-muted font-mono mt-1">{session.dokument_nr}</p>}
            <p className="text-xs text-muted mt-1">{sessionDateRange(session)}</p>
            <p className="text-secondary text-sm mt-1">{erfasst} {t('ueb_of')} {articles.length} {t('ueb_articles_word')} {t('inv_captured')} ({pct}%)</p>
          </div>
          {isManager && (
            <button onClick={toggleStatus}
                    className="px-4 py-2 rounded-xl text-sm bg-bg-2 border border-border text-secondary hover:bg-bg-3 transition-colors">
              {session.status === 'aktiv' ? t('inv_finish') : t('inv_reopen_full')}
            </button>
          )}
        </div>
        <div className="h-2 bg-bg-2 rounded-full overflow-hidden mb-5">
          <div className="h-full rounded-full transition-all duration-500"
               style={{ width: `${pct}%`, background: session.status === 'aktiv' ? '#e8821c' : '#4caf6e' }} />
        </div>
        <div className="flex gap-1 border-b border-border mb-6">
          {[['zaehlen', t('inv_tab_count'), 'scan'], ...(isManager ? [['bericht', t('inv_tab_report'), 'chart']] : [])].map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent hover:text-primary'
                    }`}>
              <Icon name={icon} size={15} color={tab === id ? '#e8821c' : '#6b7480'} />
              {label}
            </button>
          ))}
        </div>
        {tab === 'zaehlen'
          ? <ZaehlenTab session={session} articles={articles} onUpdate={onRefresh} />
          : <BerichtTab session={session} articles={articles} setArticles={setArticles} />
        }
      </div>
    </>
  )
}

/* ══ MAIN ══ */
export default function InventurPage({ articles, setArticles, setMoves }) {
  const { isManager } = useAuth()
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading]   = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventur_sessions')
      .select('*, erfassungen:inventur_erfassungen(*)')
      .order('created_at', { ascending: false })
    if (data) setSessions(data.map(s => ({ ...s, erfasst_count: s.erfassungen?.length ?? 0 })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const activeSession = sessions.find(s => s.id === activeId)

  if (activeSession) return (
    <SessionView session={activeSession} articles={articles} setArticles={setArticles} setMoves={setMoves}
                 isManager={isManager} onBack={() => setActiveId(null)} onRefresh={load} />
  )

  return (
    <SessionList sessions={sessions} articles={articles} isManager={isManager}
                 onOpen={setActiveId} onRefresh={load} />
  )
}
