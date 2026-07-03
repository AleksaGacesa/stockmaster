import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQrScanner } from '../hooks/useQrScanner'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import QrScannerCard from '../components/QrScannerCard'
import StockBadge from '../components/StockBadge'

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
      setMenge(''); setProjekt(''); setProjektId(''); setError(null); setScanError(null); setSuccess(null)
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
    setMenge(''); setProjekt(''); setProjektId(''); setError(null); setScanError(null); setSuccess(null)
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
    const { error: rpcError } = await supabase.rpc('book_movement', {
      p_artikel_id: selected.id, p_typ: typ, p_menge: m,
      p_projekt: projektText || null,
      p_notiz: projektText ? `Projekt: ${projektText}` : '',
      p_von_user: profile?.display_name ?? '', p_von_user_id: profile?.id ?? null,
      p_projekt_id: projektId ? Number(projektId) : null,
    })
    setBooking(false)
    setWarn(null)
    if (rpcError) { setError(rpcError.message); return }
    setSuccess({ typ, menge: m, einheit: selected.einheit, name: selected.name, projekt: projektText })
    onBooked()
    setTimeout(() => { setSuccess(null); reset() }, 2000)
  }, [menge, typ, projekt, projektId, projekte, selected, profile, onBooked, reset])

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
    menge, setMenge, projekt, setProjekt, projektId, setProjektId, error, success,
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
              <div className="w-11 h-11 rounded-lg bg-bg-1 overflow-hidden shrink-0">
                <img src={a.bild} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
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
        <div className="w-12 h-12 rounded-xl bg-bg-2 overflow-hidden shrink-0">
          <img src={selected.bild} className="w-full h-full object-cover"
               onError={e => e.target.style.display = 'none'} />
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
            { typ: 'eingang', label: t('bew_incoming'), icon: 'arrowDown', color: '#4caf6e', bg: '#1a2e20' },
            { typ: 'ausgang', label: t('bew_outgoing'), icon: 'arrowUp',   color: '#e0524a', bg: '#3a1c1a' },
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
                    color={typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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
              <Icon name="alert" size={13} color="#e0524a" /> {error}
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
                        style={{ background: '#e0524a' }}>
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
                   style={{ background: success.typ === 'eingang' ? '#1a2e20' : '#3a1c1a' }}>
                <Icon name="check" size={24} color={success.typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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
                    style={{ background: typ === 'eingang' ? '#4caf6e' : '#e0524a' }}>
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

/* ══ DESKTOP BUCHEN ══ */
function DesktopBuchen({ articles, onBooked, projekte }) {
  const { profile } = useAuth()
  const logic = useBuchenLogic({ articles, onBooked, profile, projekte })
  const { step, search, setSearch, selected, typ, setTyp, menge, setMenge,
          projekt, setProjekt, projektId, setProjektId, error, success,
          pickArticle, results, reset, handleSubmit, warn, setWarn, doBook, booking,
          filterKat, setFilterKat, filterLager, setFilterLager, filterLief, setFilterLief,
          filterStock, setFilterStock, kategorien, lagerorte, lieferanten, activeFilters, clearFilters } = logic

  // Desktop can't scan QR codes, so the search panel is the only entry point.
  if (step === 'method' || step === 'search') return (
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
  <div className="flex justify-center pt-10">
    <FormView
      selected={selected}
      typ={typ}
      setTyp={setTyp}
      menge={menge}
      setMenge={setMenge}
      projekt={projekt}
      setProjekt={setProjekt}
      projektId={projektId}
      setProjektId={setProjektId}
      projekte={projekte}
      error={error}
      success={success}
      handleSubmit={handleSubmit}
      reset={reset}
      warn={warn}
      setWarn={setWarn}
      doBook={doBook}
      booking={booking}
    />
  </div>
)
  return null
}

// A movement tied to a real project (projekt_id) shows that project's
// PROJ-2026-xxxxxx number — only free-typed project text (no linked
// project row) falls back to whatever was manually entered.
const movementProjectLabel = (m) => m.projekte?.dokument_nr
  ? `${m.projekte.dokument_nr}${m.projekt ? ' · ' + m.projekt : ''}`
  : (m.projekt || '')

/* ══ VERLAUF TAB ══ */
function VerlaufTab({ moves }) {
  const { t, lang } = useLanguage()
  const [search, setSearch]       = useState('')
  const [filterTyp, setFilterTyp] = useState('Alle')

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
          <Card key={s.label} className="p-3 sm:p-4">
            <div className="text-xs text-muted mb-1">{s.label}</div>
            <div className={`text-lg sm:text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <Card className="p-3 flex flex-wrap gap-2">
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
                    color={m.typ === 'eingang' ? '#4caf6e' : '#e0524a'} className="mt-0.5 shrink-0" />
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
      <Card className="hidden sm:block overflow-hidden">
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
                              color={m.typ === 'eingang' ? '#4caf6e' : '#e0524a'} />
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

  useEffect(() => {
    supabase.from('projekte').select('id,name,kunde,status').in('status', ['geplant', 'aktiv', 'pausiert']).order('name')
      .then(({ data }) => { if (data) setProjekte(data) })
  }, [])

  const onBooked = async () => {
    const [{ data: art }, { data: mov }] = await Promise.all([
      supabase.from('artikel').select('*').order('nummer'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
    ])
    if (art) setArticles(art)
    if (mov) setMoves(mov)
  }

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
            : <VerlaufTab moves={moves} />
          }
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('bew_title')}</h1>
          <p className="text-secondary text-sm">{t('bew_subtitle')}</p>
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
          ? <DesktopBuchen articles={articles} onBooked={onBooked} projekte={projekte} />
          : <VerlaufTab moves={moves} />
        }
      </div>
    </>
  )
}
