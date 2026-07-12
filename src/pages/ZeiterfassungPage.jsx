import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StatusDot from '../components/StatusDot'
import LiveDuration from '../components/LiveDuration'
import CountUp from '../components/CountUp'
import {
  arbeitstag, pausenMin, pauseLaeuft, fmtStd, fmtStdDezimal, fmtUhr, wochenStart,
} from '../lib/arbeitszeitHelpers'
import { distanzMeter, fmtDistanz } from '../lib/montagenHelpers'

const dateKey = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fmtDatum = (d) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(d))
const hms = (ms) => {
  const s = Math.max(Math.floor(ms / 1000), 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
const initialen = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const AV = ['#e8821c', '#4a90d9', '#4caf6e', '#9b6bd9', '#d96b8f', '#3fb6c4']
const avColor = (n = '') => AV[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length]

/* ══ PERSONAL CLOCK — Kommen / Pause / Gehen (everyone) ══ */
function StempelKarte({ firma, onChanged }) {
  const { t } = useLanguage()
  const { user, profile } = useAuth()
  const [mine, setMine] = useState(null)          // the OPEN session today, if any
  const [heute, setHeute] = useState([])          // all of today's sessions
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [gpsMsg, setGpsMsg] = useState(null)

  const load = useCallback(async () => {
    // Multiple sessions per day are allowed (clock out and back in),
    // so fetch all of today's and drive the clock from the OPEN one.
    const { data } = await supabase.from('arbeitszeiten').select('*')
      .eq('arbeiter_id', user.id).eq('datum', dateKey()).order('kommen_at', { ascending: false })
    const list = data ?? []
    setHeute(list)
    setMine(list.find(a => !a.gehen_at) ?? null)
    setLoading(false)
  }, [user.id])
  useEffect(() => { load() }, [load])

  // Own 1s tick so the "worked" and "pause" counters advance live
  // (LiveDuration only re-renders itself, not this card's computed
  // net time).
  const [nowT, setNowT] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNowT(Date.now()), 1000); return () => clearInterval(id) }, [])

  const refresh = () => { load(); onChanged?.() }

  const kommen = async () => {
    setBusy(true); setGpsMsg(null)
    const patch = {
      arbeiter_id: user.id, arbeiter_name: profile?.display_name ?? '',
      datum: dateKey(), kommen_at: new Date().toISOString(), pausen: [],
    }
    if (firma?.firma_lat != null && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }))
        patch.kommen_lat = pos.coords.latitude
        patch.kommen_lng = pos.coords.longitude
        patch.kommen_distanz = distanzMeter(pos.coords.latitude, pos.coords.longitude, firma.firma_lat, firma.firma_lng)
      } catch { setGpsMsg(t('zt_gps_none')) }
    }
    await supabase.from('arbeitszeiten').insert(patch)
    setBusy(false)
    refresh()
  }

  const togglePause = async () => {
    setBusy(true)
    const segs = Array.isArray(mine.pausen) ? [...mine.pausen] : []
    if (pauseLaeuft(mine)) segs[segs.length - 1] = { ...segs[segs.length - 1], e: new Date().toISOString() }
    else segs.push({ s: new Date().toISOString(), e: null })
    await supabase.from('arbeitszeiten').update({ pausen: segs }).eq('id', mine.id)
    setBusy(false)
    refresh()
  }

  // Direct clock-out: close any running pause, stamp Gehen. Pause is
  // taken automatically from the start/stop segments; the boss can
  // still correct it later in the Korrektur dialog if needed.
  const gehen = async () => {
    setBusy(true)
    const segs = Array.isArray(mine.pausen) ? [...mine.pausen] : []
    if (segs.length && !segs[segs.length - 1].e) segs[segs.length - 1] = { ...segs[segs.length - 1], e: new Date().toISOString() }
    await supabase.from('arbeitszeiten').update({ gehen_at: new Date().toISOString(), pausen: segs }).eq('id', mine.id)
    setBusy(false)
    refresh()
  }

  if (loading) return (
    <Card className="p-5 flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="w-5 h-5 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </Card>
  )

  const gpsFlag = mine && mine.kommen_distanz != null && firma?.firma_lat != null &&
    mine.kommen_distanz > (firma.firma_radius ?? 120)

  // Sum of already-closed sessions today (shown when offering a fresh
  // Kommen, so a re-clock-in doesn't look like the day was lost).
  const heuteBisher = Math.round(arbeitstag(heute.filter(a => a.gehen_at)).nettoMin)

  /* no open session — offer Kommen (a new session, even later the same day) */
  if (!mine) return (
    <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
        <Icon name="clock" size={16} color="#4caf6e" /> {t('zt_heute')}
      </h3>
      <button onClick={kommen} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-base font-bold text-white disabled:opacity-60"
              style={{ background: '#4caf6e' }}>
        <Icon name="arrowDown" size={18} color="#fff" /> {heute.length > 0 ? t('zt_wieder_kommen') : t('zt_kommen')}
      </button>
      {heute.length > 0 && (
        <p className="text-[11px] text-muted mt-2 text-center">
          {t('zt_heute_bisher')}: <span className="font-mono font-semibold text-secondary">{fmtStd(heuteBisher)} {t('zt_std')}</span>
          {' '}· {heute.length} {heute.length === 1 ? t('zt_sitzung') : t('zt_sitzungen')}
        </p>
      )}
      {gpsMsg && <p className="text-[11px] text-muted mt-2 text-center">{gpsMsg}</p>}
    </Card>
  )

  // Live counters (nowT drives the 1s re-render). Net worked = elapsed
  // since Kommen minus pause; during a running pause both grow equally,
  // so "Gearbeitet" holds still while "Pause" ticks up.
  const pauseMs = pausenMin(mine) * 60000
  const netMs = Math.max((nowT - new Date(mine.kommen_at).getTime()) - pauseMs, 0)

  return (
    <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          style={{ borderColor: pauseLaeuft(mine) ? '#e8821c55' : '#4caf6e55' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon name="clock" size={16} color="#4caf6e" /> {t('zt_heute')}
        </h3>
        {gpsFlag && (
          <span className="text-[11px] text-red flex items-center gap-1">
            <Icon name="alert" size={11} color="rgb(var(--color-red))" /> {fmtDistanz(mine.kommen_distanz)} {t('zt_entfernt')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">{t('zt_kommen')}</div>
          <div className="text-sm font-semibold font-mono">{fmtUhr(mine.kommen_at)}</div>
        </div>
        <div className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">{t('zt_pause')}</div>
          <div className="text-sm font-semibold font-mono tabular-nums" style={{ color: pauseLaeuft(mine) ? '#e8821c' : undefined }}>{hms(pauseMs)}</div>
        </div>
        <div className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">{t('zt_gearbeitet')}</div>
          <div className="text-sm font-semibold font-mono tabular-nums" style={{ color: pauseLaeuft(mine) ? '#e8821c' : '#4caf6e' }}>{hms(netMs)}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={togglePause} disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all"
                style={pauseLaeuft(mine)
                  ? { background: 'var(--color-amber-dim)', borderColor: '#e8821c', color: '#e8821c' }
                  : { background: 'rgb(var(--bg-2))', borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-secondary))' }}>
          <Icon name={pauseLaeuft(mine) ? 'refresh' : 'clock'} size={15} color="currentColor" />
          {pauseLaeuft(mine) ? t('zt_pause_ende') : t('zt_pause_start')}
        </button>
        <button onClick={gehen} disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#e0524a' }}>
          <Icon name="arrowUp" size={15} color="#fff" /> {t('zt_gehen')}
        </button>
      </div>
    </Card>
  )
}

/* ══ MANAGER CORRECTION MODAL ══ */
function KorrekturModal({ tag, firma, onClose, onSaved }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const sessions = tag.azList ?? []
  // Default to the most recent session; a picker appears if there are
  // several (worker clocked out and back in the same day).
  const [selIdx, setSelIdx] = useState(0)
  const az = sessions[selIdx] ?? sessions[0]
  const [kommen, setKommen] = useState(fmtUhr(az.kommen_at))
  const [gehen, setGehen]   = useState(az.gehen_at ? fmtUhr(az.gehen_at) : '')
  const [pause, setPause]   = useState(String(Math.round(pausenMin(az))))
  const [busy, setBusy]     = useState(false)

  const pickSession = (i) => {
    const s = sessions[i]
    setSelIdx(i)
    setKommen(fmtUhr(s.kommen_at))
    setGehen(s.gehen_at ? fmtUhr(s.gehen_at) : '')
    setPause(String(Math.round(pausenMin(s))))
  }

  const toISO = (hhmm) => {
    if (!hhmm) return null
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(az.datum + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  const save = async () => {
    setBusy(true)
    const neuKommen = toISO(kommen)
    const neuGehen = gehen ? toISO(gehen) : null
    const neuPause = Math.max(Number(pause) || 0, 0)
    const changes = []
    if (fmtUhr(neuKommen) !== fmtUhr(az.kommen_at)) changes.push(`${t('zt_kommen')} ${fmtUhr(az.kommen_at)} → ${fmtUhr(neuKommen)}`)
    if (fmtUhr(neuGehen) !== fmtUhr(az.gehen_at)) changes.push(`${t('zt_gehen')} ${az.gehen_at ? fmtUhr(az.gehen_at) : '—'} → ${neuGehen ? fmtUhr(neuGehen) : '—'}`)
    if (Math.abs(neuPause - pausenMin(az)) >= 1) changes.push(`${t('zt_pause')} ${fmtStd(pausenMin(az))} → ${fmtStd(neuPause)}`)

    await supabase.from('arbeitszeiten')
      .update({ kommen_at: neuKommen, gehen_at: neuGehen, pause_override_min: neuPause })
      .eq('id', az.id)
    if (changes.length > 0) {
      await supabase.from('arbeitszeit_korrekturen').insert({
        arbeitszeit_id: az.id, arbeiter_name: az.arbeiter_name,
        beschreibung: changes.join(' · '),
        von_user: profile?.display_name ?? '', von_user_id: profile?.id ?? null,
      })
    }
    setBusy(false)
    onSaved()
  }

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
            <div>
              <label className="block text-xs text-secondary mb-1">{t('zt_sitzung')}</label>
              <select value={selIdx} onChange={e => pickSession(Number(e.target.value))}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
                {sessions.map((s, i) => (
                  <option key={s.id} value={i}>
                    {i + 1}. {fmtUhr(s.kommen_at)}–{s.gehen_at ? fmtUhr(s.gehen_at) : '…'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">{t('zt_kommen')}</label>
              <input type="time" value={kommen} onChange={e => setKommen(e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('zt_gehen')}</label>
              <input type="time" value={gehen} onChange={e => setGehen(e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">{t('zt_pause')} (min)</label>
            <input type="number" min="0" value={pause} onChange={e => setPause(e.target.value)}
                   className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-amber" />
          </div>
          <p className="text-[11px] text-muted">{t('zt_korrektur_hint')}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={save} disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            {busy ? '…' : t('common_save')}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2">
            {t('common_cancel')}
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ══ MAIN PAGE ══ */
export default function ZeiterfassungPage() {
  const { t, lang } = useLanguage()
  const { isManager } = useAuth()
  const [arbeitszeiten, setArbeitszeiten] = useState([])
  const [montagen, setMontagen] = useState([])
  const [profiles, setProfiles] = useState([])
  const [korrekturen, setKorrekturen] = useState([])
  const [firma, setFirma] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterArbeiter, setFilterArbeiter] = useState('alle')
  const [filterZeitraum, setFilterZeitraum] = useState('woche')
  const [editTag, setEditTag] = useState(null)
  const [showKorr, setShowKorr] = useState(false)

  const load = useCallback(async () => {
    const [{ data: az }, { data: mon }, { data: prof }, { data: firmaD }, { data: korr }] = await Promise.all([
      supabase.from('arbeitszeiten').select('*').order('datum', { ascending: false }).limit(2000),
      supabase.from('montagen').select('arbeiter_id, arbeiter_name, datum, abfahrt_at, ende_at, pause_min').limit(2000),
      supabase.from('profiles').select('id, display_name').order('display_name'),
      supabase.from('firmendaten').select('firma_lat, firma_lng, firma_radius').eq('id', 1).single(),
      supabase.from('arbeitszeit_korrekturen').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setArbeitszeiten(az ?? [])
    setMontagen(mon ?? [])
    setProfiles(prof ?? [])
    setFirma(firmaD ?? null)
    setKorrekturen(korr ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // keep live durations / open days ticking
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(v => v + 1), 30000); return () => clearInterval(id) }, [])

  // Merge arbeitszeiten + montagen into one record per worker+day.
  const tage = useMemo(() => {
    const map = new Map() // key `${arbeiterId}|${datum}` → { …, azList[], montagen[] }
    const keyOf = (aid, datum) => `${aid}|${datum}`
    arbeitszeiten.forEach(az => {
      const k = keyOf(az.arbeiter_id, az.datum)
      const g = map.get(k) ?? { arbeiter_id: az.arbeiter_id, arbeiter_name: az.arbeiter_name, datum: az.datum, azList: [], montagen: [] }
      g.azList.push(az)
      if (!g.arbeiter_name) g.arbeiter_name = az.arbeiter_name
      map.set(k, g)
    })
    montagen.forEach(m => {
      const k = keyOf(m.arbeiter_id, m.datum)
      const g = map.get(k) ?? { arbeiter_id: m.arbeiter_id, arbeiter_name: m.arbeiter_name, datum: m.datum, azList: [], montagen: [] }
      g.montagen.push(m)
      if (!g.arbeiter_name) g.arbeiter_name = m.arbeiter_name
      map.set(k, g)
    })
    return [...map.values()]
      .map(g => ({ ...g, ...arbeitstag(g.azList, g.montagen) }))
      .sort((a, b) => (b.datum < a.datum ? -1 : b.datum > a.datum ? 1 : (b.start ?? 0) - (a.start ?? 0)))
  }, [arbeitszeiten, montagen])

  const korrByAz = useMemo(() => {
    const m = {}
    korrekturen.forEach(k => { (m[k.arbeitszeit_id] = m[k.arbeitszeit_id] ?? []).push(k) })
    return m
  }, [korrekturen])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  /* ── manager derived data ── */
  const inZeitraum = (datum) => {
    const d = new Date(datum + 'T12:00:00'), n = new Date()
    if (filterZeitraum === 'woche') return d >= wochenStart()
    if (filterZeitraum === 'monat') return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
    return true
  }
  const gefiltert = tage.filter(g =>
    (filterArbeiter === 'alle' || g.arbeiter_id === filterArbeiter) && inZeitraum(g.datum))

  const anwesend = tage.filter(g => g.offen)
  const wocheMin = tage.filter(g => new Date(g.datum + 'T12:00:00') >= wochenStart()).reduce((s, g) => s + g.nettoMin, 0)
  const monatMin = tage.filter(g => { const d = new Date(g.datum + 'T12:00:00'), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() }).reduce((s, g) => s + g.nettoMin, 0)
  const summe = gefiltert.reduce((s, g) => s + g.nettoMin, 0)

  const proArbeiter = (() => {
    const m = {}
    gefiltert.forEach(g => {
      const key = g.arbeiter_id ?? g.arbeiter_name
      m[key] = m[key] ?? { name: g.arbeiter_name || '—', min: 0, tage: 0 }
      m[key].min += g.nettoMin; m[key].tage += 1
    })
    return Object.values(m).sort((a, b) => b.min - a.min)
  })()

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('nav_zeiterfassung')}</h1>
        <p className="text-secondary text-sm">{t('zt_subtitle')}</p>
      </div>

      {/* personal clock — everyone */}
      <div className="max-w-md mb-6"><StempelKarte firma={firma} onChanged={load} /></div>

      {isManager && (
        <>
          {/* stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mb-4">
            {[
              { label: t('zt_stat_anwesend'), value: anwesend.length, icon: 'user', color: '#4caf6e', mono: true },
              { label: t('zt_stat_woche'), value: fmtStd(wocheMin), icon: 'clock', color: '#4a90d9' },
              { label: t('zt_stat_monat'), value: fmtStd(monatMin), icon: 'chart', color: '#e8821c' },
              { label: t('zt_stat_mitarbeiter'), value: profiles.length, icon: 'user', color: '#9b6bd9', mono: true },
            ].map(s => (
              <Card key={s.label} className="p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.color + '1f' }}>
                    <Icon name={s.icon} size={15} color={s.color} />
                  </div>
                  <span className="text-xs text-secondary leading-tight">{s.label}</span>
                </div>
                <div className="text-lg font-bold font-mono">{typeof s.value === 'number' ? <CountUp value={s.value} /> : s.value}</div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col xl:flex-row gap-4 items-start">
            <div className="flex-1 min-w-0 w-full">
              {/* filter + table */}
              <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
                  <h3 className="font-semibold text-sm mr-auto">{t('zt_table_titel')}</h3>
                  <select value={filterArbeiter} onChange={e => setFilterArbeiter(e.target.value)}
                          className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
                    <option value="alle">{t('mon_filter_alle_arbeiter')}</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                  <select value={filterZeitraum} onChange={e => setFilterZeitraum(e.target.value)}
                          className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
                    <option value="woche">{t('mon_zeitraum_woche')}</option>
                    <option value="monat">{t('auf_zeitraum_monat')}</option>
                    <option value="alle">{t('auf_zeitraum_alle')}</option>
                  </select>
                </div>
                {gefiltert.length === 0 ? (
                  <p className="text-sm text-muted text-center py-10">{t('zt_keine')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                          <th className="px-4 py-2.5 font-medium">{t('zt_col_datum')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_col_arbeiter')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_kommen')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_gehen')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_pause')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_col_netto')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('zt_col_quelle')}</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {gefiltert.map(g => {
                          const gpsFlag = firma?.firma_lat != null && g.azList.some(az =>
                            az.kommen_distanz != null && az.kommen_distanz > (firma.firma_radius ?? 120))
                          const korrRows = g.azList.flatMap(az => korrByAz[az.id] ?? [])
                          const korrekt = korrRows.length > 0
                          return (
                            <tr key={`${g.arbeiter_id}-${g.datum}`} className="border-b border-border last:border-0 hover:bg-bg-2/60 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{fmtDatum(g.datum)}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: avColor(g.arbeiter_name) }}>
                                    {initialen(g.arbeiter_name)}
                                  </span>
                                  {g.arbeiter_name || '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {fmtUhr(g.start)}
                                {gpsFlag && <Icon name="alert" size={11} color="rgb(var(--color-red))" className="inline ml-1 align-[-1px]" />}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {g.offen ? <span className="text-green inline-flex items-center gap-1"><StatusDot color="#4caf6e" pulse size={6} />{t('zt_aktiv')}</span> : fmtUhr(g.ende)}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{fmtStd(g.pauseMin)}</td>
                              <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">{fmtStd(g.nettoMin)}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1 flex-wrap">
                                  {g.quellen.includes('stempel') && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#4a90d91a', color: '#4a90d9' }}>{t('zt_quelle_stempel')}</span>}
                                  {g.quellen.includes('montage') && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#e8821c1a', color: '#e8821c' }}>{t('zt_quelle_montage')}</span>}
                                  {korrekt && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#9b6bd91a', color: '#9b6bd9' }} title={korrRows.map(k => `${k.beschreibung} (${k.von_user})`).join('\n')}>{t('zt_korrigiert')}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {g.azList.length > 0 && (
                                  <button onClick={() => { setEditTag(g); setShowKorr(true) }}
                                          className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors" title={t('zt_korrektur_titel')}>
                                    <Icon name="edit" size={13} color="#9aa3ad" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-bg-2/40">
                          <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-right">{t('zt_summe')}</td>
                          <td className="px-4 py-2.5 font-mono text-sm font-bold text-amber">{fmtStd(summe)}</td>
                          <td colSpan={2} className="px-4 py-2.5 text-[11px] text-muted">{fmtStdDezimal(summe)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            {/* right panel */}
            <div className="w-full xl:w-80 shrink-0 space-y-4">
              <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                  <StatusDot color="#4caf6e" pulse size={8} /> {t('zt_jetzt_anwesend')}
                </h3>
                {anwesend.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">{t('zt_niemand')}</p>
                ) : (
                  <div className="space-y-2">
                    {anwesend.map(g => (
                      <div key={`${g.arbeiter_id}-${g.datum}`} className="flex items-center gap-3 bg-bg-2 border border-border rounded-xl px-3 py-2.5">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: avColor(g.arbeiter_name) }}>
                          {initialen(g.arbeiter_name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{g.arbeiter_name}</div>
                          <div className="text-[11px] text-muted">{lang === 'en' ? 'Since' : 'Seit'} {fmtUhr(g.start)}{g.quellen.includes('montage') ? ' · Montage' : ''}</div>
                        </div>
                        <LiveDuration since={g.start} color="#4caf6e" className="text-xs" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <h3 className="font-semibold text-sm mb-3">{t('zt_pro_arbeiter')}</h3>
                {proArbeiter.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">{t('zt_keine')}</p>
                ) : (
                  <div className="space-y-2.5">
                    {proArbeiter.map(a => (
                      <div key={a.name} className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: avColor(a.name) }}>
                          {initialen(a.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{a.name}</div>
                          <div className="text-[11px] text-muted">{a.tage} {t('zt_tage')}</div>
                        </div>
                        <span className="text-sm font-mono font-semibold shrink-0">{fmtStd(a.min)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {/* non-manager: own recent days */}
      {!isManager && (
        <div className="max-w-md">
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('zt_meine_zeiten')}</h3>
            {tage.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">{t('zt_keine')}</p>
            ) : (
              <div className="space-y-1.5">
                {tage.slice(0, 14).map(g => (
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
      )}

      {showKorr && editTag && (
        <KorrekturModal tag={editTag} firma={firma}
                        onClose={() => setShowKorr(false)}
                        onSaved={() => { setShowKorr(false); load() }} />
      )}
    </div>
  )
}
