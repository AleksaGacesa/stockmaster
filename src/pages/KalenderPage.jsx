import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { TERMIN_TYPES, terminMeta, fmtUhrzeit, dateKey, byUhrzeit, buildMonthGrid, isOverdue } from '../lib/termine'

const todayKey = () => dateKey(new Date())
const startOfToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
const dtf = (lang, opts) => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'de-DE', opts)

/* ══ TERMIN MODAL ══ */
function TerminModal({ termin, projekte, defaultDatum, onClose, onSaved }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const isNew = !termin?.id
  const [form, setForm] = useState({
    titel: '', typ: 'montage', datum: defaultDatum || todayKey(), uhrzeit: '',
    ort: '', notiz: '', projekt_id: '', erledigt: false,
    ...(termin || {}),
    uhrzeit: termin?.uhrzeit ? fmtUhrzeit(termin.uhrzeit) : '',
    projekt_id: termin?.projekt_id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.titel.trim()) return
    setSaving(true)
    const data = {
      titel: form.titel.trim(), typ: form.typ, datum: form.datum,
      uhrzeit: form.uhrzeit || null, ort: form.ort.trim(), notiz: form.notiz.trim(),
      projekt_id: form.projekt_id ? Number(form.projekt_id) : null, erledigt: form.erledigt,
    }
    if (isNew) await supabase.from('termine').insert({ ...data, erstellt_von: profile?.display_name ?? '', erstellt_von_id: profile?.id ?? null })
    else await supabase.from('termine').update(data).eq('id', termin.id)
    setSaving(false); onSaved()
  }
  const del = async () => { await supabase.from('termine').delete().eq('id', termin.id); onSaved() }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg-1 border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{isNew ? t('kal_new_termin') : t('kal_edit_termin')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2"><Icon name="x" size={16} color="#9aa3ad" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('kal_field_title')}</label>
            <input autoFocus value={form.titel} onChange={e => up('titel', e.target.value)} placeholder={t('kal_field_title_ph')}
                   className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('kal_field_type')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(TERMIN_TYPES).map(([key, m]) => (
                <button key={key} onClick={() => up('typ', key)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${form.typ === key ? 'border-amber bg-amber-dim' : 'border-border bg-bg-2'}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                  <span className="truncate">{t(m.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1.5">{t('kal_field_date')}</label>
              <input type="date" value={form.datum} onChange={e => up('datum', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">{t('kal_field_time')} <span className="text-muted">({t('kal_optional')})</span></label>
              <input type="time" value={form.uhrzeit} onChange={e => up('uhrzeit', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('kal_field_location')} <span className="text-muted">({t('kal_optional')})</span></label>
            <input value={form.ort} onChange={e => up('ort', e.target.value)} placeholder={t('kal_field_location_ph')}
                   className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
          </div>
          {projekte.length > 0 && (
            <div>
              <label className="block text-xs text-secondary mb-1.5">{t('kal_field_project')} <span className="text-muted">({t('kal_optional')})</span></label>
              <select value={form.projekt_id} onChange={e => up('projekt_id', e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
                <option value="">—</option>
                {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('kal_field_note')} <span className="text-muted">({t('kal_optional')})</span></label>
            <textarea value={form.notiz} onChange={e => up('notiz', e.target.value)} rows={2}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber resize-none" />
          </div>
          {!isNew && (
            <button onClick={() => up('erledigt', !form.erledigt)} className="flex items-center gap-2 text-sm">
              <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${form.erledigt ? 'bg-green border-green' : 'border-border bg-bg-2'}`}>
                {form.erledigt && <Icon name="check" size={12} color="#181c20" />}
              </span>
              {t('kal_done')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 px-5 pb-6 flex-wrap">
          <button onClick={save} disabled={saving || !form.titel.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="check" size={15} color="#181c20" /> {saving ? t('common_saving') : t('common_save')}
          </button>
          {!isNew && (confirmDelete ? (
            <>
              <span className="text-red text-sm">{t('common_delete_confirm')}</span>
              <button onClick={del} className="bg-red text-white text-sm px-3 py-2.5 rounded-xl">{t('common_yes')}</button>
              <button onClick={() => setConfirmDelete(false)} className="bg-bg-2 border border-border text-secondary text-sm px-3 py-2.5 rounded-xl">{t('common_no')}</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 text-red border border-border text-sm px-3 py-2.5 rounded-xl hover:bg-bg-2">
              <Icon name="trash" size={14} color="#e0524a" /> {t('common_delete')}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══ STAT MINI ══ */
function StatMini({ label, value, sub, icon, color }) {
  return (
    <Card className="p-4 border-t-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-between gap-3" style={{ borderTopColor: color }}>
      <div className="min-w-0">
        <div className="text-xs text-secondary mb-1.5">{label}</div>
        <div className="text-2xl font-bold font-mono leading-none mb-1">{value}</div>
        <div className="text-[11px] text-muted">{sub}</div>
      </div>
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset"
           style={{ background: `linear-gradient(135deg, ${color}2e, ${color}0f)`, '--tw-ring-color': `${color}33` }}>
        <Icon name={icon} size={24} color={color} />
      </div>
    </Card>
  )
}

/* ══ TIMELINE LIST — vertical spine that TerminRow dots sit on ══ */
function TimelineList({ children }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      {children}
    </div>
  )
}

/* ══ TERMIN ROW — timeline node (colored dot) · time pill ·
   title/subtitle · type badge. Optional relative-date label on top. ══ */
function TerminRow({ tm, onClick, relLabel, t }) {
  const meta = terminMeta(tm.typ)
  const over = isOverdue(tm)
  const dotColor = over ? 'rgb(var(--color-red))' : meta.color
  return (
    <button onClick={onClick} className={`w-full text-left rounded-lg hover:bg-bg-2 transition-colors ${tm.erledigt ? 'opacity-55' : ''}`}>
      {relLabel && <div className="text-[10px] text-muted pt-1.5 pl-6">{relLabel}</div>}
      <div className="relative flex items-center gap-2.5 pl-6 pr-1.5 py-2">
        <span className="absolute left-[7px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-4 ring-bg-1 z-10" style={{ background: dotColor }} />
        <span className="font-mono text-xs font-semibold px-2 py-1 rounded-lg bg-bg-2 border border-border shrink-0"
              style={over ? { color: 'rgb(var(--color-red))' } : undefined}>
          {fmtUhrzeit(tm.uhrzeit) || t('kal_allday')}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${tm.erledigt ? 'line-through' : ''}`}>{tm.titel}</div>
          {(tm.ort || tm.projekt?.name) && <div className="text-[11px] text-muted truncate">{[tm.ort, tm.projekt?.name].filter(Boolean).join(' · ')}</div>}
        </div>
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0" style={{ background: meta.color + '22', color: meta.color }}>{t(meta.labelKey)}</span>
      </div>
    </button>
  )
}

/* ══ MINI MONTH (right panel) ══ */
function MiniMonth({ viewDate, selected, byDay, onPick, onShift, weekdays, lang }) {
  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth())
  const tk = todayKey()
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onShift(-1)} className="p-1 rounded hover:bg-bg-2"><Icon name="chevronLeft" size={14} color="#9aa3ad" /></button>
        <span className="text-xs font-semibold capitalize">{dtf(lang, { month: 'long', year: 'numeric' }).format(viewDate)}</span>
        <button onClick={() => onShift(1)} className="p-1 rounded hover:bg-bg-2"><Icon name="chevronRight" size={14} color="#9aa3ad" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {weekdays.map((w, i) => <div key={w} className={`text-[10px] text-center font-medium capitalize ${i === 6 ? 'text-amber' : 'text-muted'}`}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((d, i) => {
          const key = dateKey(d)
          const inMonth = d.getMonth() === viewDate.getMonth()
          const isToday = key === tk
          const isSel = key === selected
          const has = (byDay[key] ?? []).length > 0
          return (
            <button key={i} onClick={() => onPick(key)}
                    className="h-7 flex items-center justify-center relative rounded hover:bg-bg-2 transition-colors">
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-mono ${
                isToday ? 'bg-amber text-bg-0 font-bold'
                : isSel ? 'ring-1 ring-amber text-amber font-semibold'
                : inMonth ? 'text-secondary' : 'text-muted opacity-40'
              }`}>{d.getDate()}</span>
              {has && !isToday && <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: isSel ? '#e8821c' : '#6b7480' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══ MAIN ══ */
export default function KalenderPage() {
  const { isManager } = useAuth()
  const { t, lang } = useLanguage()
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(todayKey())
  const [view, setView] = useState('monat')          // monat | woche | tag | agenda
  const [filterTyp, setFilterTyp] = useState('alle')
  const [monthTermine, setMonthTermine] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [todayTermine, setTodayTermine] = useState([])
  const [overdue, setOverdue] = useState([])
  const [projekte, setProjekte] = useState([])
  const [modal, setModal] = useState(null)

  const grid = useMemo(() => buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth()), [viewDate])
  const rangeStart = dateKey(grid[0])
  const rangeEnd = dateKey(grid[41])

  const load = useCallback(async () => {
    const heute = todayKey()
    const [{ data: month }, { data: up }, { data: tod }, { data: ov }] = await Promise.all([
      supabase.from('termine').select('*, projekt:projekte(name)').gte('datum', rangeStart).lte('datum', rangeEnd),
      supabase.from('termine').select('*, projekt:projekte(name)').gte('datum', heute).eq('erledigt', false).order('datum').order('uhrzeit').limit(8),
      supabase.from('termine').select('*, projekt:projekte(name)').eq('datum', heute),
      supabase.from('termine').select('id').lt('datum', heute).eq('erledigt', false),
    ])
    setMonthTermine(month ?? [])
    setUpcoming(up ?? [])
    setTodayTermine(tod ?? [])
    setOverdue(ov ?? [])
  }, [rangeStart, rangeEnd])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('projekte').select('id, name').in('status', ['geplant', 'aktiv', 'pausiert']).order('name')
      .then(({ data }) => { if (data) setProjekte(data) })
  }, [])

  const matchFilter = useCallback((tm) => filterTyp === 'alle' || tm.typ === filterTyp, [filterTyp])
  const byDay = useMemo(() => {
    const map = {}
    monthTermine.filter(matchFilter).forEach(tm => { (map[tm.datum] ??= []).push(tm) })
    Object.values(map).forEach(l => l.sort(byUhrzeit))
    return map
  }, [monthTermine, matchFilter])

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => dtf(lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))), [lang])
  const monthLabel = dtf(lang, { month: 'long', year: 'numeric' }).format(viewDate)
  const shiftMonth = (delta) => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  const goToday = () => { const d = new Date(); setViewDate(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayKey()) }
  const pickDate = (key) => { setSelected(key); const d = new Date(key + 'T00:00:00'); if (d.getMonth() !== viewDate.getMonth() || d.getFullYear() !== viewDate.getFullYear()) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1)) }
  const onSaved = () => { setModal(null); load() }
  const openEdit = (tm) => { if (isManager) setModal({ termin: tm }) }
  const openNew = () => setModal({ datum: selected })

  const relLabel = (dateStr) => {
    const diff = Math.round((new Date(dateStr + 'T00:00:00').getTime() - startOfToday()) / 86400000)
    if (diff === 0) return t('kal_today')
    if (diff === 1) return t('kal_tomorrow')
    return dtf(lang, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(dateStr + 'T00:00:00'))
  }

  const tk = todayKey()
  const selectedList = (byDay[selected] ?? [])
  const selFullLabel = dtf(lang, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(selected + 'T00:00:00'))
  const countTodayType = (typ) => todayTermine.filter(x => x.typ === typ).length

  // Which dates to render in the main area based on the view. Week
  // view shows the Monday-based week containing the selected day.
  const mainDays = useMemo(() => {
    if (view !== 'woche') return grid
    const s = new Date(selected + 'T00:00:00')
    const off = (s.getDay() + 6) % 7
    const mon = new Date(s.getFullYear(), s.getMonth(), s.getDate() - off)
    return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))
  }, [view, selected, grid])

  const legendTypes = ['montage', 'warenannahme', 'kundentermin', 'projekt', 'inventur']

  return (
    <div className="p-3 sm:p-6 lg:px-8 lg:py-5 flex flex-col gap-4 lg:min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('kal_title')}</h1>
          <p className="text-secondary text-sm">{t('kal_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={goToday} className="text-sm px-3 py-2 rounded-xl bg-bg-2 border border-border text-secondary hover:bg-bg-3">{t('kal_today')}</button>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-xl bg-bg-2 border border-border hover:bg-bg-3"><Icon name="chevronLeft" size={16} color="#9aa3ad" /></button>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-xl bg-bg-2 border border-border hover:bg-bg-3"><Icon name="chevronRight" size={16} color="#9aa3ad" /></button>
          </div>
          <select value={filterTyp} onChange={e => setFilterTyp(e.target.value)}
                  className="text-sm px-3 py-2 rounded-xl bg-bg-2 border border-border text-secondary outline-none focus:border-amber">
            <option value="alle">{t('kal_all_calendars')}</option>
            {Object.entries(TERMIN_TYPES).map(([k, m]) => <option key={k} value={k}>{t(m.labelKey)}</option>)}
          </select>
          {isManager && (
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              <Icon name="plus" size={15} color="#181c20" /> {t('kal_add_termin')}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatMini label={t('kal_stat_today')} value={todayTermine.length} sub={t('kal_termine_word')} icon="calendar" color="#e8821c" />
        <StatMini label={t('kal_type_warenannahme_pl')} value={countTodayType('warenannahme')} sub={t('kal_today')} icon="truck" color="#9b6bd9" />
        <StatMini label={t('kal_type_montage_pl')} value={countTodayType('montage')} sub={t('kal_today')} icon="refresh" color="#4a90d9" />
        <StatMini label={t('kal_stat_overdue')} value={overdue.length} sub={overdue.length === 1 ? t('kal_termin_word') : t('kal_termine_word')} icon="alarm" color="#e0524a" />
      </div>

      {/* Main + right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-1">
        <Card className="lg:col-span-2 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="font-semibold text-sm capitalize">{monthLabel}</h2>
            <div className="flex bg-bg-2 border border-border rounded-lg p-0.5">
              {[['monat', t('kal_view_month')], ['woche', t('kal_view_week')], ['tag', t('kal_view_day')], ['agenda', t('kal_view_agenda')]].map(([v, lbl]) => (
                <button key={v} onClick={() => setView(v)}
                        className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${view === v ? 'bg-amber text-bg-0 font-semibold' : 'text-secondary hover:text-primary'}`}>{lbl}</button>
              ))}
            </div>
          </div>

          {(view === 'monat' || view === 'woche') && (
            <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg overflow-hidden">
              {/* weekday header */}
              <div className="grid grid-cols-7 border-b border-border bg-bg-2/40 shrink-0">
                {weekdays.map((w, i) => <div key={w} className={`text-[11px] font-medium text-center py-2 capitalize ${i === 6 ? 'text-amber' : 'text-muted'}`}>{w}</div>)}
              </div>
              {/* day cells — connected grid filling the height */}
              <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
                {mainDays.map((d, i) => {
                  const key = dateKey(d)
                  const inMonth = d.getMonth() === viewDate.getMonth()
                  const isToday = key === tk
                  const isSel = key === selected
                  const evs = byDay[key] ?? []
                  const cap = view === 'woche' ? 6 : 2
                  return (
                    <button key={i} onClick={() => setSelected(key)}
                            className={`relative border-r border-b border-border p-1.5 text-left flex flex-col gap-1 overflow-hidden transition-colors ${
                              isSel ? 'bg-amber-dim ring-1 ring-inset ring-amber z-10' : 'hover:bg-bg-2'} ${(view === 'monat' && !inMonth) ? 'opacity-40' : ''}`}>
                      <span className={`text-xs font-mono self-end shrink-0 ${isToday ? 'w-5 h-5 flex items-center justify-center rounded-full bg-amber text-bg-0 font-bold' : 'text-secondary'}`}>{d.getDate()}</span>
                      <div className="flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden -mt-3">
                        {evs.slice(0, cap).map(tm => {
                          const meta = terminMeta(tm.typ)
                          const over = isOverdue(tm)
                          const sub = tm.ort || tm.projekt?.name
                          return (
                            <div key={tm.id} onClick={(e) => { e.stopPropagation(); openEdit(tm) }}
                                 className={`rounded-md border bg-bg-2 px-1.5 py-2 flex items-center gap-2 overflow-hidden ${tm.erledigt ? 'opacity-50' : ''} ${over ? 'border-red/50' : 'border-border'}`}>
                              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${meta.color}2e, ${meta.color}0f)` }}>
                                <Icon name={meta.icon} size={15} color={meta.color} />
                              </div>
                              <div className="min-w-0 leading-tight">
                                <div className={`text-[10px] font-medium truncate ${tm.erledigt ? 'line-through' : ''}`}>{fmtUhrzeit(tm.uhrzeit) ? `${fmtUhrzeit(tm.uhrzeit)} ` : ''}{tm.titel}</div>
                                {sub && <div className="text-[9px] text-muted truncate">{sub}</div>}
                              </div>
                            </div>
                          )
                        })}
                        {evs.length > cap && <div className="text-[10px] text-muted pl-1 shrink-0">+{evs.length - cap}</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {view === 'tag' && (
            <div className="flex-1">
              <h3 className="text-sm font-medium capitalize mb-3">{selFullLabel}</h3>
              {selectedList.length === 0 ? <p className="text-muted text-sm py-8 text-center">{t('kal_no_termine_day')}</p> : (
                <TimelineList>{selectedList.map(tm => <TerminRow key={tm.id} tm={tm} onClick={() => openEdit(tm)} t={t} />)}</TimelineList>
              )}
            </div>
          )}

          {view === 'agenda' && (
            <div className="flex-1">
              {upcoming.length === 0 ? <p className="text-muted text-sm py-8 text-center">{t('kal_no_upcoming')}</p> : (
                <TimelineList>
                  {upcoming.filter(matchFilter).map(tm => <TerminRow key={tm.id} tm={tm} onClick={() => openEdit(tm)} relLabel={relLabel(tm.datum)} t={t} />)}
                </TimelineList>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap pt-4 mt-auto border-t border-border">
            {legendTypes.map(k => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-secondary">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: TERMIN_TYPES[k].color }} /> {t(TERMIN_TYPES[k].labelKey)}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[11px] text-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-red" /> {t('kal_overdue')}
            </span>
          </div>
        </Card>

        {/* Right panel */}
        <Card className="lg:col-span-1 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] lg:h-full flex flex-col">
          <h3 className="font-medium text-sm capitalize mb-3">{selFullLabel}</h3>
          <MiniMonth viewDate={viewDate} selected={selected} byDay={byDay} onPick={pickDate} onShift={shiftMonth} weekdays={weekdays} lang={lang} />

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">{t('kal_termine_this_day')}</h4>
              <span className="text-[11px] text-muted font-mono">{selectedList.length}</span>
            </div>
            {selectedList.length === 0 ? <p className="text-xs text-muted py-1">{t('kal_no_termine_day')}</p> : (
              <TimelineList>{selectedList.map(tm => <TerminRow key={tm.id} tm={tm} onClick={() => openEdit(tm)} t={t} />)}</TimelineList>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex-1">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('kal_upcoming')}</h4>
            {upcoming.length === 0 ? <p className="text-xs text-muted py-1">{t('kal_no_upcoming')}</p> : (
              <TimelineList>{upcoming.filter(matchFilter).map(tm => <TerminRow key={tm.id} tm={tm} onClick={() => openEdit(tm)} relLabel={relLabel(tm.datum)} t={t} />)}</TimelineList>
            )}
          </div>

          <button onClick={() => setView('agenda')} className="flex items-center justify-center gap-1.5 w-full mt-4 px-3 py-2 rounded-lg text-xs font-medium bg-bg-2 border border-border text-secondary hover:bg-bg-3">
            {t('kal_view_all')} <Icon name="chevronRight" size={13} color="#9aa3ad" />
          </button>
        </Card>
      </div>

      {modal && <TerminModal termin={modal.termin} projekte={projekte} defaultDatum={modal.datum} onClose={() => setModal(null)} onSaved={onSaved} />}
    </div>
  )
}
