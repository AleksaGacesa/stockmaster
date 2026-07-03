import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StockBadge from '../components/StockBadge'
import StatusDot from '../components/StatusDot'
import LiveDuration from '../components/LiveDuration'
import CountUp from '../components/CountUp'
import { useLanguage } from '../hooks/useLanguage'
import {
  fmt, fmtDt, STATUS_META, isOffen, isSpaet, materialGeplantWert,
  projektGewinn, projektRealisierterGewinn, buildReservierungMap,
  projektArbeitsstunden, projektElapsedStunden, projektArbeitskosten, offeneSegmente,
} from '../lib/auftraegeHelpers'
import { STATUS_META as BESTELLUNG_STATUS_META, bestellungTotal } from '../lib/bestellungHelpers'

// Built from `t` since the labels need to react to the language toggle.
const getNextActions = (t) => ({
  geplant:       [{ status: 'aktiv', label: t('auf_action_start') }],
  aktiv:         [{ status: 'pausiert', label: t('auf_action_pause') }, { status: 'abgeschlossen', label: t('auf_action_complete') }],
  pausiert:      [{ status: 'aktiv', label: t('auf_action_resume') }, { status: 'abgeschlossen', label: t('auf_action_complete') }],
  abgeschlossen: [{ status: 'aktiv', label: t('auf_action_reopen') }],
  storniert:     [{ status: 'geplant', label: t('auf_action_reactivate') }],
})

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

/* ══ WORKER RATE CHIPS — reused by ProjektFormModal (new project,
   local-only until saved) and ProjektDetail (live, persists to DB
   on every change) via the onAdd/onRemove/onRateChange/onRateCommit
   callbacks each caller wires up differently ══ */
function WorkerRateChips({ rates, onAdd, onRemove, onRateChange, onRateCommit, disabled }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {rates.map((rate, idx) => (
        <div key={idx}
             className="flex items-center gap-1.5 bg-gradient-to-br from-bg-2 to-bg-3 border border-border rounded-full pl-1 pr-2 py-1 shadow-sm hover:border-amber/50 transition-colors">
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-bg-1 shrink-0"
                style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)' }}>
            {idx + 1}
          </span>
          <input type="number" min="0" value={rate} disabled={disabled}
                 onChange={e => onRateChange(idx, e.target.value)}
                 onBlur={onRateCommit}
                 className="w-12 bg-transparent text-sm font-mono font-semibold outline-none disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <span className="text-[10px] text-muted">€/h</span>
          <button onClick={() => onRemove(idx)} disabled={disabled}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-red hover:bg-red-dim transition-colors disabled:opacity-60">
            <Icon name="x" size={10} color="currentColor" />
          </button>
        </div>
      ))}
      <button onClick={onAdd} disabled={disabled}
              className="flex items-center gap-1 text-xs text-secondary hover:text-amber hover:border-amber/50 border border-dashed border-border rounded-full px-3 py-1.5 transition-colors disabled:opacity-60">
        <Icon name="plus" size={11} color="currentColor" /> {t('auf_worker_add')}
      </button>
      {rates.length > 0 && (
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-dim text-amber">
          {t('auf_total_short')} {fmt(rates.reduce((s, r) => s + (Number(r) || 0), 0))}/h
        </span>
      )}
    </div>
  )
}

/* ══ PROJEKT FORM MODAL ══ */
function ProjektFormModal({ projekt, users, onClose, onSaved }) {
  const isNew = !projekt?.id
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: '', kunde: '', rok: '', verantwortlich_id: '',
    verkaufspreis: 0, notiz: '', arbeitsstunden_pro_woche: 40,
    geplanter_beginn: new Date().toISOString().slice(0, 10),
    ...(projekt || {})
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Only meaningful for a NEW project — these seed the crew's combined
  // rate and, together with the deadline, let a real "Geplant" labor
  // cost be computed once and frozen (see save() below). Editing an
  // existing project's crew still goes through the live chips in
  // ProjektDetail, which never touch the frozen columns.
  const [newWorkerRates, setNewWorkerRates] = useState([])

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const verantwortlich = users.find(u => u.id === form.verantwortlich_id)
    const data = {
      name: form.name.trim(), kunde: form.kunde.trim(), rok: form.rok || null,
      geplanter_beginn: form.geplanter_beginn || null,
      verantwortlich_id: form.verantwortlich_id || null,
      verantwortlich_name: verantwortlich?.display_name ?? '',
      verkaufspreis: Number(form.verkaufspreis) || 0,
      notiz: form.notiz.trim(),
    }
    let err
    if (isNew) {
      const stundenProWoche = Number(form.arbeitsstunden_pro_woche) || 40
      const stundensatz = newWorkerRates.reduce((s, r) => s + (Number(r) || 0), 0)
      // Weeks between the planned START (not "now", which could be
      // long before work actually begins for a job quoted in advance)
      // and the deadline — using "now" here inflated the plan with
      // idle waiting time as if the crew were being paid for it.
      const beginn = form.geplanter_beginn ? new Date(form.geplanter_beginn + 'T00:00:00') : new Date()
      const geplanteWochen = form.rok ? Math.max((new Date(form.rok + 'T23:59:59') - beginn) / (7 * 86400000), 0) : 0
      ;({ error: err } = await supabase.from('projekte').insert({
        ...data,
        erstellt_von: profile?.display_name ?? '', erstellt_von_id: profile?.id ?? null,
        stundensatz, arbeitsstunden_pro_woche: stundenProWoche,
        geplante_arbeiter_anzahl: newWorkerRates.length, geplante_wochen: geplanteWochen,
        geplante_stundensatz: stundensatz, geplante_arbeitskosten: stundensatz * stundenProWoche * geplanteWochen,
      }))
    } else {
      ;({ error: err } = await supabase.from('projekte').update(data).eq('id', projekt.id))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const del = async () => {
    await supabase.from('projekte').delete().eq('id', projekt.id)
    onSaved()
  }

  return (
    // No backdrop-click-to-close here (unlike other modals) — this
    // form is long enough to need scrolling on mobile, and the crew
    // section's number-input keyboard shrinks the viewport (dvh),
    // which shifted the layout enough that a tap meant for a field
    // could land on the backdrop instead and silently discard
    // everything typed so far. Only the explicit X/Cancel dismiss it.
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg-1 border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto">
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{isNew ? t('auf_new_title') : t('auf_edit_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-secondary mb-1">{t('auf_field_name')}</label>
              <input type="text" value={form.name} placeholder="Ograda Müller" autoComplete="off"
                     onChange={e => up('name', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('auf_field_customer')}</label>
              <input type="text" value={form.kunde} placeholder="Müller GmbH" autoComplete="off"
                     onChange={e => up('kunde', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('auf_field_start')}</label>
              <input type="date" value={form.geplanter_beginn ?? ''} onChange={e => up('geplanter_beginn', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('auf_field_deadline')}</label>
              <input type="date" value={form.rok ?? ''} onChange={e => up('rok', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">{t('auf_field_responsible')}</label>
              <select value={form.verantwortlich_id ?? ''} onChange={e => up('verantwortlich_id', e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
                <option value="">{t('auf_select_placeholder')}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
            {!isNew && (
              <div>
                <label className="block text-xs text-secondary mb-1">{t('auf_field_status')}</label>
                <div className="px-3 py-2.5"><StatusBadge status={projekt.status} /></div>
                <p className="text-[11px] text-muted mt-1">{t('auf_status_hint')}</p>
              </div>
            )}
            <div>
              <label className="block text-xs text-secondary mb-1">{t('auf_field_sale_price')}</label>
              <input type="number" min="0" value={form.verkaufspreis} onChange={e => up('verkaufspreis', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            {isNew && (
              <div>
                <label className="block text-xs text-secondary mb-1">{t('auf_field_hours_per_week')}</label>
                <input type="number" min="1" value={form.arbeitsstunden_pro_woche}
                       onChange={e => up('arbeitsstunden_pro_woche', e.target.value)}
                       className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs text-secondary mb-1">{t('auf_field_note')}</label>
              <input type="text" value={form.notiz} placeholder="z.B. Sonderwunsch Farbe RAL 7016" autoComplete="off"
                     onChange={e => up('notiz', e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
            {isNew && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-secondary mb-1.5">{t('auf_worker_label')}</label>
                <WorkerRateChips rates={newWorkerRates}
                  onAdd={() => setNewWorkerRates(r => [...r, r.length ? r[r.length - 1] : 20])}
                  onRemove={(idx) => setNewWorkerRates(r => r.filter((_, i) => i !== idx))}
                  onRateChange={(idx, v) => setNewWorkerRates(r => r.map((x, i) => i === idx ? v : x))}
                  onRateCommit={() => {}} />
                <p className="text-[11px] text-muted mt-1.5">{t('auf_new_crew_hint')}</p>
              </div>
            )}
          </div>
          {error && <p className="text-red text-xs">{error}</p>}
        </div>
        <div className="flex items-center gap-3 px-5 pb-6 flex-wrap">
          <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="check" size={15} color="#181c20" />
            {saving ? t('common_saving') : t('common_save')}
          </button>
          {!isNew && (
            confirmDelete ? (
              <>
                <span className="text-red text-sm">{t('common_delete_confirm')}</span>
                <button onClick={del} className="bg-red text-white text-sm px-3 py-2.5 rounded-xl">{t('common_yes')}</button>
                <button onClick={() => setConfirmDelete(false)}
                        className="bg-bg-2 border border-border text-secondary text-sm px-3 py-2.5 rounded-xl">{t('common_no')}</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 text-red border border-border text-sm px-3 py-2.5 rounded-xl hover:bg-bg-2">
                <Icon name="trash" size={14} color="#e0524a" /> {t('common_delete')}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

/* ══ ADD MATERIAL POPUP ══ */
function AddMaterialPopup({ articles, onClose, onAddMultiple, reservierungMap }) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [items, setItems]   = useState([])
  const [error, setError]   = useState(null)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef(null)

  const q = search.trim().toLowerCase()
  const results = articles
    .filter(a =>
      !items.some(i => i.artikel_id === a.id) &&
      (!q || a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q))
    )
    .slice(0, 150)

  const addItem = (a) => {
    setItems(list => [...list, { artikel_id: a.id, name: a.name, nummer: a.nummer, einheit: a.einheit, preis: a.preis, menge: 1 }])
    setSearch('')
    searchRef.current?.focus()
  }
  const removeItem = (id) => setItems(list => list.filter(i => i.artikel_id !== id))
  const changeMenge = (id, delta) => setItems(list => list.map(i =>
    i.artikel_id === id ? { ...i, menge: Math.max(1, i.menge + delta) } : i
  ))
  const setMengeDirect = (id, val) => setItems(list => list.map(i =>
    i.artikel_id === id ? { ...i, menge: Math.max(1, Number(val) || 1) } : i
  ))

  const confirm = async () => {
    if (items.length === 0) { setError(t('auf_min_one_article')); return }
    setSaving(true); setError(null)
    try {
      await onAddMultiple(items)
      onClose()
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl h-[92dvh] sm:h-[82vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{t('auf_add_material_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Icon name="search" size={14} color="#6b7480" />
            </div>
            <input ref={searchRef} autoFocus value={search} onChange={e => setSearch(e.target.value)}
                   placeholder={t('auf_search_material_ph')}
                   className="w-full bg-bg-2 border border-border rounded-xl pl-9 pr-3 py-3 text-sm outline-none focus:border-amber" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 space-y-1.5 border-b border-border pb-4">
          {results.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">{t('ueb_no_articles')}</p>
          ) : (
            results.map(a => {
              const reserviert = reservierungMap?.[a.id] ?? 0
              const verfuegbar = Math.max(a.menge - reserviert, 0)
              return (
                <button key={a.id} onClick={() => addItem(a)}
                        className="w-full text-left px-3 py-2.5 rounded-xl bg-bg-2 border border-border hover:border-amber hover:bg-bg-3 transition-colors flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-bg-1 text-amber font-semibold text-xs flex items-center justify-center shrink-0">
                    {a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted font-mono">{a.nummer} · {a.lagerort}</div>
                  </div>
                  <StockBadge menge={verfuegbar} mindestbestand={a.mindestbestand} />
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-semibold">{verfuegbar}</div>
                    <div className="text-[10px] text-muted">
                      {reserviert > 0 ? `${reserviert} ${t('auf_reserved')}` : `${a.einheit} ${t('auf_available')}`}
                    </div>
                  </div>
                  <Icon name="plus" size={14} color="#e8821c" />
                </button>
              )
            })
          )}
        </div>

        <div className="shrink-0 px-5 pt-3">
          <p className="text-xs text-secondary font-medium">{t('auf_added_count')} ({items.length})</p>
        </div>
        <div className="shrink-0 max-h-[26vh] overflow-y-auto px-5 py-2 space-y-1.5">
          {items.length === 0 ? (
            <p className="text-xs text-muted text-center py-3">{t('auf_no_articles_added')}</p>
          ) : (
            items.map(i => (
              <div key={i.artikel_id} className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.name}</div>
                  <div className="text-xs text-muted font-mono">{i.nummer}</div>
                </div>
                <button onClick={() => changeMenge(i.artikel_id, -1)}
                        className="w-7 h-7 rounded-md bg-bg-1 border border-border text-sm shrink-0">−</button>
                <input type="number" min="1" value={i.menge} onChange={e => setMengeDirect(i.artikel_id, e.target.value)}
                       className="w-14 bg-bg-1 border border-border rounded-md py-1 text-sm text-center font-mono outline-none focus:border-amber [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <button onClick={() => changeMenge(i.artikel_id, 1)}
                        className="w-7 h-7 rounded-md bg-bg-1 border border-border text-sm shrink-0">+</button>
                <span className="text-xs text-muted w-8 shrink-0">{i.einheit}</span>
                <button onClick={() => removeItem(i.artikel_id)} className="p-1 shrink-0">
                  <Icon name="x" size={13} color="#6b7480" />
                </button>
              </div>
            ))
          )}
        </div>

        {error && <p className="text-red text-xs px-5 pt-2 shrink-0">{error}</p>}

        <div className="p-5 pt-3 shrink-0">
          <button onClick={confirm} disabled={saving || items.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="check" size={15} color="#181c20" />
            {saving ? t('auf_adding') : items.length > 0 ? `${items.length} ${t('auf_add_articles_to_project')}` : t('auf_add_button')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══ PROJEKT DETAIL ══ */
function ProjektDetail({ projekt, articles, onBack, onRefresh, setArticles, alleProjekte, verbrauchMap }) {
  const { t, lang } = useLanguage()
  const NEXT_ACTIONS = getNextActions(t)
  const [material, setMaterial]           = useState([])
  const [verbrauch, setVerbrauch]         = useState({})
  const [loading, setLoading]             = useState(true)
  const [showAddMaterial, setShowAddMaterial] = useState(false)
  const [creating, setCreating]           = useState(false)
  const [error, setError]                 = useState(null)
  const [bestellungen, setBestellungen]   = useState([]) // Bestellungen created for THIS project
  const navigate = useNavigate()
  const [confirmStatus, setConfirmStatus] = useState(null) // status pending confirmation, or null
  const [statusBusy, setStatusBusy]       = useState(false)
  const [arbeiterBusy, setArbeiterBusy]   = useState(false)
  // Each entry is one worker's own €/h. There's no DB column for a
  // list of individual rates, so this lives client-side and its SUM
  // is what actually gets persisted to projekt.stundensatz — the
  // combined crew rate the cost calculation uses. On mount we can
  // only recover the count + the total (not each person's original
  // number), so we split the total evenly as a starting point.
  const [workerRates, setWorkerRates] = useState(() => {
    const seg = offeneSegmente(projekt)[0]
    // Before the project's first zeiterfassung segment exists (e.g. a
    // brand-new "geplant" project), fall back to the headcount frozen
    // at creation so the chips — and therefore the first "Aktiv"
    // activation's zeiterfassung insert — reflect the crew that was
    // actually planned, not zero.
    const count = seg?.arbeiter_anzahl ?? projekt.geplante_arbeiter_anzahl ?? 0
    if (count === 0) return []
    const per = Math.round((Number(projekt.stundensatz ?? 24) / count) * 100) / 100
    return Array.from({ length: count }, () => per)
  })

  // What OTHER open projects have already claimed, so this project's
  // "fehlt im Lager" check doesn't count stock someone else is
  // already counting on.
  const reservierungMap = useMemo(
    () => buildReservierungMap(alleProjekte, verbrauchMap, projekt.id),
    [alleProjekte, verbrauchMap, projekt.id]
  )

  // How much has already been put into a Bestellung LINKED TO THIS
  // PROJECT for each artikel — sourced from the DB (not local state),
  // so it survives reloads and is the same for every user looking at
  // this project, not just whoever clicked the button.
  const bestelltMap = useMemo(() => {
    const map = {}
    bestellungen.forEach(b => {
      ;(b.positionen ?? []).forEach(p => {
        if (!p.artikel_id) return
        map[p.artikel_id] = (map[p.artikel_id] ?? 0) + Number(p.menge)
      })
    })
    return map
  }, [bestellungen])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: mat }, { data: moves }, { data: best }] = await Promise.all([
      supabase.from('projekt_material').select('*').eq('projekt_id', projekt.id).order('created_at'),
      supabase.from('warenbewegungen').select('artikel_id, menge').eq('projekt_id', projekt.id).eq('typ', 'ausgang'),
      supabase.from('bestellungen')
        .select('*, lieferant:lieferanten(id,name), positionen:bestellung_positionen(*)')
        .eq('projekt_id', projekt.id).order('created_at'),
    ])
    if (mat) setMaterial(mat)
    if (best) setBestellungen(best)
    const vb = {}
    ;(moves ?? []).forEach(m => { vb[m.artikel_id] = (vb[m.artikel_id] ?? 0) + Number(m.menge) })
    setVerbrauch(vb)
    setLoading(false)
  }, [projekt.id])

  useEffect(() => { load() }, [load])

  const addMaterialBatch = async (items) => {
    const rows = items.map(i => ({
      projekt_id: projekt.id, artikel_id: i.artikel_id, artikel_name: i.name,
      artikel_nummer: i.nummer, einheit: i.einheit, geplant_menge: i.menge, preis: i.preis,
    }))
    const { error: err } = await supabase.from('projekt_material').insert(rows)
    if (err) throw new Error(err.message)
    await load()
  }

  const removeMaterial = async (id) => {
    await supabase.from('projekt_material').delete().eq('id', id)
    await load()
  }

  // Single place that handles every status transition. Leaving "Aktiv"
  // closes whatever zeiterfassung stretch is still running — the
  // clock only runs while a project is Aktiv. Crew composition itself
  // is only ever changed via persistCrew below, never automatically
  // here.
  const changeStatus = async (newStatus) => {
    if (newStatus === projekt.status) { setConfirmStatus(null); return }
    setStatusBusy(true); setError(null)
    const wasAktiv = projekt.status === 'aktiv'
    const willBeAktiv = newStatus === 'aktiv'

    if (wasAktiv && !willBeAktiv) {
      await supabase.from('projekt_zeiterfassung')
        .update({ ended_at: new Date().toISOString() })
        .eq('projekt_id', projekt.id).is('ended_at', null)
    }
    if (!wasAktiv && willBeAktiv && workerRates.length > 0) {
      await supabase.from('projekt_zeiterfassung')
        .insert({ projekt_id: projekt.id, arbeiter_anzahl: workerRates.length })
    }

    const patch = { status: newStatus }
    if (newStatus === 'abgeschlossen') patch.abgeschlossen_at = new Date().toISOString()
    else if (projekt.status === 'abgeschlossen') patch.abgeschlossen_at = null

    const { error: err } = await supabase.from('projekte').update(patch).eq('id', projekt.id)
    setStatusBusy(false); setConfirmStatus(null)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  // Whenever the crew list changes (someone added/removed, or a rate
  // edited), the total €/h is written to projekt.stundensatz. While
  // the project is Aktiv this also splits the running zeiterfassung
  // stretch: close it now (so hours already worked keep the old
  // headcount), then open a fresh one at the new count.
  const persistCrew = async (rates) => {
    setArbeiterBusy(true)
    if (projekt.status === 'aktiv') {
      await supabase.from('projekt_zeiterfassung')
        .update({ ended_at: new Date().toISOString() })
        .eq('projekt_id', projekt.id).is('ended_at', null)
      if (rates.length > 0) {
        await supabase.from('projekt_zeiterfassung')
          .insert({ projekt_id: projekt.id, arbeiter_anzahl: rates.length })
      }
    }
    const gesamt = rates.reduce((s, r) => s + (Number(r) || 0), 0)
    await supabase.from('projekte').update({ stundensatz: gesamt }).eq('id', projekt.id)
    setArbeiterBusy(false)
    onRefresh()
  }

  const addWorker = () => {
    const next = [...workerRates, workerRates.length ? workerRates[workerRates.length - 1] : 20]
    setWorkerRates(next)
    persistCrew(next)
  }
  const removeWorker = (idx) => {
    const next = workerRates.filter((_, i) => i !== idx)
    setWorkerRates(next)
    persistCrew(next)
  }
  const changeRateLocal = (idx, value) => setWorkerRates(list => list.map((r, i) => i === idx ? value : r))
  const commitRates = () => persistCrew(workerRates.map(r => Number(r) || 0))

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const rows = material.map(m => {
    const artikel = articles.find(a => a.id === m.artikel_id)
    const bestand = artikel?.menge ?? 0
    const reserviertAnderswo = reservierungMap[m.artikel_id] ?? 0
    const verfuegbar = Math.max(bestand - reserviertAnderswo, 0)
    const fehlt = Math.max(m.geplant_menge - verfuegbar, 0)
    const verbrauchtMenge = verbrauch[m.artikel_id] ?? 0
    return { ...m, artikel, bestand, reserviertAnderswo, verfuegbar, fehlt, verbrauchtMenge, diff: verbrauchtMenge - m.geplant_menge, ungeplant: false }
  })
  // Material issued against this project via Warenausgang that was
  // never explicitly planned here still needs to show up — otherwise
  // it's tracked in the DB but invisible on this page.
  const geplanteArtikelIds = new Set(material.map(m => m.artikel_id))
  const ungeplanteRows = Object.entries(verbrauch)
    .filter(([artikelId]) => !geplanteArtikelIds.has(Number(artikelId)))
    .map(([artikelId, menge]) => {
      const artikel = articles.find(a => a.id === Number(artikelId))
      return {
        id: `ungeplant-${artikelId}`, artikel_id: Number(artikelId), artikel,
        artikel_name: artikel?.name ?? 'Unbekannter Artikel', artikel_nummer: artikel?.nummer ?? '',
        einheit: artikel?.einheit ?? 'Stk', geplant_menge: 0, preis: artikel?.preis ?? 0,
        bestand: artikel?.menge ?? 0, fehlt: 0, verbrauchtMenge: menge, diff: menge, ungeplant: true,
      }
    })
  const allRows = [...rows, ...ungeplanteRows]
  const fehlendeRows = rows.filter(r => r.fehlt > 0)
  const materialGeplant = rows.reduce((s, r) => s + r.geplant_menge, 0)
  const materialVerbraucht = allRows.reduce((s, r) => s + r.verbrauchtMenge, 0)
  const materialFortschritt = materialGeplant > 0 ? Math.min(Math.round((materialVerbraucht / materialGeplant) * 100), 100) : 0

  const materialWert = rows.reduce((s, r) => s + r.geplant_menge * r.preis, 0)
  const arbeitsstunden = projektArbeitsstunden(projekt)
  const elapsedStunden = projektElapsedStunden(projekt)
  // Live labor cost — actual elapsed time × the crew's CURRENT
  // combined rate. Keeps ticking as work happens.
  const arbeitskosten = projektArbeitskosten(projekt)
  // Geplant labor cost — frozen at project creation (initial crew ×
  // weekly-hours target × weeks until the deadline). Reducing the
  // crew later only changes projekt.stundensatz (live), never this,
  // so finishing with fewer people than planned shows up as Live
  // profit beating Geplant profit instead of the plan silently
  // shrinking to match reality.
  const geplanteArbeitskosten = Number(projekt.geplante_arbeitskosten ?? 0)
  const gesamtkosten = materialWert + geplanteArbeitskosten
  const gewinn = Number(projekt.verkaufspreis ?? 0) - gesamtkosten
  const materialLiveWert = allRows.reduce((s, r) => s + r.verbrauchtMenge * r.preis, 0)
  const gesamtkostenLive = materialLiveWert + arbeitskosten
  const gewinnLive = Number(projekt.verkaufspreis ?? 0) - gesamtkostenLive
  const geplantLaborLabel = lang === 'en'
    ? `${(projekt.geplante_wochen ?? 0).toFixed(1)} wks × ${projekt.arbeitsstunden_pro_woche ?? 40}h/wk × ${fmt(projekt.geplante_stundensatz ?? 0)}`
    : `${(projekt.geplante_wochen ?? 0).toFixed(1)} Wochen × ${projekt.arbeitsstunden_pro_woche ?? 40}Std/Woche × ${fmt(projekt.geplante_stundensatz ?? 0)}`
  const offene = offeneSegmente(projekt)
  const aktivSeit = offene.length > 0
    ? Math.min(...offene.map(s => new Date(s.started_at).getTime()))
    : null

  // Only the artikel whose shortfall hasn't already been ordered (or
  // whose shortfall grew since) actually need a fresh Bestellung —
  // this is what keeps the button from re-adding the same quantity
  // on every click.
  const zuBestellen = fehlendeRows
    .map(r => ({ r, delta: r.fehlt - (bestelltMap[r.artikel_id] ?? 0) }))
    .filter(x => x.delta > 0)

  const erstelleBestellungen = async () => {
    if (zuBestellen.length === 0) return
    setCreating(true); setError(null)
    try {
      for (const { r, delta } of zuBestellen) {
        if (!r.artikel?.lieferant_id) continue
        // A dedicated draft per Lieferant, scoped to this project —
        // so its status only ever reflects this project's own order,
        // never gets silently shared with another project's shortage.
        const { data: existing } = await supabase.from('bestellungen')
          .select('id').eq('lieferant_id', r.artikel.lieferant_id).eq('status', 'entwurf')
          .eq('projekt_id', projekt.id).maybeSingle()
        let bestellungId = existing?.id
        if (!bestellungId) {
          const { data: created, error: cErr } = await supabase.from('bestellungen').insert({
            lieferant_id: r.artikel.lieferant_id, notiz: `Für Projekt: ${projekt.name}`, projekt_id: projekt.id,
          }).select('id').single()
          if (cErr) throw new Error(cErr.message)
          bestellungId = created.id
        }
        const { data: existingPos } = await supabase.from('bestellung_positionen')
          .select('id, menge').eq('bestellung_id', bestellungId).eq('artikel_id', r.artikel.id).maybeSingle()
        if (existingPos) {
          await supabase.from('bestellung_positionen')
            .update({ menge: Number(existingPos.menge) + delta }).eq('id', existingPos.id)
        } else {
          await supabase.from('bestellung_positionen').insert({
            bestellung_id: bestellungId, artikel_id: r.artikel.id, artikel_name: r.artikel.name,
            artikel_nummer: r.artikel.nummer, einheit: r.artikel.einheit, menge: delta, preis: r.artikel.preis,
          })
        }
      }
      await load()
    } catch (e) {
      setError(e.message)
    }
    setCreating(false)
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-secondary text-sm mb-4 hover:text-primary transition-colors">
        <Icon name="chevronLeft" size={16} color="currentColor" /> {t('auf_all_projects')}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-3 flex-wrap">
            {projekt.name}
            <StatusBadge status={projekt.status} />
            {isSpaet(projekt) && (
              <span className="text-xs font-medium px-2 py-1 rounded-md bg-red-dim text-red">{t('ad_late')}</span>
            )}
          </h1>
          {projekt.dokument_nr && <p className="text-xs text-muted font-mono mt-1">{projekt.dokument_nr}</p>}
          <p className="text-secondary text-sm mt-1">
            {projekt.kunde || '—'}{projekt.geplanter_beginn ? ` · ${t('auf_field_start')}: ${fmtDt(projekt.geplanter_beginn)}` : ''}{projekt.rok ? ` · ${t('auf_field_deadline')}: ${fmtDt(projekt.rok)}` : ''}{projekt.verantwortlich_name ? ` · ${projekt.verantwortlich_name}` : ''}
          </p>
          {projekt.status === 'abgeschlossen' && projekt.abgeschlossen_at && (
            <p className="text-xs text-green mt-1">{t('auf_completed_on')} {fmtDt(projekt.abgeschlossen_at)}</p>
          )}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="user" size={13} color="#6b7480" />
              <span className="text-xs text-secondary">{t('auf_worker_label')}</span>
            </div>
            <WorkerRateChips rates={workerRates}
              onAdd={addWorker} onRemove={removeWorker}
              onRateChange={changeRateLocal} onRateCommit={commitRates}
              disabled={arbeiterBusy} />
            {aktivSeit && (
              <p className="text-xs text-blue mt-2 flex items-center gap-1.5">
                {t('auf_active_since')} <LiveDuration since={aktivSeit} color="#4a90d9" />
              </p>
            )}
          </div>
        </div>
        {confirmStatus ? (
          <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2 flex-wrap">
            <span className="text-xs text-secondary">
              {lang === 'en' ? `Mark as "${t('status_' + confirmStatus)}"?` : `Als "${t('status_' + confirmStatus)}" markieren?`}
            </span>
            <button onClick={() => changeStatus(confirmStatus)} disabled={statusBusy}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              {t('common_yes')}
            </button>
            <button onClick={() => setConfirmStatus(null)} disabled={statusBusy}
                    className="text-xs bg-bg-1 border border-border text-secondary px-2.5 py-1.5 rounded-lg">
              {t('common_no')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {(NEXT_ACTIONS[projekt.status] ?? []).map(a => (
              <button key={a.status} onClick={() => setConfirmStatus(a.status)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                {a.label}
              </button>
            ))}
            {['geplant', 'aktiv', 'pausiert'].includes(projekt.status) && (
              <button onClick={() => setConfirmStatus('storniert')}
                      className="text-xs text-muted hover:text-red">
                {t('auf_cancel_project')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 mt-4">
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('auf_material_progress')}</div>
          <div className="text-lg font-bold font-mono"><CountUp value={materialFortschritt} format={n => `${Math.round(n)}%`} /></div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('auf_work_hours')}</div>
          <div className="text-lg font-bold font-mono"><CountUp value={arbeitsstunden} format={n => n.toFixed(1)} /></div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('auf_sale_price')}</div>
          <div className="text-lg font-bold font-mono"><CountUp value={projekt.verkaufspreis} format={fmt} /></div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('auf_profit')}</div>
          <div className={`text-lg font-bold font-mono ${gewinn >= 0 ? 'text-green' : 'text-red'}`}><CountUp value={gewinn} format={fmt} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs font-semibold text-secondary mb-2.5 uppercase tracking-wide">{t('auf_costs_planned')}</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-secondary">
              <span>{t('auf_material_costs')}</span><span className="font-mono">{fmt(materialWert)}</span>
            </div>
            <div className="flex justify-between text-secondary">
              <span>{t('auf_labor_costs')} ({geplantLaborLabel})</span>
              <span className="font-mono">{fmt(geplanteArbeitskosten)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-1.5">
              <span>{t('auf_total_costs')}</span><span className="font-mono">{fmt(gesamtkosten)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-muted">{t('auf_profit')}</span>
              <span className={`font-mono font-semibold ${gewinn >= 0 ? 'text-green' : 'text-red'}`}>{fmt(gewinn)}</span>
            </div>
          </div>
        </Card>
        <Card className="p-4" style={{ borderColor: '#4a90d955' }}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#4a90d9' }} />
              <span className="relative inline-flex rounded-full w-full h-full" style={{ background: '#4a90d9' }} />
            </span>
            <span className="text-xs font-semibold text-blue uppercase tracking-wide">{t('auf_costs_live')}</span>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-secondary">
              <span>{t('auf_material_costs')}</span><span className="font-mono">{fmt(materialLiveWert)}</span>
            </div>
            <div className="flex justify-between text-secondary">
              <span>{t('auf_labor_costs')} ({elapsedStunden.toFixed(1)} {t('auf_hours_word')} × {fmt(projekt.stundensatz ?? 24)} {t('auf_crew_word')})</span>
              <span className="font-mono">{fmt(arbeitskosten)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-1.5">
              <span>{t('auf_total_costs')}</span><span className="font-mono">{fmt(gesamtkostenLive)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-muted">{t('auf_profit')}</span>
              <span className={`font-mono font-semibold ${gewinnLive >= 0 ? 'text-green' : 'text-red'}`}>{fmt(gewinnLive)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-secondary">{t('auf_material_consumed')}</span>
          <span className="font-mono">{materialVerbraucht} / {materialGeplant}</span>
        </div>
        <div className="h-2.5 bg-bg-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${materialFortschritt}%`, background: materialFortschritt > 100 ? '#e0524a' : '#4a90d9' }} />
        </div>
      </Card>

      {fehlendeRows.length > 0 && (
        <Card className="p-4 mb-4 border-amber/40 bg-amber-dim">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="alert" size={15} color="#e8821c" />
            <span className="text-sm font-medium text-amber">{fehlendeRows.length} {t('auf_articles_missing')}</span>
          </div>
          {zuBestellen.length === 0 ? (
            <p className="text-green text-sm flex items-center gap-2">
              <Icon name="check" size={15} color="#4caf6e" /> {t('auf_orders_created_all')}
            </p>
          ) : (
            <button onClick={erstelleBestellungen} disabled={creating}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              <Icon name="truck" size={15} color="#181c20" />
              {creating ? t('auf_orders_creating') : `${t('auf_orders_create')} (${zuBestellen.length})`}
            </button>
          )}
          {error && <p className="text-red text-xs mt-2">{error}</p>}
        </Card>
      )}

      {bestellungen.length > 0 && (
        <Card className="overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-sm">{t('auf_orders_for_project')}</h3>
          </div>
          <div className="divide-y divide-border">
            {bestellungen.map(b => {
              const meta = BESTELLUNG_STATUS_META[b.status] ?? BESTELLUNG_STATUS_META.entwurf
              return (
                <button key={b.id} onClick={() => navigate(`/lieferanten?tab=bestellungen&bestellung=${b.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.lieferant?.name ?? '—'}</div>
                    <div className="text-xs text-muted">{b.dokument_nr || `${t('auf_order_hash')} #${b.id}`} · {fmtDt(b.created_at)}</div>
                  </div>
                  <span className="text-xs font-mono text-secondary shrink-0">{fmt(bestellungTotal(b))}</span>
                  <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                        style={{ background: meta.color + '1a', color: meta.color }}>
                    <StatusDot color={meta.color} pulse={b.status === 'gesendet'} size={6} />
                    {t('status_' + b.status)}
                  </span>
                  <Icon name="chevronRight" size={14} color="#6b7480" />
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-medium text-sm">{t('auf_material_title')}</h3>
          <button onClick={() => setShowAddMaterial(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="plus" size={12} color="#181c20" /> {t('auf_material_title')}
          </button>
        </div>
        {allRows.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">{t('auf_no_material_planned')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-2">
                  {[t('bew_col_article'), t('auf_col_planned'), t('auf_col_stock'), t('auf_col_consumed'), t('inv_difference'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium flex items-center gap-1.5">
                        {r.artikel_name}
                        {r.ungeplant && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-dim text-amber">{t('auf_unplanned')}</span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted">{r.artikel_nummer}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">{r.ungeplant ? '—' : `${r.geplant_menge} ${r.einheit}`}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.ungeplant ? (
                        <span className="text-muted text-xs">—</span>
                      ) : r.fehlt > 0 ? (
                        <span className="flex items-center gap-1 text-red text-xs">
                          <Icon name="x" size={12} color="#e0524a" /> {t('auf_missing')} {r.fehlt}
                          {r.reserviertAnderswo > 0 && <span className="text-muted">({r.reserviertAnderswo} {t('auf_reserved_elsewhere')})</span>}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green text-xs">
                          <Icon name="check" size={12} color="#4caf6e" /> {r.verfuegbar} {t('auf_available')}
                          {r.reserviertAnderswo > 0 && <span className="text-muted">({r.reserviertAnderswo} {t('auf_reserved')})</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">{r.verbrauchtMenge} {r.einheit}</td>
                    <td className={`px-4 py-2.5 font-mono whitespace-nowrap ${r.diff === 0 ? 'text-muted' : r.diff > 0 ? 'text-red' : 'text-secondary'}`}>
                      {r.ungeplant ? '—' : r.diff === 0 ? '—' : (r.diff > 0 ? '+' : '') + r.diff}
                    </td>
                    <td className="px-4 py-2.5">
                      {!r.ungeplant && (
                        <button onClick={() => removeMaterial(r.id)} className="p-1.5 rounded-lg hover:bg-bg-3">
                          <Icon name="trash" size={13} color="#6b7480" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {projekt.notiz && (
        <Card className="p-4">
          <div className="text-xs text-secondary mb-1">{t('auf_field_note')}</div>
          <p className="text-sm">{projekt.notiz}</p>
        </Card>
      )}

      {showAddMaterial && (
        <AddMaterialPopup articles={articles} onClose={() => setShowAddMaterial(false)} onAddMultiple={addMaterialBatch}
                          reservierungMap={reservierungMap} />
      )}
    </div>
  )
}

/* ══ MAIN PAGE ══ */
export default function AuftraegePage({ articles, setArticles }) {
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [projekte, setProjekte]   = useState([])
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('Alle')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [activeId, setActiveId]   = useState(null)
  const [verbrauchMap, setVerbrauchMap] = useState({}) // { [projektId]: { [artikelId]: mengeVerbraucht } }

  const load = useCallback(async () => {
    const [{ data: p }, { data: u }, { data: moves }] = await Promise.all([
      supabase.from('projekte').select('*, material:projekt_material(*), zeiterfassung:projekt_zeiterfassung(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('warenbewegungen').select('projekt_id, artikel_id, menge').eq('typ', 'ausgang').not('projekt_id', 'is', null),
    ])
    if (p) setProjekte(p)
    if (u) setUsers(u)
    const vm = {}
    ;(moves ?? []).forEach(m => {
      vm[m.projekt_id] = vm[m.projekt_id] ?? {}
      vm[m.projekt_id][m.artikel_id] = (vm[m.projekt_id][m.artikel_id] ?? 0) + Number(m.menge)
    })
    setVerbrauchMap(vm)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Arriving from the Dashboard's "Anstehende Fristen" (?projekt=5).
  useEffect(() => {
    const urlProjekt = searchParams.get('projekt')
    if (urlProjekt) setActiveId(Number(urlProjekt))
  }, []) // eslint-disable-line

  const openNew  = () => { setEditing(null); setShowModal(true) }
  const openEdit = (p) => { setEditing(p); setShowModal(true) }
  const onSaved  = async () => { setShowModal(false); await load() }
  const refresh  = async () => { await load() }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const active = projekte.find(p => p.id === activeId)
  if (active) {
    return (
      <ProjektDetail projekt={active} articles={articles} onBack={() => setActiveId(null)}
                     onRefresh={refresh} setArticles={setArticles}
                     alleProjekte={projekte} verbrauchMap={verbrauchMap} />
    )
  }

  const filtered = projekte.filter(p => {
    const q = search.toLowerCase()
    return (
      (!q || p.name.toLowerCase().includes(q) || p.kunde.toLowerCase().includes(q)) &&
      (filterStatus === 'Alle' || p.status === filterStatus)
    )
  })

  const aktiveCount = projekte.filter(p => p.status === 'aktiv').length
  const kasneCount  = projekte.filter(isSpaet).length
  const realGewinn = (p) => projektRealisierterGewinn(p, verbrauchMap, articles)

  const erwarteterGewinn = projekte.filter(p => isOffen(p.status)).reduce((s, p) => s + projektGewinn(p), 0)
  const realisierterGewinn = projekte.filter(p => p.status === 'abgeschlossen').reduce((s, p) => s + realGewinn(p), 0)

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('auf_title')}</h1>
          <p className="text-secondary text-sm">{t('auf_subtitle')}</p>
        </div>
        <button onClick={openNew}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
          <Icon name="plus" size={15} color="#181c20" /> {t('auf_new_project')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-5">
        <Card className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="text-xs text-muted mb-1">{t('ad_active_projects')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={aktiveCount} /></div>
        </Card>
        <Card className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="text-xs text-muted mb-1">{t('ad_late')}</div>
          <div className={`text-lg sm:text-xl font-bold font-mono ${kasneCount > 0 ? 'text-red' : ''}`}><CountUp value={kasneCount} /></div>
        </Card>
        <Card className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="text-xs text-muted mb-1">{t('ad_expected_profit')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono"><CountUp value={erwarteterGewinn} format={fmt} /></div>
        </Card>
        <Card className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="text-xs text-muted mb-1">{t('ad_realized_profit')}</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-green"><CountUp value={realisierterGewinn} format={fmt} /></div>
        </Card>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center mb-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="relative flex-1 min-w-[160px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('auf_search_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="Alle">{t('auf_all_status')}</option>
          {Object.entries(STATUS_META).map(([k]) => <option key={k} value={k}>{t('status_' + k)}</option>)}
        </select>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Icon name="clipboard" size={28} color="#6b7480" />
          <p className="text-secondary text-sm mt-3">{t('auf_no_projects')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            return (
              <Card key={p.id} className="p-4 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:border-border-strong sm:hover:-translate-y-0.5 sm:hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.3)] transition-all duration-200"
                    onClick={() => setActiveId(p.id)}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <p className="text-xs text-muted truncate">{p.kunde || '—'}</p>
                    {p.dokument_nr && <p className="text-[10px] text-muted font-mono truncate">{p.dokument_nr}</p>}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-secondary mb-3">
                  <span>{p.rok ? fmtDt(p.rok) : t('auf_no_deadline')}</span>
                  {isSpaet(p) && <span className="text-red font-medium">{t('ad_late')}</span>}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-secondary text-xs">{p.status === 'abgeschlossen' ? t('auf_profit_realized') : t('auf_profit_planned')}</span>
                  <span className={`font-mono font-semibold ${
                    (p.status === 'abgeschlossen' ? realGewinn(p) : projektGewinn(p)) >= 0 ? 'text-green' : 'text-red'
                  }`}>
                    {fmt(p.status === 'abgeschlossen' ? realGewinn(p) : projektGewinn(p))}
                  </span>
                </div>
                <button onClick={e => { e.stopPropagation(); openEdit(p) }}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 bg-bg-2 border border-border rounded-lg py-1.5 text-xs text-secondary hover:bg-bg-3 transition-colors">
                  <Icon name="edit" size={12} color="#9aa3ad" /> {t('common_edit')}
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {showModal && (
        <ProjektFormModal projekt={editing} users={users} onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
    </div>
  )
}
