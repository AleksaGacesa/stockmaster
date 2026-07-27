import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StatusDot from '../components/StatusDot'
import DonutChart from '../components/DonutChart'
import {
  arbeitstag, pausenMin, pauseLaeuft, fmtStd, fmtUhr, wochenStart,
} from '../lib/arbeitszeitHelpers'
import { distanzMeter } from '../lib/montagenHelpers'

// Daily target (minutes) for a worker → drives overtime. Uses the
// worker's own contract (weekly value spread over 5 workdays), then
// the company default, then 8h.
const sollDayMin = (prof, firmaSoll) => {
  if (prof?.vertrag_stunden != null && Number(prof.vertrag_stunden) > 0) {
    const h = Number(prof.vertrag_stunden)
    return Math.round((prof.vertrag_periode === 'tag' ? h : h / 5) * 60)
  }
  return Math.round((Number(firmaSoll ?? 8) || 8) * 60)
}

const dateKey = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fmtDatumLang = (d) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
const fmtDatum = (d) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(d))
const hms = (ms) => {
  const s = Math.max(Math.floor(ms / 1000), 0), p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
// Signed H:MM for overtime (can be negative = Minusstunden).
const fmtStdSigned = (min) => `${min < 0 ? '−' : ''}${fmtStd(Math.abs(min))}`
const initialen = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const AV = ['#e8821c', '#4a90d9', '#4caf6e', '#9b6bd9', '#d96b8f', '#3fb6c4']
const avColor = (n = '') => AV[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length]

function Avatar({ name, size = 32 }) {
  return (
    <span className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
          style={{ width: size, height: size, fontSize: size * 0.34, background: avColor(name) }}>
      {initialen(name)}
    </span>
  )
}

// Fluid sparkline: the viewBox keeps the drawing coordinates but the
// SVG scales to its container's width, so it never spills out of a
// narrow card (the mobile grid-cols-2 tiles were ~155px wide while the
// old fixed 230px SVG overflowed them).
function Sparkline({ points, color, w = 96, h = 34 }) {
  if (!points || points.length < 2 || Math.max(...points.map(Math.abs)) === 0)
    return <svg width="100%" height={h} className="block" />
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1
  const xy = (v, i) => [(i / (points.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)]
  const line = points.map((v, i) => xy(v, i).join(',')).join(' ')
  const area = `${xy(points[0], 0)[0]},${h} ${line} ${xy(points[points.length - 1], points.length - 1)[0]},${h}`
  const gid = `g${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full">
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((v, i) => { const [x, y] = xy(v, i); return <circle key={i} cx={x} cy={y} r="1.4" fill={color} /> })}
    </svg>
  )
}

function StatCard({ label, icon, color, value, unit, sub, subColor, spark, children }) {
  return (
    <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1f' }}>
          <Icon name={icon} size={14} color={color} />
        </div>
        <span className="text-xs text-secondary leading-tight">{label}</span>
      </div>
      {children ?? (
        <>
          <div className="font-bold font-mono leading-none">
            <span className="text-2xl">{value}</span>{unit && <span className="text-sm text-muted ml-1">{unit}</span>}
          </div>
          {sub && <div className="text-[11px] mt-1.5" style={{ color: subColor ?? 'rgb(var(--text-muted))' }}>{sub}</div>}
          {spark && <div className="mt-auto pt-2"><Sparkline points={spark} color={color} w={230} h={38} /></div>}
        </>
      )}
    </Card>
  )
}

/* ══ STATUS HEUTE — team donut + the viewer's own punch clock ══ */
function StatusHeuteCard({ firma, anwesendCount, totalCount, onChanged }) {
  const { t } = useLanguage()
  const { user, profile } = useAuth()
  const [mine, setMine] = useState(null)
  const [heute, setHeute] = useState([])
  const [busy, setBusy] = useState(false)
  const [nowT, setNowT] = useState(Date.now())

  const load = useCallback(async () => {
    const { data } = await supabase.from('arbeitszeiten').select('*')
      .eq('arbeiter_id', user.id).eq('datum', dateKey()).order('kommen_at', { ascending: false })
    const list = data ?? []; setHeute(list); setMine(list.find(a => !a.gehen_at) ?? null)
  }, [user.id])
  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(() => setNowT(Date.now()), 1000); return () => clearInterval(id) }, [])
  const refresh = () => { load(); onChanged?.() }

  const kommen = async () => {
    setBusy(true)
    const patch = { arbeiter_id: user.id, arbeiter_name: profile?.display_name ?? '', datum: dateKey(), kommen_at: new Date().toISOString(), pausen: [] }
    if (firma?.firma_lat != null && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }))
        patch.kommen_lat = pos.coords.latitude; patch.kommen_lng = pos.coords.longitude
        patch.kommen_distanz = distanzMeter(pos.coords.latitude, pos.coords.longitude, firma.firma_lat, firma.firma_lng)
      } catch { /* GPS off — allowed */ }
    }
    await supabase.from('arbeitszeiten').insert(patch); setBusy(false); refresh()
  }
  const togglePause = async () => {
    setBusy(true)
    const segs = Array.isArray(mine.pausen) ? [...mine.pausen] : []
    if (pauseLaeuft(mine)) segs[segs.length - 1] = { ...segs[segs.length - 1], e: new Date().toISOString() }
    else segs.push({ s: new Date().toISOString(), e: null })
    await supabase.from('arbeitszeiten').update({ pausen: segs }).eq('id', mine.id); setBusy(false); refresh()
  }
  const gehen = async () => {
    setBusy(true)
    const segs = Array.isArray(mine.pausen) ? [...mine.pausen] : []
    if (segs.length && !segs[segs.length - 1].e) segs[segs.length - 1] = { ...segs[segs.length - 1], e: new Date().toISOString() }
    await supabase.from('arbeitszeiten').update({ gehen_at: new Date().toISOString(), pausen: segs }).eq('id', mine.id); setBusy(false); refresh()
  }

  const pct = totalCount > 0 ? Math.round((anwesendCount / totalCount) * 100) : 0
  const donut = [
    { label: 'an', value: anwesendCount, color: '#4caf6e' },
    { label: 'ab', value: Math.max(totalCount - anwesendCount, 0), color: 'rgb(var(--bg-3))' },
  ]
  const netMs = mine ? Math.max((nowT - new Date(mine.kommen_at).getTime()) - pausenMin(mine) * 60000, 0) : 0
  const heuteBisher = Math.round(arbeitstag(heute.filter(a => a.gehen_at)).nettoMin)

  return (
    <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <StatusDot color="#4caf6e" pulse size={8} />
        <span className="text-xs text-secondary">{t('zt_status_heute')}</span>
      </div>
      <div className="text-[11px] text-green font-medium mb-2">{t('zt_jetzt_anwesend')}</div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="font-bold font-mono leading-none"><span className="text-2xl">{anwesendCount}</span><span className="text-sm text-muted"> / {totalCount}</span></div>
          <div className="text-[11px] text-muted mt-1">{t('zt_im_team')}</div>
        </div>
        <div className="relative shrink-0">
          <DonutChart data={donut} size={64} />
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono">{pct}%</div>
        </div>
      </div>
      {!mine ? (
        <button onClick={kommen} disabled={busy}
                className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: '#4caf6e' }}>
          <Icon name="arrowDown" size={15} color="#fff" /> {heute.length > 0 ? t('zt_wieder_kommen') : t('zt_kommen')}
        </button>
      ) : (
        <div className="mt-auto">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-muted">{t('zt_gearbeitet')}</span>
            <span className="font-mono font-semibold tabular-nums" style={{ color: pauseLaeuft(mine) ? '#e8821c' : '#4caf6e' }}>{hms(netMs)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={togglePause} disabled={busy}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                    style={pauseLaeuft(mine) ? { background: 'var(--color-amber-dim)', borderColor: '#e8821c', color: '#e8821c' } : { background: 'rgb(var(--bg-2))', borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-secondary))' }}>
              {pauseLaeuft(mine) ? t('zt_pause_ende') : t('zt_pause')}
            </button>
            <button onClick={gehen} disabled={busy}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60" style={{ background: '#e0524a' }}>
              {t('zt_gehen')}
            </button>
          </div>
        </div>
      )}
      {heute.length > 0 && !mine && (
        <div className="text-[10px] text-muted text-center mt-1.5">{t('zt_heute_bisher')}: <span className="font-mono">{fmtStd(heuteBisher)}</span></div>
      )}
    </Card>
  )
}

/* ══ CORRECTION MODAL (manager) ══ */
function KorrekturModal({ tag, onClose, onSaved }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const sessions = tag.azList ?? []
  const [selIdx, setSelIdx] = useState(0)
  const az = sessions[selIdx] ?? sessions[0]
  const [kommen, setKommen] = useState(fmtUhr(az.kommen_at))
  const [gehen, setGehen] = useState(az.gehen_at ? fmtUhr(az.gehen_at) : '')
  const [pause, setPause] = useState(String(Math.round(pausenMin(az))))
  const [busy, setBusy] = useState(false)
  const pickSession = (i) => { const s = sessions[i]; setSelIdx(i); setKommen(fmtUhr(s.kommen_at)); setGehen(s.gehen_at ? fmtUhr(s.gehen_at) : ''); setPause(String(Math.round(pausenMin(s)))) }
  const toISO = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); const d = new Date(az.datum + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.toISOString() }
  const save = async () => {
    setBusy(true)
    const nk = toISO(kommen), ng = gehen ? toISO(gehen) : null, np = Math.max(Number(pause) || 0, 0)
    const ch = []
    if (fmtUhr(nk) !== fmtUhr(az.kommen_at)) ch.push(`${t('zt_kommen')} ${fmtUhr(az.kommen_at)} → ${fmtUhr(nk)}`)
    if (fmtUhr(ng) !== fmtUhr(az.gehen_at)) ch.push(`${t('zt_gehen')} ${az.gehen_at ? fmtUhr(az.gehen_at) : '—'} → ${ng ? fmtUhr(ng) : '—'}`)
    if (Math.abs(np - pausenMin(az)) >= 1) ch.push(`${t('zt_pause')} ${fmtStd(pausenMin(az))} → ${fmtStd(np)}`)
    await supabase.from('arbeitszeiten').update({ kommen_at: nk, gehen_at: ng, pause_override_min: np }).eq('id', az.id)
    if (ch.length) await supabase.from('arbeitszeit_korrekturen').insert({ arbeitszeit_id: az.id, arbeiter_name: az.arbeiter_name, beschreibung: ch.join(' · '), von_user: profile?.display_name ?? '', von_user_id: profile?.id ?? null })
    setBusy(false); onSaved()
  }
  const del = async () => { setBusy(true); await supabase.from('arbeitszeiten').delete().eq('id', az.id); setBusy(false); onSaved() }
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{t('zt_korrektur_titel')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2"><Icon name="x" size={16} color="#9aa3ad" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-xs text-muted">{az.arbeiter_name} · {fmtDatum(az.datum)}</div>
          {sessions.length > 1 && (
            <select value={selIdx} onChange={e => pickSession(Number(e.target.value))} className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
              {sessions.map((s, i) => <option key={s.id} value={i}>{i + 1}. {fmtUhr(s.kommen_at)}–{s.gehen_at ? fmtUhr(s.gehen_at) : '…'}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-secondary mb-1">{t('zt_kommen')}</label>
              <input type="time" value={kommen} onChange={e => setKommen(e.target.value)} className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" /></div>
            <div><label className="block text-xs text-secondary mb-1">{t('zt_gehen')}</label>
              <input type="time" value={gehen} onChange={e => setGehen(e.target.value)} className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" /></div>
          </div>
          <div><label className="block text-xs text-secondary mb-1">{t('zt_pause')} (min)</label>
            <input type="number" min="0" value={pause} onChange={e => setPause(e.target.value)} className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-amber" /></div>
          <p className="text-[11px] text-muted">{t('zt_korrektur_hint')}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>{busy ? '…' : t('common_save')}</button>
          <button onClick={del} disabled={busy} className="px-3 py-2.5 rounded-xl text-sm text-red border border-border hover:bg-red-dim"><Icon name="trash" size={14} color="#e0524a" /></button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2">{t('common_cancel')}</button>
        </div>
      </Card>
    </div>
  )
}

/* ══ MAIN PAGE ══ */
export default function ZeiterfassungPage() {
  const { t } = useLanguage()
  const { isManager, user } = useAuth()
  const [arbeitszeiten, setArbeitszeiten] = useState([])
  const [montagen, setMontagen] = useState([])
  const [profiles, setProfiles] = useState([])
  const [korrekturen, setKorrekturen] = useState([])
  const [firma, setFirma] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [selDate, setSelDate] = useState(() => new Date())
  const [period, setPeriod] = useState('woche')          // tag | woche | monat
  const [filterArbeiter, setFilterArbeiter] = useState('alle')
  const [search, setSearch] = useState('')
  const [showAllTeam, setShowAllTeam] = useState(false)
  const [showAllRank, setShowAllRank] = useState(false)
  const [editTag, setEditTag] = useState(null)

  const load = useCallback(async () => {
    const [{ data: az }, { data: mon }, { data: prof }, { data: firmaD }, { data: korr }] = await Promise.all([
      supabase.from('arbeitszeiten').select('*').order('datum', { ascending: false }).limit(3000),
      supabase.from('montagen').select('arbeiter_id, arbeiter_name, datum, abfahrt_at, ankunft_at, arbeit_start_at, ende_at, pause_min').limit(3000),
      supabase.from('profiles').select('id, display_name, role, stundensatz, vertrag_stunden, vertrag_periode').order('display_name'),
      supabase.from('firmendaten').select('firma_lat, firma_lng, firma_radius, soll_stunden_tag').eq('id', 1).single(),
      supabase.from('arbeitszeit_korrekturen').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    setArbeitszeiten(az ?? []); setMontagen(mon ?? []); setProfiles(prof ?? [])
    setFirma(firmaD ?? null); setKorrekturen(korr ?? [])
    setLastUpdate(new Date()); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(v => v + 1), 30000); return () => clearInterval(id) }, [])
  const roleLabel = (role) => role === 'owner' ? t('sidebar_owner') : role === 'admin' ? t('sidebar_admin') : t('sidebar_worker')

  // Merge arbeitszeiten + montagen → one record per worker+day.
  const tage = useMemo(() => {
    const map = new Map(); const keyOf = (a, d) => `${a}|${d}`
    arbeitszeiten.forEach(az => { const k = keyOf(az.arbeiter_id, az.datum); const g = map.get(k) ?? { arbeiter_id: az.arbeiter_id, arbeiter_name: az.arbeiter_name, datum: az.datum, azList: [], montagen: [] }; g.azList.push(az); if (!g.arbeiter_name) g.arbeiter_name = az.arbeiter_name; map.set(k, g) })
    montagen.forEach(m => { const k = keyOf(m.arbeiter_id, m.datum); const g = map.get(k) ?? { arbeiter_id: m.arbeiter_id, arbeiter_name: m.arbeiter_name, datum: m.datum, azList: [], montagen: [] }; g.montagen.push(m); if (!g.arbeiter_name) g.arbeiter_name = m.arbeiter_name; map.set(k, g) })
    return [...map.values()].map(g => ({ ...g, ...arbeitstag(g.azList, g.montagen) }))
  }, [arbeitszeiten, montagen])

  const korrByAz = useMemo(() => { const m = {}; korrekturen.forEach(k => (m[k.arbeitszeit_id] = m[k.arbeitszeit_id] ?? []).push(k)); return m }, [korrekturen])
  const tagFor = useCallback((datumStr) => tage.filter(g => g.datum === datumStr), [tage])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64"><div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" /></div>
  )

  /* ── date/period helpers ── */
  const shiftDay = (n) => { const d = new Date(selDate); d.setDate(d.getDate() + n); setSelDate(d) }
  const selKey = dateKey(selDate)
  const gesternKey = dateKey(new Date(selDate.getTime() - 86400000))
  const profMap = new Map(profiles.map(p => [p.id, p]))
  const overMin = (g) => (g.bruttoMin > 0 || g.nettoMin > 0)
    ? g.nettoMin - sollDayMin(profMap.get(g.arbeiter_id), firma?.soll_stunden_tag) : 0

  // day aggregates
  const dayAgg = (datumStr) => {
    const rows = tagFor(datumStr)
    const netto = rows.reduce((s, g) => s + g.nettoMin, 0)
    const pause = rows.reduce((s, g) => s + g.pauseMin, 0)
    const workers = rows.filter(g => g.nettoMin > 0 || g.offen).length
    return { netto, pause, workers }
  }
  const heuteA = dayAgg(selKey), gesternA = dayAgg(gesternKey)
  const anwesendIds = new Set(tagFor(selKey).filter(g => g.nettoMin > 0 || g.offen).map(g => g.arbeiter_id))
  const anwesendCount = anwesendIds.size

  // week overtime (week of selDate)
  const weekStartD = wochenStart(0)  // current week (relative to now)
  const weekMinOf = (offset) => {
    const von = wochenStart(offset), bis = wochenStart(offset - 1)
    return tage.filter(g => { const d = new Date(g.datum + 'T12:00:00'); return d >= von && d < bis }).reduce((s, g) => s + overMin(g), 0)
  }
  const ueberWoche = weekMinOf(0), ueberVorwoche = weekMinOf(1)

  // sparklines: last 8 days (netto, avg, pause) and 6 weeks (overtime)
  const days8 = []; for (let i = 7; i >= 0; i--) days8.push(dateKey(new Date(selDate.getTime() - i * 86400000)))
  const nettoSpark = days8.map(k => dayAgg(k).netto / 60)
  const avgSpark = days8.map(k => { const a = dayAgg(k); return a.workers ? a.netto / a.workers / 60 : 0 })
  const pauseSpark = days8.map(k => dayAgg(k).pause / 60)
  const overSpark = []; for (let i = 5; i >= 0; i--) overSpark.push(weekMinOf(i) / 60)

  const durchschnittHeute = heuteA.workers ? heuteA.netto / heuteA.workers : 0
  const durchschnittGestern = gesternA.workers ? gesternA.netto / gesternA.workers : 0
  const pauseProMa = anwesendCount ? heuteA.pause / anwesendCount : 0

  const deltaStr = (min, unit = 'h') => `${min >= 0 ? '+' : '−'}${fmtStd(Math.abs(min))} ${unit} ${t('zt_vs_gestern')}`
  const deltaCol = (min, invert = false) => (invert ? min <= 0 : min >= 0) ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'

  /* ── table rows for the period ── */
  const periodRange = () => {
    if (period === 'tag') return [selKey, selKey]
    if (period === 'monat') { const s = new Date(selDate.getFullYear(), selDate.getMonth(), 1), e = new Date(selDate.getFullYear(), selDate.getMonth() + 1, 0); return [dateKey(s), dateKey(e)] }
    const s = new Date(selDate); const day = (s.getDay() + 6) % 7; s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - day)
    const e = new Date(s.getTime() + 6 * 86400000); return [dateKey(s), dateKey(e)]
  }
  const [rangeStart, rangeEnd] = periodRange()
  const matchesArb = (g) => filterArbeiter === 'alle' || g.arbeiter_id === filterArbeiter
  const matchesSearch = (name) => !search || (name ?? '').toLowerCase().includes(search.toLowerCase())

  let rows = tage
    .filter(g => g.datum >= rangeStart && g.datum <= rangeEnd && matchesArb(g) && matchesSearch(g.arbeiter_name))
    .map(g => ({ ...g, over: overMin(g), status: g.offen ? 'anwesend' : (g.nettoMin > 0 ? 'anwesend' : 'abwesend') }))
    .sort((a, b) => (b.datum < a.datum ? -1 : b.datum > a.datum ? 1 : (b.nettoMin - a.nettoMin)))

  // On a single day, also list employees with no attendance as absent.
  if (period === 'tag') {
    const present = new Set(rows.map(r => r.arbeiter_id))
    profiles.filter(p => !present.has(p.id) && matchesArb({ arbeiter_id: p.id }) && matchesSearch(p.display_name))
      .forEach(p => rows.push({ arbeiter_id: p.id, arbeiter_name: p.display_name, datum: selKey, azList: [], montagen: [], nettoMin: 0, pauseMin: 0, bruttoMin: 0, offen: false, start: null, ende: null, quellen: [], over: 0, status: 'abwesend' }))
  }
  const roleOf = (id) => profiles.find(p => p.id === id)?.role
  const summeNetto = rows.reduce((s, r) => s + r.nettoMin, 0)
  const summeOver = rows.reduce((s, r) => s + r.over, 0)

  // Team status (all employees, present today or not) + today ranking
  const teamList = profiles.map(p => ({ ...p, anwesend: anwesendIds.has(p.id) }))
    .sort((a, b) => (b.anwesend ? 1 : 0) - (a.anwesend ? 1 : 0))
  const ranking = tagFor(selKey).filter(g => g.nettoMin > 0)
    .sort((a, b) => b.nettoMin - a.nettoMin)

  const exportExcel = () => {
    const head = [t('zt_col_datum'), t('zt_col_arbeiter'), t('zt_kommen'), t('zt_gehen'), t('zt_pause'), t('zt_col_arbeitszeit'), t('zt_col_ueberstunden')]
    const body = rows.map(r => [fmtDatum(r.datum), r.arbeiter_name, fmtUhr(r.start), r.offen ? '—' : fmtUhr(r.ende), fmtStd(r.pauseMin), fmtStd(r.nettoMin), fmtStdSigned(r.over)])
    body.push(['', t('zt_summe'), '', '', '', fmtStd(summeNetto), fmtStdSigned(summeOver)])
    const ws = XLSX.utils.aoa_to_sheet([head, ...body])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Zeiterfassung')
    XLSX.writeFile(wb, `Zeiterfassung_${rangeStart}_${rangeEnd}.xlsx`)
  }

  const StatusPill = ({ status }) => {
    const on = status === 'anwesend'
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium"><StatusDot color={on ? '#4caf6e' : '#9aa3ad'} pulse={false} size={7} />{on ? t('zt_anwesend') : t('zt_abwesend')}</span>
  }

  const periodOptions = [['tag', t('zt_heute')], ['woche', t('mon_zeitraum_woche')], ['monat', t('auf_zeitraum_monat')]]

  /* ══ NON-MANAGER: personal clock + own recent days ══ */
  if (!isManager) {
    const own = tage.filter(g => g.arbeiter_id === user?.id)
      .sort((a, b) => (a.datum < b.datum ? 1 : -1))
    return (
      <div className="p-3 sm:p-6 lg:p-8 max-w-md space-y-4">
        <div><h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('nav_zeiterfassung')}</h1><p className="text-secondary text-sm">{t('zt_subtitle')}</p></div>
        <StatusHeuteCard firma={firma} anwesendCount={anwesendCount} totalCount={profiles.length} onChanged={load} />
        <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <h3 className="font-semibold text-sm mb-3">{t('zt_meine_zeiten')}</h3>
          {own.length === 0 ? <p className="text-xs text-muted text-center py-4">{t('zt_keine')}</p> : (
            <div className="space-y-1.5">
              {own.slice(0, 14).map(g => (
                <div key={`${g.arbeiter_id}-${g.datum}`} className="flex items-center gap-3 bg-bg-2 border border-border rounded-lg px-3 py-2 text-xs">
                  <span className="font-mono text-muted whitespace-nowrap">{fmtDatum(g.datum)}</span>
                  <span className="font-mono text-secondary">{fmtUhr(g.start)}–{g.offen ? '…' : fmtUhr(g.ende)}</span>
                  <span className="font-mono font-semibold ml-auto">{fmtStd(g.nettoMin)}</span>
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
    <div className="p-3 sm:p-6 lg:p-8 overflow-x-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('nav_zeiterfassung')}</h1>
          <p className="text-secondary text-sm">{t('zt_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-bg-1 border border-border rounded-xl">
            <button onClick={() => shiftDay(-1)} className="p-2 hover:bg-bg-2 rounded-l-xl"><Icon name="chevronLeft" size={15} color="#9aa3ad" /></button>
            <span className="px-3 text-sm font-medium font-mono whitespace-nowrap flex items-center gap-1.5"><Icon name="calendar" size={13} color="#6b7480" />{fmtDatumLang(selDate)}</span>
            <button onClick={() => shiftDay(1)} className="p-2 hover:bg-bg-2 rounded-r-xl"><Icon name="chevronRight" size={15} color="#9aa3ad" /></button>
          </div>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-bg-1 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
            {periodOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-green border border-green/40 bg-green-dim hover:bg-green/10 transition-colors">
            <Icon name="download" size={15} color="rgb(var(--color-green))" /> {t('zt_export')}
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 mb-4">
        <StatusHeuteCard firma={firma} anwesendCount={anwesendCount} totalCount={profiles.length} onChanged={load} />
        <StatCard label={t('zt_stunden_heute')} icon="clock" color="#4a90d9" value={fmtStd(heuteA.netto)} unit="h"
                  sub={deltaStr(heuteA.netto - gesternA.netto)} subColor={deltaCol(heuteA.netto - gesternA.netto)} spark={nettoSpark} />
        <StatCard label={t('zt_durchschnitt')} icon="user" color="#9b6bd9" value={fmtStd(durchschnittHeute)} unit="h"
                  sub={deltaStr(durchschnittHeute - durchschnittGestern)} subColor={deltaCol(durchschnittHeute - durchschnittGestern)} spark={avgSpark} />
        <StatCard label={t('zt_ueberstunden_woche')} icon="alarm" color="#e8821c" value={fmtStdSigned(ueberWoche)} unit="h"
                  sub={`${ueberWoche - ueberVorwoche >= 0 ? '+' : '−'}${fmtStd(Math.abs(ueberWoche - ueberVorwoche))} h ${t('mon_vs_woche')}`}
                  subColor={deltaCol(-(ueberWoche - ueberVorwoche))} spark={overSpark} />
        <StatCard label={t('zt_pausen_heute')} icon="refresh" color="#3fb6c4" value={fmtStd(heuteA.pause)} unit="h"
                  sub={`Ø ${fmtStd(pauseProMa)} ${t('zt_pro_ma')}`} spark={pauseSpark} />
      </div>

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* table */}
        <div className="flex-1 min-w-0 w-full">
          <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
              <h3 className="font-semibold text-sm mr-auto">{t('zt_table_titel')}</h3>
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><Icon name="search" size={13} color="#6b7480" /></div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('zt_suchen')}
                       className="bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-amber w-40" />
              </div>
              <select value={filterArbeiter} onChange={e => setFilterArbeiter(e.target.value)} className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
                <option value="alle">{t('mon_filter_alle_arbeiter')}</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
                {periodOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {rows.length === 0 ? <p className="text-sm text-muted text-center py-10">{t('zt_keine')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                      <th className="px-4 py-2.5 font-medium">{t('zt_col_arbeiter')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_kommen')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_gehen')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_pause')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_col_arbeitszeit')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_col_ueberstunden')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('zt_col_status')}</th>
                      <th className="px-3 py-2.5 font-medium text-right">{t('zt_col_aktionen')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.arbeiter_id}-${r.datum}-${i}`} className="border-b border-border last:border-0 hover:bg-bg-2/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.arbeiter_name} size={30} />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{r.arbeiter_name || '—'}</div>
                              <div className="text-[11px] text-muted">{period !== 'tag' ? fmtDatum(r.datum) : roleLabel(roleOf(r.arbeiter_id))}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.start ? fmtUhr(r.start) : '–'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.start ? (r.offen ? '…' : fmtUhr(r.ende)) : '–'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-secondary">{r.start ? fmtStd(r.pauseMin) : '–'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold whitespace-nowrap">{fmtStd(r.nettoMin)} h</td>
                        <td className={`px-3 py-2.5 font-mono text-xs whitespace-nowrap ${r.over > 0 ? 'text-amber' : r.over < 0 ? 'text-red' : 'text-muted'}`}>{fmtStdSigned(r.over)} h</td>
                        <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-2.5 text-right">
                          {r.azList?.length > 0 && (
                            <button onClick={() => setEditTag(r)} className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors" title={t('zt_korrektur_titel')}>
                              <Icon name="dots" size={15} color="#9aa3ad" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-bg-2/40">
                      <td className="px-4 py-3 text-sm font-semibold">{t('zt_summe')}</td>
                      <td colSpan={3} />
                      <td className="px-3 py-3 font-mono text-sm font-bold">{fmtStd(summeNetto)} h</td>
                      <td className={`px-3 py-3 font-mono text-sm font-bold ${summeOver > 0 ? 'text-amber' : summeOver < 0 ? 'text-red' : 'text-muted'}`}>{fmtStdSigned(summeOver)} h</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-border text-[11px] text-muted">
              {t('zt_letzte_akt')}: {lastUpdate ? fmtUhr(lastUpdate) : '—'} <button onClick={load} className="hover:text-primary"><Icon name="refresh" size={12} color="currentColor" /></button>
              <span className="mx-1">·</span><StatusDot color="#4caf6e" pulse size={6} /> {t('zt_auto_akt')}
            </div>
          </Card>
        </div>

        {/* right panel */}
        <div className="w-full xl:w-80 shrink-0 space-y-4">
          {/* Team Status */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">{t('zt_team_status')}</h3>
              <span className="text-[11px] text-muted font-mono">{anwesendCount}/{profiles.length} {t('zt_anwesend').toLowerCase()}</span>
            </div>
            <div className="space-y-0.5">
              {(showAllTeam ? teamList : teamList.slice(0, 6)).map(u => (
                <div key={u.id} className="flex items-center gap-2.5 px-1 py-1.5">
                  <StatusDot color={u.anwesend ? '#4caf6e' : '#9aa3ad'} pulse={u.anwesend} size={8} />
                  <span className={`flex-1 min-w-0 truncate text-sm ${u.anwesend ? 'text-primary' : 'text-muted'}`}>{u.display_name}</span>
                  <span className="text-[10px] text-muted shrink-0">{roleLabel(u.role)}</span>
                </div>
              ))}
            </div>
            {teamList.length > 6 && (
              <button onClick={() => setShowAllTeam(s => !s)} className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
                <Icon name="user" size={12} color="currentColor" /> {showAllTeam ? t('mon_weniger_akt') : t('zt_alle_mitarbeiter')}
              </button>
            )}
          </Card>

          {/* Top Arbeitszeit heute */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('zt_top_arbeitszeit')}</h3>
            {ranking.length === 0 ? <p className="text-xs text-muted text-center py-3">{t('zt_keine')}</p> : (
              <div className="space-y-2">
                {(showAllRank ? ranking : ranking.slice(0, 3)).map((g, i) => (
                  <div key={g.arbeiter_id} className="flex items-center gap-2.5">
                    <span className={`w-5 text-center text-xs font-bold ${i === 0 ? 'text-amber' : 'text-muted'}`}>{i + 1}</span>
                    <Avatar name={g.arbeiter_name} size={28} />
                    <span className="flex-1 min-w-0 truncate text-sm">{g.arbeiter_name}</span>
                    <span className={`text-sm font-mono font-semibold shrink-0 ${i === 0 ? 'text-amber' : ''}`}>{fmtStd(g.nettoMin)} h</span>
                  </div>
                ))}
              </div>
            )}
            {ranking.length > 3 && (
              <button onClick={() => setShowAllRank(s => !s)} className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
                <Icon name="chart" size={12} color="currentColor" /> {showAllRank ? t('mon_weniger_akt') : t('zt_ranking')}
              </button>
            )}
          </Card>
        </div>
      </div>

      {editTag && <KorrekturModal tag={editTag} onClose={() => setEditTag(null)} onSaved={() => { setEditTag(null); load() }} />}
    </div>
  )
}
