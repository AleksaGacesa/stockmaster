import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQrScanner } from '../hooks/useQrScanner'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import QrScannerCard from '../components/QrScannerCard'
import StockBadge from '../components/StockBadge'
import ArtikelBild from '../components/ArtikelBild'
import { buildReservierungMap } from '../lib/auftraegeHelpers'

const fmtDt = (d) => new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(d))

/* ══ BUCHEN WIZARD — shared logic, different layout per device ══ */
function useBuchenLogic({ articles, onBooked, profile, projekte }) {
  const { t } = useLanguage()
  const [step, setStep]         = useState('method')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [typ, setTyp]           = useState(null)
  const [menge, setMenge]       = useState('')
  const [projekt, setProjekt]   = useState('')
  const [projektId, setProjektId] = useState('')
  const [bemerkung, setBemerkung] = useState('')
  const [error, setError]       = useState(null)
  const [success, setSuccess]   = useState(null)
  const [warn, setWarn]         = useState(null) // { geplant, verbraucht, menge } or null
  const [booking, setBooking]   = useState(false)
  const [filterKat, setFilterKat]     = useState('Alle')
  const [filterLager, setFilterLager] = useState('Alle')
  const [filterLief, setFilterLief]   = useState('Alle')
  const [filterStock, setFilterStock] = useState('Alle')

  const pickArticle = useCallback((a) => {
    setSelected(a); setStep('form'); setSearch('')
  }, [])

  const { scanning, scanError, setScanError, videoRef, canvasRef, startScan: startScanning, stopScan } =
    useQrScanner(articles, pickArticle)

  const startScan = useCallback(() => { setStep('scan'); startScanning() }, [startScanning])

  // Entering the wizard (scan/search/form) pushes one history entry, so
  // the phone's back gesture steps back into the wizard's start screen
  // instead of leaking through to whatever page was open before
  // Bewegung (previously: straight back to Home, since none of these
  // step changes are real route changes).
  const pushedHistory = useRef(false)
  useEffect(() => {
    if (step === 'method') return
    if (!pushedHistory.current) {
      window.history.pushState({ bewegungWizard: true }, '')
      pushedHistory.current = true
    }
    const onPopState = () => {
      pushedHistory.current = false
      stopScan(); setStep('method'); setSelected(null); setTyp(null)
      setMenge(''); setProjekt(''); setProjektId(''); setBemerkung(''); setError(null); setScanError(null); setSuccess(null)
      setWarn(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [step, stopScan, setScanError])

  const kategorien  = useMemo(() => ['Alle', ...new Set(articles.map(a => a.kategorie).filter(Boolean))].sort(), [articles])
  const lagerorte   = useMemo(() => ['Alle', ...new Set(articles.map(a => a.lagerort).filter(Boolean))].sort(), [articles])
  const lieferanten = useMemo(() => ['Alle', ...new Set(articles.map(a => a.lieferant).filter(Boolean))].sort(), [articles])

  // Shows the full article list by default (not just after typing),
  // so the search step doubles as a browsable catalog — same pattern
  // as the Aufträge "Material hinzufügen" popup. Filters mirror the
  // Artikelübersicht list so this stays usable once the catalog grows
  // into the thousands.
  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter(a =>
      (!q || a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q)) &&
      (filterKat   === 'Alle' || a.kategorie === filterKat) &&
      (filterLager === 'Alle' || a.lagerort  === filterLager) &&
      (filterLief  === 'Alle' || a.lieferant === filterLief) &&
      (filterStock === 'Alle' ||
        (filterStock === 'Niedrig'     && a.menge < a.mindestbestand) ||
        (filterStock === 'Ausreichend' && a.menge >= a.mindestbestand))
    ).slice(0, 150)
  }, [articles, search, filterKat, filterLager, filterLief, filterStock])

  const activeFilters = [filterKat, filterLager, filterLief, filterStock].filter(f => f !== 'Alle').length
  const clearFilters = useCallback(() => {
    setFilterKat('Alle'); setFilterLager('Alle'); setFilterLief('Alle'); setFilterStock('Alle'); setSearch('')
  }, [])

  const reset = useCallback(() => {
    stopScan(); setStep('method'); setSelected(null); setTyp(null)
    setMenge(''); setProjekt(''); setProjektId(''); setBemerkung(''); setError(null); setScanError(null); setSuccess(null)
    setWarn(null)
    // Closed via an in-app button rather than the phone's back gesture —
    // consume the history entry we pushed so it doesn't linger as a
    // dead "back" step the next time the user actually navigates back.
    if (pushedHistory.current) { pushedHistory.current = false; window.history.back() }
  }, [stopScan, setScanError])

  // Actually performs the booking — called directly for the normal
  // case, or after the user confirms the "someone already took this"
  // warning below.
  const doBook = useCallback(async () => {
    const m = Number(menge)
    setBooking(true)
    const projektText = projektId
      ? (projekte.find(p => String(p.id) === String(projektId))?.name ?? '')
      : projekt.trim()
    // Atomic server-side update via RPC — two people booking the same
    // article at once no longer risk one update overwriting the other.
    const notizParts = []
    if (projektText) notizParts.push(`Projekt: ${projektText}`)
    if (bemerkung.trim()) notizParts.push(bemerkung.trim())
    const { error: rpcError } = await supabase.rpc('book_movement', {
      p_artikel_id: selected.id, p_typ: typ, p_menge: m,
      p_projekt: projektText || null,
      p_notiz: notizParts.join(' · '),
      p_von_user: profile?.display_name ?? '', p_von_user_id: profile?.id ?? null,
      p_projekt_id: projektId ? Number(projektId) : null,
    })
    setBooking(false)
    setWarn(null)
    if (rpcError) { setError(rpcError.message); return }
    setSuccess({ typ, menge: m, einheit: selected.einheit, name: selected.name, projekt: projektText })
    onBooked()
    setTimeout(() => { setSuccess(null); reset() }, 2000)
  }, [menge, typ, projekt, projektId, bemerkung, projekte, selected, profile, onBooked, reset])

  const handleSubmit = useCallback(async () => {
    const m = Number(menge)
    if (!menge || m <= 0) { setError(t('bew_qty_required')); return }
    if (typ === 'ausgang' && !projektId && !projekt.trim()) { setError(t('bew_project_required')); return }
    if (typ === 'ausgang' && m > selected.menge) {
      setError(`${t('bew_not_enough_stock')} ${selected.menge} ${selected.einheit}`); return
    }
    setError(null)

    // A colleague may have already booked out this article's planned
    // quantity for the project — warn instead of silently letting a
    // second person blow past the plan unnoticed. Still lets them
    // continue, since the plan can be wrong or extra material genuinely
    // needed. Same for material that was never planned for this
    // project at all (missing projekt_material row).
    if (typ === 'ausgang' && projektId) {
      const { data: matRow } = await supabase.from('projekt_material')
        .select('geplant_menge').eq('projekt_id', projektId).eq('artikel_id', selected.id).maybeSingle()
      if (!matRow) {
        setWarn({ type: 'unplanned', menge: m })
        return
      }
      const { data: bewegungen } = await supabase.from('warenbewegungen')
        .select('menge').eq('projekt_id', projektId).eq('artikel_id', selected.id).eq('typ', 'ausgang')
      const verbraucht = (bewegungen ?? []).reduce((s, b) => s + Number(b.menge), 0)
      if (verbraucht + m > Number(matRow.geplant_menge)) {
        setWarn({ type: 'exceeded', geplant: Number(matRow.geplant_menge), verbraucht, menge: m })
        return
      }
    }
    await doBook()
  }, [menge, typ, projekt, projektId, selected, doBook, t])

  return {
    step, setStep, search, setSearch, selected, typ, setTyp,
    menge, setMenge, projekt, setProjekt, projektId, setProjektId, bemerkung, setBemerkung, error, success,
    scanning, scanError, videoRef, canvasRef,
    startScan, stopScan, pickArticle, results, reset, handleSubmit,
    warn, setWarn, doBook, booking,
    filterKat, setFilterKat, filterLager, setFilterLager, filterLief, setFilterLief,
    filterStock, setFilterStock, kategorien, lagerorte, lieferanten, activeFilters, clearFilters,
  }
}

/* ── Shared sub-components ── */
function SearchView({
  search, setSearch, results, pickArticle, onClose,
  filterKat, setFilterKat, filterLager, setFilterLager, filterLief, setFilterLief, filterStock, setFilterStock,
  kategorien, lagerorte, lieferanten, activeFilters, clearFilters,
}) {
  const { t } = useLanguage()
  const [showFilters, setShowFilters] = useState(false)
  const selClass = (active) => `text-xs rounded-lg px-2.5 py-2 border outline-none ${
    active ? 'border-amber text-amber bg-amber-dim' : 'border-border text-secondary bg-bg-2'
  }`
  return (
    <Card className="w-full max-w-8xl mx-auto flex flex-col" style={{ height: 'min(1050px, 82vh)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 className="text-base font-semibold">{t('bew_search_article')}</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
          <Icon name="x" size={16} color="#9aa3ad" />
        </button>
      </div>
      <div className="px-5 pt-4 pb-3 shrink-0 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Icon name="search" size={15} color="#6b7480" />
            </div>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                   placeholder={t('bew_search_ph')}
                   className="w-full bg-bg-2 border border-border rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:border-amber" />
          </div>
          <button onClick={() => setShowFilters(s => !s)}
                  aria-label={t('ueb_filter_aria')}
                  className={`sm:hidden flex items-center justify-center gap-1 min-w-[44px] px-2.5 py-2 rounded-xl border text-xs transition-colors shrink-0 ${
                    activeFilters > 0 ? 'border-amber text-amber bg-amber-dim' : 'border-border text-secondary bg-bg-2'
                  }`}>
            <Icon name="filter" size={14} color="currentColor" />
            {activeFilters > 0 && <span className="font-semibold">{activeFilters}</span>}
          </button>
        </div>
        <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-wrap gap-2 items-center`}>
          <select value={filterKat} onChange={e => setFilterKat(e.target.value)} className={selClass(filterKat !== 'Alle')}>
            <option value="Alle">{t('ueb_all_categories')}</option>
            {kategorien.filter(k => k !== 'Alle').map(k => <option key={k}>{k}</option>)}
          </select>
          <select value={filterLager} onChange={e => setFilterLager(e.target.value)} className={selClass(filterLager !== 'Alle')}>
            <option value="Alle">{t('ueb_all_locations')}</option>
            {lagerorte.filter(l => l !== 'Alle').map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={filterLief} onChange={e => setFilterLief(e.target.value)} className={selClass(filterLief !== 'Alle')}>
            <option value="Alle">{t('ueb_all_suppliers')}</option>
            {lieferanten.filter(l => l !== 'Alle').map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className={selClass(filterStock !== 'Alle')}>
            <option value="Alle">{t('ueb_all_stock')}</option>
            <option value="Niedrig">{t('ueb_low_stock_option')}</option>
            <option value="Ausreichend">{t('stock_sufficient')}</option>
          </select>
          {activeFilters > 0 && (
            <button onClick={clearFilters}
                    className="text-xs text-secondary border border-border rounded-lg px-2.5 py-2 bg-bg-2 hover:bg-bg-3 flex items-center gap-1.5">
              <Icon name="x" size={12} color="#9aa3ad" /> {t('common_reset_filters')} · {activeFilters}
            </button>
          )}
          <span className="text-xs text-muted ml-auto">{results.length} {t('ueb_articles_word')}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-2 content-start">
        {results.length === 0 ? (
          <p className="text-xs text-muted text-center py-6 col-span-2">{t('bew_no_articles_found')}</p>
        ) : (
          results.map(a => (
            <button key={a.id} onClick={() => pickArticle(a)}
                    className="text-left px-3 py-2.5 rounded-xl bg-bg-2 border border-border hover:border-amber hover:bg-bg-3 transition-colors flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0">
                <ArtikelBild artikel={a} iconSize={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted font-mono">{a.nummer} · {a.lagerort}</div>
                <div className="mt-1"><StockBadge menge={a.menge} mindestbestand={a.mindestbestand} /></div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold">{a.menge}</div>
                <div className="text-[10px] text-muted">{a.einheit}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  )
}

function FormView({ selected, typ, setTyp, menge, setMenge, projekt, setProjekt, projektId, setProjektId, projekte, error, success, handleSubmit, reset, warn, setWarn, doBook, booking }) {
  const { t, lang } = useLanguage()
  const warnMsg = warn ? (warn.type === 'unplanned'
    ? (lang === 'en'
        ? `This material wasn't planned for this project. Book it anyway?`
        : `Dieses Material wurde für dieses Projekt nicht eingeplant. Trotzdem buchen?`)
    : (lang === 'en'
        ? `This project has ${warn.geplant} ${selected.einheit} planned, of which ${warn.verbraucht} have already been booked${warn.verbraucht >= warn.geplant ? ' — the requirement is already covered' : ''}. Maybe another employee has already taken this article.`
        : `Für dieses Projekt sind ${warn.geplant} ${selected.einheit} geplant, davon wurden bereits ${warn.verbraucht} gebucht${warn.verbraucht >= warn.geplant ? ' — der Bedarf ist schon gedeckt' : ''}. Vielleicht hat ein anderer Mitarbeiter diesen Artikel schon entnommen.`)
  ) : ''
  const bookAnywayLabel = warn ? (lang === 'en' ? `Book ${warn.menge} anyway` : `Trotzdem ${warn.menge} buchen`) : ''
  return (
    <div className="w-full max-w-2xl space-y-4">
      {/* Selected article */}
      <Card className="p-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
          <ArtikelBild artikel={selected} iconSize={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-amber">{selected.nummer}</div>
          <div className="font-semibold text-sm truncate">{selected.name}</div>
          <div className="text-xs text-secondary">{selected.menge} {selected.einheit} · {selected.lagerort}</div>
        </div>
        <button onClick={reset} className="p-1.5 rounded-lg border border-border hover:bg-bg-2 shrink-0">
          <Icon name="x" size={14} color="#9aa3ad" />
        </button>
      </Card>

      {!typ ? (
        <div className="flex gap-3">
          {[
            { typ: 'eingang', label: t('bew_incoming'), icon: 'arrowDown', color: 'rgb(var(--color-green))', bg: 'var(--color-green-dim)' },
            { typ: 'ausgang', label: t('bew_outgoing'), icon: 'arrowUp',   color: 'rgb(var(--color-red))', bg: 'var(--color-red-dim)' },
          ].map(b => (
            <button key={b.typ} onClick={() => setTyp(b.typ)}
                    className="flex-1 border rounded-xl py-4 flex flex-col items-center gap-2 transition-all hover:-translate-y-0.5"
                    style={{ background: b.bg, borderColor: b.color }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: b.color + '33' }}>
                <Icon name={b.icon} size={20} color={b.color} />
              </div>
              <span className="font-semibold text-sm" style={{ color: b.color }}>{b.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2">
              <Icon name={typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={15}
                    color={typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
              {typ === 'eingang' ? t('bew_incoming') : t('bew_outgoing')}
            </span>
            <button onClick={() => setTyp(null)} className="text-xs text-muted hover:text-secondary">{t('bew_change')}</button>
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">
              {t('ueb_col_qty')} ({selected.einheit}) <span className="text-red">*</span>
            </label>
            <input autoFocus type="number" value={menge} onChange={e => setMenge(e.target.value)}
                   placeholder="0"
                   className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber" />
          </div>
          {typ === 'ausgang' ? (
            <div>
              <label className="block text-xs text-secondary mb-1">
                {t('bew_project')} <span className="text-red">*</span>
              </label>
              <select value={projektId} onChange={e => { setProjektId(e.target.value); if (e.target.value) setProjekt('') }}
                      className={`w-full bg-bg-2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber ${projekte.length > 0 ? 'mb-2' : ''}`}>
                <option value="">{t('bew_project_freetext')}</option>
                {projekte.map(p => <option key={p.id} value={p.id}>{p.name}{p.kunde ? ` (${p.kunde})` : ''}</option>)}
              </select>
              {!projektId && (
                <input type="text" value={projekt} onChange={e => setProjekt(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                       placeholder={t('bew_project_ph')}
                       className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber" />
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs text-secondary mb-1">
                {t('bew_project')} <span className="text-muted">({t('bew_project_optional')})</span>
              </label>
              <input type="text" value={projekt} onChange={e => setProjekt(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                     placeholder={t('bew_delivery_ph')}
                     className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red text-xs bg-red-dim rounded-xl px-3 py-2">
              <Icon name="alert" size={13} color="rgb(var(--color-red))" /> {error}
            </div>
          )}
          {warn ? (
            <div className="bg-amber-dim border border-amber/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-start gap-2 text-amber text-xs">
                <Icon name="alert" size={14} color="#e8821c" className="mt-0.5 shrink-0" />
                <span>{warnMsg}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={doBook} disabled={booking}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: 'rgb(var(--color-red))' }}>
                  {booking ? t('bew_booking') : bookAnywayLabel}
                </button>
                <button onClick={() => setWarn(null)} disabled={booking}
                        className="flex-1 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary disabled:opacity-60">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center py-3 gap-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                   style={{ background: success.typ === 'eingang' ? 'var(--color-green-dim)' : 'var(--color-red-dim)' }}>
                <Icon name="check" size={24} color={success.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
              </div>
              <div className="text-center">
                <div className="font-semibold text-sm">
                  {success.typ === 'eingang' ? t('bew_incoming_booked') : t('bew_outgoing_booked')}
                </div>
                <div className="text-secondary text-xs">{success.menge} {success.einheit} · {success.name}</div>
              </div>
            </div>
          ) : (
            <button onClick={handleSubmit}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))' }}>
              {typ === 'eingang' ? t('bew_book_incoming') : t('bew_book_outgoing')}
            </button>
          )}
        </Card>
      )}
    </div>
  )
}

/* ══ MOBILE BUCHEN ══ */
function MobileBuchen({ articles, onBooked, projekte }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const logic = useBuchenLogic({ articles, onBooked, profile, projekte })
  const { step, setStep, search, setSearch, selected, typ, setTyp, menge, setMenge,
          projekt, setProjekt, projektId, setProjektId, error, success, scanning, scanError, videoRef, canvasRef,
          startScan, pickArticle, results, reset, handleSubmit, warn, setWarn, doBook, booking,
          filterKat, setFilterKat, filterLager, setFilterLager, filterLief, setFilterLief,
          filterStock, setFilterStock, kategorien, lagerorte, lieferanten, activeFilters, clearFilters } = logic

  if (step === 'method') return (
    <div className="flex flex-col gap-3">
      <button onClick={startScan}
              className="flex items-center gap-4 p-4 bg-bg-1 border border-border rounded-2xl hover:border-amber transition-colors"
              onTouchStart={() => {}}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)' }}>
          <Icon name="scan" size={24} color="#181c20" />
        </div>
        <div className="text-left">
          <div className="font-semibold text-sm">{t('bew_scan_qr')}</div>
          <div className="text-secondary text-xs mt-0.5">{t('bew_scan_qr_desc')}</div>
        </div>
        <Icon name="chevronRight" size={16} color="#6b7480" className="ml-auto" />
      </button>
      <button onClick={() => setStep('search')}
              className="flex items-center gap-4 p-4 bg-bg-1 border border-border rounded-2xl hover:border-blue transition-colors"
              onTouchStart={() => {}}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'linear-gradient(135deg,#5a9fe0,#3a6fb0)' }}>
          <Icon name="search" size={24} color="#181c20" />
        </div>
        <div className="text-left">
          <div className="font-semibold text-sm">{t('bew_search_article')}</div>
          <div className="text-secondary text-xs mt-0.5">{t('bew_search_article_desc')}</div>
        </div>
        <Icon name="chevronRight" size={16} color="#6b7480" className="ml-auto" />
      </button>
    </div>
  )

  if (step === 'scan') return (
    <QrScannerCard scanning={scanning} scanError={scanError} videoRef={videoRef} canvasRef={canvasRef}
              onSearchFallback={() => setStep('search')} onClose={reset} />
  )
  if (step === 'search') return (
    <SearchView search={search} setSearch={setSearch} results={results}
                pickArticle={pickArticle} onClose={reset}
                filterKat={filterKat} setFilterKat={setFilterKat}
                filterLager={filterLager} setFilterLager={setFilterLager}
                filterLief={filterLief} setFilterLief={setFilterLief}
                filterStock={filterStock} setFilterStock={setFilterStock}
                kategorien={kategorien} lagerorte={lagerorte} lieferanten={lieferanten}
                activeFilters={activeFilters} clearFilters={clearFilters} />
  )
  if (step === 'form' && selected) return (
    <FormView selected={selected} typ={typ} setTyp={setTyp} menge={menge} setMenge={setMenge}
              projekt={projekt} setProjekt={setProjekt} projektId={projektId} setProjektId={setProjektId} projekte={projekte}
              error={error} success={success}
              handleSubmit={handleSubmit} reset={reset}
              warn={warn} setWarn={setWarn} doBook={doBook} booking={booking} />
  )
  return null
}

/* ══ DESKTOP BUCHEN — Bestands-Dashboard ══ */
const fmtEur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

// Status is judged on what is actually AVAILABLE (stock minus what open
// projects have reserved), not the raw shelf quantity.
const BEW_STATUS = {
  ausreichend: { labelKey: 'lief_status_ausreichend',   color: '#4caf6e' },
  knapp:       { labelKey: 'lief_status_knapp',         color: '#e8821c' },
  niedrig:     { labelKey: 'lief_status_niedrig',       color: '#e0524a' },
  nicht_verf:  { labelKey: 'bew_status_nicht_verf',     color: '#e0524a' },
}
const bewStatus = (a, verfuegbar) => {
  if (verfuegbar <= 0 && a.menge > 0) return 'nicht_verf'
  if (verfuegbar < a.mindestbestand) return 'niedrig'
  if (verfuegbar < a.mindestbestand * 1.5) return 'knapp'
  return 'ausreichend'
}

function BewStatusBadge({ status }) {
  const { t } = useLanguage()
  const m = BEW_STATUS[status]
  return (
    <span className="text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: m.color + '1a', color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {t(m.labelKey)}
    </span>
  )
}

function BewStatCard({ label, value, sub, subColor, icon, color }) {
  return (
    <Card className="p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1f' }}>
          <Icon name={icon} size={15} color={color} />
        </div>
        <span className="text-xs text-secondary leading-tight">{label}</span>
      </div>
      <div className="text-lg font-bold font-mono truncate">{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: subColor ?? 'rgb(var(--text-muted))' }}>
        {sub ?? ' '}
      </div>
    </Card>
  )
}

/* 30-day stock line, reconstructed backwards from the article's own
   movements: today's quantity is known, each day's point re-adds what
   left and removes what arrived after it. */
function Verlauf30Chart({ artikel, artMoves }) {
  const { t } = useLanguage()
  const points = useMemo(() => {
    const days = 30
    const now = new Date(); now.setHours(23, 59, 59, 999)
    const pts = []
    for (let i = days; i >= 0; i--) {
      const end = new Date(now.getTime() - i * 86400000)
      let m = Number(artikel.menge)
      artMoves.forEach(mv => {
        if (new Date(mv.created_at) > end) m += (mv.typ === 'eingang' ? -1 : 1) * Number(mv.menge)
      })
      pts.push(Math.max(m, 0))
    }
    return pts
  }, [artikel, artMoves])

  const W = 250, H = 66, PAD = 6
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const xy = (v, i) => `${PAD + (i / (points.length - 1)) * (W - PAD * 2)},${H - PAD - ((v - min) / span) * (H - PAD * 2)}`
  const poly = points.map((v, i) => xy(v, i)).join(' ')
  const fmtTag = (offset) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
    .format(new Date(Date.now() - offset * 86400000))

  return (
    <div className="bg-bg-2 border border-border rounded-xl p-2.5">
      <div className="text-[11px] text-secondary mb-1.5">{t('bew_verlauf30')}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <polyline points={poly} fill="none" stroke="#e8821c" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
        {points.map((v, i) => i % 5 === 0 && (
          <circle key={i} cx={xy(v, i).split(',')[0]} cy={xy(v, i).split(',')[1]} r="1.8" fill="#e8821c" />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-muted font-mono mt-1">
        <span>{fmtTag(30)}</span><span>{fmtTag(22)}</span><span>{fmtTag(15)}</span><span>{fmtTag(7)}</span><span>{fmtTag(0)}</span>
      </div>
    </div>
  )
}

const BEW_PAGE_DEFAULT = 10

function DesktopBuchen({ articles, onBooked, projekte, lieferantenInfo, reservierungMap, moves, onShowVerlauf }) {
  const { profile } = useAuth()
  const { t, lang } = useLanguage()
  const logic = useBuchenLogic({ articles, onBooked, profile, projekte })
  const { selected, typ, setTyp, menge, setMenge, projektId, setProjektId,
          bemerkung, setBemerkung, error, success, pickArticle, reset,
          handleSubmit, warn, setWarn, doBook, booking,
          filterKat, setFilterKat, filterLager, setFilterLager, filterLief, setFilterLief,
          filterStock, setFilterStock, kategorien, lagerorte, lieferanten } = logic
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [artMoves, setArtMoves] = useState([])

  useEffect(() => { setPage(0) }, [search, filterKat, filterLager, filterLief, filterStock])

  // Booking type defaults to Wareneingang once something is selected.
  useEffect(() => { if (selected && !typ) setTyp('eingang') }, [selected, typ, setTyp])

  /* ── derived per-article numbers ── */
  const reserviert = (a) => Math.min(reservierungMap[a.id] ?? 0, Number(a.menge))
  const verfuegbar = (a) => Math.max(Number(a.menge) - (reservierungMap[a.id] ?? 0), 0)

  /* ── headline stats ── */
  const wocheAgo = new Date(Date.now() - 7 * 86400000)
  const vor14 = new Date(Date.now() - 14 * 86400000)
  const gesamtWert = articles.reduce((s, a) => s + Number(a.menge) * Number(a.preis), 0)
  const reserviertWert = articles.reduce((s, a) => s + reserviert(a) * Number(a.preis), 0)
  const verfuegbarWert = gesamtWert - reserviertWert
  const neueArtikel = articles.filter(a => a.created_at && new Date(a.created_at) >= wocheAgo).length
  const moves7 = moves.filter(m => new Date(m.created_at) >= wocheAgo).length
  const movesVor7 = moves.filter(m => { const d = new Date(m.created_at); return d >= vor14 && d < wocheAgo }).length
  const pct = (v) => gesamtWert > 0 ? `${((v / gesamtWert) * 100).toFixed(1).replace('.', ',')}% ${t('bew_vom_bestand')}` : undefined

  /* ── table filtering + adaptive paging (viewport-pinned layout) ── */
  const filtered = articles.filter(a => {
    const q = search.trim().toLowerCase()
    const st = bewStatus(a, verfuegbar(a))
    return (
      (!q || a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q)) &&
      (filterKat   === 'Alle' || a.kategorie === filterKat) &&
      (filterLager === 'Alle' || a.lagerort  === filterLager) &&
      (filterLief  === 'Alle' || a.lieferant === filterLief) &&
      (filterStock === 'Alle' ||
        (filterStock === 'Niedrig'     && (st === 'niedrig' || st === 'nicht_verf')) ||
        (filterStock === 'Knapp'       && st === 'knapp') ||
        (filterStock === 'Ausreichend' && st === 'ausreichend'))
    )
  })

  const rootRef = useRef(null)
  const [tabH, setTabH] = useState(null)
  useEffect(() => {
    const calc = () => {
      const el = rootRef.current
      if (!el) return
      setTabH(Math.max(window.innerHeight - el.getBoundingClientRect().top - 28, 420))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])
  const tableBoxRef = useRef(null)
  const [pageSize, setPageSize] = useState(BEW_PAGE_DEFAULT)
  useEffect(() => {
    const el = tableBoxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (!window.matchMedia('(min-width: 1280px)').matches) { setPageSize(BEW_PAGE_DEFAULT); return }
      const h = el.clientHeight
      if (h > 0) setPageSize(Math.min(Math.max(Math.floor((h - 36) / 60), 5), 40))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const from = filtered.length === 0 ? 0 : safePage * pageSize + 1
  const to = Math.min((safePage + 1) * pageSize, filtered.length)

  const sel = selected ?? paged[0] ?? null
  const selId = sel?.id ?? null
  // The details chart and "letzte Bewegung" need this article's own
  // movement history — the shared `moves` prop only holds the newest
  // 200 across all articles. Keyed on the effective selection (incl.
  // the default first row), not just an explicit pick.
  useEffect(() => {
    if (!selId) { setArtMoves([]); return }
    supabase.from('warenbewegungen').select('typ, menge, created_at')
      .eq('artikel_id', selId).order('created_at', { ascending: false }).limit(150)
      .then(({ data }) => setArtMoves(data ?? []))
  }, [selId])
  const selLief = sel ? lieferantenInfo.find(l => l.id === sel.lieferant_id) : null
  const selVerf = sel ? verfuegbar(sel) : 0
  const selRes  = sel ? reserviert(sel) : 0
  const lastMove = artMoves[0] ?? null
  const fmtLastMove = (ts) => {
    const d = new Date(ts)
    const zeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d)
    return new Date().toDateString() === d.toDateString()
      ? `${t('mon_heute')}, ${zeit} Uhr`
      : `${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(d)}, ${zeit} Uhr`
  }

  const warnMsg = warn ? (warn.type === 'unplanned'
    ? (lang === 'en'
        ? `This material wasn't planned for this project. Book it anyway?`
        : `Dieses Material wurde für dieses Projekt nicht eingeplant. Trotzdem buchen?`)
    : (lang === 'en'
        ? `This project has ${warn.geplant} planned, of which ${warn.verbraucht} are already booked. Book anyway?`
        : `Für dieses Projekt sind ${warn.geplant} geplant, davon wurden bereits ${warn.verbraucht} gebucht. Trotzdem buchen?`)
  ) : ''

  const detailRow = (label, value) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )

  return (
    <div ref={rootRef} className="space-y-4 xl:flex xl:flex-col xl:overflow-hidden xl:h-[var(--tab-h)]"
         style={{ '--tab-h': tabH ? `${tabH}px` : 'auto' }}>
      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 xl:shrink-0">
        <BewStatCard label={t('bew_stat_gesamtartikel')} value={articles.length} icon="package" color="#4a90d9"
                     sub={neueArtikel > 0 ? `+${neueArtikel} ${t('bew_seit_woche')}` : undefined}
                     subColor="rgb(var(--color-green))" />
        <BewStatCard label={t('bew_stat_bestandswert')} value={fmtEur(gesamtWert)} icon="chart" color="#4caf6e" />
        <BewStatCard label={t('bew_stat_reserviert')} value={fmtEur(reserviertWert)} icon="box" color="#e8821c"
                     sub={pct(reserviertWert)} />
        <BewStatCard label={t('bew_stat_verfuegbar')} value={fmtEur(verfuegbarWert)} icon="check" color="#4caf6e"
                     sub={pct(verfuegbarWert)} subColor="rgb(var(--color-green))" />
        <BewStatCard label={t('bew_stat_letzte7')} value={moves7} icon="refresh" color="#9b6bd9"
                     sub={`${moves7 - movesVor7 >= 0 ? '+' : ''}${moves7 - movesVor7} ${t('bew_vs_vorherige')}`}
                     subColor={moves7 - movesVor7 >= 0 ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
      </div>

      {/* ── search + filters ── */}
      <Card className="p-3 space-y-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:shrink-0">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('bew_search_big_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { v: filterKat, set: setFilterKat, opts: kategorien, all: t('lief_alle_kategorien') },
            { v: filterLager, set: setFilterLager, opts: lagerorte, all: t('bew_alle_lagerorte') },
            { v: filterLief, set: setFilterLief, opts: lieferanten, all: t('lief_alle_lieferanten') },
          ].map((f, i) => (
            <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                    className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
              {f.opts.map(o => <option key={o} value={o}>{o === 'Alle' ? f.all : o}</option>)}
            </select>
          ))}
          <select value={filterStock} onChange={e => setFilterStock(e.target.value)}
                  className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-secondary outline-none">
            <option value="Alle">{t('lief_bestand_alle')}</option>
            <option value="Ausreichend">{t('lief_status_ausreichend')}</option>
            <option value="Knapp">{t('lief_status_knapp')}</option>
            <option value="Niedrig">{t('lief_status_niedrig')}</option>
          </select>
        </div>
      </Card>

      <div className="flex flex-col xl:flex-row gap-4 xl:flex-1 xl:min-h-0">
        {/* ══ MAIN: stock table ══ */}
        <div className="flex-1 min-w-0 w-full flex flex-col xl:min-h-0">
          <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex-1 flex flex-col xl:min-h-0">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-muted text-sm">{t('bew_no_articles_found')}</p>
            ) : (
              <>
                <div ref={tableBoxRef} className="overflow-x-auto flex-1 xl:min-h-0 xl:overflow-y-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_artikel')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_nummer')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_lagerort')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_bestand')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_verfuegbar')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_reserviert')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_einheit')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_wert')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('bew_col_status')}</th>
                        <th className="px-3 py-2.5 font-medium text-right">{t('bew_col_aktion')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(a => {
                        const verf = verfuegbar(a), res = reserviert(a)
                        const st = bewStatus(a, verf)
                        const isSel = sel?.id === a.id
                        return (
                          <tr key={a.id} onClick={() => pickArticle(a)}
                              className={`border-b border-border last:border-0 cursor-pointer transition-colors ${isSel ? 'bg-bg-2' : 'hover:bg-bg-2/60'}`}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-border">
                                  <ArtikelBild artikel={a} iconSize={14} />
                                </div>
                                <span className="font-medium truncate max-w-[170px]">{a.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-secondary whitespace-nowrap">{a.nummer}</td>
                            <td className="px-3 py-2 text-xs text-secondary whitespace-nowrap">{a.lagerort || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{a.menge}</td>
                            <td className={`px-3 py-2 font-mono text-xs whitespace-nowrap font-semibold ${verf <= 0 ? 'text-red' : verf < a.mindestbestand ? 'text-red' : 'text-green'}`}>
                              {verf}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-amber font-semibold">
                              {res > 0 ? res : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs text-secondary whitespace-nowrap">{a.einheit}</td>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{fmtEur(Number(a.menge) * Number(a.preis))}</td>
                            <td className="px-3 py-2"><BewStatusBadge status={st} /></td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-0.5">
                                <button title={t('bew_outgoing')}
                                        onClick={e => { e.stopPropagation(); pickArticle(a); setTyp('ausgang') }}
                                        className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                                  <Icon name="cart" size={13} color="#9aa3ad" />
                                </button>
                                <button title={t('bew_tab_verlauf')}
                                        onClick={e => { e.stopPropagation(); onShowVerlauf(a.nummer) }}
                                        className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                                  <Icon name="clock" size={13} color="#9aa3ad" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); pickArticle(a) }}
                                        className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                                  <Icon name="dots" size={13} color="#9aa3ad" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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

        {/* ══ RIGHT PANEL — booking on top, details fill down to the
            table's bottom edge; scrolls internally on xl if needed ══ */}
        <div className="w-full xl:w-80 shrink-0 space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:flex xl:flex-col">
          {sel ? (
            <>
              {/* Buchung erfassen — on top, the action the user came for */}
              <Card className="p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <h3 className="font-semibold text-sm mb-3">{t('bew_buchung_erfassen')}</h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { id: 'eingang', label: t('bew_incoming'), icon: 'arrowDown', color: 'rgb(var(--color-green))', bg: 'var(--color-green-dim)' },
                    { id: 'ausgang', label: t('bew_outgoing'), icon: 'arrowUp',   color: 'rgb(var(--color-red))',   bg: 'var(--color-red-dim)' },
                  ].map(o => (
                    <button key={o.id} onClick={() => { setTyp(o.id); setWarn(null) }}
                            className="flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all"
                            style={{
                              background: o.bg, color: o.color,
                              borderColor: typ === o.id ? o.color : 'transparent',
                              opacity: typ === o.id ? 1 : 0.55,
                            }}>
                      <Icon name={o.icon} size={13} color={o.color} />
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {typ === 'ausgang' && (
                    <div>
                      <label className="block text-[11px] text-secondary mb-1">{t('bew_projekt_montage')}</label>
                      <select value={projektId} onChange={e => setProjektId(e.target.value)}
                              className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber">
                        <option value="">{t('bew_projekt_waehlen')}</option>
                        {projekte.map(p => <option key={p.id} value={p.id}>{p.name}{p.kunde ? ` — ${p.kunde}` : ''}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">{t('bew_menge')} ({sel.einheit})</label>
                    <div className="relative">
                      <input type="number" min="0" value={menge} onChange={e => setMenge(e.target.value)} placeholder="0"
                             className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2 pr-12 text-sm font-mono outline-none focus:border-amber" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{sel.einheit}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">{t('bew_bemerkung')}</label>
                    <input type="text" value={bemerkung} onChange={e => setBemerkung(e.target.value)}
                           placeholder={t('bew_bemerkung_ph')}
                           className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber" />
                  </div>
                  {error && <p className="text-red text-xs">{error}</p>}
                  {success && (
                    <div className="flex items-center gap-2 text-green text-xs bg-green-dim rounded-xl px-3 py-2 animate-fade-up">
                      <Icon name="check" size={13} color="#4caf6e" />
                      {success.typ === 'eingang' ? '+' : '−'}{success.menge} {success.einheit} · {success.name}
                    </div>
                  )}
                  {warn ? (
                    <div className="bg-amber-dim border border-amber/40 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-amber">{warnMsg}</p>
                      <div className="flex gap-2">
                        <button onClick={doBook} disabled={booking}
                                className="flex-1 bg-amber text-bg-0 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60">
                          {lang === 'en' ? 'Book anyway' : 'Trotzdem buchen'}
                        </button>
                        <button onClick={() => setWarn(null)}
                                className="text-xs text-secondary border border-border px-3 py-2 rounded-lg hover:bg-bg-2">
                          {t('common_cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={handleSubmit} disabled={booking || !typ}
                            className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                      {booking ? '…' : typ === 'ausgang' ? t('bew_ausgang_buchen') : t('bew_eingang_buchen')}
                    </button>
                  )}
                </div>
              </Card>

              {/* Artikel Details — compact, stretches to the column bottom */}
              <Card className="p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:flex-1 xl:flex xl:flex-col">
                <h3 className="font-semibold text-sm mb-2">{t('bew_details_titel')}</h3>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
                    <ArtikelBild artikel={sel} iconSize={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{sel.name}</div>
                    <div className="text-[11px] font-mono text-amber">{sel.nummer}</div>
                  </div>
                  <BewStatusBadge status={bewStatus(sel, selVerf)} />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2">
                  {detailRow(t('bew_col_lagerort'), sel.lagerort || '—')}
                  {detailRow(t('bew_col_einheit'), sel.einheit)}
                  {detailRow(t('bew_lieferant'), sel.lieferant || '—')}
                  {detailRow(t('bew_lieferzeit'), selLief?.lieferzeit || '—')}
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-2 border-t border-border pt-2 mt-2">
                  {detailRow(t('bew_col_bestand'), <span className="font-mono">{sel.menge} {sel.einheit}</span>)}
                  {detailRow(t('bew_col_verfuegbar'), <span className={`font-mono ${selVerf < sel.mindestbestand ? 'text-red' : 'text-green'}`}>{selVerf} {sel.einheit}</span>)}
                  {detailRow(t('bew_col_reserviert'), <span className="font-mono text-amber">{selRes} {sel.einheit}</span>)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2 mt-2 mb-2">
                  {detailRow(t('bew_col_wert'), <span className="font-mono">{fmtEur(Number(sel.menge) * Number(sel.preis))}</span>)}
                  {detailRow(t('bew_letzte_bewegung'),
                    lastMove
                      ? <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} color="#9aa3ad" /> {fmtLastMove(lastMove.created_at)}</span>
                      : '—')}
                </div>
                <div className="xl:mt-auto">
                  <Verlauf30Chart artikel={sel} artMoves={artMoves} />
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-6 text-center">
              <Icon name="box" size={24} color="#6b7480" />
              <p className="text-muted text-xs mt-2">{t('bew_kein_artikel')}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// A movement tied to a real project (projekt_id) shows that project's
// PROJ-2026-xxxxxx number — only free-typed project text (no linked
// project row) falls back to whatever was manually entered.
const movementProjectLabel = (m) => m.projekte?.dokument_nr
  ? `${m.projekte.dokument_nr}${m.projekt ? ' · ' + m.projekt : ''}`
  : (m.projekt || '')

/* ══ VERLAUF TAB ══ */
function VerlaufTab({ moves, initialSearch }) {
  const { t, lang } = useLanguage()
  const [search, setSearch]       = useState(initialSearch ?? '')
  const [filterTyp, setFilterTyp] = useState('Alle')

  // Arriving via an article row's clock button — prefilter to it.
  useEffect(() => { if (initialSearch) setSearch(initialSearch) }, [initialSearch])

  const filtered = useMemo(() => moves.filter(m => {
    const q = search.toLowerCase()
    return (
      (!q || m.artikel_name.toLowerCase().includes(q) || m.artikel_nummer.toLowerCase().includes(q) ||
       movementProjectLabel(m).toLowerCase().includes(q) || (m.von_user || '').toLowerCase().includes(q)) &&
      (filterTyp === 'Alle' || m.typ === filterTyp)
    )
  }), [moves, search, filterTyp])

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: t('bew_total'),          value: moves.length,                              color: '' },
          { label: t('bew_incoming_plural'), value: moves.filter(m => m.typ === 'eingang').length, color: 'text-green' },
          { label: t('bew_outgoing_plural'), value: moves.filter(m => m.typ === 'ausgang').length, color: 'text-red' },
        ].map(s => (
          <Card key={s.label} className="p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="text-xs text-muted mb-1">{s.label}</div>
            <div className={`text-lg sm:text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <Card className="p-3 flex flex-wrap gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="relative flex-1 min-w-[160px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={13} color="#6b7480" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder={t('bew_filter_ph')}
                 className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-amber" />
        </div>
        <select value={filterTyp} onChange={e => setFilterTyp(e.target.value)}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
          <option value="Alle">{t('bew_all_types')}</option>
          <option value="eingang">{t('bew_only_incoming')}</option>
          <option value="ausgang">{t('bew_only_outgoing')}</option>
        </select>
      </Card>

      {/* Mobile list */}
      <div className="sm:hidden space-y-1.5">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted text-sm">{t('bew_no_movements_found')}</Card>
        ) : filtered.map(m => (
          <div key={m.id} className="bg-bg-1 border border-border rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={14}
                    color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.artikel_name}</div>
                <div className="flex items-center gap-2 text-xs mt-0.5">
                  <span className={`font-mono font-semibold ${m.typ === 'eingang' ? 'text-green' : 'text-red'}`}>
                    {m.typ === 'eingang' ? '+' : '−'}{m.menge}
                  </span>
                  {movementProjectLabel(m) && <span className="text-muted truncate">{movementProjectLabel(m)}</span>}
                  {m.von_user && <span className="text-muted ml-auto shrink-0">{m.von_user}</span>}
                </div>
              </div>
              <div className="text-xs text-muted font-mono shrink-0">
                {new Date(m.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">{t('bew_no_movements_found')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-2">
                  {[t('bew_col_date'), t('bew_col_article'), t('bew_col_type'), t('ueb_col_qty'), t('bew_col_project_note'), t('bew_col_employee')].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-border hover:bg-bg-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">{fmtDt(m.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.artikel_name}</div>
                      <div className="font-mono text-xs text-muted">{m.artikel_nummer}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-xs ${m.typ === 'eingang' ? 'text-green' : 'text-red'}`}>
                        <Icon name={m.typ === 'eingang' ? 'arrowDown' : 'arrowUp'} size={12}
                              color={m.typ === 'eingang' ? 'rgb(var(--color-green))' : 'rgb(var(--color-red))'} />
                        {m.typ === 'eingang' ? t('dash_incoming') : t('dash_outgoing')}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-semibold whitespace-nowrap ${m.typ === 'eingang' ? 'text-green' : 'text-red'}`}>
                      {m.typ === 'eingang' ? '+' : '−'}{m.menge}
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">{movementProjectLabel(m) || m.notiz || '—'}</td>
                    <td className="px-4 py-3 text-secondary text-sm whitespace-nowrap">{m.von_user || '—'}</td>
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

/* ══ MAIN PAGE ══ */
export default function BewegungPage({ articles, setArticles, moves, setMoves }) {
  const { t } = useLanguage()
  const [tab, setTab] = useState('buchen')
  const [projekte, setProjekte] = useState([])
  const [projekteMat, setProjekteMat] = useState([])
  const [verbrauchMap, setVerbrauchMap] = useState({})
  const [lieferantenInfo, setLieferantenInfo] = useState([])
  const [verlaufSearch, setVerlaufSearch] = useState(null)

  const loadReservierung = useCallback(async () => {
    const [{ data: pm }, { data: vb }] = await Promise.all([
      supabase.from('projekte').select('id,status,material:projekt_material(artikel_id,geplant_menge,preis)')
        .in('status', ['geplant', 'aktiv', 'pausiert']),
      supabase.from('warenbewegungen').select('projekt_id, artikel_id, menge')
        .eq('typ', 'ausgang').not('projekt_id', 'is', null),
    ])
    setProjekteMat(pm ?? [])
    const vm = {}
    ;(vb ?? []).forEach(m => {
      vm[m.projekt_id] = vm[m.projekt_id] ?? {}
      vm[m.projekt_id][m.artikel_id] = (vm[m.projekt_id][m.artikel_id] ?? 0) + Number(m.menge)
    })
    setVerbrauchMap(vm)
  }, [])

  useEffect(() => {
    supabase.from('projekte').select('id,name,kunde,status').in('status', ['geplant', 'aktiv', 'pausiert']).order('name')
      .then(({ data }) => { if (data) setProjekte(data) })
    supabase.from('lieferanten').select('id,name,lieferzeit,versandart')
      .then(({ data }) => { if (data) setLieferantenInfo(data) })
    loadReservierung()
  }, [loadReservierung])

  // What open projects still have "spoken for" per artikel — drives the
  // Verfügbar/Reserviert columns and the € stat cards.
  const reservierungMap = useMemo(
    () => buildReservierungMap(projekteMat, verbrauchMap),
    [projekteMat, verbrauchMap]
  )

  const onBooked = async () => {
    const [{ data: art }, { data: mov }] = await Promise.all([
      supabase.from('artikel').select('*').order('nummer'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
    ])
    if (art) setArticles(art)
    if (mov) setMoves(mov)
    await loadReservierung()
  }

  const showVerlauf = (nummer) => { setVerlaufSearch(nummer); setTab('verlauf') }

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh]">
        <div className="flex gap-1 border-b border-border px-3 bg-bg-0">
          {[['buchen', t('bew_tab_buchen'), 'scan'], ['verlauf', t('bew_tab_verlauf'), 'refresh']].map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent'
                    }`}>
              <Icon name={icon} size={14} color={tab === id ? '#e8821c' : '#6b7480'} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'buchen'
            ? <MobileBuchen articles={articles} onBooked={onBooked} projekte={projekte} />
            : <VerlaufTab moves={moves} initialSearch={verlaufSearch} />
          }
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('bew_title')}</h1>
            <p className="text-secondary text-sm">{t('bew_subtitle')}</p>
          </div>
          <button onClick={() => setTab('buchen')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            <Icon name="plus" size={15} color="#181c20" /> {t('bew_buchung_erfassen')}
          </button>
        </div>
        <div className="flex gap-1 border-b border-border mb-6">
          {[['buchen', t('bew_tab_buchen'), 'scan'], ['verlauf', t('bew_tab_verlauf'), 'refresh']].map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'text-primary border-amber' : 'text-secondary border-transparent hover:text-primary'
                    }`}>
              <Icon name={icon} size={15} color={tab === id ? '#e8821c' : '#6b7480'} />
              {label}
            </button>
          ))}
        </div>
        {tab === 'buchen'
          ? <DesktopBuchen articles={articles} onBooked={onBooked} projekte={projekte}
                           lieferantenInfo={lieferantenInfo} reservierungMap={reservierungMap}
                           moves={moves} onShowVerlauf={showVerlauf} />
          : <VerlaufTab moves={moves} initialSearch={verlaufSearch} />
        }
      </div>
    </>
  )
}
