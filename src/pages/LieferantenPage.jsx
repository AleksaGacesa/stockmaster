import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StockBadge from '../components/StockBadge'
import StatusDot from '../components/StatusDot'
import ArtikelBild from '../components/ArtikelBild'
import DonutChart from '../components/DonutChart'
import { useLanguage } from '../hooks/useLanguage'
import {
  fmt, fmtDt, STATUS_META, bestellungTotal, bestellungBrutto,
  buildLastPurchaseMap, buildUnterwegsMap, daysAgo, lowStockForLieferant,
} from '../lib/bestellungHelpers'
import { printQrLabels } from '../lib/printQrLabels'

function StatusBadge({ status }) {
  const { t } = useLanguage()
  const m = STATUS_META[status] ?? STATUS_META.entwurf
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <StatusDot color={m.color} pulse={status === 'gesendet'} size={6} />
      {t('status_' + status)}
    </span>
  )
}

/* ══ LIEFERANT FORM MODAL ══ */
function LieferantFormModal({ lieferant, onClose, onSaved }) {
  const { t } = useLanguage()
  const isNew = !lieferant?.id
  const [form, setForm] = useState({
    name: '', email: '', telefon: '', ansprechpartner: '', adresse: '', notiz: '', bestellnachricht: '', steuersatz: 19,
    bewertung: 0, lieferzeit: '', versandart: '',
    ...(lieferant || {})
  })
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const data = {
      name: form.name.trim(), email: form.email.trim(), telefon: form.telefon.trim(),
      ansprechpartner: form.ansprechpartner.trim(), adresse: form.adresse.trim(), notiz: form.notiz.trim(),
      bestellnachricht: form.bestellnachricht.trim(), steuersatz: Number(form.steuersatz) || 0,
      bewertung: Math.min(Math.max(Number(form.bewertung) || 0, 0), 5),
      lieferzeit: form.lieferzeit.trim(), versandart: form.versandart.trim(),
    }
    const { error: err } = isNew
      ? await supabase.from('lieferanten').insert(data)
      : await supabase.from('lieferanten').update(data).eq('id', lieferant.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const del = async () => {
    const { error: err } = await supabase.from('lieferanten').delete().eq('id', lieferant.id)
    if (err) { setError(t('lief_delete_blocked')); setConfirmDelete(false); return }
    onSaved()
  }

  const fields = [
    { k: 'name',            label: t('lief_field_name'),   ph: 'Würth GmbH', full: true },
    { k: 'email',           label: t('lief_field_email'),  ph: 'einkauf@firma.de' },
    { k: 'telefon',         label: t('lief_field_phone'),  ph: '+49 30 1234567' },
    { k: 'ansprechpartner', label: t('lief_field_contact'), ph: 'Max Mustermann' },
    { k: 'adresse',         label: t('lief_field_address'), ph: 'Musterstraße 1, 12345 Berlin' },
    { k: 'steuersatz',      label: t('lief_field_tax'),    ph: '19', type: 'number' },
    { k: 'bewertung',       label: t('lief_field_rating'), ph: '4,5', type: 'number' },
    { k: 'lieferzeit',      label: t('lief_field_leadtime'), ph: '2-3 Tage' },
    { k: 'versandart',      label: t('lief_field_shipping'), ph: 'Standard / Express' },
    { k: 'notiz',           label: t('lief_field_note'),   ph: 'z.B. Zahlungsziel 30 Tage', full: true },
    { k: 'bestellnachricht', label: t('lief_field_default_message'),
      ph: 'z.B. "Bitte Lieferung Mo–Fr 8–16 Uhr, Anlieferung über den Hof."', full: true },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{isNew ? t('lief_new') : t('lief_edit')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.k} className={f.full ? 'sm:col-span-2' : ''}>
                <label className="block text-xs text-secondary mb-1">{f.label}</label>
                <input type={f.type ?? 'text'} value={form[f.k]} placeholder={f.ph} autoComplete="off"
                       onChange={e => up(f.k, e.target.value)}
                       className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
              </div>
            ))}
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

/* ══ ARTIKEL → BESTELLUNG POPUP ══ */
function AddToBestellungPopup({ artikel, lieferanten, onClose, onAdd, lastPurchase, unterwegs }) {
  const { t, lang } = useLanguage()
  const suggested = Math.max(1, Math.ceil(artikel.mindestbestand * 1.5) - artikel.menge)
  const [menge, setMenge]           = useState(suggested)
  const [lieferantId, setLieferantId] = useState(artikel.lieferant_id ?? '')
  const [error, setError]           = useState(null)
  const [saving, setSaving]         = useState(false)

  const letzte = lastPurchase[artikel.id]
  const letzteTage = letzte ? daysAgo(letzte.created_at) : null
  const unterwegsMenge = unterwegs[artikel.id] ?? 0
  const showWarning = (letzteTage !== null && letzteTage <= 14) || unterwegsMenge > 0

  const confirm = async () => {
    if (!lieferantId) { setError(t('lief_select_supplier_ph')); return }
    if (!menge || menge <= 0) { setError(lang === 'en' ? 'Quantity must be greater than 0.' : 'Menge muss größer als 0 sein.'); return }
    setSaving(true); setError(null)
    try {
      await onAdd(artikel, Number(lieferantId), menge)
      onClose()
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{t('lief_add_to_order')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="font-medium text-sm">{artikel.name}</div>
            <div className="text-xs text-muted font-mono mt-0.5">{artikel.nummer} · {t('inv_system_label')}: {artikel.menge} {artikel.einheit}</div>
          </div>
          {showWarning && (
            <div className="flex items-start gap-2 text-xs text-amber bg-amber-dim rounded-xl px-3 py-2.5">
              <Icon name="alert" size={14} color="#e8821c" className="mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {letzteTage !== null && letzteTage <= 14 && (
                  <div>{lang === 'en'
                    ? `This article was ordered ${letzteTage === 0 ? 'today' : `${letzteTage} day${letzteTage === 1 ? '' : 's'} ago`}.`
                    : `Dieser Artikel wurde vor ${letzteTage === 0 ? 'heute' : `${letzteTage} Tag${letzteTage === 1 ? '' : 'en'}`} bestellt.`}</div>
                )}
                {unterwegsMenge > 0 && (
                  <div>{t('lief_already_word')} {unterwegsMenge} {artikel.einheit} {t('lief_already_in_transit')}</div>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-secondary mb-1">{t('lief_supplier')}</label>
            <select value={lieferantId} onChange={e => setLieferantId(e.target.value)}
                    className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
              <option value="">{t('lief_select_supplier_ph')}</option>
              {lieferanten.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">{t('ueb_col_qty')} ({artikel.einheit})</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setMenge(m => Math.max(1, m - 1))}
                      className="w-9 h-9 rounded-xl bg-bg-2 border border-border text-lg shrink-0">−</button>
              <input type="number" min="1" value={menge}
                     onChange={e => setMenge(Math.max(1, Number(e.target.value) || 1))}
                     className="font-mono text-2xl font-bold flex-1 w-0 text-center bg-bg-2 border border-border rounded-xl py-1 outline-none focus:border-amber [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button onClick={() => setMenge(m => m + 1)}
                      className="w-9 h-9 rounded-xl bg-bg-2 border border-border text-lg shrink-0">+</button>
            </div>
          </div>
          {error && <p className="text-red text-xs">{error}</p>}
        </div>
        <div className="px-5 pb-6">
          <button onClick={confirm} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="check" size={15} color="#181c20" />
            {saving ? t('auf_adding') : t('lief_add_to_order')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══ ARTIKEL BESTELLEN TAB — Bestell-Dashboard ══ */
const bestandStatus = (a) => a.menge < a.mindestbestand ? 'niedrig'
  : a.menge < a.mindestbestand * 1.5 ? 'knapp' : 'ausreichend'
const BESTAND_META = {
  ausreichend: { labelKey: 'lief_status_ausreichend', color: '#4caf6e' },
  knapp:       { labelKey: 'lief_status_knapp',       color: '#e8821c' },
  niedrig:     { labelKey: 'lief_status_niedrig',     color: '#e0524a' },
  bestellt:    { labelKey: 'lief_status_bestellt',    color: '#9aa3ad' },
}

function BestandBadge({ status }) {
  const { t } = useLanguage()
  const m = BESTAND_META[status]
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <StatusDot color={m.color} pulse={status === 'niedrig'} size={6} />
      {t(m.labelKey)}
    </span>
  )
}

function Sterne({ value }) {
  if (!value || Number(value) <= 0) return <span className="text-muted text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Icon name="star" size={11} color="#e8b23c" />
      <span className="font-mono font-semibold">{Number(value).toFixed(1).replace('.', ',')}</span>
    </span>
  )
}

function LiefSparkline({ points, color }) {
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

function LiefStatCard({ label, value, sub, subColor, icon, color, spark }) {
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
          <div className="text-lg font-bold font-mono truncate">{value}</div>
          <div className="text-[11px] mt-0.5 truncate" style={{ color: subColor ?? 'rgb(var(--text-muted))' }}>
            {sub ?? ' '}
          </div>
        </div>
        {spark && <LiefSparkline points={spark} color={color} />}
      </div>
    </Card>
  )
}

function ArtikelBestellenTab({ articles, onOpenAdd, justAdded, lastPurchase, unterwegs,
                                lieferanten, bestellungen, onShowLieferanten, onOpenBestellung }) {
  const { t, lang } = useLanguage()
  const [search, setSearch] = useState('')
  const [filterBestand, setFilterBestand]     = useState('alle')
  const [filterKategorie, setFilterKategorie] = useState('alle')
  const [filterLieferant, setFilterLieferant] = useState('alle')
  const [view, setView] = useState('tabelle')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [showAllAct, setShowAllAct] = useState(false)

  useEffect(() => { setPage(0) }, [search, filterBestand, filterKategorie, filterLieferant])

  // The card stretches to the bottom of the viewport, so the page size
  // adapts to how many ~57px rows actually fit instead of a fixed 10.
  // Measured from the card's top edge (stable regardless of row count,
  // so no feedback loop), re-measured on window resize.
  const tableTopRef = useRef(null)
  const [pageSize, setPageSize] = useState(10)
  useEffect(() => {
    const calc = () => {
      const el = tableTopRef.current
      if (!el || el.offsetParent === null) return
      const avail = window.innerHeight - el.getBoundingClientRect().top - 46 - 36 - 40
      setPageSize(Math.min(Math.max(Math.floor(avail / 57), 8), 30))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const liefById = useMemo(() => new Map(lieferanten.map(l => [l.id, l])), [lieferanten])
  const kategorien = useMemo(() => [...new Set(articles.map(a => a.kategorie).filter(Boolean))].sort(), [articles])

  /* ── headline stats ── */
  const jetzt = new Date()
  const wocheAgo = new Date(Date.now() - 7 * 86400000)
  const sameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  const offene = bestellungen.filter(b => b.status !== 'eingetroffen')
  const inTransit = bestellungen.filter(b => b.status === 'gesendet' || b.status === 'bestaetigt')
  const neueWoche = bestellungen.filter(b => new Date(b.created_at) >= wocheAgo).length
  const eingetroffenMonat = bestellungen.filter(b => b.eingetroffen_at && sameMonth(new Date(b.eingetroffen_at), jetzt))
  const eingetroffenWoche = bestellungen.filter(b => b.eingetroffen_at && new Date(b.eingetroffen_at) >= wocheAgo).length
  const wertMonat = bestellungen
    .filter(b => sameMonth(new Date(b.created_at), jetzt))
    .reduce((s, b) => s + bestellungTotal(b), 0)
  const bewertete = lieferanten.filter(l => Number(l.bewertung) > 0)
  const avgBewertung = bewertete.length
    ? bewertete.reduce((s, l) => s + Number(l.bewertung), 0) / bewertete.length
    : null

  const sparks = useMemo(() => {
    const erstellt = [], erhalten = [], wert = []
    for (let i = 5; i >= 0; i--) {
      const von = new Date(Date.now() - (i + 1) * 7 * 86400000)
      const bis = new Date(Date.now() - i * 7 * 86400000)
      erstellt.push(bestellungen.filter(b => { const d = new Date(b.created_at); return d >= von && d < bis }).length)
      erhalten.push(bestellungen.filter(b => { const d = b.eingetroffen_at && new Date(b.eingetroffen_at); return d && d >= von && d < bis }).length)
    }
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1)
      wert.push(bestellungen.filter(b => sameMonth(new Date(b.created_at), ref)).reduce((s, b) => s + bestellungTotal(b), 0))
    }
    // No rating history exists — the sorted current ratings stand in as
    // a decorative but real-data line.
    const bewertungen = lieferanten.map(l => Number(l.bewertung)).filter(v => v > 0).sort((a, b) => a - b)
    return { erstellt, erhalten, wert, bewertungen: bewertungen.length > 1 ? bewertungen : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestellungen, lieferanten])

  const wertDelta = (() => {
    const prev = sparks.wert[4], cur = sparks.wert[5]
    if (!prev) return null
    const d = ((cur - prev) / Math.abs(prev)) * 100
    return `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}% ${t('auf_vs_last_month')}`
  })()
  const bewertungWort = avgBewertung === null ? null
    : avgBewertung >= 4.5 ? t('lief_sehr_gut') : avgBewertung >= 3.5 ? t('lief_gut') : t('lief_okay')

  /* ── article filtering + paging ── */
  const artStatus = (a) => unterwegs[a.id] > 0 ? 'bestellt' : bestandStatus(a)
  const filtered = articles.filter(a => {
    const q = search.toLowerCase()
    const st = bestandStatus(a)
    return (
      (!q || a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q) || (a.lieferant ?? '').toLowerCase().includes(q)) &&
      (filterBestand === 'alle' || st === filterBestand) &&
      (filterKategorie === 'alle' || a.kategorie === filterKategorie) &&
      (filterLieferant === 'alle' || a.lieferant_id === Number(filterLieferant))
    )
  })
  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const from = filtered.length === 0 ? 0 : safePage * pageSize + 1
  const to = Math.min((safePage + 1) * pageSize, filtered.length)

  /* ── right panel data ── */
  const donutData = useMemo(() => {
    const counts = { ausreichend: 0, niedrig: 0, knapp: 0, bestellt: 0 }
    articles.forEach(a => { counts[artStatus(a)] += 1 })
    return [
      { label: t('lief_status_ausreichend'), value: counts.ausreichend, color: '#4caf6e' },
      { label: t('lief_status_niedrig'),     value: counts.niedrig,     color: '#e0524a' },
      { label: t('lief_status_knapp'),       value: counts.knapp,       color: '#e8821c' },
      { label: t('lief_status_bestellt'),    value: counts.bestellt,    color: '#9aa3ad' },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, unterwegs, t])
  const niedrigList = articles.filter(a => bestandStatus(a) === 'niedrig').slice(0, 5)
  const topLief = [...lieferanten].filter(l => Number(l.bewertung) > 0)
    .sort((a, b) => Number(b.bewertung) - Number(a.bewertung)).slice(0, 5)

  const activities = useMemo(() => {
    const out = []
    bestellungen.forEach(b => {
      const nr = b.dokument_nr ?? `#${b.id}`
      const name = b.lieferant?.name ?? ''
      out.push({ at: b.created_at, icon: 'plus', color: '#4a90d9', text: t('lief_akt_erstellt'), sub: `${nr} ${t('lief_an')} ${name}`, id: b.id })
      if (b.gesendet_at) out.push({ at: b.gesendet_at, icon: 'mail', color: '#e8821c', text: t('lief_akt_gesendet'), sub: `${nr} ${t('lief_an')} ${name}`, id: b.id })
      if (b.eingetroffen_at) out.push({ at: b.eingetroffen_at, icon: 'check', color: '#4caf6e', text: t('lief_akt_erhalten'), sub: `${nr} ${t('lief_von')} ${name}`, id: b.id })
    })
    return out.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [bestellungen, t])
  const fmtAkt = (ts) => {
    const d = new Date(ts)
    const heute = new Date().toDateString() === d.toDateString()
    const zeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d)
    return heute ? `${t('mon_heute')}, ${zeit}` : `${fmtDt(d)}`
  }

  /* ── shared article row (compact list, mobile + Karten view) ── */
  const compactList = (
    <div className="space-y-1.5">
      {paged.map(a => (
        <div key={a.id} className="bg-bg-1 border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 hidden sm:block">
            <ArtikelBild artikel={a} iconSize={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm truncate flex-1">{a.name}</span>
              <StockBadge menge={a.menge} mindestbestand={a.mindestbestand} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted min-w-0">
              <span className="font-mono text-amber shrink-0">{a.nummer}</span>
              <span className="font-mono shrink-0">{a.menge} {a.einheit}</span>
              {a.lieferant && <span className="truncate">· {a.lieferant}</span>}
            </div>
            {lastPurchase[a.id] && (
              <div className="text-[11px] text-muted mt-0.5">
                {t('lief_last_purchase')}: {fmtDt(lastPurchase[a.id].created_at)} · {lastPurchase[a.id].menge} {a.einheit} ·{' '}
                {fmt(lastPurchase[a.id].preis ?? 0)}/{a.einheit}
              </div>
            )}
          </div>
          <button onClick={() => onOpenAdd(a)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="plus" size={13} color="#181c20" /> {t('lief_order_button')}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
        <LiefStatCard label={t('lief_stat_offene')} value={offene.length} icon="cart" color="#e8821c"
                      sub={neueWoche > 0 ? `+${neueWoche} ${t('lief_seit_woche')}` : undefined}
                      subColor="rgb(var(--color-green))" spark={sparks.erstellt} />
        <LiefStatCard label={t('lief_stat_unterwegs')} value={inTransit.length} icon="truck" color="#9b6bd9"
                      sub={`${inTransit.length} ${t('lief_lieferungen')}`} spark={sparks.erstellt.map((v, i) => v + sparks.erhalten[i])} />
        <LiefStatCard label={t('lief_stat_eingetroffen')} value={eingetroffenMonat.length} icon="check" color="#4caf6e"
                      sub={eingetroffenWoche > 0 ? `+${eingetroffenWoche} ${t('lief_seit_woche')}` : undefined}
                      subColor="rgb(var(--color-green))" spark={sparks.erhalten} />
        <LiefStatCard label={t('lief_stat_wert')} value={fmt(wertMonat)} icon="chart" color="#4caf6e"
                      sub={wertDelta} subColor="rgb(var(--color-green))" spark={sparks.wert} />
        <LiefStatCard label={t('lief_stat_bewertung')} value={avgBewertung === null ? '—' : `${avgBewertung.toFixed(1).replace('.', ',')} / 5`}
                      icon="star" color="#e8b23c" sub={bewertungWort} spark={sparks.bewertungen} />
      </div>

      {/* ── filter bar ── */}
      <Card className="p-3 flex flex-wrap gap-2 items-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="relative flex-1 min-w-[180px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('lief_search_article_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
        </div>
        <select value={filterBestand} onChange={e => setFilterBestand(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="alle">{t('lief_bestand_alle')}</option>
          <option value="niedrig">{t('lief_nur_niedrig')}</option>
          <option value="knapp">{t('lief_nur_knapp')}</option>
        </select>
        <select value={filterKategorie} onChange={e => setFilterKategorie(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="alle">{t('lief_alle_kategorien')}</option>
          {kategorien.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={filterLieferant} onChange={e => setFilterLieferant(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="alle">{t('lief_alle_lieferanten')}</option>
          {lieferanten.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="hidden lg:flex items-center gap-1 bg-bg-2 border border-border rounded-xl p-1">
          <button onClick={() => setView('tabelle')} title="Tabelle"
                  className={`p-1.5 rounded-lg transition-colors ${view === 'tabelle' ? 'bg-amber text-bg-0' : 'text-muted hover:bg-bg-3'}`}>
            <Icon name="list" size={14} color="currentColor" />
          </button>
          <button onClick={() => setView('liste')} title="Kompakt"
                  className={`p-1.5 rounded-lg transition-colors ${view === 'liste' ? 'bg-amber text-bg-0' : 'text-muted hover:bg-bg-3'}`}>
            <Icon name="grid" size={14} color="currentColor" />
          </button>
        </div>
      </Card>

      {justAdded && (
        <div className="flex items-center gap-2 text-green text-xs bg-green-dim rounded-xl px-3 py-2 animate-fade-up">
          <Icon name="check" size={13} color="#4caf6e" /> {justAdded}
        </div>
      )}

      {/* Columns stretch so the article card fills down to the bottom
          of the viewport instead of stopping at its content height. */}
      <div className="flex flex-col xl:flex-row gap-4 xl:min-h-[calc(100vh-380px)]">
        {/* ══ MAIN: article table ══ */}
        <div ref={tableTopRef} className="flex-1 min-w-0 w-full flex flex-col">
          <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex-1 flex flex-col">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-muted text-sm">{t('ueb_no_articles')}</p>
            ) : (
              <>
                {/* compact list on small screens / Karten view */}
                <div className={view === 'liste' ? 'p-3' : 'p-3 lg:hidden'}>{compactList}</div>
                {view === 'tabelle' && (
                  <div className="hidden lg:block overflow-x-auto flex-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_artikel')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_details')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_lager')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_lieferant')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_lieferzeit')}</th>
                          <th className="px-4 py-2.5 font-medium">{t('lief_col_status')}</th>
                          <th className="px-4 py-2.5 font-medium text-right">{t('lief_col_aktion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(a => {
                          const st = artStatus(a)
                          const lief = liefById.get(a.lieferant_id)
                          const expanded = expandedId === a.id
                          return (
                            <Fragment key={a.id}>
                              <tr onClick={() => setExpandedId(expanded ? null : a.id)}
                                  className={`border-b border-border cursor-pointer transition-colors ${expanded ? 'bg-bg-2' : 'hover:bg-bg-2/60'}`}>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-border">
                                      <ArtikelBild artikel={a} iconSize={15} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-medium truncate max-w-[190px]">{a.name}</div>
                                      <div className="text-[11px] font-mono text-amber">{a.nummer}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-secondary">
                                  <div className="truncate max-w-[160px]">{a.menge} {a.einheit}{a.lieferant ? ` · ${a.lieferant}` : ''}</div>
                                  <div className="text-muted truncate max-w-[160px]">{[a.kategorie, a.lagerort].filter(Boolean).join(' · ')}</div>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 font-mono text-xs">
                                    <StatusDot color={BESTAND_META[bestandStatus(a)].color} pulse={bestandStatus(a) === 'niedrig'} size={7} />
                                    {a.menge} {a.einheit}
                                  </div>
                                  <div className="text-[11px] text-muted font-mono mt-0.5">{t('lief_min_short')} {a.mindestbestand}</div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="text-xs truncate max-w-[140px]">{a.lieferant || '—'}</div>
                                  <div className="mt-0.5"><Sterne value={lief?.bewertung} /></div>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <div className="text-xs">{lief?.lieferzeit || '—'}</div>
                                  {lief?.versandart && <div className="text-[11px] text-muted">{lief.versandart}</div>}
                                </td>
                                <td className="px-4 py-2.5"><BestandBadge status={st} /></td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={e => { e.stopPropagation(); onOpenAdd(a) }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                            style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                                      <Icon name="plus" size={12} color="#181c20" /> {t('lief_order_button')}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : a.id) }}
                                            className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                                      <Icon name="dots" size={14} color="#9aa3ad" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded && (
                                <tr className="border-b border-border bg-bg-0/40">
                                  <td colSpan={7} className="px-6 py-2.5 text-xs text-secondary">
                                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                                      {lastPurchase[a.id] ? (
                                        <span>{t('lief_last_purchase')}: {fmtDt(lastPurchase[a.id].created_at)} · {lastPurchase[a.id].menge} {a.einheit} · {fmt(lastPurchase[a.id].preis ?? 0)}/{a.einheit}</span>
                                      ) : (
                                        <span className="text-muted">{t('lief_no_purchase_yet')}</span>
                                      )}
                                      {unterwegs[a.id] > 0 && (
                                        <span className="text-amber font-medium">{unterwegs[a.id]} {a.einheit} {t('lief_unterwegs_hint')}</span>
                                      )}
                                      <span className="text-muted">{fmt(a.preis)} / {a.einheit}</span>
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
                )}
                {/* pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted flex-wrap gap-2">
                  <span>
                    {lang === 'en'
                      ? `Showing ${from} to ${to} of ${filtered.length} articles`
                      : `Zeige ${from} bis ${to} von ${filtered.length} Artikeln`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                            className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-bg-2 transition-colors">
                      <Icon name="chevronLeft" size={12} color="#9aa3ad" />
                    </button>
                    {Array.from({ length: Math.min(pageCount, 7) }).map((_, i) => (
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
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="w-full xl:w-80 shrink-0 space-y-4">
          {/* Bestellübersicht donut */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('lief_uebersicht_titel')}</h3>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <DonutChart data={donutData} size={110} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold font-mono">{articles.length}</span>
                  <span className="text-[9px] text-muted">{t('lief_gesamt')}</span>
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

          {/* Niedriger Bestand */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('lief_niedriger_bestand')}</h3>
            {niedrigList.length === 0 ? (
              <p className="text-xs text-muted text-center py-3">{t('lief_kein_niedrig')}</p>
            ) : (
              <div className="space-y-2">
                {niedrigList.map((a, i) => (
                  <button key={a.id} onClick={() => onOpenAdd(a)}
                          className="w-full flex items-center gap-2.5 text-left animate-fade-up hover:bg-bg-2 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                          style={{ animationDelay: `${i * 40}ms` }}>
                    <StatusDot color="#e0524a" pulse size={7} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{a.name}</div>
                      <div className="text-[11px] text-muted font-mono">{a.menge} {a.einheit}</div>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-red shrink-0">{t('lief_min_short')} {a.mindestbestand}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setFilterBestand('niedrig')}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
              {t('lief_alle_anzeigen')} <Icon name="chevronRight" size={12} color="currentColor" />
            </button>
          </Card>

          {/* Top Lieferanten */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('lief_top_lieferanten')}</h3>
            {topLief.length === 0 ? (
              <p className="text-xs text-muted text-center py-3">—</p>
            ) : (
              <div className="space-y-2">
                {topLief.map((l, i) => (
                  <div key={l.id} className="flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ background: ['#4caf6e', '#4a90d9', '#e8821c', '#9b6bd9', '#3fb6c4'][i] ?? '#9aa3ad' }}>
                      {i + 1}
                    </span>
                    <span className="text-xs truncate flex-1">{l.name}</span>
                    <Sterne value={l.bewertung} />
                  </div>
                ))}
              </div>
            )}
            <button onClick={onShowLieferanten}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
              {t('lief_alle_lieferanten')} <Icon name="chevronRight" size={12} color="currentColor" />
            </button>
          </Card>

          {/* Letzte Aktivitäten */}
          <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <h3 className="font-semibold text-sm mb-3">{t('lief_aktivitaeten')}</h3>
            {activities.length === 0 ? (
              <p className="text-xs text-muted text-center py-3">—</p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {activities.slice(0, showAllAct ? 15 : 3).map((a, i) => (
                    <button key={`${a.at}-${i}`} onClick={() => onOpenBestellung(a.id)}
                            className="w-full flex items-start gap-2.5 text-left animate-fade-up hover:bg-bg-2 rounded-lg px-2 py-1 -mx-2 transition-colors"
                            style={{ animationDelay: `${i * 30}ms` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                           style={{ background: a.color + '1f' }}>
                        <Icon name={a.icon} size={13} color={a.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{a.text}</div>
                        <div className="text-[11px] text-muted truncate">{a.sub}</div>
                      </div>
                      <span className="text-[10px] text-muted font-mono shrink-0 mt-0.5">{fmtAkt(a.at)}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAllAct(s => !s)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary border border-border rounded-lg py-2 mt-3 hover:bg-bg-2 transition-colors">
                  {showAllAct ? t('mon_weniger_akt') : t('lief_alle_akt')}
                  <Icon name="chevronRight" size={12} color="currentColor" />
                </button>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ══ NEUE BESTELLUNG MODAL (manuell, ohne Artikel-Vorauswahl) ══ */
function NewBestellungModal({ lieferanten, articles, initialLieferantId, onClose, onCreated }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [lieferantId, setLieferantId] = useState(initialLieferantId ?? lieferanten[0]?.id ?? null)
  const [items, setItems]             = useState([])
  const [manualSearch, setManualSearch] = useState('')
  const [notiz, setNotiz]             = useState('')
  const [error, setError]             = useState(null)
  const [saving, setSaving]           = useState(false)

  const selectedLieferant = lieferanten.find(l => l.id === Number(lieferantId))

  useEffect(() => {
    if (!selectedLieferant) { setItems([]); return }
    const suggested = lowStockForLieferant(articles, selectedLieferant).map(a => ({
      artikel_id: a.id, nummer: a.nummer, name: a.name, einheit: a.einheit, preis: a.preis,
      menge: Math.max(1, Math.ceil(a.mindestbestand * 1.5) - a.menge),
    }))
    setItems(suggested)
  }, [lieferantId]) // eslint-disable-line

  const manualResults = useMemo(() => {
    if (!manualSearch.trim()) return []
    const q = manualSearch.toLowerCase()
    return articles.filter(a =>
      !items.some(i => i.artikel_id === a.id) &&
      (a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q))
    ).slice(0, 6)
  }, [manualSearch, articles, items])

  const addItem = (a) => {
    setItems(list => [...list, { artikel_id: a.id, nummer: a.nummer, name: a.name, einheit: a.einheit, preis: a.preis, menge: 1 }])
    setManualSearch('')
  }
  const removeItem = (artikelId) => setItems(list => list.filter(i => i.artikel_id !== artikelId))
  const changeMenge = (artikelId, delta) => setItems(list => list.map(i =>
    i.artikel_id === artikelId ? { ...i, menge: Math.max(1, i.menge + delta) } : i
  ))
  const setMengeDirect = (artikelId, value) => setItems(list => list.map(i =>
    i.artikel_id === artikelId ? { ...i, menge: Math.max(1, Number(value) || 1) } : i
  ))

  const save = async () => {
    if (!selectedLieferant) { setError(t('lief_select_supplier_ph')); return }
    if (items.length === 0) { setError(t('auf_min_one_article')); return }
    setSaving(true); setError(null)
    const { data: b, error: bErr } = await supabase.from('bestellungen').insert({
      lieferant_id: selectedLieferant.id, notiz: notiz.trim(),
      erstellt_von: profile?.display_name ?? '', erstellt_von_id: profile?.id ?? null,
    }).select().single()
    if (bErr) { setError(bErr.message); setSaving(false); return }
    const rows = items.map(i => ({
      bestellung_id: b.id, artikel_id: i.artikel_id, artikel_name: i.name,
      artikel_nummer: i.nummer, einheit: i.einheit, menge: i.menge, preis: i.preis ?? 0,
    }))
    const { error: pErr } = await supabase.from('bestellung_positionen').insert(rows)
    setSaving(false)
    if (pErr) { setError(pErr.message); return }
    onCreated(b.id)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{t('lief_new_order')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">{t('lief_supplier')}</label>
            <select value={lieferantId ?? ''} onChange={e => setLieferantId(Number(e.target.value))}
                    className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
              {lieferanten.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <div className="text-xs text-secondary font-medium mb-2">{t('bew_col_article')}</div>
            {items.length === 0 ? (
              <p className="text-xs text-muted">{t('lief_no_articles_add_manually')}</p>
            ) : (
              <div className="space-y-1.5">
                {items.map(i => (
                  <div key={i.artikel_id} className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{i.name}</div>
                      <div className="text-xs text-muted font-mono">{i.nummer}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => changeMenge(i.artikel_id, -1)}
                              className="w-6 h-6 rounded-md bg-bg-1 border border-border text-sm">−</button>
                      <input type="number" min="1" value={i.menge}
                             onChange={e => setMengeDirect(i.artikel_id, e.target.value)}
                             className="font-mono text-sm font-semibold w-12 text-center bg-bg-1 border border-border rounded-md py-0.5 outline-none focus:border-amber [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <button onClick={() => changeMenge(i.artikel_id, 1)}
                              className="w-6 h-6 rounded-md bg-bg-1 border border-border text-sm">+</button>
                    </div>
                    <button onClick={() => removeItem(i.artikel_id)} className="p-1 shrink-0">
                      <Icon name="x" size={13} color="#6b7480" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon name="search" size={13} color="#6b7480" />
              </div>
              <input value={manualSearch} onChange={e => setManualSearch(e.target.value)}
                     placeholder={t('lief_add_manually_ph')}
                     className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
            </div>
            {manualResults.length > 0 && (
              <div className="mt-1.5 border border-border rounded-xl overflow-hidden">
                {manualResults.map(a => (
                  <button key={a.id} onClick={() => addItem(a)}
                          className="w-full text-left px-3 py-2 bg-bg-2 border-b border-border last:border-0 hover:bg-bg-3 transition-colors">
                    <span className="text-sm">{a.name}</span>
                    <span className="text-xs text-muted font-mono ml-2">{a.nummer}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">{t('lief_note_optional')}</label>
            <input type="text" value={notiz} onChange={e => setNotiz(e.target.value)}
                   placeholder="z.B. Lieferung bis Freitag"
                   className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber" />
          </div>

          {error && <p className="text-red text-xs">{error}</p>}
        </div>

        <div className="px-5 pb-6">
          <button onClick={save} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="check" size={15} color="#181c20" />
            {saving ? t('common_saving') : t('lief_save_as_draft')}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_ORDER = ['entwurf', 'gesendet', 'bestaetigt', 'eingetroffen']

/* ══ BESTELLUNG DETAIL ══ */
const defaultLieferDatum = () => {
  const d = new Date(); d.setDate(d.getDate() + 5)
  return d.toISOString().slice(0, 10)
}

const loadImageEl = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = url
})

function BestellungDetail({ bestellung, onBack, onRefresh, setArticles, setMoves, firma }) {
  const { t, lang } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // 'gesendet' | 'bestaetigt' | 'eingetroffen' | null
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lieferDatum, setLieferDatum] = useState(defaultLieferDatum())
  const [empfangenMengen, setEmpfangenMengen] = useState({})
  const lieferant = bestellung.lieferant
  const positionen = bestellung.positionen ?? []
  const totalMenge = positionen.reduce((s, p) => s + Number(p.menge), 0)
  const { netto, mwst, brutto, satz } = bestellungBrutto(bestellung)

  const statusIdx   = STATUS_ORDER.indexOf(bestellung.status)
  const nextStatus  = STATUS_ORDER[statusIdx + 1]
  const prevStatus  = statusIdx > 0 ? STATUS_ORDER[statusIdx - 1] : null
  const warSpaet = bestellung.status === 'eingetroffen' && bestellung.erwartete_lieferung && bestellung.eingetroffen_at
    && new Date(bestellung.eingetroffen_at) > new Date(bestellung.erwartete_lieferung + 'T23:59:59')

  const printBestellung = () => {
    const rows = positionen.map(p =>
      `<tr><td>${p.artikel_nummer}</td><td>${p.artikel_name}</td><td style="text-align:right">${p.menge} ${p.einheit}</td><td style="text-align:right">${fmt(p.preis ?? 0)}</td><td style="text-align:right">${fmt(p.menge * (p.preis ?? 0))}</td></tr>`
    ).join('')
    const addressBlock = (label, name, adresse, telefon, email, steuernummer, ustIdnr) => `
      <div class="party">
        <div class="party-label">${label}</div>
        ${name ? `<div class="party-name">${name}</div>` : ''}
        ${adresse ? `<div>${adresse}</div>` : ''}
        ${telefon ? `<div>${telefon}</div>` : ''}
        ${email ? `<div>${email}</div>` : ''}
        ${steuernummer ? `<div>St.-Nr. ${steuernummer}</div>` : ''}
        ${ustIdnr ? `<div>USt-IdNr. ${ustIdnr}</div>` : ''}
      </div>`
    const docTitel = bestellung.dokument_nr || `#${bestellung.id}`
    const win = window.open('', '_blank', 'width=800,height=1000')
    win.document.write(`<html><head><title>Bestellung ${docTitel}</title>
      <style>
        @page{margin:18mm}
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#1a1a1a;display:flex;flex-direction:column;min-height:257mm}
        .page{display:flex;flex-direction:column;flex:1}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
        .header img{max-height:64px;max-width:220px}
        h1{font-size:26px;margin:0 0 4px;letter-spacing:0.5px}
        .subtitle{color:#888;font-size:13px}
        .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;padding:18px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}
        .party-label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px}
        .party-name{font-weight:bold;font-size:14px;margin-bottom:2px}
        .party div{font-size:13px;line-height:1.5;color:#333}
        .meta-row{font-size:13px;color:#555;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ddd;padding:9px 10px;text-align:left}
        th{background:#f4f4f4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#555}
        .summary{width:280px;margin-left:auto;margin-top:16px;font-size:13px}
        .summary td{border:none;padding:4px 8px}
        .summary tr.brutto td{font-weight:bold;font-size:15px;border-top:2px solid #999;padding-top:8px}
        .notiz{margin-top:20px;font-size:13px;color:#333;line-height:1.5}
        .notiz strong{color:#000}
        .footer{margin-top:auto;padding-top:60px}
        .sign-row{display:flex;gap:60px}
        .sign-box{flex:1}
        .sign-line{border-top:1px solid #999;padding-top:6px;font-size:11px;color:#888}
      </style></head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <h1>Bestellung</h1>
              <div class="subtitle">${docTitel}</div>
            </div>
            ${firma?.logo_url ? `<img src="${firma.logo_url}" />` : ''}
          </div>
          <div class="parties">
            ${addressBlock('Von', firma?.name, firma?.adresse, firma?.telefon, firma?.email, firma?.steuernummer, firma?.ust_idnr)}
            ${addressBlock('An', lieferant?.name, lieferant?.adresse, lieferant?.telefon, lieferant?.email)}
          </div>
          <div class="meta-row">Datum: ${fmtDt(bestellung.created_at)}</div>
          <table>
            <thead><tr><th>Artikelnr.</th><th>Artikel</th><th style="text-align:right">Menge</th><th style="text-align:right">Preis</th><th style="text-align:right">Summe</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <table class="summary">
            <tr><td>Netto</td><td style="text-align:right">${fmt(netto)}</td></tr>
            <tr><td>MwSt (${satz}%)</td><td style="text-align:right">${fmt(mwst)}</td></tr>
            <tr class="brutto"><td>Brutto</td><td style="text-align:right">${fmt(brutto)}</td></tr>
          </table>
          ${bestellung.notiz ? `<div class="notiz"><strong>Notiz:</strong> ${bestellung.notiz}</div>` : ''}
          ${lieferant?.bestellnachricht ? `<div class="notiz"><strong>Nachricht an Lieferant:</strong> ${lieferant.bestellnachricht}</div>` : ''}
          <div class="footer">
            <div class="sign-row">
              <div class="sign-box"><div class="sign-line">Ort, Datum</div></div>
              <div class="sign-box"><div class="sign-line">Unterschrift, Name</div></div>
            </div>
          </div>
        </div>
        <script>window.onload=()=>window.print()<\/script>
      </body></html>`)
    win.document.close()
  }

  const downloadPdf = async () => {
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const doc = new jsPDF()
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      if (firma?.logo_url) {
        try {
          const img = await loadImageEl(firma.logo_url)
          const maxW = 40, maxH = 20
          let w = maxW, h = (img.naturalHeight / img.naturalWidth) * w
          if (h > maxH) { h = maxH; w = (img.naturalWidth / img.naturalHeight) * h }
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', pageW - 14 - w, 14, w, h)
        } catch { /* logo couldn't be loaded — skip it, rest of the PDF still generates */ }
      }

      const docTitel = bestellung.dokument_nr || `#${bestellung.id}`

      doc.setFontSize(22)
      doc.setTextColor(20)
      doc.text('Bestellung', 14, 24)
      doc.setFontSize(11)
      doc.setTextColor(140)
      doc.text(docTitel, 14, 31)

      doc.setDrawColor(210)
      doc.line(14, 40, pageW - 14, 40)

      // Two clearly separated columns — "Von" (our company) and "An"
      // (the Lieferant) — each its own stacked block instead of one
      // dense middot-joined line.
      const colX = [14, pageW / 2 + 6]
      const drawParty = (x, label, name, adresse, telefon, email, steuernummer, ustIdnr) => {
        let py = 48
        doc.setFontSize(9); doc.setTextColor(150)
        doc.text(label.toUpperCase(), x, py)
        py += 6
        doc.setFontSize(11); doc.setTextColor(20); doc.setFont(undefined, 'bold')
        if (name) { doc.text(name, x, py); py += 5.5 }
        doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(70)
        const steuerLines = [
          steuernummer ? `St.-Nr. ${steuernummer}` : null,
          ustIdnr ? `USt-IdNr. ${ustIdnr}` : null,
        ].filter(Boolean)
        ;[adresse, telefon, email, ...steuerLines].filter(Boolean).forEach(line => { doc.text(line, x, py); py += 5 })
        return py
      }
      const bottomY = Math.max(
        drawParty(colX[0], 'Von', firma?.name, firma?.adresse, firma?.telefon, firma?.email, firma?.steuernummer, firma?.ust_idnr),
        drawParty(colX[1], 'An', lieferant?.name, lieferant?.adresse, lieferant?.telefon, lieferant?.email),
      )

      doc.setDrawColor(210)
      doc.line(14, bottomY + 4, pageW - 14, bottomY + 4)

      doc.setFontSize(10); doc.setTextColor(90)
      doc.text(`Datum: ${fmtDt(bestellung.created_at)}`, 14, bottomY + 12)

      autoTable(doc, {
        startY: bottomY + 20,
        head: [['Artikelnr.', 'Artikel', 'Menge', 'Preis', 'Summe']],
        body: positionen.map(p => [
          p.artikel_nummer, p.artikel_name, `${p.menge} ${p.einheit}`,
          fmt(p.preis ?? 0), fmt(p.menge * (p.preis ?? 0)),
        ]),
        foot: [
          ['', '', '', 'Netto', fmt(netto)],
          ['', '', '', `MwSt (${satz}%)`, fmt(mwst)],
          ['', '', '', 'Brutto', fmt(brutto)],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 34, 38] },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })

      let y = doc.lastAutoTable.finalY + 12
      doc.setFontSize(10); doc.setTextColor(30)
      if (bestellung.notiz) {
        const lines = doc.splitTextToSize(`Notiz: ${bestellung.notiz}`, pageW - 28)
        doc.text(lines, 14, y)
        y += lines.length * 5 + 4
      }
      if (lieferant?.bestellnachricht) {
        const lines = doc.splitTextToSize(`Nachricht an Lieferant: ${lieferant.bestellnachricht}`, pageW - 28)
        doc.text(lines, 14, y)
        y += lines.length * 5
      }

      // Signature area — always anchored near the bottom of the page
      // (using the whole sheet instead of leaving it half-empty), but
      // pushed further down if the content above runs long.
      const sigY = Math.max(y + 25, pageH - 35)
      const sigW = (pageW - 28 - 20) / 2
      doc.setDrawColor(160)
      doc.line(14, sigY, 14 + sigW, sigY)
      doc.line(14 + sigW + 20, sigY, pageW - 14, sigY)
      doc.setFontSize(9); doc.setTextColor(140)
      doc.text('Ort, Datum', 14, sigY + 5)
      doc.text('Unterschrift, Name', 14 + sigW + 20, sigY + 5)

      doc.save(`Bestellung-${docTitel}.pdf`)
    } catch (e) {
      setError(t('lief_pdf_error') + e.message)
    }
  }

  const commitForward = async (status) => {
    if (status === 'eingetroffen') { await receive(); return }
    setBusy(true); setError(null)
    const patch = { status }
    if (status === 'gesendet') {
      patch.gesendet_at = new Date().toISOString()
      if (lieferDatum) patch.erwartete_lieferung = lieferDatum
    }
    const { error: err } = await supabase.from('bestellungen').update(patch).eq('id', bestellung.id)
    setBusy(false); setConfirmAction(null)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  const revertTo = async (status) => {
    setBusy(true); setError(null)
    const patch = { status }
    if (status === 'entwurf') patch.gesendet_at = null
    const { error: err } = await supabase.from('bestellungen').update(patch).eq('id', bestellung.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  const openEingetroffenConfirm = () => {
    const defaults = {}
    positionen.forEach(p => { defaults[p.id] = p.menge })
    setEmpfangenMengen(defaults)
    setConfirmAction('eingetroffen')
  }

  const receive = async () => {
    setBusy(true); setError(null)
    const payload = positionen.map(p => ({ id: p.id, menge: empfangenMengen[p.id] ?? p.menge }))
    const { error: err } = await supabase.rpc('receive_bestellung', { p_bestellung_id: bestellung.id, p_mengen: payload })
    if (!err) {
      const [{ data: art }, { data: mov }] = await Promise.all([
        supabase.from('artikel').select('*').order('nummer'),
        supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
      ])
      if (art) setArticles(art)
      if (mov) setMoves(mov)
    }
    setBusy(false); setConfirmAction(null)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  const printPositionenQr = () => {
    printQrLabels(positionen.map(p => ({ nummer: p.artikel_nummer, name: p.artikel_name })))
  }

  const deleteBestellung = async () => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('bestellungen').delete().eq('id', bestellung.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onBack()
    onRefresh()
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-2xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-secondary text-sm mb-4 hover:text-primary transition-colors">
        <Icon name="chevronLeft" size={16} color="currentColor" /> {t('lief_all_orders')}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-3">
            {bestellung.dokument_nr || `${t('auf_order_hash')} #${bestellung.id}`}
            <StatusBadge status={bestellung.status} />
          </h1>
          <p className="text-secondary text-sm mt-1">{fmtDt(bestellung.created_at)} · {bestellung.erstellt_von || '—'}</p>
          {bestellung.erwartete_lieferung && bestellung.status !== 'eingetroffen' && (
            <p className="text-xs text-muted mt-1">{t('lief_expected_delivery')}: {fmtDt(bestellung.erwartete_lieferung)}</p>
          )}
          {bestellung.status === 'eingetroffen' && bestellung.erwartete_lieferung && (
            <p className={`text-xs mt-1 ${warSpaet ? 'text-red' : 'text-green'}`}>
              {warSpaet ? t('lief_arrived_late') : t('lief_arrived_on_time')} ({t('lief_expected_word')}: {fmtDt(bestellung.erwartete_lieferung)})
            </p>
          )}
          {bestellung.wareneingang_nr && (
            <p className="text-xs text-muted mt-1 font-mono">{t('lief_wareneingang_nr')}: {bestellung.wareneingang_nr}</p>
          )}
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="building" size={15} color="#e8821c" />
          <span className="font-semibold text-sm">{lieferant?.name}</span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-secondary">
          {lieferant?.email && <span className="flex items-center gap-1.5"><Icon name="mail" size={12} color="#6b7480" /> {lieferant.email}</span>}
          {lieferant?.telefon && <span className="flex items-center gap-1.5"><Icon name="phone" size={12} color="#6b7480" /> {lieferant.telefon}</span>}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('lief_positions')}</div>
          <div className="text-lg font-bold font-mono">{positionen.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('lief_total_qty')}</div>
          <div className="text-lg font-bold font-mono">{totalMenge}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted mb-1">{t('lief_net')}</div>
          <div className="text-lg font-bold font-mono">{fmt(netto)}</div>
        </Card>
      </div>

      <Card className="overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">{t('ueb_col_number')}</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">{t('bew_col_article')}</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted font-medium">{bestellung.status === 'eingetroffen' ? t('lief_col_ordered') : t('ueb_col_qty')}</th>
                {bestellung.status === 'eingetroffen' && (
                  <th className="text-right px-4 py-2.5 text-xs text-muted font-medium">{t('lief_col_received')}</th>
                )}
                <th className="text-right px-4 py-2.5 text-xs text-muted font-medium">{t('lief_col_sum')}</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-amber text-xs whitespace-nowrap">{p.artikel_nummer}</td>
                  <td className="px-4 py-2.5">{p.artikel_name}</td>
                  <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">{p.menge} {p.einheit}</td>
                  {bestellung.status === 'eingetroffen' && (
                    <td className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${
                      p.empfangen_menge != null && p.empfangen_menge < p.menge ? 'text-red' : 'text-green'
                    }`}>
                      {p.empfangen_menge ?? p.menge} {p.einheit}
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">{fmt(p.menge * (p.preis ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="max-w-xs ml-auto space-y-1.5 text-sm">
          <div className="flex justify-between text-secondary">
            <span>{t('lief_net')}</span><span className="font-mono">{fmt(netto)}</span>
          </div>
          <div className="flex justify-between text-secondary">
            <span>{t('lief_vat')} ({satz}%)</span><span className="font-mono">{fmt(mwst)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-border pt-1.5">
            <span>{t('lief_gross')}</span><span className="font-mono">{fmt(brutto)}</span>
          </div>
        </div>
      </Card>

      {bestellung.notiz && (
        <Card className="p-4 mb-4">
          <div className="text-xs text-secondary mb-1">{t('auf_field_note')}</div>
          <p className="text-sm">{bestellung.notiz}</p>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red text-xs bg-red-dim rounded-xl px-3 py-2 mb-4">
          <Icon name="alert" size={13} color="#e0524a" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={printBestellung}
                className="flex items-center gap-2 bg-bg-2 border border-border text-sm px-4 py-2.5 rounded-xl hover:bg-bg-3 transition-colors">
          <Icon name="printer" size={15} color="#9aa3ad" /> {t('common_print')}
        </button>
        <button onClick={downloadPdf}
                className="flex items-center gap-2 bg-bg-2 border border-border text-sm px-4 py-2.5 rounded-xl hover:bg-bg-3 transition-colors">
          <Icon name="download" size={15} color="#9aa3ad" /> {t('lief_as_pdf')}
        </button>
        {positionen.length > 0 && (
          <button onClick={printPositionenQr}
                  className="flex items-center gap-2 bg-bg-2 border border-border text-sm px-4 py-2.5 rounded-xl hover:bg-bg-3 transition-colors">
            <Icon name="scan" size={15} color="#9aa3ad" /> {t('lief_print_qr_labels')}
          </button>
        )}
      </div>

      {confirmAction ? (
        <div className="flex flex-col gap-3 bg-bg-2 border border-amber/40 rounded-xl px-4 py-3 mb-3">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={16} color="#e8821c" className="shrink-0 mt-0.5" />
            <span className="text-sm flex-1 min-w-[200px]">
              {lang === 'en' ? `Mark as "${t('status_' + confirmAction)}"?` : `Als "${t('status_' + confirmAction)}" markieren?`}
              {confirmAction === 'eingetroffen' && t('lief_receive_warning')}
            </span>
          </div>
          {confirmAction === 'gesendet' && (
            <div className="flex items-center gap-2 pl-7">
              <label className="text-xs text-secondary shrink-0">{t('lief_expected_delivery_colon')}</label>
              <input type="date" value={lieferDatum} onChange={e => setLieferDatum(e.target.value)}
                     className="bg-bg-1 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber" />
            </div>
          )}
          {confirmAction === 'eingetroffen' && (
            <div className="pl-7 space-y-1.5">
              <p className="text-xs text-secondary mb-1">{t('lief_actually_received')}</p>
              {positionen.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">
                    {p.artikel_name} <span className="text-muted text-xs">({t('lief_ordered_word')}: {p.menge} {p.einheit})</span>
                  </span>
                  <input type="number" min="0" value={empfangenMengen[p.id] ?? p.menge}
                         onChange={e => setEmpfangenMengen(m => ({ ...m, [p.id]: Math.max(0, Number(e.target.value) || 0) }))}
                         className="w-20 bg-bg-1 border border-border rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:border-amber shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="text-xs text-muted w-8 shrink-0">{p.einheit}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pl-7">
            <button onClick={() => commitForward(confirmAction)} disabled={busy}
                    className="text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              {t('lief_yes_confirm')}
            </button>
            <button onClick={() => setConfirmAction(null)} disabled={busy}
                    className="text-sm px-3 py-2 rounded-lg bg-bg-1 border border-border text-secondary">
              {t('common_cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {nextStatus && (
            <button onClick={() => {
                      if (nextStatus === 'eingetroffen') { openEingetroffenConfirm(); return }
                      setConfirmAction(nextStatus)
                      if (nextStatus === 'gesendet') setLieferDatum(defaultLieferDatum())
                    }} disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              {lang === 'en' ? `Mark as ${t('status_' + nextStatus)}` : `Als ${t('status_' + nextStatus)} markieren`}
            </button>
          )}
          {prevStatus && bestellung.status !== 'eingetroffen' && (
            <button onClick={() => revertTo(prevStatus)} disabled={busy}
                    className="text-xs text-secondary underline decoration-dotted hover:text-primary">
              {t('lief_back_to')} {t('status_' + prevStatus)}
            </button>
          )}
          {bestellung.status === 'eingetroffen' && bestellung.eingetroffen_at && (
            <span className="text-sm text-secondary">{t('lief_arrived_on')} {fmtDt(bestellung.eingetroffen_at)}</span>
          )}
        </div>
      )}

      <div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-red transition-colors">
            <Icon name="trash" size={12} color="currentColor" /> {t('lief_delete_order')}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-red">{t('lief_delete_order_confirm')}</span>
            <button onClick={deleteBestellung} disabled={busy} className="text-xs bg-red text-white px-2.5 py-1.5 rounded-lg">{t('lief_yes_delete')}</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs bg-bg-2 border border-border text-secondary px-2.5 py-1.5 rounded-lg">{t('common_no')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══ LIEFERANTEN TAB ══ */
function LieferantenTab({ lieferanten, articles, bestellungen, onNewLieferant, onEditLieferant, onNewBestellung }) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const filtered = lieferanten.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))

  const openCount = (lieferantId) => bestellungen.filter(b => b.lieferant_id === lieferantId && b.status !== 'eingetroffen').length

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('lief_search_supplier_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-amber" />
        </div>
        <button onClick={onNewLieferant}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold shrink-0"
                style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
          <Icon name="plus" size={14} color="#181c20" /> {t('lief_supplier')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Icon name="building" size={24} color="#6b7480" />
          <p className="text-secondary text-sm mt-2">{t('lief_no_suppliers_found')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(l => {
            const knapp = lowStockForLieferant(articles, l)
            return (
              <Card key={l.id} className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:hover:border-border-strong sm:hover:-translate-y-0.5 sm:hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.3)] transition-all duration-200">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-bg-2 text-amber font-semibold text-sm flex items-center justify-center shrink-0">
                    {l.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{l.name}</div>
                    {l.email && <div className="text-xs text-muted truncate">{l.email}</div>}
                  </div>
                  {openCount(l.id) > 0 && (
                    <span className="text-xs font-semibold shrink-0" style={{ color: '#4a90d9' }}>{openCount(l.id)} {t('lief_open_word')}</span>
                  )}
                </div>
                {knapp.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber bg-amber-dim rounded-lg px-2.5 py-1.5 mb-3">
                    <Icon name="alert" size={12} color="#e8821c" /> {knapp.length} {t('lief_articles_tight')}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => onNewBestellung(l.id)}
                          className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                    {t('lief_new_order')}
                  </button>
                  <button onClick={() => onEditLieferant(l)}
                          className="p-2 rounded-lg bg-bg-2 border border-border">
                    <Icon name="edit" size={14} color="#9aa3ad" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══ BESTELLUNGEN TAB ══ */
function BestellungenTab({ bestellungen, lieferanten, onOpenDetail, initialFilterLief, onFilterLiefConsumed }) {
  const { t } = useLanguage()
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('Alle')
  const [filterLief, setFilterLief] = useState(initialFilterLief != null ? String(initialFilterLief) : 'Alle')

  useEffect(() => {
    if (initialFilterLief != null) {
      setFilterLief(String(initialFilterLief))
      onFilterLiefConsumed?.()
    }
  }, [initialFilterLief]) // eslint-disable-line

  const filtered = bestellungen.filter(b => {
    const q = search.toLowerCase()
    return (
      (!q || (b.lieferant?.name ?? '').toLowerCase().includes(q)) &&
      (filterStatus === 'Alle' || b.status === filterStatus) &&
      (filterLief === 'Alle' || String(b.lieferant_id) === filterLief)
    )
  })

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('lief_search_supplier_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="Alle">{t('auf_all_status')}</option>
          {Object.entries(STATUS_META).map(([k]) => <option key={k} value={k}>{t('status_' + k)}</option>)}
        </select>
        <select value={filterLief} onChange={e => setFilterLief(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="Alle">{t('ueb_all_suppliers')}</option>
          {lieferanten.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted text-sm">{t('lief_no_orders_found')}</Card>
      ) : (
        <>
          <div className="sm:hidden space-y-1.5">
            {filtered.map(b => (
              <div key={b.id} onClick={() => onOpenDetail(b.id)}
                   className="bg-bg-1 border border-border rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm truncate">{b.lieferant?.name}</span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="text-[11px] text-muted font-mono mb-1">{b.dokument_nr || `#${b.id}`}</div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{fmtDt(b.created_at)}</span>
                  <span>· {(b.positionen ?? []).length} {t('lief_positions')}</span>
                  <span className="ml-auto font-mono text-secondary">{fmt(bestellungTotal(b))}</span>
                </div>
              </div>
            ))}
          </div>
          <Card className="hidden sm:block overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-2">
                    {['#', t('lief_col_supplier'), t('bew_col_date'), t('lief_positions'), t('inv_col_value'), t('ueb_col_status'), ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id} onClick={() => onOpenDetail(b.id)}
                        className="border-b border-border hover:bg-bg-2/50 transition-colors cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs text-muted">{b.dokument_nr || `#${b.id}`}</td>
                      <td className="px-4 py-3 font-medium">{b.lieferant?.name}</td>
                      <td className="px-4 py-3 text-secondary text-xs whitespace-nowrap">{fmtDt(b.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{(b.positionen ?? []).length}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{fmt(bestellungTotal(b))}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3"><Icon name="chevronRight" size={14} color="#6b7480" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/* ══ MAIN PAGE ══ */
export default function LieferantenPage({ articles, setArticles, setMoves }) {
  const { profile } = useAuth()
  const { t, lang } = useLanguage()
  const [searchParams] = useSearchParams()
  const [tab, setTab]                       = useState('bestellen')
  const [lieferanten, setLieferanten]       = useState([])
  const [bestellungen, setBestellungen]     = useState([])
  const [loading, setLoading]               = useState(true)
  const [showLieferantModal, setShowLieferantModal] = useState(false)
  const [editingLieferant, setEditingLieferant]     = useState(null)
  const [newBestellungFor, setNewBestellungFor]     = useState(undefined) // undefined = closed
  const [activeBestellungId, setActiveBestellungId] = useState(null)
  const [addPopupArtikel, setAddPopupArtikel]       = useState(null)
  const [justAdded, setJustAdded]                   = useState(null)
  const [firma, setFirma]                           = useState(null)
  const [jumpFilterLief, setJumpFilterLief]         = useState(null)

  const loadLieferanten = useCallback(async () => {
    const { data } = await supabase.from('lieferanten').select('*').order('name')
    if (data) setLieferanten(data)
  }, [])

  const loadBestellungen = useCallback(async () => {
    const { data } = await supabase
      .from('bestellungen')
      .select('*, lieferant:lieferanten(id,name,email,telefon,adresse,bestellnachricht,steuersatz), positionen:bestellung_positionen(*)')
      .order('created_at', { ascending: false })
    if (data) setBestellungen(data)
    return data ?? []
  }, [])

  const loadFirma = useCallback(async () => {
    const { data } = await supabase.from('firmendaten').select('*').eq('id', 1).single()
    if (data) setFirma(data)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadLieferanten(), loadBestellungen(), loadFirma()]).then(() => setLoading(false))
  }, [loadLieferanten, loadBestellungen, loadFirma])

  // Arriving from the Dashboard's "Lieferanten-Statistik"
  // (?tab=bestellungen&lieferant=5), from a Projekt's own Bestellung
  // status badge (?tab=bestellungen&bestellung=14), or from Home's
  // "niedriger Bestand" cards (?tab=bestellen&artikel=7) — the last
  // one opens the Bestellen popup for that article directly instead
  // of just landing on the list.
  useEffect(() => {
    const urlTab = searchParams.get('tab')
    const urlLieferant = searchParams.get('lieferant')
    const urlBestellung = searchParams.get('bestellung')
    const urlArtikel = searchParams.get('artikel')
    if (urlTab) setTab(urlTab)
    if (urlLieferant) setJumpFilterLief(Number(urlLieferant))
    if (urlBestellung) setActiveBestellungId(Number(urlBestellung))
    if (urlArtikel) {
      const found = articles.find(a => a.id === Number(urlArtikel))
      if (found) setAddPopupArtikel(found)
    }
  }, []) // eslint-disable-line

  const openNewLieferant  = () => { setEditingLieferant(null); setShowLieferantModal(true) }
  const openEditLieferant = (l) => { setEditingLieferant(l); setShowLieferantModal(true) }
  const onLieferantSaved  = async () => { setShowLieferantModal(false); await loadLieferanten() }

  const openNewBestellung = (lieferantId) => setNewBestellungFor(lieferantId ?? null)
  const onBestellungCreated = async (newId) => {
    setNewBestellungFor(undefined)
    await loadBestellungen()
    setTab('bestellungen')
    setActiveBestellungId(newId)
  }

  const refreshBestellungen = async () => { await loadBestellungen() }

  // Adds one artikel + Menge to that Lieferant's open Entwurf, creating
  // one if none exists yet. Called from the "Artikel bestellen" tab —
  // this is the main entry point for building a Bestellung.
  const addToOrder = async (artikel, lieferantId, menge) => {
    if (artikel.lieferant_id !== lieferantId) {
      const { error } = await supabase.from('artikel').update({ lieferant_id: lieferantId }).eq('id', artikel.id)
      if (error) throw new Error(error.message)
    }

    let draft = bestellungen.find(b => b.lieferant_id === lieferantId && b.status === 'entwurf')
    if (!draft) {
      const { data, error } = await supabase.from('bestellungen').insert({
        lieferant_id: lieferantId, erstellt_von: profile?.display_name ?? '', erstellt_von_id: profile?.id ?? null,
      }).select().single()
      if (error) throw new Error(error.message)
      draft = { ...data, positionen: [] }
    }

    const existingPos = (draft.positionen ?? []).find(p => p.artikel_id === artikel.id)
    if (existingPos) {
      const { error } = await supabase.from('bestellung_positionen')
        .update({ menge: existingPos.menge + menge }).eq('id', existingPos.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('bestellung_positionen').insert({
        bestellung_id: draft.id, artikel_id: artikel.id, artikel_name: artikel.name,
        artikel_nummer: artikel.nummer, einheit: artikel.einheit, menge, preis: artikel.preis,
      })
      if (error) throw new Error(error.message)
    }

    await loadBestellungen()
    if (artikel.lieferant_id !== lieferantId) {
      const { data } = await supabase.from('artikel').select('*').order('nummer')
      if (data) setArticles(data)
    }
    const lieferantName = lieferanten.find(l => l.id === lieferantId)?.name ?? ''
    setJustAdded(lang === 'en'
      ? `${menge} ${artikel.einheit} "${artikel.name}" added to order for ${lieferantName}.`
      : `${menge} ${artikel.einheit} "${artikel.name}" zur Bestellung an ${lieferantName} hinzugefügt.`)
    setTimeout(() => setJustAdded(null), 3500)
  }

  const lastPurchase = useMemo(() => buildLastPurchaseMap(bestellungen), [bestellungen])
  const unterwegs    = useMemo(() => buildUnterwegsMap(bestellungen), [bestellungen])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const activeBestellung = bestellungen.find(b => b.id === activeBestellungId)
  if (activeBestellung) {
    return (
      <BestellungDetail
        bestellung={activeBestellung}
        onBack={() => setActiveBestellungId(null)}
        onRefresh={refreshBestellungen}
        setArticles={setArticles}
        setMoves={setMoves}
        firma={firma}
      />
    )
  }

  const TABS = [
    ['bestellen', t('lief_tab_order_articles'), 'box'],
    ['bestellungen', t('lief_tab_orders'), 'truck'],
    ['lieferanten', t('lief_tab_suppliers'), 'building'],
  ]
  const renderTabContent = () => {
    if (tab === 'bestellen') return <ArtikelBestellenTab articles={articles} onOpenAdd={setAddPopupArtikel}
                                                           justAdded={justAdded} lastPurchase={lastPurchase}
                                                           unterwegs={unterwegs} lieferanten={lieferanten}
                                                           bestellungen={bestellungen}
                                                           onShowLieferanten={() => setTab('lieferanten')}
                                                           onOpenBestellung={setActiveBestellungId} />
    if (tab === 'bestellungen') return <BestellungenTab bestellungen={bestellungen} lieferanten={lieferanten}
                                                          onOpenDetail={setActiveBestellungId}
                                                          initialFilterLief={jumpFilterLief} onFilterLiefConsumed={() => setJumpFilterLief(null)} />
    return <LieferantenTab lieferanten={lieferanten} articles={articles} bestellungen={bestellungen}
                            onNewLieferant={openNewLieferant} onEditLieferant={openEditLieferant}
                            onNewBestellung={openNewBestellung} />
  }

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh]">
        <div className="px-3 pt-3 pb-2 border-b border-border bg-bg-0">
          <h1 className="text-base font-semibold mb-2">{t('lief_title')}</h1>
          <div className="flex gap-1">
            {TABS.map(([id, label, icon]) => (
              <button key={id} onClick={() => setTab(id)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                        tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent'
                      }`}>
                <Icon name={icon} size={13} color={tab === id ? '#e8821c' : '#6b7480'} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {renderTabContent()}
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('lief_title')}</h1>
            <p className="text-secondary text-sm">{t('lief_subtitle')}</p>
          </div>
          <button onClick={() => openNewBestellung(null)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="plus" size={15} color="#181c20" /> {t('lief_new_order')}
          </button>
        </div>
        <div className="flex gap-1 border-b border-border mb-6">
          {TABS.map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent hover:text-primary'
                    }`}>
              <Icon name={icon} size={15} color={tab === id ? '#e8821c' : '#6b7480'} />
              {label}
            </button>
          ))}
        </div>
        {renderTabContent()}
      </div>

      {showLieferantModal && (
        <LieferantFormModal lieferant={editingLieferant} onClose={() => setShowLieferantModal(false)} onSaved={onLieferantSaved} />
      )}
      {newBestellungFor !== undefined && lieferanten.length > 0 && (
        <NewBestellungModal
          lieferanten={lieferanten} articles={articles} initialLieferantId={newBestellungFor}
          onClose={() => setNewBestellungFor(undefined)} onCreated={onBestellungCreated}
        />
      )}
      {addPopupArtikel && (
        lieferanten.length === 0 ? (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setAddPopupArtikel(null)}>
            <Card className="p-5 max-w-sm text-center" onClick={e => e.stopPropagation()}>
              <Icon name="building" size={24} color="#6b7480" />
              <p className="text-sm text-secondary mt-2 mb-3">{t('lief_no_supplier_yet')}</p>
              <button onClick={() => { setAddPopupArtikel(null); openNewLieferant() }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                {t('lief_create_supplier')}
              </button>
            </Card>
          </div>
        ) : (
          <AddToBestellungPopup artikel={addPopupArtikel} lieferanten={lieferanten}
                                 onClose={() => setAddPopupArtikel(null)} onAdd={addToOrder}
                                 lastPurchase={lastPurchase} unterwegs={unterwegs} />
        )
      )}
    </>
  )
}
