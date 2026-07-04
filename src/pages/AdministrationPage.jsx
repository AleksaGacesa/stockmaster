import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { downloadBlob, deNum } from '../lib/csv'
import { buildXlsxBlob, downloadXlsx } from '../lib/xlsxExport'
import { drawPdfHeader } from '../lib/pdfHeader'
import {
  materialGeplantWert, projektGewinn, projektRealisierterGewinn,
  buildReservierungMap,
} from '../lib/auftraegeHelpers'
import { lieferantStats, bestellungTotal } from '../lib/bestellungHelpers'

const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDt = (d) => d ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : ''
const today = () => new Date().toISOString().slice(0, 10)

const STATUS_LABEL = {
  geplant: 'Geplant', aktiv: 'Aktiv', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
  entwurf: 'Entwurf', gesendet: 'Gesendet', bestaetigt: 'Bestätigt', eingetroffen: 'Eingetroffen',
}

// Every warenbewegungen row's notiz is stamped with a fixed German
// prefix at creation time (book_movement callers), regardless of the
// UI language in use — that's what makes it possible to classify a
// movement's origin here without guessing.
const bewegungQuelle = (m) => {
  const n = m.notiz || ''
  if (n.startsWith('Bestellung ')) return 'bestellung'
  if (n.startsWith('Inventur-Korrektur')) return 'inventur'
  if (n.startsWith('Manuelle Korrektur')) return 'manuell'
  return 'sonstige'
}
const QUELLE_LABEL = { bestellung: 'Bestellung', inventur: 'Inventur-Korrektur', manuell: 'Manuelle Korrektur', sonstige: 'Sonstige' }

// A movement tied to a real project (projekt_id) shows that project's
// PROJ-2026-xxxxxx number — only free-typed project text (no linked
// project row) falls back to whatever was manually entered.
const movementProjectLabel = (m) => m.projekte?.dokument_nr
  ? `${m.projekte.dokument_nr}${m.projekt ? ' · ' + m.projekt : ''}`
  : (m.projekt || '')

const loadPdfLibs = () => Promise.all([import('jspdf'), import('jspdf-autotable')])
  .then(([{ jsPDF }, { default: autoTable }]) => ({ jsPDF, autoTable }))

// Export history now lives in the database (export_protokoll), so it's
// shared across every device and survives cache clears / origin
// changes — the old localStorage version silently vanished when
// switching between the deployed site and localhost.
const REPORT_META = {
  lieferanten:    { icon: 'building',  color: '#9b6bd9', label: 'Lieferantenübersicht' },
  lagerbewertung: { icon: 'box',       color: '#4a90d9', label: 'Lagerbewertung' },
  inventur:       { icon: 'filter',    color: '#4caf6e', label: 'Inventurliste' },
  wareneingang:   { icon: 'truck',     color: '#e8821c', label: 'Wareneingang' },
  projektbericht: { icon: 'clipboard', color: '#d96b8f', label: 'Projektbericht' },
  jahresbericht:  { icon: 'chart',     color: '#3fb6c4', label: 'Jahresbericht' },
  tagesbewegung:  { icon: 'truck',     color: '#e8821c', label: 'Artikel Tagesbewegung' },
  artikel:        { icon: 'package',   color: '#4caf6e', label: 'Artikel' },
  bestellungen:   { icon: 'truck',     color: '#4a90d9', label: 'Bestellungen' },
  projekte:       { icon: 'clipboard', color: '#d96b8f', label: 'Projekte' },
  bewegungen:     { icon: 'refresh',   color: '#e8821c', label: 'Lagerbewegungen' },
  zip:            { icon: 'download',  color: '#e8821c', label: 'Steuerberater-Export' },
}

/* ══ EXPORT CARD — icon+title header, description, full-width action
   button at the bottom, matching the mockup's card anatomy. ══ */
function ExportButton({ icon, title, desc, onClick, disabled, color = '#e8821c', buttonLabel }) {
  const { t } = useLanguage()
  return (
    <div style={{ '--accent': color }}
         className="p-4 bg-bg-2 border border-border rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:border-[var(--accent)] transition-colors duration-200 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset"
             style={{ background: `linear-gradient(135deg, ${color}2e, ${color}0f)`, '--tw-ring-color': `${color}33` }}>
          <Icon name={icon} size={16} color={color} />
        </div>
        <div className="font-medium text-sm min-w-0 truncate">{title}</div>
      </div>
      <p className="text-xs text-muted flex-1 leading-relaxed">{desc}</p>
      <button onClick={onClick} disabled={disabled}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium bg-bg-3 border border-border hover:bg-bg-1 hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:pointer-events-none">
        <Icon name="download" size={13} color="#9aa3ad" /> {buttonLabel ?? t('adm_pdf_create')}
      </button>
    </div>
  )
}

/* ══ SEARCHABLE PICKER — a dropdown that can also be typed into to
   filter, for lists (Bestellungen etc.) that grow into the hundreds.
   Custom-built (not a native <datalist>) because the native popup
   can't be styled or reliably scrolled — it just renders using the
   OS/browser dark-mode preference regardless of our own theme, which
   looks fine against a light page but disappears against a dark one. ══ */
function SearchablePicker({ value, onChange, options, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = options.find(o => String(o.id) === String(value))

  useEffect(() => {
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        placeholder={placeholder}
        className="w-full bg-bg-1 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber"
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">—</div>
          ) : (
            filtered.slice(0, 200).map(o => (
              <button key={o.id} type="button"
                      onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-bg-2 transition-colors truncate block">
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ══ HISTORY PANEL — "Vorschau & Schnellzugriff": every export
   generated on any device, read from the export_protokoll table. ══ */
function relativeTime(iso, t) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return t('adm_history_just_now')
  if (diffMin < 60) return `${diffMin} ${t('adm_history_min_ago')}`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ${t('adm_history_hours_ago')}`
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function HistoryPanel({ history, onRemove }) {
  const { t } = useLanguage()
  return (
    <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <h2 className="font-semibold text-sm mb-3.5">{t('adm_history_title')}</h2>
      {history.length === 0 ? (
        <p className="text-xs text-muted">{t('adm_history_empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {history.map(entry => {
            const meta = REPORT_META[entry.typ] ?? { icon: 'download', color: '#9aa3ad', label: entry.typ }
            return (
              <div key={entry.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-bg-2 transition-colors group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: `linear-gradient(135deg, ${meta.color}2e, ${meta.color}0f)` }}>
                  <Icon name={meta.icon} size={14} color={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{meta.label}{entry.detail ? ` — ${entry.detail}` : ''}</div>
                  <div className="text-[11px] text-muted truncate">
                    {relativeTime(entry.created_at, t)}{entry.erstellt_von ? ` · ${entry.erstellt_von}` : ''}
                  </div>
                </div>
                <button onClick={() => onRemove(entry.id)}
                        aria-label={t('common_delete')}
                        className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-bg-3 transition-opacity shrink-0">
                  <Icon name="x" size={12} color="#6b7480" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ══ REPORT GENERATOR — quick-picker modal listing every report so
   you don't have to scroll to find one. Calls the exact same export
   functions as their dedicated buttons below. ══ */
function ReportGeneratorModal({ items, onClose }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80dvh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{t('adm_generator_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {items.map(item => (
            <button key={item.title} onClick={() => { item.onClick(); onClose() }} disabled={item.disabled}
                    className="w-full flex items-center gap-3 p-3 bg-bg-2 border border-border rounded-xl hover:border-[var(--accent)] transition-colors text-left disabled:opacity-40 disabled:pointer-events-none"
                    style={{ '--accent': item.color }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: `linear-gradient(135deg, ${item.color}2e, ${item.color}0f)` }}>
                <Icon name={item.icon} size={16} color={item.color} />
              </div>
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</span>
              <Icon name="download" size={14} color="#6b7480" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══ QUICK-PICK MODAL — for the 3 report cards that need one specific
   record (which Inventur session / Bestellung / Projekt) instead of
   always having a picker row sitting in the page. Pick → export
   fires immediately. ══ */
function QuickPickModal({ title, icon, color, options, onPick, onClose }) {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Icon name={icon} size={16} color={color} /> {title}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <SearchablePicker value={value} onChange={setValue} options={options} placeholder={t('adm_quickpick_placeholder')} />
          <button onClick={() => { if (value) { onPick(value); onClose() } }} disabled={!value}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="download" size={15} color="#181c20" /> {t('adm_pdf_create')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdministrationPage({ articles }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [lieferanten, setLieferanten] = useState([])
  const [bestellungen, setBestellungen] = useState([])
  const [projekte, setProjekte] = useState([])
  const [bewegungen, setBewegungen] = useState([])
  const [inventuren, setInventuren] = useState([])
  const [selectedInventurId, setSelectedInventurId] = useState('')
  const [selectedWareneingangId, setSelectedWareneingangId] = useState('')
  const [selectedProjektId, setSelectedProjektId] = useState('')
  const [selectedJahr, setSelectedJahr] = useState(new Date().getFullYear())
  const [selectedTag, setSelectedTag] = useState(() => new Date().toISOString().slice(0, 10))
  const [tagesTyp, setTagesTyp] = useState('Alle')
  const [tagesQuelle, setTagesQuelle] = useState('Alle')
  const [verbrauchMap, setVerbrauchMap] = useState({})
  const [firma, setFirma] = useState(null)
  const [loading, setLoading] = useState(true)
  const [zipping, setZipping] = useState(false)
  const [history, setHistory] = useState([])
  const [showGenerator, setShowGenerator] = useState(false)
  const [quickPick, setQuickPick] = useState(null) // 'inventur' | 'wareneingang' | 'projektbericht' | null

  // typ must match a REPORT_META key; detail is an optional suffix
  // (e.g. the project name) appended to that type's fixed label. Stored
  // in the DB so the history is shared across devices.
  const logHistory = useCallback(async (typ, detail) => {
    const { data } = await supabase.from('export_protokoll').insert({
      typ, detail: detail || null,
      erstellt_von: profile?.display_name ?? '', erstellt_von_id: profile?.id ?? null,
    }).select().single()
    if (data) setHistory(h => [data, ...h].slice(0, 15))
  }, [profile])

  const removeHistoryEntry = useCallback(async (id) => {
    await supabase.from('export_protokoll').delete().eq('id', id)
    setHistory(h => h.filter(e => e.id !== id))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: l }, { data: b }, { data: p }, { data: bw }, { data: inv }, { data: f }, { data: hist }] = await Promise.all([
      supabase.from('lieferanten').select('*'),
      supabase.from('bestellungen').select('*, lieferant:lieferanten(id,name,steuersatz), positionen:bestellung_positionen(*)').order('created_at'),
      supabase.from('projekte').select('*, material:projekt_material(*), zeiterfassung:projekt_zeiterfassung(*)').order('created_at'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at'),
      supabase.from('inventur_sessions').select('*, erfassungen:inventur_erfassungen(*)').order('created_at', { ascending: false }),
      supabase.from('firmendaten').select('*').eq('id', 1).single(),
      supabase.from('export_protokoll').select('*').order('created_at', { ascending: false }).limit(15),
    ])
    setLieferanten(l ?? [])
    setBestellungen(b ?? [])
    setProjekte(p ?? [])
    setBewegungen(bw ?? [])
    setInventuren(inv ?? [])
    setFirma(f ?? null)
    setHistory(hist ?? [])
    const vm = {}
    ;(bw ?? []).filter(m => m.typ === 'ausgang' && m.projekt_id).forEach(m => {
      vm[m.projekt_id] = vm[m.projekt_id] ?? {}
      vm[m.projekt_id][m.artikel_id] = (vm[m.projekt_id][m.artikel_id] ?? 0) + Number(m.menge)
    })
    setVerbrauchMap(vm)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const reserviertMap = useMemo(() => buildReservierungMap(projekte, verbrauchMap), [projekte, verbrauchMap])

  /* ══ EXCEL DATASETS — shared by the individual buttons and the ZIP bundle.
     Numeric columns stay real numbers (not comma-strings) so Excel can
     sort/sum them and always renders proper columns, independent of
     the user's regional CSV-separator settings. ══ */
  const dsArtikel = useCallback(() => ({
    headers: ['Artikelnummer', 'Bezeichnung', 'Kategorie', 'Lieferant', 'Lagerplatz', 'Bestand', 'Einheit', 'Mindestbestand', 'Reserviert', 'Einkaufspreis', 'Lagerwert'],
    rows: articles.map(a => {
      const lief = lieferanten.find(l => l.id === a.lieferant_id)?.name || a.lieferant || ''
      return [
        a.nummer, a.name, a.kategorie, lief, a.lagerort,
        Number(a.menge), a.einheit, Number(a.mindestbestand), Number(reserviertMap[a.id] ?? 0),
        Number(a.preis), Number(a.menge * a.preis),
      ]
    }),
  }), [articles, lieferanten, reserviertMap])

  const dsBestellungen = useCallback(() => {
    const rows = []
    bestellungen.forEach(b => (b.positionen ?? []).forEach(p => rows.push([
      b.dokument_nr || `#${b.id}`, fmtDt(b.created_at), b.lieferant?.name || '',
      p.artikel_nummer, p.artikel_name, Number(p.menge), p.einheit,
      Number(p.preis ?? 0), Number(p.menge * (p.preis ?? 0)),
      Number(b.lieferant?.steuersatz ?? 19), STATUS_LABEL[b.status] ?? b.status,
    ])))
    return { headers: ['Bestellnummer', 'Datum', 'Lieferant', 'Artikelnummer', 'Artikel', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamtpreis', 'MwSt-Satz', 'Status'], rows }
  }, [bestellungen])

  const dsProjekte = useCallback(() => ({
    headers: ['Projektnummer', 'Projektname', 'Kunde', 'Beginn', 'Ende', 'Status', 'Geplanter Umsatz', 'Materialkosten', 'Arbeitskosten', 'Gewinn'],
    rows: projekte.map(p => [
      p.dokument_nr || `#${p.id}`, p.name, p.kunde, fmtDt(p.created_at),
      fmtDt(p.status === 'abgeschlossen' ? p.abgeschlossen_at : p.rok), STATUS_LABEL[p.status] ?? p.status,
      // Frozen "Geplant" labor cost — not the live elapsed-time figure —
      // so this column always sums correctly to the Gewinn column next
      // to it (projektGewinn is computed from the frozen figure too).
      Number(p.verkaufspreis), Number(materialGeplantWert(p)), Number(p.geplante_arbeitskosten ?? 0),
      Number(p.status === 'abgeschlossen' ? projektRealisierterGewinn(p, verbrauchMap, articles) : projektGewinn(p)),
    ]),
  }), [projekte, verbrauchMap, articles])

  const dsBewegungen = useCallback(() => ({
    headers: ['Datum', 'Art', 'Artikelnummer', 'Artikel', 'Menge', 'Benutzer', 'Projekt', 'Notiz'],
    rows: bewegungen.map(m => [
      new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at)),
      m.typ === 'eingang' ? 'Eingang' : 'Ausgang',
      m.artikel_nummer, m.artikel_name, Number(m.menge), m.von_user, movementProjectLabel(m), m.notiz ?? '',
    ]),
  }), [bewegungen])

  const exportArtikel      = () => { downloadXlsx(`Artikel_${today()}.xlsx`, 'Artikel', dsArtikel().headers, dsArtikel().rows); logHistory('artikel') }
  const exportBestellungen = () => { downloadXlsx(`Bestellungen_${today()}.xlsx`, 'Bestellungen', dsBestellungen().headers, dsBestellungen().rows); logHistory('bestellungen') }
  const exportProjekte     = () => { downloadXlsx(`Projekte_${today()}.xlsx`, 'Projekte', dsProjekte().headers, dsProjekte().rows); logHistory('projekte') }
  const exportBewegungen   = () => { downloadXlsx(`Lagerbewegungen_${today()}.xlsx`, 'Lagerbewegungen', dsBewegungen().headers, dsBewegungen().rows); logHistory('bewegungen') }

  /* ══ PDF BUILDERS — each returns a ready jsPDF doc, reused by the
     single-click buttons and the ZIP bundle ══ */
  const buildTagesbewegungPdf = useCallback(async (tag, typ, quelle) => {
    // Compare local calendar day (not UTC) — same semantics as the
    // "Bewegung heute" filter on Home, so a move logged at 23:50 and
    // one at 00:10 the next local day land on the correct date.
    const [ty, tm, td] = tag.split('-').map(Number)
    const tagMoves = bewegungen.filter(m => {
      const d = new Date(m.created_at)
      return d.getFullYear() === ty && d.getMonth() === tm - 1 && d.getDate() === td &&
        (typ === 'Alle' || m.typ === typ) &&
        (quelle === 'Alle' || bewegungQuelle(m) === quelle)
    })
    const eingang = tagMoves.filter(m => m.typ === 'eingang')
    const ausgang = tagMoves.filter(m => m.typ === 'ausgang')
    const tagLabel = `${String(td).padStart(2, '0')}.${String(tm).padStart(2, '0')}.${ty}`
    const filterLabel = [
      typ !== 'Alle' ? (typ === 'eingang' ? 'Eingang' : 'Ausgang') : null,
      quelle !== 'Alle' ? QUELLE_LABEL[quelle] : null,
    ].filter(Boolean).join(', ')

    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Tagesbewegung',
      subtitle: `${firma?.name ?? ''} · ${tagLabel} · ${eingang.length} Eingänge, ${ausgang.length} Ausgänge${filterLabel ? ` · Filter: ${filterLabel}` : ''}`,
    })
    autoTable(doc, {
      startY,
      head: [['Zeit', 'Art', 'Artikelnr.', 'Artikel', 'Menge', 'Benutzer', 'Quelle', 'Projekt/Notiz']],
      body: tagMoves.map(m => [
        new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at)),
        m.typ === 'eingang' ? 'Eingang' : 'Ausgang',
        m.artikel_nummer, m.artikel_name, deNum(m.menge), m.von_user || '—',
        QUELLE_LABEL[bewegungQuelle(m)], movementProjectLabel(m) || m.notiz || '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 4: { halign: 'right' } },
    })
    return doc
  }, [firma, bewegungen])

  const buildLieferantenPdf = useCallback(async () => {
    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Lieferantenübersicht',
      subtitle: `${firma?.name ?? ''} · Stand ${fmtDt(new Date())}`,
    })
    const stats = lieferantStats(lieferanten, bestellungen)
    autoTable(doc, {
      startY,
      head: [['Lieferant', 'Kontakt', 'Bestellungen', 'Gesamtwert', 'Letzte Bestellung', 'Pünktlich', 'Verspätungen']],
      body: stats.map(s => {
        const letzte = bestellungen.filter(b => b.lieferant_id === s.lieferant.id)
          .reduce((max, b) => !max || new Date(b.created_at) > new Date(max) ? b.created_at : max, null)
        return [
          s.lieferant.name, s.lieferant.ansprechpartner || s.lieferant.email || '—',
          s.anzahl, fmt(s.gesamtwert), letzte ? fmtDt(letzte) : '—',
          s.pctPaetlich === null ? '—' : `${s.pctPaetlich}%`, s.verspaetungenAnzahl,
        ]
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    })
    return doc
  }, [firma, lieferanten, bestellungen])

  const buildLagerbewertungPdf = useCallback(async () => {
    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Lagerbewertung',
      subtitle: `${firma?.name ?? ''} · Stand ${fmtDt(new Date())}`,
    })
    const byKategorie = {}
    articles.forEach(a => {
      const k = a.kategorie || '—'
      byKategorie[k] = byKategorie[k] ?? { menge: 0, wert: 0 }
      byKategorie[k].menge += Number(a.menge)
      byKategorie[k].wert += a.menge * a.preis
    })
    const rows = Object.entries(byKategorie).sort((a, b) => b[1].wert - a[1].wert)
    const gesamtwert = rows.reduce((s, [, v]) => s + v.wert, 0)
    autoTable(doc, {
      startY,
      head: [['Kategorie', 'Menge', 'Wert']],
      body: rows.map(([k, v]) => [k, deNum(v.menge), fmt(v.wert)]),
      foot: [['', 'Gesamt', fmt(gesamtwert)]],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(`${articles.length} Artikel insgesamt`, 14, doc.lastAutoTable.finalY + 10)
    return doc
  }, [firma, articles])

  const buildInventurPdf = useCallback(async (session) => {
    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Inventurliste',
      subtitle: `${session.dokument_nr ? session.dokument_nr + ' · ' : ''}${session.name} · ${fmtDt(session.created_at)}`,
    })
    const rows = (session.erfassungen ?? []).map(e => {
      const a = articles.find(x => x.id === e.artikel_id)
      if (!a) return null
      const diff = e.gezaehlt - a.menge
      return { a, gezaehlt: e.gezaehlt, diff, wert: diff * a.preis }
    }).filter(Boolean)
    const diffs = rows.filter(r => r.diff !== 0)
    const gesamtwertDiff = diffs.reduce((s, r) => s + r.wert, 0)
    autoTable(doc, {
      startY,
      head: [['Artikel', 'Lagerplatz', 'Erwartet', 'Gezählt', 'Differenz', 'Wert']],
      body: rows.map(r => [
        `${r.a.nummer} ${r.a.name}`, r.a.lagerort, deNum(r.a.menge), deNum(r.gezaehlt),
        (r.diff > 0 ? '+' : '') + deNum(r.diff), fmt(r.wert),
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4 && rows[data.row.index]?.diff !== 0) {
          data.cell.styles.textColor = rows[data.row.index].diff < 0 ? [224, 82, 74] : [76, 175, 110]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    doc.setFontSize(9); doc.setTextColor(60)
    doc.text(`${rows.length} Artikel gezählt · ${diffs.length} Abweichungen · Gesamtwert Differenzen: ${fmt(gesamtwertDiff)}`, 14, doc.lastAutoTable.finalY + 10)
    return doc
  }, [firma, articles])

  const buildWareneingangPdf = useCallback(async (b) => {
    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const pageH = doc.internal.pageSize.getHeight()
    const pageW = doc.internal.pageSize.getWidth()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Wareneingang',
      subtitle: `${b.wareneingang_nr || ''} · ${b.lieferant?.name ?? ''} · ${fmtDt(b.eingetroffen_at)}${b.dokument_nr ? ` · Bestellung ${b.dokument_nr}` : ''}`,
    })
    autoTable(doc, {
      startY,
      head: [['Artikelnr.', 'Artikel', 'Bestellt', 'Erhalten', 'Differenz', 'Einheit']],
      body: (b.positionen ?? []).map(p => {
        const erhalten = p.empfangen_menge ?? p.menge
        const diff = erhalten - p.menge
        return [p.artikel_nummer, p.artikel_name, deNum(p.menge), deNum(erhalten), (diff > 0 ? '+' : '') + deNum(diff), p.einheit]
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
    const sigY = Math.max(doc.lastAutoTable.finalY + 30, pageH - 35)
    const sigW = (pageW - 28 - 20) / 2
    doc.setDrawColor(160)
    doc.line(14, sigY, 14 + sigW, sigY)
    doc.line(14 + sigW + 20, sigY, pageW - 14, sigY)
    doc.setFontSize(9); doc.setTextColor(140)
    doc.text('Ort, Datum', 14, sigY + 5)
    doc.text('Unterschrift, Name (Warenannahme)', 14 + sigW + 20, sigY + 5)
    return doc
  }, [firma])

  const buildProjektberichtPdf = useCallback(async (p) => {
    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, {
      logoUrl: firma?.logo_url, title: 'Projektbericht',
      subtitle: `${p.dokument_nr ? p.dokument_nr + ' · ' : ''}${p.name}${p.kunde ? ' · ' + p.kunde : ''}`,
    })
    doc.setFontSize(9); doc.setTextColor(90)
    const meta = [
      ['Beginn:', fmtDt(p.created_at)], ['Rok:', p.rok ? fmtDt(p.rok) : '—'],
      ['Abgeschlossen:', p.abgeschlossen_at ? fmtDt(p.abgeschlossen_at) : '—'], ['Status:', STATUS_LABEL[p.status] ?? p.status],
    ]
    let my = startY
    meta.forEach(([label, val]) => { doc.text(label, 14, my); doc.text(val, 45, my); my += 5.5 })

    autoTable(doc, {
      startY: my + 4,
      head: [['Finanzen', 'Wert']],
      body: [
        ['Geplanter Umsatz', fmt(p.verkaufspreis)],
        ['Materialkosten (geplant)', fmt(materialGeplantWert(p))],
        // Frozen figure, matching Gewinn (geplant) below — using the
        // live elapsed-time cost here would make the two rows not add
        // up to the profit row anymore.
        ['Arbeitskosten (geplant)', fmt(Number(p.geplante_arbeitskosten ?? 0))],
        ['Gewinn (geplant)', fmt(projektGewinn(p))],
        ...(p.status === 'abgeschlossen' ? [['Gewinn (realisiert)', fmt(projektRealisierterGewinn(p, verbrauchMap, articles))]] : []),
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 1: { halign: 'right' } },
      tableWidth: 100,
    })

    const vb = verbrauchMap[p.id] ?? {}
    const materialRows = (p.material ?? []).map(m => {
      const verbraucht = vb[m.artikel_id] ?? 0
      return [m.artikel_name, `${deNum(m.geplant_menge)} ${m.einheit}`, `${deNum(verbraucht)} ${m.einheit}`, `${deNum(m.geplant_menge - verbraucht)} ${m.einheit}`]
    })
    if (materialRows.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Material', 'Geplant', 'Verbraucht', 'Differenz']],
        body: materialRows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 34, 38] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
    }
    return doc
  }, [firma, verbrauchMap, articles])

  const buildJahresberichtPdf = useCallback(async (jahr) => {
    const inJahr = (d) => d && new Date(d).getFullYear() === jahr
    const jBestellungen = bestellungen.filter(b => inJahr(b.created_at))
    const jProjekte = projekte.filter(p => inJahr(p.created_at))
    const jBewegungen = bewegungen.filter(m => inJahr(m.created_at))
    const lagerwert = articles.reduce((s, a) => s + a.menge * a.preis, 0)
    const kaufwert = jBestellungen.reduce((s, b) => s + bestellungTotal(b), 0)
    const projektwert = jProjekte.reduce((s, p) => s + Number(p.verkaufspreis ?? 0), 0)
    const dobit = jProjekte.reduce((s, p) => s + (p.status === 'abgeschlossen'
      ? projektRealisierterGewinn(p, verbrauchMap, articles) : projektGewinn(p)), 0)

    const artikelMap = {}
    jBestellungen.forEach(b => (b.positionen ?? []).forEach(pos => {
      artikelMap[pos.artikel_name] = (artikelMap[pos.artikel_name] ?? 0) + Number(pos.menge)
    }))
    const topArtikel = Object.entries(artikelMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const topLieferanten = lieferantStats(lieferanten, jBestellungen).slice(0, 10)

    const { jsPDF, autoTable } = await loadPdfLibs()
    const doc = new jsPDF()
    const startY = await drawPdfHeader(doc, { logoUrl: firma?.logo_url, title: `Jahresbericht ${jahr}`, subtitle: firma?.name ?? '' })

    autoTable(doc, {
      startY,
      head: [['Kennzahl', 'Wert']],
      body: [
        ['Bestellungen', jBestellungen.length],
        ['Projekte', jProjekte.length],
        ['Wareneingänge', jBewegungen.filter(m => m.typ === 'eingang').length],
        ['Warenausgänge', jBewegungen.filter(m => m.typ === 'ausgang').length],
        ['Einkaufswert', fmt(kaufwert)],
        [`Lagerwert (Stand ${today()})`, fmt(lagerwert)],
        ['Projektvolumen', fmt(projektwert)],
        ['Geschätzter Gewinn', fmt(dobit)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 34, 38] },
      columnStyles: { 1: { halign: 'right' } },
      tableWidth: 100,
    })
    if (topArtikel.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Top 10 Artikel (nach Menge)', 'Menge']],
        body: topArtikel.map(([name, menge]) => [name, deNum(menge)]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 34, 38] },
        columnStyles: { 1: { halign: 'right' } },
        tableWidth: 100,
      })
    }
    if (topLieferanten.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Top 10 Lieferanten', 'Bestellwert']],
        body: topLieferanten.map(s => [s.lieferant.name, fmt(s.gesamtwert)]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 34, 38] },
        columnStyles: { 1: { halign: 'right' } },
        tableWidth: 100,
      })
    }
    return doc
  }, [firma, bestellungen, projekte, bewegungen, articles, verbrauchMap, lieferanten])

  const exportLieferantenPdf    = async () => { (await buildLieferantenPdf()).save(`Lieferantenuebersicht_${today()}.pdf`); logHistory('lieferanten') }
  const exportLagerbewertungPdf = async () => { (await buildLagerbewertungPdf()).save(`Lagerbewertung_${today()}.pdf`); logHistory('lagerbewertung') }
  const exportJahresberichtPdf  = async () => { (await buildJahresberichtPdf(Number(selectedJahr))).save(`Jahresbericht_${selectedJahr}.pdf`); logHistory('jahresbericht', String(selectedJahr)) }
  const exportTagesbewegungPdf  = async () => {
    const suffix = [tagesTyp !== 'Alle' ? tagesTyp : null, tagesQuelle !== 'Alle' ? tagesQuelle : null].filter(Boolean).join('_')
    ;(await buildTagesbewegungPdf(selectedTag, tagesTyp, tagesQuelle)).save(`Tagesbewegung_${selectedTag}${suffix ? '_' + suffix : ''}.pdf`)
    logHistory('tagesbewegung', selectedTag)
  }

  // Each accepts an optional id override so the quick-pick modal can
  // fire the export the instant something's chosen, instead of
  // waiting a render for setSelectedXxxId to land in state first.
  const exportInventurPdf = async (idOverride) => {
    const session = inventuren.find(s => String(s.id) === String(idOverride ?? selectedInventurId))
    if (!session) return
    ;(await buildInventurPdf(session)).save(`Inventurliste_${session.dokument_nr || session.id}.pdf`)
    logHistory('inventur', session.name)
  }
  const exportWareneingangPdf = async (idOverride) => {
    const b = bestellungen.find(x => String(x.id) === String(idOverride ?? selectedWareneingangId))
    if (!b) return
    ;(await buildWareneingangPdf(b)).save(`Wareneingang_${b.wareneingang_nr || b.id}.pdf`)
    logHistory('wareneingang', b.lieferant?.name)
  }
  const exportProjektberichtPdf = async (idOverride) => {
    const p = projekte.find(x => String(x.id) === String(idOverride ?? selectedProjektId))
    if (!p) return
    ;(await buildProjektberichtPdf(p)).save(`Projektbericht_${p.dokument_nr || p.id}.pdf`)
    logHistory('projektbericht', p.name)
  }

  /* ══ ZIP BUNDLE — everything above, packaged for the Steuerberater ══ */
  const exportZip = async () => {
    setZipping(true)
    try {
      const [{ default: JSZip }, lieferantenDoc, lagerbewertungDoc, jahresberichtDoc] = await Promise.all([
        import('jszip'),
        buildLieferantenPdf(),
        buildLagerbewertungPdf(),
        buildJahresberichtPdf(Number(selectedJahr)),
      ])
      const zip = new JSZip()
      zip.file('Lieferantenuebersicht.pdf', lieferantenDoc.output('blob'))
      zip.file('Lagerbewertung.pdf', lagerbewertungDoc.output('blob'))
      zip.file(`Jahresbericht_${selectedJahr}.pdf`, jahresberichtDoc.output('blob'))

      const excelFolder = zip.folder('Excel')
      excelFolder.file('Artikel.xlsx', buildXlsxBlob('Artikel', dsArtikel().headers, dsArtikel().rows))
      excelFolder.file('Bestellungen.xlsx', buildXlsxBlob('Bestellungen', dsBestellungen().headers, dsBestellungen().rows))
      excelFolder.file('Projekte.xlsx', buildXlsxBlob('Projekte', dsProjekte().headers, dsProjekte().rows))
      excelFolder.file('Lagerbewegungen.xlsx', buildXlsxBlob('Lagerbewegungen', dsBewegungen().headers, dsBewegungen().rows))

      if (inventuren.length > 0) {
        const invFolder = zip.folder('Inventurlisten')
        for (const session of inventuren) {
          const doc = await buildInventurPdf(session)
          invFolder.file(`${session.dokument_nr || session.id}.pdf`, doc.output('blob'))
        }
      }
      const receivedBestellungen = bestellungen.filter(b => b.status === 'eingetroffen')
      if (receivedBestellungen.length > 0) {
        const weFolder = zip.folder('Wareneingaenge')
        for (const b of receivedBestellungen) {
          const doc = await buildWareneingangPdf(b)
          weFolder.file(`${b.wareneingang_nr || b.id}.pdf`, doc.output('blob'))
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(`Steuerberater_${selectedJahr}.zip`, blob)
      logHistory('zip', String(selectedJahr))
    } finally {
      setZipping(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const availableYears = [...new Set([
    ...bestellungen.map(b => new Date(b.created_at).getFullYear()),
    ...projekte.map(p => new Date(p.created_at).getFullYear()),
    new Date().getFullYear(),
  ])].sort((a, b) => b - a)

  const receivedBestellungen = bestellungen.filter(b => b.status === 'eingetroffen')
  const inventurOptions = inventuren.map(s => ({ id: s.id, label: `${s.dokument_nr ? s.dokument_nr + ' · ' : ''}${s.name} (${fmtDt(s.created_at)})` }))
  const wareneingangOptions = receivedBestellungen.map(b => ({ id: b.id, label: `${b.wareneingang_nr || `#${b.id}`} · ${b.lieferant?.name} (${fmtDt(b.eingetroffen_at)})` }))
  const projektOptions = projekte.map(p => ({ id: p.id, label: `${p.dokument_nr ? p.dokument_nr + ' · ' : ''}${p.name}` }))

  const excelExports = [
    { icon: REPORT_META.artikel.icon,      color: REPORT_META.artikel.color,      title: t('adm_export_artikel'),      desc: t('adm_export_artikel_desc'),      onClick: exportArtikel, buttonLabel: t('adm_excel_create') },
    { icon: REPORT_META.bestellungen.icon, color: REPORT_META.bestellungen.color, title: t('adm_export_bestellungen'), desc: t('adm_export_bestellungen_desc'), onClick: exportBestellungen, disabled: bestellungen.length === 0, buttonLabel: t('adm_excel_create') },
    { icon: REPORT_META.projekte.icon,     color: REPORT_META.projekte.color,     title: t('adm_export_projekte'),     desc: t('adm_export_projekte_desc'),     onClick: exportProjekte, disabled: projekte.length === 0, buttonLabel: t('adm_excel_create') },
    { icon: REPORT_META.bewegungen.icon,   color: REPORT_META.bewegungen.color,   title: t('adm_export_bewegungen'),   desc: t('adm_export_bewegungen_desc'),   onClick: exportBewegungen, disabled: bewegungen.length === 0, buttonLabel: t('adm_excel_create') },
  ]

  // Inventur/Wareneingang/Projektbericht need one specific record —
  // their card opens the quick-pick modal instead of exporting
  // straight away, so all 6 report cards can sit in one uniform grid.
  const pdfExports = [
    { icon: REPORT_META.lieferanten.icon,    color: REPORT_META.lieferanten.color,    title: t('adm_pdf_lieferanten'), desc: t('adm_pdf_lieferanten_desc'), onClick: exportLieferantenPdf, disabled: lieferanten.length === 0 },
    { icon: REPORT_META.lagerbewertung.icon, color: REPORT_META.lagerbewertung.color, title: t('adm_pdf_lagerbewertung'), desc: t('adm_pdf_lagerbewertung_desc'), onClick: exportLagerbewertungPdf, disabled: articles.length === 0 },
    { icon: REPORT_META.inventur.icon,       color: REPORT_META.inventur.color,       title: t('adm_pdf_inventur'), desc: t('adm_pdf_inventur_desc'), onClick: () => setQuickPick('inventur'), disabled: inventurOptions.length === 0 },
    { icon: REPORT_META.wareneingang.icon,   color: REPORT_META.wareneingang.color,   title: t('adm_pdf_wareneingang'), desc: t('adm_pdf_wareneingang_desc'), onClick: () => setQuickPick('wareneingang'), disabled: wareneingangOptions.length === 0 },
    { icon: REPORT_META.projektbericht.icon, color: REPORT_META.projektbericht.color, title: t('adm_pdf_projektbericht'), desc: t('adm_pdf_projektbericht_desc'), onClick: () => setQuickPick('projektbericht'), disabled: projektOptions.length === 0 },
    { icon: REPORT_META.jahresbericht.icon,  color: REPORT_META.jahresbericht.color,  title: t('adm_pdf_jahresbericht'), desc: t('adm_pdf_jahresbericht_desc'), onClick: exportJahresberichtPdf },
  ]

  const generatorItems = [
    ...pdfExports.filter(e => !e.disabled),
    ...excelExports.filter(e => !e.disabled),
    { icon: REPORT_META.zip.icon, color: REPORT_META.zip.color, title: t('adm_zip_title'), onClick: exportZip },
  ]

  const quickPickMeta = {
    inventur:       { title: t('adm_pdf_inventur'),       options: inventurOptions,       onPick: (id) => { setSelectedInventurId(id); exportInventurPdf(id) } },
    wareneingang:   { title: t('adm_pdf_wareneingang'),    options: wareneingangOptions,    onPick: (id) => { setSelectedWareneingangId(id); exportWareneingangPdf(id) } },
    projektbericht: { title: t('adm_pdf_projektbericht'),  options: projektOptions,          onPick: (id) => { setSelectedProjektId(id); exportProjektberichtPdf(id) } },
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5">
      {/* Header — title, Berichtsgenerator, and next-auto-export preview */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('adm_title')}</h1>
          <p className="text-secondary text-sm">{t('adm_subtitle')}</p>
        </div>
        <div className="flex items-stretch gap-3 shrink-0">
          <button onClick={() => setShowGenerator(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'linear-gradient(135deg,#9b6bd9,#6f47a8)', color: '#fff' }}>
            <Icon name="chart" size={15} color="#fff" /> {t('adm_generator_button')}
          </button>
          {/* Preview of the upcoming automatic-export feature — not wired
              to a real scheduled job yet (Phase 2), so it shows a
              coming-soon state rather than a fake "next run" date. */}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-1 border border-border">
            <div>
              <div className="text-[11px] text-muted">{t('adm_next_auto_export')}</div>
              <div className="text-sm font-semibold text-secondary">{t('adm_coming_soon')}</div>
            </div>
            <Icon name="clipboard" size={18} color="#6b7480" />
          </div>
        </div>
      </div>

      {/* Reports (PDF) + history side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <Card className="lg:col-span-2 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <h2 className="font-semibold text-sm mb-1">{t('adm_pdf_section')}</h2>
          <p className="text-xs text-secondary mb-4">{t('adm_pdf_section_desc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">
            {pdfExports.map(e => <ExportButton key={e.title} {...e} buttonLabel={t('adm_pdf_create')} />)}
          </div>

          <div className="flex items-start gap-2 p-4 bg-bg-2 border border-border rounded-xl">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset"
                 style={{ background: `linear-gradient(135deg, ${REPORT_META.tagesbewegung.color}2e, ${REPORT_META.tagesbewegung.color}0f)`, '--tw-ring-color': `${REPORT_META.tagesbewegung.color}33` }}>
              <Icon name={REPORT_META.tagesbewegung.icon} size={18} color={REPORT_META.tagesbewegung.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1">{t('adm_pdf_tagesbewegung')}</div>
              <div className="grid grid-cols-3 gap-1.5">
                <input type="date" value={selectedTag} onChange={e => setSelectedTag(e.target.value)}
                       className="w-full bg-bg-1 border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber" />
                <select value={tagesTyp} onChange={e => setTagesTyp(e.target.value)}
                        className="w-full bg-bg-1 border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber">
                  <option value="Alle">{t('bew_all_types')}</option>
                  <option value="eingang">{t('bew_only_incoming')}</option>
                  <option value="ausgang">{t('bew_only_outgoing')}</option>
                </select>
                <select value={tagesQuelle} onChange={e => setTagesQuelle(e.target.value)}
                        className="w-full bg-bg-1 border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber">
                  <option value="Alle">{t('adm_tages_all_sources')}</option>
                  <option value="bestellung">{t('adm_tages_source_bestellung')}</option>
                  <option value="inventur">{t('adm_tages_source_inventur')}</option>
                  <option value="manuell">{t('adm_tages_source_manuell')}</option>
                  <option value="sonstige">{t('adm_tages_source_sonstige')}</option>
                </select>
              </div>
            </div>
            <button onClick={exportTagesbewegungPdf}
                    className="p-2.5 rounded-lg bg-bg-3 border border-border shrink-0">
              <Icon name="download" size={15} color="#9aa3ad" />
            </button>
          </div>
        </Card>

        <div className="lg:col-span-1">
          <HistoryPanel history={history} onRemove={removeHistoryEntry} />
        </div>
      </div>

      {/* Bottom row — Excel exports, ZIP bundle, and the (upcoming)
          automation/retention settings side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-stretch">
        <Card className="lg:col-span-2 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <h2 className="font-semibold text-sm mb-1">{t('adm_csv_section')}</h2>
          <p className="text-xs text-secondary mb-4">{t('adm_csv_section_desc')}</p>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {excelExports.map(e => <ExportButton key={e.title} {...e} />)}
          </div>
        </Card>

        <Card className="lg:col-span-1 p-4 sm:p-5 flex flex-col" style={{ borderColor: '#e8821c55' }}>
          <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Icon name="download" size={15} color="#e8821c" /> {t('adm_zip_title')}
          </h2>
          <p className="text-xs text-secondary mb-4 flex-1">{t('adm_zip_desc')}</p>
          <select value={selectedJahr} onChange={e => setSelectedJahr(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-amber mb-2.5">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportZip} disabled={zipping}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="download" size={15} color="#181c20" />
            {zipping ? t('adm_zip_building') : t('adm_zip_button')}
          </button>
        </Card>

        {/* Automation & retention — visual placeholder for the Phase-2
            automatic export; values are illustrative, not yet active. */}
        <Card className="lg:col-span-1 p-4 sm:p-5 flex flex-col">
          <h2 className="font-semibold text-sm mb-0.5">{t('adm_settings_title')}</h2>
          <p className="text-xs text-secondary mb-4">{t('adm_settings_subtitle')}</p>
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-secondary">
                <Icon name="refresh" size={13} color="#6b7480" /> {t('adm_settings_auto_export')}
              </span>
              <span className="text-xs font-medium text-amber">{t('adm_coming_soon')}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-secondary">
                <Icon name="clipboard" size={13} color="#6b7480" /> {t('adm_settings_retention')}
              </span>
              <span className="text-xs font-medium text-muted">{t('adm_settings_retention_value')}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-secondary">
                <Icon name="chart" size={13} color="#6b7480" /> {t('adm_settings_time')}
              </span>
              <span className="text-xs font-medium text-muted">{t('adm_settings_time_value')}</span>
            </div>
          </div>
          <button disabled
                  className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs font-medium bg-bg-2 border border-border text-muted opacity-60 cursor-not-allowed">
            <Icon name="settings" size={13} color="#6b7480" /> {t('adm_settings_manage')}
          </button>
        </Card>
      </div>

      {/* Tipp */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl border"
           style={{ background: 'linear-gradient(135deg,#9b6bd914,#9b6bd908)', borderColor: '#9b6bd940' }}>
        <Icon name="alert" size={15} color="#9b6bd9" className="mt-0.5 shrink-0" />
        <p className="text-xs text-secondary leading-relaxed">{t('adm_tipp')}</p>
      </div>

      {showGenerator && <ReportGeneratorModal items={generatorItems} onClose={() => setShowGenerator(false)} />}

      {quickPick && (
        <QuickPickModal
          title={quickPickMeta[quickPick].title}
          icon={REPORT_META[quickPick].icon}
          color={REPORT_META[quickPick].color}
          options={quickPickMeta[quickPick].options}
          onPick={quickPickMeta[quickPick].onPick}
          onClose={() => setQuickPick(null)}
        />
      )}
    </div>
  )
}
