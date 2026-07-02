import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { useLanguage } from '../hooks/useLanguage'

export default function ImportPage({ setArticles }) {
  const { t } = useLanguage()
  const [preview, setPreview]     = useState(null)
  const [error, setError]         = useState(null)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess]     = useState(null)
  const [dragging, setDragging]   = useState(false)
  const fileRef = useRef(null)

  const handleFile = (file) => {
    setError(null); setPreview(null); setSuccess(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (rows.length === 0) { setError(t('imp_no_data')); return }
        const mapped = rows.map((r, i) => ({
          nummer:         String(r.Artikelnummer || r.nummer || `IMP-${i + 1}`),
          name:           String(r.Name          || r.name          || ''),
          kategorie:      String(r.Kategorie     || r.kategorie     || 'Sonstige'),
          menge:          Number(r.Menge         || r.menge         || 0),
          einheit:        String(r.Einheit       || r.einheit       || 'Stk'),
          mindestbestand: Number(r.Mindestbestand|| r.mindestbestand|| 0),
          lagerort:       String(r.Lagerort      || r.lagerort      || ''),
          preis:          Number(r.Preis         || r.preis         || 0),
          lieferant:      String(r.Lieferant     || r.lieferant     || ''),
          bild:           String(r.Bild          || r.bild          || ''),
        }))
        setPreview(mapped)
      } catch { setError(t('imp_read_error')) }
    }
    reader.readAsArrayBuffer(file)
  }

  const confirmImport = async () => {
    if (!preview) return
    setImporting(true)
    const { error: err } = await supabase.from('artikel').upsert(preview, { onConflict: 'nummer' })
    if (err) { setError(err.message); setImporting(false); return }
    const { data } = await supabase.from('artikel').select('*').order('nummer')
    if (data) setArticles(data)
    setSuccess(`${preview.length} ${t('imp_success_suffix')}`)
    setPreview(null)
    setImporting(false)
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      Artikelnummer: 'ART-1021', Name: 'Beispielartikel', Kategorie: 'Sonstige',
      Menge: 100, Einheit: 'Stk', Mindestbestand: 20,
      Lagerort: 'Regal A1-01', Preis: 5.50, Lieferant: 'Musterfirma GmbH', Bild: ''
    }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Artikel')
    XLSX.writeFile(wb, 'StockMaster_Vorlage.xlsx')
  }

  const DropZone = ({ compact = false }) => (
    <div className={`border-2 border-dashed rounded-2xl text-center cursor-pointer transition-colors ${
      dragging ? 'border-amber bg-amber-dim' : 'border-border hover:border-amber'
    } ${compact ? 'p-6' : 'p-10'}`}
         onClick={() => fileRef.current?.click()}
         onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
         onDragOver={e => { e.preventDefault(); setDragging(true) }}
         onDragLeave={() => setDragging(false)}>
      <Icon name="upload" size={compact ? 24 : 32} color="#6b7480" />
      <p className={`font-medium mt-2 mb-1 ${compact ? 'text-sm' : 'text-sm'}`}>
        {compact ? t('imp_dropzone_compact') : t('imp_dropzone_full')}
      </p>
      <p className="text-xs text-muted">{t('imp_supports')}</p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
             onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
    </div>
  )

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden overflow-y-auto">
        <div className="p-3 space-y-3">
          <h1 className="text-base font-semibold">{t('imp_title')}</h1>

          <Card className="p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-secondary">{t('imp_template_prompt_mobile')}</p>
            <button onClick={downloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-bg-2 border border-border shrink-0">
              <Icon name="download" size={13} color="#9aa3ad" /> {t('imp_template_button')}
            </button>
          </Card>

          <DropZone compact />

          {error && (
            <div className="bg-red-dim border border-red/40 rounded-xl p-3">
              <p className="text-red text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-dim border border-green/40 rounded-xl p-3">
              <p className="text-green text-sm flex items-center gap-2">
                <Icon name="check" size={15} color="#4caf6e" /> {success}
              </p>
            </div>
          )}

          {preview && (
            <Card className="overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{preview.length} {t('home_articles_short')}</span>
                <button onClick={confirmImport} disabled={importing}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  <Icon name="check" size={13} color="#181c20" />
                  {importing ? t('imp_importing_short') : t('imp_import_button')}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {preview.map((a, i) => (
                  <div key={i} className="px-3 py-2.5 border-b border-border last:border-0">
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-xs text-muted font-mono">{a.nummer} · {a.menge} {a.einheit} · {a.lagerort}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('imp_title')}</h1>
          <p className="text-secondary text-sm">{t('imp_subtitle')}</p>
        </div>

        <Card className="p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-secondary">{t('imp_template_prompt_desktop')}</p>
          <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-bg-2 border border-border hover:bg-bg-3 transition-colors">
            <Icon name="download" size={15} color="#9aa3ad" /> {t('imp_download_template')}
          </button>
        </Card>

        <DropZone />

        {error && (
          <Card className="p-4 mb-4 mt-4 border-red/40 bg-red-dim">
            <p className="text-red text-sm">{error}</p>
          </Card>
        )}

        {success && (
          <Card className="p-4 mb-4 mt-4 border-green/40 bg-green-dim">
            <p className="text-green text-sm flex items-center gap-2">
              <Icon name="check" size={15} color="#4caf6e" /> {success}
            </p>
          </Card>
        )}

        {preview && (
          <Card className="overflow-hidden mt-4">
            <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <span className="font-medium">{t('imp_preview_prefix')}: {preview.length} {t('home_articles_short')}</span>
              <button onClick={confirmImport} disabled={importing}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                <Icon name="check" size={15} color="#181c20" />
                {importing ? t('imp_importing_long') : t('imp_confirm_import')}
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-bg-2">
                  <tr className="border-b border-border">
                    {[t('imp_col_number'), t('ueb_col_name'), t('ueb_col_category'), t('ueb_col_qty'), t('ueb_col_location'), t('ueb_col_price'), t('ueb_col_supplier')].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((a, i) => (
                    <tr key={i} className="border-b border-border hover:bg-bg-2/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-amber">{a.nummer}</td>
                      <td className="px-4 py-2.5 font-medium">{a.name}</td>
                      <td className="px-4 py-2.5 text-secondary text-xs">{a.kategorie}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{a.menge} {a.einheit}</td>
                      <td className="px-4 py-2.5 text-secondary text-xs">{a.lagerort}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{a.preis} €</td>
                      <td className="px-4 py-2.5 text-secondary text-xs">{a.lieferant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
