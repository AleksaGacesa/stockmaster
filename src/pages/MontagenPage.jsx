import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StatusDot from '../components/StatusDot'
import LiveDuration from '../components/LiveDuration'
import CountUp from '../components/CountUp'
import DonutChart from '../components/DonutChart'
import { fmt, fmtDt } from '../lib/auftraegeHelpers'
import {
  montageFahrzeitMin as fahrzeitMin, montageArbeitMin as arbeitMin,
  fmtMin, fmtH, distanzMeter, fmtDistanz,
} from '../lib/montagenHelpers'

/* ── status & cost helpers ── */
const MON_META = {
  unterwegs: { color: '#e8821c', icon: 'truck',    labelKey: 'mon_unterwegs' },
  arbeitet:  { color: '#4a90d9', icon: 'settings', labelKey: 'mon_arbeitet' },
  beendet:   { color: '#4caf6e', icon: 'check',    labelKey: 'mon_beendet' },
}
const monStatus = (m) => !m.ankunft_at ? 'unterwegs' : !m.ende_at ? 'arbeitet' : 'beendet'

// Grouped per-project row status for the main table + donut.
const GRP_META = {
  einsatz:       { labelKey: 'mon_status_einsatz',   color: '#4a90d9', pulse: true },
  abgeschlossen: { labelKey: 'status_abgeschlossen', color: '#4caf6e' },
  pausiert:      { labelKey: 'status_pausiert',      color: '#e8821c' },
  geplant:       { labelKey: 'status_geplant',       color: '#9aa3ad' },
}

const fmtUhr = (d) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(d))

// Completed entries use the rates frozen at Feierabend; running ones
// preview with the worker's current rate + the firm's current €/km.
const monKosten = (m, profMap, kmSatzLive) => {
  const rate = m.ende_at ? Number(m.stundensatz ?? 0) : Number(profMap.get(m.arbeiter_id)?.stundensatz ?? 0)
  const kmr  = m.ende_at ? Number(m.km_satz ?? 0) : Number(kmSatzLive ?? 0)
  const fz = fahrzeitMin(m) ?? 0
  return ((fz + arbeitMin(m)) / 60) * rate + Number(m.km ?? 0) * kmr
}
const monArbeitskosten = (m, profMap) => {
  const rate = m.ende_at ? Number(m.stundensatz ?? 0) : Number(profMap.get(m.arbeiter_id)?.stundensatz ?? 0)
  return (((fahrzeitMin(m) ?? 0) + arbeitMin(m)) / 60) * rate
}
const monFahrtkosten = (m, kmSatzLive) =>
  Number(m.km ?? 0) * (m.ende_at ? Number(m.km_satz ?? 0) : Number(kmSatzLive ?? 0))

/* ── small building blocks ── */
const AV_COLORS = ['#e8821c', '#4a90d9', '#4caf6e', '#9b6bd9', '#d96b8f', '#3fb6c4']
const avColor = (name = '') => AV_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_COLORS.length]
const initialen = (name = '') => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

function Avatars({ names, max = 2 }) {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <span key={n + i} title={n}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-bg-1 ${i > 0 ? '-ml-1.5' : ''}`}
              style={{ background: avColor(n) }}>
          {initialen(n)}
        </span>
      ))}
      {rest > 0 && (
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-bg-3 text-secondary ring-2 ring-bg-1 -ml-1.5">
          +{rest}
        </span>
      )}
    </div>
  )
}

function MonSparkline({ points, color }) {
  const W = 96, H = 30
  if (!points || points.length < 2) return <svg width={W} height={H} />
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const pts = points.map((v, i) =>
    `${(i / (points.length - 1)) * W},${H - 3 - ((v - min) / span) * (H - 6)}`
  ).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({ label, value, sub, subColor, icon, color, spark, format }) {
  return (
    <Card className="p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1f' }}>
          <Icon name={icon} size={15} color={color} />
        </div>
        <span className="text-xs text-secondary leading-tight">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold font-mono truncate">
            {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
          </div>
          <div className="text-[11px] mt-0.5 truncate" style={{ color: subColor ?? 'rgb(var(--text-muted))' }}>
            {sub ?? ' '}
          </div>
        </div>
        {spark && <MonSparkline points={spark} color={color} />}
      </div>
    </Card>
  )
}

function FortschrittBar({ pct, color = '#4a90d9' }) {
  return (
    <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden w-full">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function GrpStatusBadge({ status }) {
  const { t } = useLanguage()
  const m = GRP_META[status]
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <StatusDot color={m.color} pulse={!!m.pulse} size={6} />
      {t(m.labelKey)}
    </span>
  )
}

function MonStatusBadge({ status }) {
  const { t } = useLanguage()
  const m = MON_META[status]
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <StatusDot color={m.color} pulse={status !== 'beendet'} size={6} />
      {t(m.labelKey)}
    </span>
  )
}

/* ══ START FORM — project select + Abfahrt (inline in the filter bar
   for managers, standalone card for workers) ══ */
function MontageStart({ projekte, onStarted, inline = false }) {
  const { t } = useLanguage()
  const { user, profile } = useAuth()
  const [projektId, setProjektId] = useState('')
  const [busy, setBusy] = useState(false)

  const starten = async () => {
    if (!projektId) return
    setBusy(true)
    await supabase.from('montagen').insert({
      projekt_id: Number(projektId),
      arbeiter_id: user.id,
      arbeiter_name: profile?.display_name ?? '',
    })
    setBusy(false); setProjektId('')
    onStarted()
  }

  const controls = (
    <div className={`flex gap-2 ${inline ? 'flex-1 min-w-[220px]' : 'flex-col sm:flex-row'}`}>
      <select value={projektId} onChange={e => setProjektId(e.target.value)}
              className="flex-1 bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber min-w-0">
        <option value="">{t('mon_select_projekt')}</option>
        {projekte.map(p => (
          <option key={p.id} value={p.id}>{p.name}{p.kunde ? ` — ${p.kunde}` : ''}</option>
        ))}
      </select>
      <button onClick={starten} disabled={!projektId || busy}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 shrink-0"
              style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
        <Icon name="truck" size={14} color="#181c20" /> {t('mon_abfahrt')}
      </button>
    </div>
  )

  if (inline) return controls
  return (
    <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
        <Icon name="mapPin" size={16} color="#e8821c" /> {t('mon_start_title')}
      </h3>
      {controls}
    </Card>
  )
}

/* ══ LIVE PUNCH CARD — the running entry's Ankunft/Feierabend flow ══ */
function MontageLive({ offen, montagen, onChanged }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [pause, setPause] = useState('0')
  const [km, setKm] = useState('')
  const [fortschritt, setFortschritt] = useState(0)
  const [notiz, setNotiz] = useState('')
  // Feierabend only ends the DAY — multi-day montages continue
  // tomorrow. This explicit toggle is what marks the whole montage
  // finished (progress jumps to 100%).
  const [fertig, setFertig] = useState(false)

  const status = monStatus(offen)
  const meta = MON_META[status]

  // Prefill the slider with the last progress anyone reported for
  // this project, so the worker adjusts instead of guessing from 0.
  const startFinish = () => {
    const letzte = montagen.find(m =>
      m.projekt_id === offen.projekt_id && m.ende_at && m.fortschritt !== null)
    setFortschritt(letzte?.fortschritt ?? 0)
    setPause('0'); setKm(''); setNotiz(''); setFertig(false)
    setFinishing(true)
  }

  // Check-in: when the boss pinned the site on the map, the worker's
  // GPS position and distance to the pin are stored as proof. Outside
  // the radius (or GPS off) the check-in still goes through — the boss
  // just sees it flagged; a hard block would strand workers with a
  // weak signal on site.
  const angekommen = async () => {
    setBusy(true)
    const patch = { ankunft_at: new Date().toISOString() }
    const st = offen.projekt
    if (st?.standort_lat != null && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }))
        patch.ankunft_lat = pos.coords.latitude
        patch.ankunft_lng = pos.coords.longitude
        patch.ankunft_distanz = distanzMeter(pos.coords.latitude, pos.coords.longitude, st.standort_lat, st.standort_lng)
      } catch { /* GPS denied/timeout — allowed, stays unverified */ }
    }
    await supabase.from('montagen').update(patch).eq('id', offen.id)
    setBusy(false)
    onChanged()
  }

  const abschliessen = async () => {
    setBusy(true)
    // Freeze today's rates into the row — later rate changes must not
    // rewrite history (same trade-off note as projekt.stundensatz).
    const { data: firma } = await supabase.from('firmendaten').select('km_satz').eq('id', 1).single()
    const { data: me } = await supabase.from('profiles').select('stundensatz').eq('id', user.id).single()
    await supabase.from('montagen').update({
      ende_at: new Date().toISOString(),
      pause_min: Math.max(Number(pause) || 0, 0),
      km: Math.max(Number(km) || 0, 0),
      fortschritt: fortschritt,
      notiz: notiz.trim(),
      stundensatz: Number(me?.stundensatz ?? 0),
      km_satz: Number(firma?.km_satz ?? 0),
    }).eq('id', offen.id)
    setBusy(false); setFinishing(false)
    onChanged()
  }

  const verwerfen = async () => {
    setBusy(true)
    await supabase.from('montagen').delete().eq('id', offen.id)
    setBusy(false); setFinishing(false)
    onChanged()
  }

  return (
    <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] animate-fade-up" style={{ borderColor: meta.color + '55' }}>
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{offen.projekt?.name ?? `#${offen.projekt_id}`}</h3>
          {offen.projekt?.kunde && <p className="text-xs text-muted truncate">{offen.projekt.kunde}</p>}
        </div>
        <MonStatusBadge status={status} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">{t('mon_fahrzeit')}</div>
          {status === 'unterwegs'
            ? <LiveDuration since={offen.abfahrt_at} color="#e8821c" className="text-sm font-semibold" />
            : <div className="text-sm font-semibold font-mono">{fmtMin(fahrzeitMin(offen))}</div>}
        </div>
        <div className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">{t('mon_arbeitszeit')}</div>
          {status === 'arbeitet'
            ? <LiveDuration since={offen.ankunft_at} color="#4a90d9" className="text-sm font-semibold" />
            : <div className="text-sm font-semibold font-mono text-muted">—</div>}
        </div>
      </div>

      {/* GPS check-in verdict, once arrived at a pinned site */}
      {status === 'arbeitet' && offen.projekt?.standort_lat != null && (
        offen.ankunft_distanz == null ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3 -mt-2">
            <Icon name="mapPin" size={11} color="#9aa3ad" /> {t('mon_gps_none')}
          </div>
        ) : offen.ankunft_distanz <= (offen.projekt.standort_radius ?? 150) ? (
          <div className="flex items-center gap-1.5 text-[11px] text-green mb-3 -mt-2">
            <Icon name="check" size={11} color="rgb(var(--color-green))" /> {t('mon_gps_ok')} ({fmtDistanz(offen.ankunft_distanz)})
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-red mb-3 -mt-2">
            <Icon name="alert" size={11} color="rgb(var(--color-red))" /> {fmtDistanz(offen.ankunft_distanz)} {t('mon_gps_entfernt')}
          </div>
        )
      )}

      {!finishing ? (
        <div className="flex gap-2 flex-wrap">
          {status === 'unterwegs' && (
            <button onClick={angekommen} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#4a90d9' }}>
              <Icon name="mapPin" size={15} color="#fff" /> {t('mon_angekommen')}
            </button>
          )}
          {status === 'arbeitet' && (
            <button onClick={startFinish} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#4caf6e' }}>
              <Icon name="check" size={15} color="#fff" /> {t('mon_feierabend')}
            </button>
          )}
          <button onClick={verwerfen} disabled={busy}
                  className="px-3 py-3 rounded-xl text-xs text-muted border border-border hover:text-red hover:border-red/40 transition-colors">
            {t('mon_verwerfen')}
          </button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-secondary mb-1">{t('mon_pause')}</label>
              <input type="number" min="0" value={pause} onChange={e => setPause(e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('mon_km')}</label>
              <input type="number" min="0" value={km} onChange={e => setKm(e.target.value)} placeholder="0"
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-secondary">{t('mon_fortschritt')}</label>
              <span className="text-sm font-mono font-bold text-amber">{fortschritt}%</span>
            </div>
            <input type="range" min="0" max="100" step="5" value={fortschritt} disabled={fertig}
                   onChange={e => setFortschritt(Number(e.target.value))}
                   className="w-full accent-[#e8821c] disabled:opacity-50" />
            <FortschrittBar pct={fortschritt} color={fertig ? '#4caf6e' : '#e8821c'} />
          </div>
          {/* End of day ≠ end of montage — this toggle is the explicit
              "site is finished" for the last day. */}
          <button type="button" onClick={() => {
                    setFertig(f => {
                      const next = !f
                      if (next) setFortschritt(100)
                      return next
                    })
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition-all"
                  style={fertig
                    ? { background: 'var(--color-green-dim)', borderColor: 'rgb(var(--color-green))', color: 'rgb(var(--color-green))' }
                    : { background: 'rgb(var(--bg-2))', borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-secondary))' }}>
            <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
              fertig ? 'bg-green border-green' : 'border-border-strong bg-bg-1'}`}>
              {fertig && <Icon name="check" size={12} color="#fff" />}
            </span>
            {t('mon_fertig_frage')}
          </button>
          <div>
            <label className="block text-xs text-secondary mb-1">{t('mon_notiz')}</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={abschliessen} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: fertig ? '#4caf6e' : '#4a90d9' }}>
              <Icon name="check" size={15} color="#fff" />
              {fertig ? t('mon_abschliessen') : t('mon_feierabend_buchen')}
            </button>
            <button onClick={() => setFinishing(false)} disabled={busy}
                    className="px-4 py-3 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2 transition-colors">
              {t('common_cancel')}
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ══ WEEKDAY BAR CHART — hours per weekday of the current week ══ */
function WochenChart({ minuten, lang }) {
  const labels = lang === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const max = Math.max(...minuten, 60)
  return (
    <div>
      <div className="flex items-end gap-2 h-28">
        {minuten.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            {m > 0 && (
              <div className="text-[9px] font-mono text-muted mb-1">{(m / 60).toFixed(1).replace('.', ',')}</div>
            )}
            <div className="w-full max-w-[26px] rounded-t-md transition-all duration-700"
                 style={{ height: `${Math.max((m / max) * 100, m > 0 ? 4 : 2)}%`, background: m > 0 ? '#4caf6e' : 'rgb(var(--bg-3))' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {labels.map(l => <div key={l} className="flex-1 text-center text-[10px] text-muted">{l}</div>)}
      </div>
    </div>
  )
}

const PAGE_SIZE = 8

/* ══ MAIN PAGE ══ */
export default function MontagenPage() {
  const { t, lang } = useLanguage()
  const { user, isManager, isOwner } = useAuth()
  const [montagen, setMontagen] = useState([])
  const [projekte, setProjekte] = useState([])
  const [profiles, setProfiles] = useState([])
  const [moves, setMoves]       = useState([])   // project material issues, last 6 months
  const [artikelPreise, setArtikelPreise] = useState(new Map())
  const [kmSatz, setKmSatz]     = useState(0)
  const [loading, setLoading]   = useState(true)
  const [filterArbeiter, setFilterArbeiter] = useState('alle')
  const [filterProjekt, setFilterProjekt]   = useState('alle')
  const [filterZeitraum, setFilterZeitraum] = useState('alle')
  const [page, setPage]         = useState(0)
  const [expandedId, setExpandedId]         = useState(null)
  const [confirmDelete, setConfirmDelete]   = useState(null)
  const [showAllAct, setShowAllAct]         = useState(false)
  const [ratesDraft, setRatesDraft] = useState({})
  const [kmDraft, setKmDraft]       = useState('')

  const load = useCallback(async () => {
    const seit = new Date()
    seit.setMonth(seit.getMonth() - 6)
    const [{ data: mons }, { data: projs }, { data: profs }, { data: firma }, { data: mv }, { data: arts }] = await Promise.all([
      supabase.from('montagen').select('*, projekt:projekte(id,name,kunde,dokument_nr,standort_lat,standort_lng,standort_radius)').order('abfahrt_at', { ascending: false }).limit(500),
      supabase.from('projekte').select('id,name,kunde,status,dokument_nr').in('status', ['aktiv', 'geplant']).order('name'),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('firmendaten').select('km_satz').eq('id', 1).single(),
      supabase.from('warenbewegungen').select('artikel_id, artikel_name, menge, projekt_id, projekt, created_at')
        .eq('typ', 'ausgang').not('projekt_id', 'is', null).gte('created_at', seit.toISOString()),
      supabase.from('artikel').select('id, preis'),
    ])
    setMontagen(mons ?? [])
    setProjekte(projs ?? [])
    setProfiles(profs ?? [])
    setMoves(mv ?? [])
    setArtikelPreise(new Map((arts ?? []).map(a => [a.id, Number(a.preis ?? 0)])))
    const ks = Number(firma?.km_satz ?? 0)
    setKmSatz(ks); setKmDraft(String(ks))
    setRatesDraft(Object.fromEntries((profs ?? []).map(p => [p.id, String(p.stundensatz ?? 0)])))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [filterArbeiter, filterProjekt, filterZeitraum])

  // Keep the live "(x,x h)" figures in the right panel ticking.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(v => v + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles])
  const meine = useMemo(() => montagen.filter(m => m.arbeiter_id === user?.id), [montagen, user])
  const offenMeine = meine.find(m => !m.ende_at) ?? null
  const laufende = useMemo(() => montagen.filter(m => !m.ende_at), [montagen])

  /* ── period helpers ── */
  const wkStart = (offsetWeeks = 0) => {
    const d = new Date(); const day = (d.getDay() + 6) % 7
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day - offsetWeeks * 7)
    return d
  }
  const sameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()

  /* ── headline stats ── */
  const jetzt = new Date()
  const wocheEintraege = montagen.filter(m => new Date(m.abfahrt_at) >= wkStart())
  const vorwocheEintraege = montagen.filter(m => {
    const d = new Date(m.abfahrt_at)
    return d >= wkStart(1) && d < wkStart()
  })
  const sumMin = (list) => list.reduce((s, m) => s + (fahrzeitMin(m) ?? 0) + arbeitMin(m), 0)
  const wocheMin = sumMin(wocheEintraege)
  const vorwocheMin = sumMin(vorwocheEintraege)
  const wocheDelta = (wocheMin - vorwocheMin) / 60

  const monatEintraege = montagen.filter(m => sameMonth(new Date(m.abfahrt_at), jetzt))
  const materialKosten = (list) => list.reduce((s, mv) => s + Number(mv.menge) * (artikelPreise.get(mv.artikel_id) ?? 0), 0)
  const monatMoves = moves.filter(mv => sameMonth(new Date(mv.created_at), jetzt))
  const monatArbeitskosten = monatEintraege.reduce((s, m) => s + monArbeitskosten(m, profMap), 0)
  const monatFahrtkosten   = monatEintraege.reduce((s, m) => s + monFahrtkosten(m, kmSatz), 0)
  const monatMaterial      = materialKosten(monatMoves)
  const monatGesamt        = monatArbeitskosten + monatFahrtkosten + monatMaterial

  const einsatzProjekte = new Set(laufende.map(m => m.projekt_id)).size
  const wocheArbeiter = new Set(wocheEintraege.map(m => m.arbeiter_id ?? m.arbeiter_name)).size
  const avgProArbeiter = wocheArbeiter > 0 ? wocheMin / wocheArbeiter : null

  /* ── sparklines: 6 buckets each (weeks for hours, months for costs) ── */
  const sparks = useMemo(() => {
    const wochen = [], wochenAvg = []
    for (let i = 5; i >= 0; i--) {
      const von = wkStart(i), bis = wkStart(i - 1)
      const es = montagen.filter(m => { const d = new Date(m.abfahrt_at); return d >= von && d < bis })
      const min = sumMin(es)
      wochen.push(min / 60)
      const arb = new Set(es.map(m => m.arbeiter_id ?? m.arbeiter_name)).size
      wochenAvg.push(arb > 0 ? min / 60 / arb : 0)
    }
    const kosten = [], fahrt = []
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1)
      const es = montagen.filter(m => sameMonth(new Date(m.abfahrt_at), ref))
      const mv = moves.filter(x => sameMonth(new Date(x.created_at), ref))
      fahrt.push(es.reduce((s, m) => s + monFahrtkosten(m, kmSatz), 0))
      kosten.push(es.reduce((s, m) => s + monArbeitskosten(m, profMap), 0) + fahrt[fahrt.length - 1] + materialKosten(mv))
    }
    return { wochen, wochenAvg, kosten, fahrt }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montagen, moves, profMap, kmSatz, artikelPreise])

  const pctDelta = (arr) => {
    const prev = arr[4], cur = arr[5]
    if (!prev) return null
    const d = ((cur - prev) / Math.abs(prev)) * 100
    return `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}% ${t('auf_vs_last_month')}`
  }

  /* ── filtered entries + grouped per-project rows ── */
  const inZeitraum = (m) => {
    const d = new Date(m.abfahrt_at)
    if (filterZeitraum === 'woche') return d >= wkStart()
    if (filterZeitraum === 'monat') return sameMonth(d, jetzt)
    return true
  }
  const gefiltert = montagen.filter(m =>
    (filterArbeiter === 'alle' || m.arbeiter_id === filterArbeiter) &&
    (filterProjekt === 'alle' || m.projekt_id === Number(filterProjekt)) &&
    inZeitraum(m)
  )

  const gruppen = useMemo(() => {
    const map = new Map()
    gefiltert.forEach(m => {
      const g = map.get(m.projekt_id) ?? { projekt: m.projekt, projekt_id: m.projekt_id, eintraege: [] }
      g.eintraege.push(m)
      map.set(m.projekt_id, g)
    })
    // Open projects without any montage yet appear as "Geplant" rows
    // (only when no worker filter narrows the view).
    if (filterArbeiter === 'alle') {
      projekte.forEach(p => {
        if (map.has(p.id)) return
        if (filterProjekt !== 'alle' && Number(filterProjekt) !== p.id) return
        map.set(p.id, { projekt: p, projekt_id: p.id, eintraege: [] })
      })
    }
    return [...map.values()].map(g => {
      const es = g.eintraege
      const running = es.filter(m => !m.ende_at)
      const workers = [...new Map(es.map(m => [m.arbeiter_id ?? m.arbeiter_name, m.arbeiter_name])).values()].filter(Boolean)
      const dauerMin = sumMin(es)
      const letzteFort = es.filter(m => m.fortschritt !== null && m.ende_at)
        .sort((a, b) => new Date(b.ende_at) - new Date(a.ende_at))[0]
      const fort = letzteFort?.fortschritt ?? null
      const kosten = es.reduce((s, m) => s + monKosten(m, profMap, kmSatz), 0)
      const status = running.length > 0 ? 'einsatz'
        : es.length === 0 ? 'geplant'
        : (fort !== null && fort >= 100) ? 'abgeschlossen' : 'pausiert'
      const startTs = es.length ? Math.min(...es.map(m => new Date(m.abfahrt_at).getTime())) : null
      const endeTs = (es.length && running.length === 0)
        ? Math.max(...es.filter(m => m.ende_at).map(m => new Date(m.ende_at).getTime()))
        : null
      return { ...g, running, workers, dauerMin, fort, kosten, status, startTs, endeTs }
    }).sort((a, b) =>
      (b.status === 'einsatz') - (a.status === 'einsatz') ||
      (b.startTs ?? 0) - (a.startTs ?? 0)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gefiltert, projekte, profMap, kmSatz, filterArbeiter, filterProjekt])

  const pageCount = Math.max(Math.ceil(gruppen.length / PAGE_SIZE), 1)
  const safePage  = Math.min(page, pageCount - 1)
  const paged     = gruppen.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const from = gruppen.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const to   = Math.min((safePage + 1) * PAGE_SIZE, gruppen.length)

  /* ── charts data ── */
  const wochentagMin = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0]
    wocheEintraege.forEach(m => {
      const d = new Date(m.abfahrt_at)
      arr[(d.getDay() + 6) % 7] += (fahrzeitMin(m) ?? 0) + arbeitMin(m)
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montagen])

  const arbeiterWoche = useMemo(() => {
    const map = new Map()
    profiles.forEach(p => map.set(p.id, { name: p.display_name, min: 0 }))
    wocheEintraege.forEach(m => {
      const e = map.get(m.arbeiter_id) ?? { name: m.arbeiter_name || '—', min: 0 }
      e.min += (fahrzeitMin(m) ?? 0) + arbeitMin(m)
      map.set(m.arbeiter_id ?? m.arbeiter_name, e)
    })
    return [...map.values()].sort((a, b) => b.min - a.min)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montagen, profiles])

  const topProjekte = useMemo(() => {
    const map = new Map()
    monatEintraege.forEach(m => {
      const k = m.projekt_id
      const e = map.get(k) ?? { name: m.projekt?.name ?? `#${k}`, kosten: 0 }
      e.kosten += monKosten(m, profMap, kmSatz)
      map.set(k, e)
    })
    return [...map.values()].sort((a, b) => b.kosten - a.kosten).slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montagen, profMap, kmSatz])

  /* ── donut: status distribution + overall progress ── */
  const donutData = useMemo(() => {
    const counts = { abgeschlossen: 0, einsatz: 0, geplant: 0, pausiert: 0 }
    gruppen.forEach(g => { counts[g.status] += 1 })
    return [
      { label: t('status_abgeschlossen'), value: counts.abgeschlossen, color: '#4caf6e' },
      { label: t('mon_in_arbeit'),        value: counts.einsatz,       color: '#4a90d9' },
      { label: t('status_geplant'),       value: counts.geplant,       color: '#e8b23c' },
      { label: t('status_pausiert'),      value: counts.pausiert,      color: '#9aa3ad' },
    ]
  }, [gruppen, t])
  const gesamtFort = gruppen.length
    ? Math.round(gruppen.reduce((s, g) => s + (g.fort ?? 0), 0) / gruppen.length)
    : 0

  /* ── activity feed ── */
  const activities = useMemo(() => {
    const out = []
    montagen.forEach(m => {
      const sub = m.projekt?.name ?? `#${m.projekt_id}`
      out.push({ at: m.abfahrt_at, icon: 'truck', color: '#9b6bd9', text: t('mon_act_fahrt'), sub })
      if (m.ankunft_at) out.push({ at: m.ankunft_at, icon: 'mapPin', color: '#4a90d9', text: t('mon_act_arbeit'), sub })
      if (m.ende_at) out.push({ at: m.ende_at, icon: 'clock', color: '#4caf6e', text: t('mon_act_zeit'), sub })
    })
    moves.forEach(mv => {
      out.push({ at: mv.created_at, icon: 'box', color: '#4caf6e', text: t('mon_act_material'), sub: mv.projekt || mv.artikel_name })
    })
    return out.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [montagen, moves, t])

  const fmtAkt = (ts) => {
    const d = new Date(ts)
    const heute = new Date().toDateString() === d.toDateString()
    return heute ? `${t('mon_heute')}, ${fmtUhr(d)}` : `${fmtDt(d)}, ${fmtUhr(d)}`
  }

  const deleteEintrag = async (id) => {
    await supabase.from('montagen').delete().eq('id', id)
    setConfirmDelete(null)
    await load()
  }

  const saveRate = async (pid) => {
    const v = Math.max(Number(ratesDraft[pid]) || 0, 0)
    await supabase.from('profiles').update({ stundensatz: v }).eq('id', pid)
  }
  const saveKmSatz = async () => {
    const v = Math.max(Number(kmDraft) || 0, 0)
    setKmSatz(v)
    await supabase.from('firmendaten').update({ km_satz: v }).eq('id', 1)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  /* ══ WORKER VIEW — punch clock + own history ══ */
  if (!isManager) {
    return (
      <div className="p-3 sm:p-6 lg:p-8 max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('mon_title')}</h1>
          <p className="text-secondary text-sm">{t('mon_subtitle')}</p>
        </div>
        {offenMeine
          ? <MontageLive offen={offenMeine} montagen={montagen} onChanged={load} />
          : <MontageStart projekte={projekte} onStarted={load} />}
        <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <h3 className="font-semibold text-sm mb-3">{t('mon_meine')}</h3>
          {meine.filter(m => m.ende_at).length === 0 ? (
            <p className="text-sm text-muted text-center py-6">{t('mon_keine')}</p>
          ) : (
            <div className="space-y-2">
              {meine.filter(m => m.ende_at).slice(0, 10).map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5 animate-fade-up"
                     style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.projekt?.name ?? `#${m.projekt_id}`}</div>
                    <div className="text-[11px] text-muted font-mono">
                      {fmtDt(m.datum)} · {t('mon_fahrzeit')} {fmtMin(fahrzeitMin(m))} · {t('mon_arbeitszeit')} {fmtMin(arbeitMin(m))}
                    </div>
                  </div>
                  {m.fortschritt !== null && (
                    <div className="w-20 shrink-0">
                      <div className="text-[11px] font-mono text-secondary text-right mb-1">{m.fortschritt}%</div>
                      <FortschrittBar pct={m.fortschritt} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }

  /* ══ MANAGER DASHBOARD ══ */
  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('mon_title')}</h1>
        <p className="text-secondary text-sm">{t('mon_subtitle')}</p>
      </div>

      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 mb-4">
        <StatCard label={t('mon_stat_einsatz')} value={einsatzProjekte} icon="mapPin" color="#e8821c"
                  sub={t('mon_stat_projekte')} />
        <StatCard label={t('mon_stat_stunden_woche')} value={fmtH(wocheMin)} icon="clock" color="#4a90d9"
                  sub={vorwocheMin > 0 ? `${wocheDelta >= 0 ? '+' : ''}${wocheDelta.toFixed(1).replace('.', ',')} h ${t('mon_vs_woche')}` : undefined}
                  subColor={wocheDelta >= 0 ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'}
                  spark={sparks.wochen} />
        <StatCard label={t('mon_stat_kosten_monat')} value={monatGesamt} format={fmt} icon="chart" color="#4caf6e"
                  sub={pctDelta(sparks.kosten)} subColor="rgb(var(--color-green))"
                  spark={sparks.kosten} />
        <StatCard label={t('mon_stat_fahrtkosten')} value={monatFahrtkosten} format={fmt} icon="truck" color="#9b6bd9"
                  sub={pctDelta(sparks.fahrt)} subColor="rgb(var(--color-green))"
                  spark={sparks.fahrt} />
        <StatCard label={t('mon_stat_avg_arbeiter')} value={fmtH(avgProArbeiter)} icon="user" color="#e8821c"
                  sub={t('mon_diese_woche')} spark={sparks.wochenAvg} />
      </div>

      {/* Columns stretch to match each other and fill the viewport, so
          the charts row reaches the bottom instead of stopping short. */}
      <div className="flex flex-col xl:flex-row gap-4 xl:min-h-[calc(100vh-320px)]">
        {/* ══ MAIN COLUMN ══ */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {/* filter bar with inline start flow */}
          <Card className="p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              {!offenMeine && (
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[10px] font-semibold text-amber uppercase tracking-wide mb-1">{t('mon_start_title')}</div>
                  <MontageStart projekte={projekte} onStarted={load} inline />
                </div>
              )}
              <div className={`flex flex-wrap items-center gap-2 ${offenMeine ? 'flex-1' : 'self-end'}`}>
                <select value={filterArbeiter} onChange={e => setFilterArbeiter(e.target.value)}
                        className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
                  <option value="alle">{t('mon_filter_alle_arbeiter')}</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <select value={filterProjekt} onChange={e => setFilterProjekt(e.target.value)}
                        className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
                  <option value="alle">{t('mon_filter_alle_projekte')}</option>
                  {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={filterZeitraum} onChange={e => setFilterZeitraum(e.target.value)}
                        className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
                  <option value="alle">{t('mon_zeitraum_waehlen')}</option>
                  <option value="woche">{t('mon_zeitraum_woche')}</option>
                  <option value="monat">{t('auf_zeitraum_monat')}</option>
                </select>
                <button onClick={() => { setFilterArbeiter('alle'); setFilterProjekt('alle'); setFilterZeitraum('alle') }}
                        className="flex items-center gap-1.5 bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary hover:bg-bg-3 transition-colors">
                  <Icon name="filter" size={13} color="currentColor" /> Filter
                </button>
              </div>
            </div>
          </Card>

          {/* my running montage (manager works on the roof too) */}
          {offenMeine && <MontageLive offen={offenMeine} montagen={montagen} onChanged={load} />}

          {/* grouped table — grows to fill the leftover height */}
          <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex-1 flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <h3 className="font-semibold text-sm">{t('mon_table_title')}</h3>
            </div>
            {gruppen.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">{t('mon_keine')}</p>
            ) : (
              <>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_projekt')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_kunde')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_arbeiter')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_start')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_ende')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_dauer')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_fortschritt')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('mon_col_kosten')}</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(g => {
                        const gm = GRP_META[g.status]
                        const expanded = expandedId === g.projekt_id
                        return (
                          <Fragment key={g.projekt_id}>
                            <tr onClick={() => setExpandedId(expanded ? null : g.projekt_id)}
                                className={`border-b border-border cursor-pointer transition-colors ${expanded ? 'bg-bg-2' : 'hover:bg-bg-2/60'}`}>
                              <td className="px-4 py-3" style={{ borderLeft: `3px solid ${gm.color}` }}>
                                <div className="font-medium">{g.projekt?.name ?? `#${g.projekt_id}`}</div>
                                {g.projekt?.dokument_nr && <div className="text-[11px] text-muted font-mono mt-0.5">{g.projekt.dokument_nr}</div>}
                              </td>
                              <td className="px-4 py-3 text-secondary">{g.projekt?.kunde || '—'}</td>
                              <td className="px-4 py-3">
                                {g.workers.length > 0 ? <Avatars names={g.workers} /> : <span className="text-muted text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {g.startTs ? (<>
                                  <div>{fmtDt(g.startTs)}</div>
                                  <div className="text-muted">{fmtUhr(g.startTs)}</div>
                                </>) : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {g.endeTs ? (<>
                                  <div>{fmtDt(g.endeTs)}</div>
                                  <div className="text-muted">{fmtUhr(g.endeTs)}</div>
                                </>) : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {g.eintraege.length > 0 ? fmtH(g.dauerMin) : '—'}
                              </td>
                              <td className="px-4 py-3 w-36">
                                <div className="flex items-center gap-2 mb-1">
                                  <GrpStatusBadge status={g.status} />
                                </div>
                                {g.fort !== null && (
                                  <div className="flex items-center gap-2">
                                    <FortschrittBar pct={g.fort} color={g.fort >= 100 ? '#4caf6e' : '#4a90d9'} />
                                    <span className="text-[11px] font-mono text-secondary shrink-0">{g.fort}%</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-amber font-semibold">
                                {g.eintraege.length > 0 ? fmt(g.kosten) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : g.projekt_id) }}
                                        className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                                  <Icon name="dots" size={15} color="#9aa3ad" />
                                </button>
                              </td>
                            </tr>
                            {expanded && g.eintraege.length > 0 && (
                              <tr className="border-b border-border bg-bg-0/40">
                                <td colSpan={9} className="px-6 py-3">
                                  <div className="space-y-1.5">
                                    {g.eintraege.map(m => {
                                      const st = monStatus(m)
                                      return (
                                        <div key={m.id} className="flex items-center gap-3 text-xs bg-bg-1 border border-border rounded-lg px-3 py-2">
                                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                                style={{ background: avColor(m.arbeiter_name) }}>
                                            {initialen(m.arbeiter_name)}
                                          </span>
                                          <span className="font-medium w-32 truncate">{m.arbeiter_name || '—'}</span>
                                          <span className="font-mono text-muted whitespace-nowrap">{fmtDt(m.datum)}</span>
                                          <span className="font-mono whitespace-nowrap inline-flex items-center gap-1">
                                            <Icon name="truck" size={11} color="#9aa3ad" /> {fmtMin(fahrzeitMin(m))}
                                          </span>
                                          <span className="font-mono whitespace-nowrap inline-flex items-center gap-1">
                                            {st === 'beendet'
                                              ? <><Icon name="clock" size={11} color="#9aa3ad" /> {fmtMin(arbeitMin(m))}</>
                                              : <MonStatusBadge status={st} />}
                                          </span>
                                          {Number(m.km) > 0 && <span className="font-mono text-muted whitespace-nowrap">{Number(m.km)} km</span>}
                                          {m.ankunft_distanz != null && g.projekt?.standort_lat != null && (
                                            m.ankunft_distanz > (g.projekt.standort_radius ?? 150) ? (
                                              <span className="inline-flex items-center gap-1 text-red font-semibold whitespace-nowrap">
                                                <Icon name="alert" size={11} color="rgb(var(--color-red))" />
                                                {fmtDistanz(m.ankunft_distanz)} {t('mon_gps_entfernt')}
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-green whitespace-nowrap" title={t('mon_gps_ok')}>
                                                <Icon name="mapPin" size={11} color="rgb(var(--color-green))" />
                                                {fmtDistanz(m.ankunft_distanz)}
                                              </span>
                                            )
                                          )}
                                          {m.notiz && <span className="text-muted truncate flex-1">{m.notiz}</span>}
                                          <span className="font-mono font-semibold ml-auto whitespace-nowrap">{fmt(monKosten(m, profMap, kmSatz))}</span>
                                          {confirmDelete === m.id ? (
                                            <span className="flex items-center gap-1">
                                              <button onClick={() => deleteEintrag(m.id)}
                                                      className="text-[11px] font-semibold bg-red text-white px-2 py-1 rounded-md">OK</button>
                                              <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-muted px-1">✕</button>
                                            </span>
                                          ) : (
                                            <button onClick={() => setConfirmDelete(m.id)} className="p-1 rounded hover:bg-bg-3">
                                              <Icon name="trash" size={12} color="#9aa3ad" />
                                            </button>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted flex-wrap gap-2">
                  <span>
                    {lang === 'en'
                      ? `Showing ${from} to ${to} of ${gruppen.length} jobs`
                      : `Zeige ${from} bis ${to} von ${gruppen.length} Einsätzen`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                            className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-bg-2 transition-colors">
                      <Icon name="chevronLeft" size={12} color="#9aa3ad" />
                    </button>
                    {Array.from({ length: pageCount }).map((_, i) => (
                      <button key={i} onClick={() => setPage(i)}
                              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                                i === safePage ? 'bg-amber text-bg-0' : 'border border-border text-secondary hover:bg-bg-2'
                              }`}>
                        {i + 1}
                      </button>
                    ))}
                    <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
                            className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-bg-2 transition-colors">
                      <Icon name="chevronRight" size={12} color="#9aa3ad" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* bottom charts row — natural height, pushed to the bottom */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-auto">
            <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
              <h3 className="font-semibold text-sm mb-4">{t('mon_zeit_chart')}</h3>
              <div className="flex-1 flex flex-col justify-center">
                <WochenChart minuten={wochentagMin} lang={lang} />
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="w-2 h-2 rounded-full" style={{ background: '#4caf6e' }} />
                <span className="text-[10px] text-muted">{t('mon_arbeitsstunden')}</span>
              </div>
            </Card>

            <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
              <h3 className="font-semibold text-sm mb-4">{t('mon_stunden_pro_arbeiter')}</h3>
              <div className="space-y-2.5">
                {arbeiterWoche.slice(0, 6).map((a, i) => {
                  const max = Math.max(arbeiterWoche[0]?.min ?? 0, 60)
                  const color = AV_COLORS[i % AV_COLORS.length]
                  return (
                    <div key={a.name} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-xs truncate flex-1">{a.name}</span>
                        <span className="text-[11px] font-mono text-secondary shrink-0">{fmtH(a.min)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden mt-1 ml-3.5">
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${(a.min / max) * 100}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
              <h3 className="font-semibold text-sm mb-4">{t('mon_top_projekte')}</h3>
              {topProjekte.length === 0 ? (
                <p className="text-xs text-muted text-center py-6">{t('mon_keine')}</p>
              ) : (
                <div className="space-y-2.5">
                  {topProjekte.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between gap-3 animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <span className="text-xs truncate">{p.name}</span>
                      <span className="text-xs font-mono font-semibold shrink-0">{fmt(p.kosten)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ══ RIGHT PANEL — activity card grows so the column fills the
            same height as the main one ══ */}
        <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
          {/* live */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <StatusDot color="#4caf6e" pulse size={8} /> {t('mon_live')}
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md"
                    style={{ background: '#4a90d91a', color: '#4a90d9' }}>Live</span>
            </div>
            {laufende.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">{t('mon_niemand')}</p>
            ) : (
              <div className="space-y-2">
                {[...new Map(laufende.map(m => [m.projekt_id, null])).keys()].map(pid => {
                  const es = laufende.filter(m => m.projekt_id === pid)
                  const fruehste = Math.min(...es.map(m => new Date(m.abfahrt_at).getTime()))
                  const stunden = (Date.now() - fruehste) / 3600000
                  return (
                    <div key={pid} className="flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5">
                      <StatusDot color="#4a90d9" pulse size={7} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{es[0].projekt?.name ?? `#${pid}`}</div>
                        <div className="text-[11px] text-muted">
                          {lang === 'en' ? 'Since' : 'Seit'} {fmtUhr(fruehste)} {lang === 'en' ? '' : 'Uhr'} ({stunden.toFixed(1).replace('.', ',')} h)
                        </div>
                      </div>
                      <Avatars names={[...new Set(es.map(m => m.arbeiter_name).filter(Boolean))]} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* donut */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <Icon name="chart" size={15} color="#4caf6e" /> {t('mon_fortschritt_gesamt')}
            </h3>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <DonutChart data={donutData} size={110} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold font-mono">{gesamtFort}%</span>
                  <span className="text-[9px] text-muted">{t('mon_gesamt')}</span>
                </div>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                {donutData.map(d => {
                  const total = donutData.reduce((s, x) => s + x.value, 0) || 1
                  return (
                    <div key={d.label} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-secondary truncate flex-1">{d.label}</span>
                      <span className="font-mono shrink-0">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* cost overview */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <Icon name="chart" size={15} color="#e8821c" /> {t('mon_kosten_uebersicht')}
            </h3>
            <div className="space-y-2.5 text-xs">
              {[
                { label: t('mon_arbeitskosten'),    value: monatArbeitskosten },
                { label: t('mon_materialkosten'),   value: monatMaterial },
                { label: t('mon_fahrtkosten_short'), value: monatFahrtkosten },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{r.label}</span>
                  <span className="font-mono font-medium">{fmt(r.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <span className="font-medium">{t('mon_gesamt')}</span>
                <span className="font-mono font-bold text-amber">{fmt(monatGesamt)}</span>
              </div>
            </div>
          </Card>

          {/* activity feed */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex-1">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <Icon name="clock" size={15} color="#9b6bd9" /> {t('mon_aktivitaeten')}
            </h3>
            {activities.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">{t('mon_keine')}</p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {activities.slice(0, showAllAct ? 20 : 4).map((a, i) => (
                    <div key={`${a.at}-${i}`} className="flex items-start gap-2.5 animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                           style={{ background: a.color + '1f' }}>
                        <Icon name={a.icon} size={13} color={a.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{a.text}</div>
                        <div className="text-[11px] text-muted truncate">{a.sub}</div>
                      </div>
                      <span className="text-[10px] text-muted font-mono shrink-0 mt-0.5">{fmtAkt(a.at)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowAllAct(s => !s)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
                  {showAllAct ? t('mon_weniger_akt') : t('mon_alle_akt')}
                  <Icon name="chevronRight" size={12} color="currentColor" />
                </button>
              </>
            )}
          </Card>

          {/* rates (owner) */}
          {isOwner && (
            <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h3 className="font-semibold text-sm mb-3">{t('mon_saetze')}</h3>
              <div className="space-y-2">
                {profiles.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                          style={{ background: avColor(p.display_name) }}>
                      {initialen(p.display_name)}
                    </span>
                    <span className="text-xs flex-1 truncate">{p.display_name}</span>
                    <input type="number" min="0" step="0.5" value={ratesDraft[p.id] ?? ''}
                           onChange={e => setRatesDraft(d => ({ ...d, [p.id]: e.target.value }))}
                           onBlur={() => saveRate(p.id)}
                           className="w-20 bg-bg-2 border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none focus:border-amber" />
                    <span className="text-[11px] text-muted w-7">€/h</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 border-t border-border pt-2 mt-2">
                  <span className="text-xs flex-1">{t('mon_km_satz')}</span>
                  <input type="number" min="0" step="0.05" value={kmDraft}
                         onChange={e => setKmDraft(e.target.value)}
                         onBlur={saveKmSatz}
                         className="w-20 bg-bg-2 border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none focus:border-amber" />
                  <span className="text-[11px] text-muted w-7">€/km</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
