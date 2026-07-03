import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import Card from '../components/Card'
import Icon from '../components/Icon'
import StockBadge from '../components/StockBadge'
import { printQrLabels } from '../lib/printQrLabels'

const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function SelectCheckbox({ checked, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }}
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
              checked ? 'bg-amber border-amber' : 'border-border bg-bg-2'
            }`}>
      {checked && <Icon name="check" size={12} color="#181c20" />}
    </button>
  )
}

/* ══ ARTICLE FORM MODAL ══ */
function ArticleFormModal({ article, firma, onClose, onSaved }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const isNew = !article?.id
  const [form, setForm] = useState({
    nummer: '', name: '', kategorie: '', menge: 0, einheit: 'Stk',
    mindestbestand: 0, lagerort: '', preis: 0, lieferant: '', bild: '',
    ...(article || {})
  })
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showQr, setShowQr]           = useState(false)
  const [qrUrl, setQrUrl]             = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [pinStep, setPinStep]         = useState(false)
  const [pinInput, setPinInput]       = useState('')
  const [pinError, setPinError]       = useState(null)

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mengeChanged = !isNew && Number(form.menge) !== Number(article.menge)

  const uploadImage = async (file) => {
    setUploading(true); setUploadError(null)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${(form.nummer || 'artikel').replace(/[^a-zA-Z0-9-]/g, '_')}.${ext}`
    const { error: upErr } = await supabase.storage.from('artikelbilder').upload(path, file, { upsert: true, cacheControl: '3600' })
    setUploading(false)
    if (upErr) { setUploadError(upErr.message); return }
    const { data } = supabase.storage.from('artikelbilder').getPublicUrl(path)
    up('bild', `${data.publicUrl}?v=${Date.now()}`)
  }

  // A quantity change on an existing article is a manual stock
  // override — same weight as a Warenausgang/-eingang booking, so it
  // goes through book_movement (audit trail: who, when, how much)
  // instead of a silent artikel.update(). Gated behind the optional
  // Änderungs-PIN from Einstellungen (skipped if no PIN is set).
  const attemptSave = () => {
    if (!form.nummer.trim() || !form.name.trim()) return
    if (mengeChanged && firma?.aenderungs_pin) {
      setPinStep(true); setPinInput(''); setPinError(null)
      return
    }
    save()
  }

  const confirmPin = () => {
    if (pinInput !== firma.aenderungs_pin) { setPinError(t('ueb_pin_wrong')); return }
    setPinStep(false)
    save()
  }

  const save = async () => {
    setSaving(true)
    const data = {
      nummer: form.nummer, name: form.name, kategorie: form.kategorie,
      einheit: form.einheit, mindestbestand: Number(form.mindestbestand),
      lagerort: form.lagerort, preis: Number(form.preis), lieferant: form.lieferant, bild: form.bild,
    }
    if (isNew) {
      await supabase.from('artikel').insert({ ...data, menge: Number(form.menge) })
    } else {
      await supabase.from('artikel').update(data).eq('id', article.id)
      if (mengeChanged) {
        const diff = Number(form.menge) - Number(article.menge)
        await supabase.rpc('book_movement', {
          p_artikel_id: article.id, p_typ: diff > 0 ? 'eingang' : 'ausgang', p_menge: Math.abs(diff),
          // Always German, not t() — this is audit-trail data (like the
          // Inventur-Korrektur/Bestellung notiz elsewhere), not UI
          // chrome, and needs to stay matchable regardless of which
          // language the person doing the edit had the UI set to.
          p_projekt: null, p_notiz: 'Manuelle Korrektur (Artikel bearbeiten)',
          p_von_user: profile?.display_name ?? '', p_von_user_id: profile?.id ?? null,
        })
      }
    }
    setSaving(false)
    onSaved()
  }

  const del = async () => {
    await supabase.from('artikel').delete().eq('id', article.id)
    onSaved()
  }

  useEffect(() => {
    if (showQr && form.nummer) {
      import('qrcode').then(QRCode => {
        QRCode.toDataURL(form.nummer, { width: 220, margin: 1 })
          .then(url => setQrUrl(url))
          .catch(() => setQrUrl(null))
      })
    }
  }, [showQr, form.nummer])

  const printQr = () => {
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(form.nummer, { width: 400, margin: 1 }).then(url => {
        const win = window.open('', '_blank', 'width=420,height=520')
        win.document.write(`<html><head><title>QR ${form.nummer}</title>
          <style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:Arial}
          .l{border:1px dashed #999;border-radius:10px;padding:24px;text-align:center}
          img{width:200px;height:200px}.n{font-family:monospace;font-weight:700;font-size:18px;margin-top:10px}
          .nm{font-size:13px;color:#444;margin-top:4px}@media print{.l{border:none}}</style></head>
          <body><div class="l"><img src="${url}"/><div class="n">${form.nummer}</div>
          <div class="nm">${form.name}</div></div>
          <script>window.onload=()=>window.print()<\/script></body></html>`)
        win.document.close()
      })
    })
  }

  const fields = [
    { k: 'nummer',         label: t('ueb_field_number'),    type: 'text',   ph: 'ART-1021' },
    { k: 'name',           label: t('ueb_field_name'),      type: 'text',   ph: 'Sechskantschraube M8' },
    { k: 'kategorie',      label: t('ueb_field_category'),  type: 'text',   ph: 'Schrauben' },
    { k: 'menge',          label: t('ueb_col_qty'),         type: 'number', ph: '0' },
    { k: 'einheit',        label: t('ueb_field_unit'),      type: 'text',   ph: 'Stk' },
    { k: 'mindestbestand', label: t('ueb_field_minstock'),  type: 'number', ph: '0' },
    { k: 'lagerort',       label: t('ueb_col_location'),    type: 'text',   ph: 'Regal A1-03' },
    { k: 'preis',          label: t('ueb_field_price'),     type: 'number', ph: '0.00' },
    { k: 'lieferant',      label: t('ueb_field_supplier'),  type: 'text',   ph: 'Würth GmbH' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Handle bar for mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{isNew ? t('ueb_form_new_title') : t('ueb_form_edit_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={16} color="#9aa3ad" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('ueb_field_image')}</label>
            <div className="flex items-center gap-3">
              {form.bild ? (
                <img src={form.bild} alt="" className="w-16 h-16 rounded-xl object-cover bg-bg-2 border border-border shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-bg-2 border border-border flex items-center justify-center shrink-0">
                  <Icon name="camera" size={20} color="#6b7480" />
                </div>
              )}
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 text-xs bg-bg-2 border border-border px-3 py-2 rounded-lg text-secondary cursor-pointer hover:bg-bg-3 transition-colors">
                  <Icon name="upload" size={13} color="currentColor" />
                  {uploading ? t('set_uploading') : t('ueb_upload_image')}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading}
                         onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} />
                </label>
                {form.bild && (
                  <button onClick={() => up('bild', '')} className="ml-2 text-xs text-muted hover:text-red">
                    {t('set_remove')}
                  </button>
                )}
                {uploadError && <p className="text-red text-xs mt-1">{uploadError}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.k} className={f.full ? 'sm:col-span-2' : ''}>
                <label className="block text-xs text-secondary mb-1">{f.label}</label>
                <input type={f.type} value={form[f.k]} placeholder={f.ph}
                       onChange={e => up(f.k, e.target.value)}
                       className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
              </div>
            ))}
          </div>

          {/* QR section — only for existing articles */}
          {!isNew && form.nummer && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Icon name="scan" size={15} color="#9aa3ad" /> QR-Code
                </span>
                <button onClick={() => setShowQr(s => !s)}
                        className="text-xs bg-bg-2 border border-border px-3 py-1.5 rounded-lg text-secondary">
                  {showQr ? t('ueb_qr_hide') : t('ueb_qr_show')}
                </button>
              </div>
              {showQr && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="bg-white rounded-xl p-2.5 w-28 h-28 flex items-center justify-center shrink-0">
                    {qrUrl
                      ? <img src={qrUrl} alt="QR" className="w-full h-full" />
                      : <span className="text-xs text-gray-400">{t('ueb_qr_generating')}</span>
                    }
                  </div>
                  <div>
                    <p className="font-mono text-sm mb-2">{form.nummer}</p>
                    <button onClick={printQr} disabled={!qrUrl}
                            className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                      <Icon name="download" size={14} color="#181c20" /> {t('common_print')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {pinStep && (
          <div className="mx-5 mb-4 bg-amber-dim border border-amber/40 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-start gap-2 text-amber text-xs">
              <Icon name="alert" size={14} color="#e8821c" className="mt-0.5 shrink-0" />
              <span>{t('ueb_pin_required')}</span>
            </div>
            <input type="password" value={pinInput} autoFocus
                   onChange={e => { setPinInput(e.target.value); setPinError(null) }}
                   onKeyDown={e => e.key === 'Enter' && confirmPin()}
                   placeholder="PIN"
                   className="w-full bg-bg-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber" />
            {pinError && <p className="text-red text-xs">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={confirmPin} disabled={saving}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                      style={{ background: '#e8821c' }}>
                {saving ? t('common_saving') : t('common_confirm')}
              </button>
              <button onClick={() => setPinStep(false)} disabled={saving}
                      className="flex-1 py-2 rounded-lg text-xs bg-bg-2 border border-border text-secondary disabled:opacity-60">
                {t('common_cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-5 pb-6 flex-wrap">
          <button onClick={attemptSave} disabled={saving || pinStep}
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

/* ══ MAIN PAGE ══ */
export default function UebersichtPage({ articles, setArticles, setMoves }) {
  const { isManager } = useAuth()
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [search, setSearch]           = useState('')
  const [filterKat, setFilterKat]     = useState('Alle')
  const [filterLager, setFilterLager] = useState('Alle')
  const [filterLief, setFilterLief]   = useState('Alle')
  const [filterStock, setFilterStock] = useState(() => searchParams.get('bestand') ?? 'Alle')
  const [view, setView]               = useState('list')
  const [showFilters, setShowFilters] = useState(false)
  const [editingArticle, setEditingArticle] = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [firma, setFirma]             = useState(null)
  const [selectMode, setSelectMode]   = useState(false)
  const [selected, setSelected]       = useState(() => new Set())

  useEffect(() => {
    if (isManager) supabase.from('firmendaten').select('aenderungs_pin').eq('id', 1).single().then(({ data }) => setFirma(data))
  }, [isManager])

  const kategorien  = useMemo(() => ['Alle', ...new Set(articles.map(a => a.kategorie))].sort(), [articles])
  const lagerorte   = useMemo(() => ['Alle', ...new Set(articles.map(a => a.lagerort))].sort(),  [articles])
  const lieferanten = useMemo(() => ['Alle', ...new Set(articles.map(a => a.lieferant))].sort(), [articles])

  const filtered = useMemo(() => articles.filter(a => {
    const q = search.toLowerCase()
    return (
      (!q || a.name.toLowerCase().includes(q) || a.nummer.toLowerCase().includes(q)) &&
      (filterKat   === 'Alle' || a.kategorie === filterKat) &&
      (filterLager === 'Alle' || a.lagerort  === filterLager) &&
      (filterLief  === 'Alle' || a.lieferant === filterLief) &&
      (filterStock === 'Alle' ||
        (filterStock === 'Niedrig'     && a.menge < a.mindestbestand) ||
        (filterStock === 'Ausreichend' && a.menge >= a.mindestbestand))
    )
  }), [articles, search, filterKat, filterLager, filterLief, filterStock])

  const activeFilters = [filterKat, filterLager, filterLief, filterStock].filter(f => f !== 'Alle').length
  const clearFilters  = () => {
    setFilterKat('Alle'); setFilterLager('Alle'); setFilterLief('Alle')
    setFilterStock('Alle'); setSearch('')
  }

  const toggleSelectMode = () => { setSelectMode(s => !s); setSelected(new Set()) }
  const toggleSelected = (id) => setSelected(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAllFiltered = () => setSelected(new Set(filtered.map(a => a.id)))
  const printSelectedQr = () => {
    const items = articles.filter(a => selected.has(a.id)).map(a => ({ nummer: a.nummer, name: a.name }))
    printQrLabels(items)
  }

  const openNew  = () => { setEditingArticle(null); setShowModal(true) }
  const openEdit = (a) => { setEditingArticle(a);   setShowModal(true) }
  const onSaved  = async () => {
    setShowModal(false)
    const [{ data }, { data: mov }] = await Promise.all([
      supabase.from('artikel').select('*').order('nummer'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
    ])
    if (data) setArticles(data)
    if (mov) setMoves?.(mov)
  }

  const selClass = (active) =>
    `bg-bg-2 border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${
      active ? 'border-amber text-amber' : 'border-border text-secondary'
    }`

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh]">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-bg-0 border-b border-border px-3 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold leading-tight">{t('ueb_title')}</h1>
              <p className="text-xs text-secondary">
                {selectMode
                  ? `${selected.size} ${t('ueb_selected_word')}`
                  : <>{filtered.length} {t('ueb_of')} {articles.length}
                      {activeFilters > 0 && <span className="text-amber ml-1">· {activeFilters} {t('ueb_filters_short')}</span>}
                    </>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {selectMode ? (
                <button onClick={toggleSelectMode}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-bg-2 border border-border text-secondary">
                  <Icon name="x" size={13} color="#9aa3ad" /> {t('common_cancel')}
                </button>
              ) : (
                <>
                  <button onClick={toggleSelectMode}
                          aria-label={t('ueb_select_mode_aria')}
                          className="flex items-center justify-center p-2 rounded-xl text-xs bg-bg-2 border border-border text-secondary">
                    <Icon name="clipboard" size={15} color="#9aa3ad" />
                  </button>
                  {isManager && (
                    <button onClick={openNew}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                            style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                      <Icon name="plus" size={13} color="#181c20" /> {t('common_new')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Search + filter toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon name="search" size={13} color="#6b7480" />
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)}
                     placeholder={t('common_search')}
                     className="w-full bg-bg-2 border border-border rounded-lg pl-7 pr-2 py-2 text-sm outline-none focus:border-amber" />
            </div>
            <button onClick={() => setShowFilters(s => !s)}
                    aria-label={t('ueb_filter_aria')}
                    className={`flex items-center justify-center gap-1 min-w-[40px] px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                      activeFilters > 0 ? 'border-amber text-amber bg-amber-dim' : 'border-border text-secondary bg-bg-2'
                    }`}>
              <Icon name="filter" size={13} color="currentColor" />
              {activeFilters > 0 && <span className="font-semibold">{activeFilters}</span>}
            </button>
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                [filterKat,   setFilterKat,   t('ueb_filter_cat_short'),  kategorien],
                [filterLager, setFilterLager, t('ueb_filter_loc_short'),  lagerorte],
                [filterLief,  setFilterLief,  t('ueb_filter_sup_short'), lieferanten],
                [filterStock, setFilterStock, t('ueb_filter_stock_short'), ['Alle', 'Niedrig', 'Ausreichend']],
              ].map(([val, setter, ph, opts], i) => (
                <select key={i} value={val} onChange={e => setter(e.target.value)}
                        className={`min-w-0 text-xs rounded-lg px-2 py-2 border outline-none ${
                          val !== 'Alle' ? 'border-amber text-amber bg-amber-dim' : 'border-border text-secondary bg-bg-2'
                        }`}>
                  <option value="Alle">{ph}</option>
                  {opts.filter(o => o !== 'Alle').map(o => <option key={o} value={o}>{o === 'Niedrig' ? t('stock_low') : o === 'Ausreichend' ? t('stock_sufficient') : o}</option>)}
                </select>
              ))}
              {activeFilters > 0 && (
                <button onClick={clearFilters}
                        className="col-span-2 text-xs text-secondary border border-border rounded-lg py-2 bg-bg-2">
                  {t('common_reset_filters')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Article list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 -webkit-overflow-scrolling-touch">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center mt-2">
              <Icon name="search" size={24} color="#6b7480" />
              <p className="text-secondary text-sm mt-2">{t('ueb_no_articles')}</p>
              {activeFilters > 0 && (
                <button onClick={clearFilters}
                        className="mt-3 text-xs bg-bg-2 border border-border px-3 py-2 rounded-xl text-secondary">
                  {t('common_reset_filters')}
                </button>
              )}
            </Card>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(a => (
                <div key={a.id}
                     onClick={() => selectMode && toggleSelected(a.id)}
                     className={`bg-bg-1 border rounded-xl px-3 py-2.5 ${
                       selectMode && selected.has(a.id) ? 'border-amber' : 'border-border'
                     }`}>
                  <div className="flex items-center gap-2">
                    {selectMode && <SelectCheckbox checked={selected.has(a.id)} onClick={() => toggleSelected(a.id)} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate flex-1">{a.name}</span>
                        <StockBadge menge={a.menge} mindestbestand={a.mindestbestand} />
                      </div>
                      <div className="flex items-center gap-2 text-xs min-w-0">
                        <span className="font-mono text-amber shrink-0">{a.nummer}</span>
                        <span className="text-muted truncate">{a.lagerort}</span>
                        <span className="font-mono text-secondary ml-auto shrink-0">{a.menge} {a.einheit}</span>
                      </div>
                    </div>
                    {!selectMode && isManager && (
                      <button onClick={() => openEdit(a)}
                              aria-label={t('ueb_edit_article_aria')}
                              className="p-2 rounded-lg bg-bg-2 border border-border shrink-0 active:scale-95 transition-transform">
                        <Icon name="edit" size={14} color="#9aa3ad" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectMode && (
          <div className="sticky bottom-0 z-10 bg-bg-0 border-t border-border px-3 py-2.5 flex items-center gap-2">
            <button onClick={selectAllFiltered}
                    className="text-xs text-secondary underline decoration-dotted shrink-0">
              {t('ueb_select_all')}
            </button>
            <button onClick={printSelectedQr} disabled={selected.size === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
              <Icon name="printer" size={15} color="#181c20" /> {t('ueb_print_qr_labels')}
            </button>
          </div>
        )}
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('ueb_title')}</h1>
            <p className="text-secondary text-sm">
              {selectMode
                ? `${selected.size} ${t('ueb_selected_word')}`
                : <>{filtered.length} {t('ueb_of')} {articles.length} {t('ueb_articles_word')}
                    {activeFilters > 0 && <span className="text-amber ml-2">· {activeFilters} {t('ueb_filters_active')}</span>}
                  </>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button onClick={selectAllFiltered}
                        className="text-xs text-secondary underline decoration-dotted">
                  {t('ueb_select_all')}
                </button>
                <button onClick={printSelectedQr} disabled={selected.size === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  <Icon name="printer" size={15} color="#181c20" /> {t('ueb_print_qr_labels')}
                </button>
                <button onClick={toggleSelectMode}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
                  <Icon name="x" size={14} color="#9aa3ad" /> {t('common_cancel')}
                </button>
              </>
            ) : (
              <>
                <button onClick={toggleSelectMode}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-secondary">
                  <Icon name="clipboard" size={14} color="#9aa3ad" /> {t('ueb_select_mode')}
                </button>
                {isManager && (
                  <button onClick={openNew}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                          style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                    <Icon name="plus" size={15} color="#181c20" /> {t('ueb_new_article')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <Card className="p-3 mb-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon name="search" size={14} color="#6b7480" />
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)}
                     placeholder={t('ueb_search_ph')}
                     className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
            </div>
            <select value={filterKat}   onChange={e => setFilterKat(e.target.value)}   className={selClass(filterKat   !== 'Alle')}>
              <option value="Alle">{t('ueb_all_categories')}</option>
              {kategorien.filter(k => k !== 'Alle').map(k => <option key={k}>{k}</option>)}
            </select>
            <select value={filterLager} onChange={e => setFilterLager(e.target.value)} className={selClass(filterLager !== 'Alle')}>
              <option value="Alle">{t('ueb_all_locations')}</option>
              {lagerorte.filter(l => l !== 'Alle').map(l => <option key={l}>{l}</option>)}
            </select>
            <select value={filterLief}  onChange={e => setFilterLief(e.target.value)}  className={selClass(filterLief  !== 'Alle')}>
              <option value="Alle">{t('ueb_all_suppliers')}</option>
              {lieferanten.filter(l => l !== 'Alle').map(l => <option key={l}>{l}</option>)}
            </select>
            <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className={selClass(filterStock !== 'Alle')}>
              <option value="Alle">{t('ueb_all_stock')}</option>
              <option value="Niedrig">{t('ueb_low_stock_option')}</option>
              <option value="Ausreichend">{t('stock_sufficient')}</option>
            </select>
            <div className="flex border border-border rounded-xl overflow-hidden ml-auto">
              <button onClick={() => setView('list')}
                      className={`p-2.5 transition-colors ${view === 'list' ? 'bg-bg-3' : 'bg-bg-2 hover:bg-bg-3'}`}>
                <Icon name="filter" size={15} color={view === 'list' ? '#eef1f4' : '#6b7480'} />
              </button>
              <button onClick={() => setView('grid')}
                      className={`p-2.5 transition-colors ${view === 'grid' ? 'bg-bg-3' : 'bg-bg-2 hover:bg-bg-3'}`}>
                <Icon name="box" size={15} color={view === 'grid' ? '#eef1f4' : '#6b7480'} />
              </button>
            </div>
            {activeFilters > 0 && (
              <button onClick={clearFilters}
                      className="flex items-center gap-1.5 text-xs text-secondary border border-border px-3 py-2.5 rounded-xl hover:bg-bg-2">
                <Icon name="x" size={12} color="#9aa3ad" /> {t('common_reset')}
              </button>
            )}
          </div>
        </Card>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <Icon name="search" size={28} color="#6b7480" />
            <p className="text-secondary text-sm mt-3">{t('ueb_no_articles')}</p>
          </Card>
        ) : view === 'list' ? (
          <Card className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-2">
                    {[...(selectMode ? [''] : []), t('ueb_col_number'), t('ueb_col_name'), t('ueb_col_status'), t('ueb_col_location'), t('ueb_col_category'), t('ueb_col_qty'),
                      ...(isManager ? [t('ueb_col_price'), t('ueb_col_supplier'), ''] : [])
                    ].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}
                        onClick={() => selectMode && toggleSelected(a.id)}
                        className={`border-b border-border transition-colors ${
                          selectMode ? 'cursor-pointer' : ''
                        } ${selectMode && selected.has(a.id) ? 'bg-amber-dim' : 'hover:bg-bg-2/50'}`}>
                      {selectMode && (
                        <td className="px-4 py-3">
                          <SelectCheckbox checked={selected.has(a.id)} onClick={() => toggleSelected(a.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-amber font-medium text-xs whitespace-nowrap">{a.nummer}</td>
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><StockBadge menge={a.menge} mindestbestand={a.mindestbestand} /></td>
                      <td className="px-4 py-3">
                        <span className="bg-bg-2 border border-border rounded-md px-2 py-0.5 text-xs font-mono">{a.lagerort}</span>
                      </td>
                      <td className="px-4 py-3 text-secondary text-xs whitespace-nowrap">{a.kategorie}</td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">{a.menge} <span className="text-muted text-xs">{a.einheit}</span></td>
                      {isManager && <td className="px-4 py-3 font-mono whitespace-nowrap text-xs">{fmt(a.preis)}</td>}
                      {isManager && <td className="px-4 py-3 text-secondary text-xs whitespace-nowrap">{a.lieferant}</td>}
                      {isManager && (
                        <td className="px-4 py-3">
                          {!selectMode && (
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-bg-3 transition-colors">
                              <Icon name="edit" size={14} color="#9aa3ad" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(a => (
              <Card key={a.id}
                    onClick={selectMode ? () => toggleSelected(a.id) : undefined}
                    className={`overflow-hidden relative shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.3)] transition-all duration-200 ${
                      selectMode && selected.has(a.id) ? 'border-amber' : ''
                    }`}>
                {selectMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <SelectCheckbox checked={selected.has(a.id)} onClick={() => toggleSelected(a.id)} />
                  </div>
                )}
                <div className="aspect-video bg-bg-2 overflow-hidden">
                  <img src={a.bild} alt={a.name} className="w-full h-full object-cover"
                       onError={e => { e.target.style.display = 'none' }} />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-amber font-medium">{a.nummer}</span>
                    <StockBadge menge={a.menge} mindestbestand={a.mindestbestand} />
                  </div>
                  <p className="font-medium text-sm mb-2 leading-tight">{a.name}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-secondary">{t('ueb_col_qty')}</span>
                      <span className="font-mono">{a.menge} {a.einheit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">{t('ueb_col_location')}</span>
                      <span className="font-mono text-[11px]">{a.lagerort}</span>
                    </div>
                    {isManager && (
                      <div className="flex justify-between">
                        <span className="text-secondary">{t('ueb_col_price')}</span>
                        <span className="font-mono">{fmt(a.preis)}</span>
                      </div>
                    )}
                  </div>
                  {!selectMode && isManager && (
                    <button onClick={() => openEdit(a)}
                            className="w-full mt-3 flex items-center justify-center gap-1.5 bg-bg-2 border border-border rounded-lg py-1.5 text-xs text-secondary hover:bg-bg-3 transition-colors">
                      <Icon name="edit" size={12} color="#9aa3ad" /> {t('common_edit')}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ArticleFormModal
          article={editingArticle}
          firma={firma}
          onClose={() => setShowModal(false)}
          onSaved={onSaved}
        />
      )}
    </>
  )
}
