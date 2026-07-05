import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQrScanner } from '../hooks/useQrScanner'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import DonutChart from '../components/DonutChart'
import QrScannerCard from '../components/QrScannerCard'

const fmt   = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDt = (d) => new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(d))
const fmtDtTime = (d) => new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(d))

const INV_STATUS = {
  geplant:       { color: '#9aa3ad', labelKey: 'status_geplant' },
  aktiv:         { color: '#4a90d9', labelKey: 'status_aktiv' },
  abgeschlossen: { color: '#4caf6e', labelKey: 'inv_status_done_full' },
  abgebrochen:   { color: '#e0524a', labelKey: 'inv_status_abgebrochen' },
}
const invStatusMeta = (s) => INV_STATUS[s] ?? INV_STATUS.aktiv

function StatusBadge({ status }) {
  const { t } = useLanguage()
  const m = invStatusMeta(status)
  return (
    <span className="text-xs px-2 py-1 rounded-md font-medium whitespace-nowrap"
          style={{ background: m.color + '22', color: m.color }}>
      {t(m.labelKey)}
    </span>
  )
}

// A closed session's updated_at is only ever bumped by status changes,
// so once abgeschlossen it doubles as "closed at" — combined with
// created_at that's enough for a "ran from X to Y" range without a
// dedicated column, and collapses to one date when it closed same-day.
const sessionDateRange = (s) => {
  if (s.status !== 'abgeschlossen' && s.status !== 'abgebrochen') return fmtDt(s.created_at)
  const start = fmtDt(s.created_at)
  const end = fmtDt(s.updated_at)
  return start === end ? start : `${start} – ${end}`
}

// The correction bookings stamped by BerichtTab reference the session
// via this exact notiz — that's what lets a completed session's real
// applied difference/accuracy be reconstructed from the audit trail.
const korrRef = (s) => `Inventur-Korrektur: ${s.dokument_nr || s.name}`

/* ══ SESSION STATS — one place that answers "how did this count go".
   Active sessions compare live against current stock (same as the
   report tab); completed ones read the correction bookings instead,
   since applying the count changes stock to match and a live diff
   would misleadingly show zero. ══ */
function sessionStats(s, artikelMap, korrByRef) {
  const counted = s.erfassungen?.length ?? 0
  if (s.status === 'abgeschlossen') {
    const korr = korrByRef[korrRef(s)] ?? []
    const corrected = new Set(korr.map(k => k.artikel_id)).size
    const diffValue = korr.reduce((sum, k) => {
      const preis = artikelMap.get(k.artikel_id)?.preis ?? 0
      return sum + (k.typ === 'eingang' ? 1 : -1) * Number(k.menge) * preis
    }, 0)
    const genauigkeit = counted > 0 ? Math.round((1 - corrected / counted) * 1000) / 10 : null
    const top = [...korr]
      .map(k => ({ name: k.artikel_name, diff: (k.typ === 'eingang' ? 1 : -1) * Number(k.menge), einheit: artikelMap.get(k.artikel_id)?.einheit ?? '', wert: Math.abs(Number(k.menge) * (artikelMap.get(k.artikel_id)?.preis ?? 0)) }))
      .sort((a, b) => b.wert - a.wert).slice(0, 5)
    return { counted, diffs: corrected, diffValue, genauigkeit, top }
  }
  let diffs = 0, diffValue = 0, matches = 0
  const live = []
  ;(s.erfassungen ?? []).forEach(e => {
    const a = artikelMap.get(e.artikel_id)
    if (!a) return
    const d = e.gezaehlt - a.menge
    if (d !== 0) { diffs++; diffValue += d * a.preis; live.push({ name: a.name, diff: d, einheit: a.einheit, wert: Math.abs(d * a.preis) }) }
    else matches++
  })
  const genauigkeit = counted > 0 ? Math.round((matches / counted) * 1000) / 10 : null
  return { counted, diffs, diffValue, genauigkeit, top: live.sort((a, b) => b.wert - a.wert).slice(0, 5) }
}

/* ══ CREATE FORM — shared by the mobile card and the desktop modal ══ */
function CreateSessionForm({ onCreated, onCancel }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [lager, setLager] = useState('')
  const [sofort, setSofort] = useState(true)
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('inventur_sessions').insert({
      name: name.trim(), lager: lager.trim(),
      status: sofort ? 'aktiv' : 'geplant',
      erstellt_von: profile?.display_name ?? '',
    })
    setSaving(false)
    onCreated()
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-secondary mb-1.5">{t('inv_name_label')}</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && create()}
               placeholder={t('inv_name_ph_long')}
               className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
      </div>
      <div>
        <label className="block text-xs text-secondary mb-1.5">{t('inv_field_lager')} <span className="text-muted">({t('kal_optional')})</span></label>
        <input value={lager} onChange={e => setLager(e.target.value)}
               placeholder={t('inv_field_lager_ph')}
               className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
      </div>
      <button onClick={() => setSofort(v => !v)} className="flex items-center gap-2 text-sm">
        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${sofort ? 'bg-amber border-amber' : 'border-border bg-bg-2'}`}>
          {sofort && <Icon name="check" size={12} color="#181c20" />}
        </span>
        {t('inv_start_now')}
      </button>
      <div className="flex gap-2 pt-1">
        <button onClick={create} disabled={saving || !name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
          {saving ? t('common_creating') : t('inv_create')}
        </button>
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
          {t('common_cancel')}
        </button>
      </div>
    </div>
  )
}

/* ══ SPARKLINE — tiny 6-month trend, real monthly buckets ══ */
function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null
  const W = 96, H = 30, pad = 3
  const max = Math.max(...points), min = Math.min(...points)
  const range = max - min || 1
  const xFor = (i) => pad + (i / (points.length - 1)) * (W - pad * 2)
  const yFor = (v) => H - pad - ((v - min) / range) * (H - pad * 2)
  const pts = points.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"
                strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ══ STAT CARD — icon chip left, value below, sparkline bottom right ══ */
function StatMini({ label, value, sub, icon, color, valueColor, spark }) {
  return (
    <Card className="p-4 border-t-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" style={{ borderTopColor: color }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset"
             style={{ background: `linear-gradient(135deg, ${color}2e, ${color}0f)`, '--tw-ring-color': `${color}33` }}>
          <Icon name={icon} size={17} color={color} />
        </div>
        <span className="text-xs text-secondary leading-tight">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-2xl font-bold font-mono leading-none mb-1.5 ${valueColor ?? ''}`}>{value}</div>
          <div className="text-[11px] text-muted">{sub}</div>
        </div>
        <Sparkline points={spark} color={color} />
      </div>
    </Card>
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
          <Card key={s.label} className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="text-xs text-muted mb-1">{s.label}</div>
            <div className={`text-base sm:text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {onlyDiffs.length > 0 && (
        <Card className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
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
      <Card className="hidden sm:block overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
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
function SessionView({ session, articles, setArticles, setMoves, isManager, onBack, onRefresh, initialTab = 'zaehlen' }) {
  const { t } = useLanguage()
  const [tab, setTab] = useState(initialTab)
  const erfasst = session.erfassungen?.length ?? 0
  const pct     = articles.length > 0 ? Math.round((erfasst / articles.length) * 100) : 0

  // geplant → start; aktiv → finish; abgeschlossen/abgebrochen → reopen
  const nextStatus = session.status === 'aktiv' ? 'abgeschlossen' : 'aktiv'
  const nextLabel  = session.status === 'geplant' ? t('inv_start_count')
    : session.status === 'aktiv' ? t('inv_finish') : t('inv_reopen_full')

  const setStatus = async () => {
    await supabase.from('inventur_sessions').update({ status: nextStatus }).eq('id', session.id)
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
              <StatusBadge status={session.status} />
            </div>
            {isManager && (
              <button onClick={setStatus}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-bg-2 border border-border text-secondary shrink-0 ml-2">
                {nextLabel}
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
                 style={{ width: `${pct}%`, background: invStatusMeta(session.status).color }} />
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
              <StatusBadge status={session.status} />
            </h1>
            <p className="text-xs text-muted font-mono mt-1">
              {[session.dokument_nr, session.lager].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-muted mt-1">{sessionDateRange(session)}</p>
            <p className="text-secondary text-sm mt-1">{erfasst} {t('ueb_of')} {articles.length} {t('ueb_articles_word')} {t('inv_captured')} ({pct}%)</p>
          </div>
          {isManager && (
            <button onClick={setStatus}
                    className="px-4 py-2 rounded-xl text-sm bg-bg-2 border border-border text-secondary hover:bg-bg-3 transition-colors">
              {nextLabel}
            </button>
          )}
        </div>
        <div className="h-2 bg-bg-2 rounded-full overflow-hidden mb-5">
          <div className="h-full rounded-full transition-all duration-500"
               style={{ width: `${pct}%`, background: invStatusMeta(session.status).color }} />
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
          : <BerichtTab session={session} articles={articles} setArticles={setArticles} setMoves={setMoves} />
        }
      </div>
    </>
  )
}

/* ══ EXPANDED ROW — progress details, top deviations, team, actions ══ */
function ExpandedRow({ s, stats, articlesTotal, isManager, onOpen, onSetStatus, onDelete, t }) {
  const team = useMemo(() => {
    const seen = new Map()
    ;(s.erfassungen ?? []).forEach(e => { if (e.von_user && !seen.has(e.von_user)) seen.set(e.von_user, true) })
    const users = [...seen.keys()]
    if (users.length === 0 && s.erstellt_von) users.push(s.erstellt_von)
    return users.slice(0, 4)
  }, [s])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 px-4 py-4 bg-bg-2/40 border-l-2" style={{ borderLeftColor: invStatusMeta(s.status).color }}>
      {/* Fortschritt */}
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">{t('inv_col_progress')}</h4>
        <div className="space-y-1.5 text-sm">
          {[
            [t('inv_counted_positions'), stats.counted, '#4a90d9'],
            [t('inv_open_positions'), Math.max(articlesTotal - stats.counted, 0), '#e8821c'],
            [t('inv_diffs_found'), stats.diffs, stats.diffs > 0 ? '#e0524a' : '#4caf6e'],
          ].map(([label, val, color]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-secondary">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} /> {label}
              </span>
              <span className="font-mono text-sm">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 deviations */}
      <div className="lg:col-span-1">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">{t('inv_top_articles')}</h4>
        {stats.top.length === 0 ? (
          <p className="text-xs text-muted">{stats.counted === 0 ? t('inv_none_counted') : t('inv_no_diffs')}</p>
        ) : (
          <div className="space-y-1.5">
            {stats.top.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-secondary">{r.name}</span>
                <span className={`font-mono font-semibold shrink-0 ${r.diff > 0 ? 'text-green' : 'text-red'}`}>
                  {r.diff > 0 ? '+' : ''}{r.diff} {r.einheit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team */}
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">{t('inv_team')}</h4>
        {team.length === 0 ? <p className="text-xs text-muted">—</p> : (
          <div className="space-y-1.5">
            {team.map(u => (
              <div key={u} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-bg-3 flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {u.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs truncate">{u}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aktionen */}
      {isManager && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">{t('inv_col_actions')}</h4>
          <div className="space-y-1.5">
            {s.status === 'geplant' && (
              <button onClick={() => onSetStatus(s, 'aktiv')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                <Icon name="scan" size={13} color="#181c20" /> {t('inv_start_count')}
              </button>
            )}
            {s.status === 'aktiv' && (
              <button onClick={() => onOpen(s.id, 'zaehlen')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                <Icon name="scan" size={13} color="#181c20" /> {t('inv_continue_count')}
              </button>
            )}
            <button onClick={() => onOpen(s.id, 'bericht')}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary hover:bg-bg-3">
              <Icon name="chart" size={13} color="#9aa3ad" /> {t('inv_show_report')}
            </button>
            {(s.status === 'abgeschlossen' || s.status === 'abgebrochen') && (
              <button onClick={() => onSetStatus(s, 'aktiv')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary hover:bg-bg-3">
                <Icon name="refresh" size={13} color="#9aa3ad" /> {t('inv_reopen_full')}
              </button>
            )}
            {s.status === 'aktiv' && (
              confirmCancel ? (
                <div className="flex gap-1.5">
                  <button onClick={() => { onSetStatus(s, 'abgebrochen'); setConfirmCancel(false) }}
                          className="flex-1 px-2 py-2 rounded-lg text-xs bg-red text-white">{t('common_yes')}</button>
                  <button onClick={() => setConfirmCancel(false)}
                          className="flex-1 px-2 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary">{t('common_no')}</button>
                </div>
              ) : (
                <button onClick={() => setConfirmCancel(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-red/40 text-red hover:bg-red-dim">
                  <Icon name="x" size={13} color="#e0524a" /> {t('inv_cancel_count')}
                </button>
              )
            )}
            {confirmDelete ? (
              <div className="flex gap-1.5">
                <button onClick={() => onDelete(s.id)} className="flex-1 px-2 py-2 rounded-lg text-xs bg-red text-white">{t('lief_yes_delete')}</button>
                <button onClick={() => setConfirmDelete(false)} className="flex-1 px-2 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary">{t('common_no')}</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-red border border-transparent hover:border-red/30">
                <Icon name="trash" size={13} color="currentColor" /> {t('common_delete')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══ MAIN ══ */
export default function InventurPage({ articles, setArticles, setMoves }) {
  const { isManager } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [korrekturen, setKorrekturen] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activeTab, setActiveTab] = useState('zaehlen')
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)
  const [statusTab, setStatusTab] = useState('alle')
  const [lagerFilter, setLagerFilter] = useState('Alle')
  const [expandedId, setExpandedId] = useState(null)
  const [showAllAct, setShowAllAct] = useState(false)

  const load = async () => {
    const [{ data }, { data: korr }] = await Promise.all([
      supabase.from('inventur_sessions').select('*, erfassungen:inventur_erfassungen(*)').order('created_at', { ascending: false }),
      supabase.from('warenbewegungen').select('artikel_id, artikel_name, typ, menge, notiz, created_at').ilike('notiz', 'Inventur-Korrektur%'),
    ])
    if (data) setSessions(data.map(s => ({ ...s, erfasst_count: s.erfassungen?.length ?? 0 })))
    setKorrekturen(korr ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const artikelMap = useMemo(() => new Map(articles.map(a => [a.id, a])), [articles])
  const korrByRef = useMemo(() => {
    const map = {}
    korrekturen.forEach(k => { (map[k.notiz] ??= []).push(k) })
    return map
  }, [korrekturen])

  const statsById = useMemo(() => {
    const map = {}
    sessions.forEach(s => { map[s.id] = sessionStats(s, artikelMap, korrByRef) })
    return map
  }, [sessions, artikelMap, korrByRef])

  // Headline stats
  const aktive = sessions.filter(s => s.status === 'aktiv')
  const yearAgo = Date.now() - 365 * 86400000
  const done12m = sessions.filter(s => s.status === 'abgeschlossen' && new Date(s.updated_at).getTime() >= yearAgo)
  const doneWithCounts = sessions.filter(s => s.status === 'abgeschlossen' && (statsById[s.id]?.counted ?? 0) > 0)
  const avgGenauigkeit = doneWithCounts.length > 0
    ? doneWithCounts.reduce((sum, s) => sum + (statsById[s.id].genauigkeit ?? 0), 0) / doneWithCounts.length
    : null
  const lastDone = sessions.find(s => s.status === 'abgeschlossen')
  const lastDiffValue = lastDone ? statsById[lastDone.id]?.diffValue ?? 0 : null

  // Sparklines — real monthly buckets over the last 6 months, derived
  // from the sessions themselves (no synthetic data): how many were
  // running / completed per month, the month's average accuracy, and
  // the month's total absolute difference value.
  const sparkSeries = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      months.push([
        new Date(now.getFullYear(), now.getMonth() - i, 1).getTime(),
        new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime(),
      ])
    }
    const inMonth = (d, [s, e]) => { const t2 = new Date(d).getTime(); return t2 >= s && t2 < e }
    const closedAt = (s) => (s.status === 'abgeschlossen' || s.status === 'abgebrochen') ? new Date(s.updated_at).getTime() : Infinity

    const active = months.map(m => sessions.filter(s => new Date(s.created_at).getTime() < m[1] && closedAt(s) >= m[0]).length)
    const done = months.map(m => sessions.filter(s => s.status === 'abgeschlossen' && inMonth(s.updated_at, m)).length)
    const accRaw = months.map(m => {
      const list = sessions.filter(s => s.status === 'abgeschlossen' && inMonth(s.updated_at, m) && (statsById[s.id]?.counted ?? 0) > 0)
      if (list.length === 0) return null
      return list.reduce((sum, s) => sum + (statsById[s.id].genauigkeit ?? 0), 0) / list.length
    })
    // Months without a completed count carry the last known accuracy
    // forward so the line stays continuous instead of dropping to 0.
    let carry = accRaw.find(v => v !== null) ?? 100
    const acc = accRaw.map(v => { if (v !== null) carry = v; return carry })
    const diff = months.map(m => sessions
      .filter(s => s.status === 'abgeschlossen' && inMonth(s.updated_at, m))
      .reduce((sum, s) => sum + Math.abs(statsById[s.id]?.diffValue ?? 0), 0))
    return { active, done, acc, diff }
  }, [sessions, statsById])

  // Filters
  const lagerOptions = useMemo(() => ['Alle', ...new Set(sessions.map(s => s.lager).filter(Boolean))], [sessions])
  const filtered = sessions.filter(s =>
    (statusTab === 'alle' || s.status === statusTab) &&
    (lagerFilter === 'Alle' || s.lager === lagerFilter)
  )

  // Right panel: status distribution + recent activity
  const statusCounts = useMemo(() => {
    const counts = {}
    sessions.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1 })
    return counts
  }, [sessions])
  const donutData = Object.entries(INV_STATUS)
    .filter(([k]) => (statusCounts[k] ?? 0) > 0)
    .map(([k, m]) => ({ label: k, value: statusCounts[k], color: m.color }))

  // Grouped like the mockup: one "N Positionen gezählt" entry per
  // session (not one per article), plus a "Differenz gefunden" entry
  // per deviating position — live diffs for running counts, the booked
  // corrections for completed ones.
  const activities = useMemo(() => {
    const out = []
    sessions.forEach(s => {
      out.push({ at: s.created_at, icon: 'scan', color: '#e8821c', text: t('inv_activity_started'), sub: s.name })
      if (s.status === 'abgeschlossen') out.push({ at: s.updated_at, icon: 'check', color: '#4caf6e', text: t('inv_activity_completed'), sub: s.name })
      const erf = s.erfassungen ?? []
      if (erf.length > 0) {
        const latest = erf.reduce((m, e) => (e.created_at && (!m || e.created_at > m)) ? e.created_at : m, null)
        if (latest) out.push({ at: latest, icon: 'refresh', color: '#4caf6e', text: `${erf.length} ${t('inv_activity_positions')}`, sub: s.name })
      }
      if (s.status === 'abgeschlossen') {
        (korrByRef[korrRef(s)] ?? []).forEach(k => {
          out.push({ at: k.created_at, icon: 'alert', color: '#e0524a', text: t('inv_activity_diff'), sub: k.artikel_name })
        })
      } else {
        erf.forEach(e => {
          const a = artikelMap.get(e.artikel_id)
          if (a && e.created_at && Number(e.gezaehlt) !== Number(a.menge)) {
            out.push({ at: e.created_at, icon: 'alert', color: '#e0524a', text: t('inv_activity_diff'), sub: a.name })
          }
        })
      }
    })
    return out.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [sessions, artikelMap, korrByRef, t])

  const setStatus = async (s, status) => {
    await supabase.from('inventur_sessions').update({ status }).eq('id', s.id)
    load()
  }
  const del = async (id) => {
    await supabase.from('inventur_sessions').delete().eq('id', id)
    setExpandedId(null)
    load()
  }
  const openSession = (id, tab = 'zaehlen') => { setActiveTab(tab); setActiveId(id) }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const activeSession = sessions.find(s => s.id === activeId)
  if (activeSession) return (
    <SessionView key={`${activeSession.id}-${activeTab}`} session={activeSession} articles={articles} setArticles={setArticles} setMoves={setMoves}
                 isManager={isManager} onBack={() => setActiveId(null)} onRefresh={load} initialTab={activeTab} />
  )

  const tabs = [
    ['alle', t('inv_tab_alle')], ['aktiv', t('status_aktiv')], ['geplant', t('status_geplant')],
    ['abgeschlossen', t('inv_status_done_full')], ['abgebrochen', t('inv_status_abgebrochen')],
  ]

  return (
    <>
      {/* ══ MOBILE — simple list, counting stays the focus ══ */}
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
              <CreateSessionForm onCreated={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />
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
                       onClick={() => openSession(s.id)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted font-mono mt-0.5">{s.dokument_nr ? `${s.dokument_nr} · ` : ''}{sessionDateRange(s)}</div>
                      </div>
                      <span className="ml-2 shrink-0"><StatusBadge status={s.status} /></span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-secondary">{s.erfasst_count ?? 0} / {articles.length}</span>
                      <span className="font-mono">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                           style={{ width: `${pct}%`, background: invStatusMeta(s.status).color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ DESKTOP — dashboard ══ */}
      <div className="hidden sm:flex flex-col gap-4 p-6 lg:px-8 lg:py-5 lg:min-h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('inv_title')}</h1>
            <p className="text-secondary text-sm">{t('inv_subtitle')}</p>
          </div>
          {isManager && (
            <button onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              <Icon name="plus" size={15} color="#181c20" /> {t('inv_new_project')}
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatMini label={t('inv_stat_active')} value={aktive.length} sub={t('inv_stat_active_sub')} icon="box" color="#4a90d9" spark={sparkSeries.active} />
          <StatMini label={t('inv_stat_done')} value={done12m.length} sub={t('inv_stat_done_sub')} icon="check" color="#4caf6e" spark={sparkSeries.done} />
          <StatMini label={t('inv_stat_accuracy')} value={avgGenauigkeit === null ? '—' : `${avgGenauigkeit.toFixed(1).replace('.', ',')}%`} sub={t('inv_stat_accuracy_sub')} icon="chart" color="#9b6bd9" spark={sparkSeries.acc} />
          <StatMini label={t('inv_stat_diff')} value={lastDiffValue === null ? '—' : fmt(lastDiffValue)} sub={t('inv_stat_diff_sub')} icon="refresh" color="#e8821c"
                    valueColor={lastDiffValue === null ? '' : lastDiffValue < 0 ? 'text-red' : lastDiffValue > 0 ? 'text-green' : ''}
                    spark={sparkSeries.diff} />
        </div>

        {/* Main + right panel */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start lg:flex-1">
          <Card className="xl:col-span-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden xl:h-full flex flex-col">
            {/* Tabs + lager filter */}
            <div className="flex items-center justify-between gap-2 flex-wrap px-4 pt-3 border-b border-border">
              <div className="flex gap-1 overflow-x-auto">
                {tabs.map(([id, label]) => (
                  <button key={id} onClick={() => setStatusTab(id)}
                          className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                            statusTab === id ? 'text-amber border-amber' : 'text-secondary border-transparent hover:text-primary'
                          }`}>
                    {label}
                  </button>
                ))}
              </div>
              {lagerOptions.length > 1 && (
                <select value={lagerFilter} onChange={e => setLagerFilter(e.target.value)}
                        className="bg-bg-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-secondary outline-none focus:border-amber mb-2">
                  <option value="Alle">{t('inv_all_lager')}</option>
                  {lagerOptions.filter(l => l !== 'Alle').map(l => <option key={l}>{l}</option>)}
                </select>
              )}
            </div>

            <div className="px-4 py-3">
              <h2 className="font-semibold text-sm">{t('inv_projects_title')}</h2>
            </div>

            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Icon name="filter" size={28} color="#6b7480" />
                <p className="text-secondary text-sm mt-3">{t('inv_none_yet')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg-2">
                      {[t('inv_col_project'), t('inv_col_lager'), t('inv_col_zeitraum'), t('inv_col_progress'), t('ueb_col_status'), t('inv_col_accuracy'), t('inv_col_diff'), ''].map((h, i) => (
                        <th key={i} className="text-left px-4 py-2.5 text-[11px] text-muted font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => {
                      const st = statsById[s.id]
                      const pct = articles.length > 0 ? Math.round((st.counted / articles.length) * 100) : 0
                      const expanded = expandedId === s.id
                      return [
                        <tr key={s.id} onClick={() => setExpandedId(expanded ? null : s.id)}
                            className={`border-b border-border cursor-pointer transition-colors ${expanded ? 'bg-bg-2/60' : 'hover:bg-bg-2/40'}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-[11px] text-muted font-mono">{s.dokument_nr || `#${s.id}`}</div>
                          </td>
                          <td className="px-4 py-3 text-secondary text-xs whitespace-nowrap">{s.lager || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs">{sessionDateRange(s)}</div>
                            <div className="text-[11px] text-muted">
                              {s.status === 'abgeschlossen' ? `${t('inv_completed_at')}: ${fmtDtTime(s.updated_at)}` : `${t('inv_started_at')}: ${fmtDtTime(s.created_at)}`}
                            </div>
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            <div className="text-xs mb-1">{st.counted} {t('ueb_of')} {articles.length} <span className="text-muted">· {pct}%</span></div>
                            <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden w-24">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: invStatusMeta(s.status).color }} />
                            </div>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            {st.genauigkeit === null
                              ? <span className="text-muted" title={t('inv_not_calculated')}>—</span>
                              : `${st.genauigkeit.toFixed(1).replace('.', ',')}%`}
                          </td>
                          <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap ${st.diffValue === 0 || st.counted === 0 ? 'text-muted' : st.diffValue > 0 ? 'text-green' : 'text-red'}`}>
                            {st.counted === 0 ? '—' : (st.diffValue > 0 ? '+' : '') + fmt(st.diffValue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Icon name="chevronRight" size={14} color="#6b7480" className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </td>
                        </tr>,
                        expanded && (
                          <tr key={`${s.id}-x`} className="border-b border-border">
                            <td colSpan={8} className="p-0">
                              <ExpandedRow s={s} stats={st} articlesTotal={articles.length} isManager={isManager}
                                           onOpen={openSession} onSetStatus={setStatus} onDelete={del} t={t} />
                            </td>
                          </tr>
                        ),
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Right panel */}
          <div className="xl:col-span-1 space-y-4 xl:h-full flex flex-col">
            <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h3 className="font-semibold text-sm mb-4">{t('inv_statistik')}</h3>
              {donutData.length === 0 ? (
                <p className="text-xs text-muted">{t('inv_none_yet')}</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <DonutChart data={donutData} size={120} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold font-mono leading-none">{sessions.length}</span>
                      <span className="text-[10px] text-muted">{t('inv_gesamt')}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {donutData.map(d => (
                      <div key={d.label} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-secondary flex-1 truncate">{t(INV_STATUS[d.label].labelKey)}</span>
                        <span className="font-mono shrink-0">{d.value} ({Math.round((d.value / sessions.length) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h3 className="font-semibold text-sm mb-3">{t('inv_quick_actions')}</h3>
              <div className="space-y-1.5">
                {isManager && (
                  <button onClick={() => setShowNew(true)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border bg-bg-2 hover:border-amber transition-colors text-left">
                    <Icon name="plus" size={15} color="#e8821c" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{t('inv_new_project')}</div>
                      <div className="text-[11px] text-muted">{t('inv_new_project_sub')}</div>
                    </div>
                  </button>
                )}
                <button onClick={() => navigate('/administration')}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border bg-bg-2 hover:border-amber transition-colors text-left">
                  <Icon name="download" size={15} color="#9aa3ad" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{t('inv_report_action')}</div>
                    <div className="text-[11px] text-muted">{t('inv_report_action_sub')}</div>
                  </div>
                </button>
                <div className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border bg-bg-2 opacity-50 cursor-not-allowed">
                  <Icon name="clipboard" size={15} color="#6b7480" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{t('inv_templates')}</div>
                    <div className="text-[11px] text-muted">{t('adm_coming_soon')}</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex-1">
              <h3 className="font-semibold text-sm mb-3">{t('inv_activities')}</h3>
              {activities.length === 0 ? (
                <p className="text-xs text-muted">{t('inv_none_yet')}</p>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {activities.slice(0, showAllAct ? 30 : 5).map((a, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                             style={{ background: `linear-gradient(135deg, ${a.color}2e, ${a.color}0f)` }}>
                          <Icon name={a.icon} size={11} color={a.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{a.text}</div>
                          <div className="text-[11px] text-muted truncate">{a.sub}</div>
                        </div>
                        <span className="text-[10px] text-muted font-mono shrink-0">{new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(a.at))}</span>
                      </div>
                    ))}
                  </div>
                  {activities.length > 5 && (
                    <button onClick={() => setShowAllAct(v => !v)}
                            className="w-full flex items-center justify-center gap-1.5 mt-3.5 px-3 py-2 rounded-lg text-xs font-medium bg-bg-2 border border-border text-secondary hover:bg-bg-3 transition-colors">
                      {showAllAct ? t('inv_show_less') : t('inv_show_all_activities')}
                      <Icon name="chevronRight" size={13} color="#9aa3ad" className={showAllAct ? 'rotate-90' : ''} />
                    </button>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>

        {/* Create modal (desktop) */}
        {showNew && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
            <div className="bg-bg-1 border border-border w-full max-w-md rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">{t('inv_new_project')}</h2>
                <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg hover:bg-bg-2"><Icon name="x" size={16} color="#9aa3ad" /></button>
              </div>
              <CreateSessionForm onCreated={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
