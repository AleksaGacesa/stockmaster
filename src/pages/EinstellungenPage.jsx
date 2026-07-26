import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import Card from '../components/Card'
import Icon from '../components/Icon'
import MapPicker from '../components/MapPicker'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'

const AV = ['#e8821c', '#4a90d9', '#4caf6e', '#9b6bd9', '#d96b8f', '#3fb6c4']
const avColor = (n = '') => AV[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length]
const initialen = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

const ROLE_META = {
  owner: { color: '#4caf6e' },
  admin: { color: '#4a90d9' },
  worker: { color: '#9b6bd9' },
}
function RoleBadge({ role }) {
  const { t } = useLanguage()
  const m = ROLE_META[role] ?? ROLE_META.worker
  const label = role === 'owner' ? t('sidebar_owner') : role === 'admin' ? t('sidebar_admin') : t('sidebar_worker')
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ background: m.color + '1a', color: m.color }}>{label}</span>
}

// Non-interactive Leaflet preview of the saved company location + its
// check-in radius circle. Leaflet is lazy-loaded (never in the base
// bundle). Falls back to a placeholder when no location is set.
function StandortPreview({ lat, lng, radius }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  useEffect(() => {
    if (lat == null) { mapRef.current?.remove(); mapRef.current = null; return }
    let disposed = false
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
      if (disposed || !boxRef.current) return
      const L = mod.default ?? mod
      mapRef.current?.remove()
      const map = L.map(boxRef.current, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false })
        .setView([lat, lng], 15)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      L.circle([lat, lng], { radius: radius || 150, color: '#e8821c', fillColor: '#e8821c', fillOpacity: 0.15, weight: 1.5 }).addTo(map)
      L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#e8821c', fillOpacity: 1 }).addTo(map)
      setTimeout(() => map.invalidateSize(), 60)
      mapRef.current = map
    })
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null }
  }, [lat, lng, radius])

  if (lat == null) {
    return <div className="h-32 rounded-xl bg-bg-2 border border-border flex items-center justify-center text-muted text-xs">
      <Icon name="mapPin" size={18} color="#6b7480" />
    </div>
  }
  // `isolate` traps Leaflet's high pane z-indexes in their own stacking
  // context so the preview never renders in front of a modal opened above it.
  return <div ref={boxRef} className="h-32 rounded-xl overflow-hidden border border-border bg-bg-2 isolate" />
}

// Consistent section header (icon chip + title) used across the
// settings cards so the page reads like the rest of the app.
function SectionHead({ icon, color, title, action }) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <h2 className="font-semibold flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1f' }}>
          <Icon name={icon} size={15} color={color} />
        </span>
        <span className="truncate">{title}</span>
      </h2>
      {action}
    </div>
  )
}

function UserForm({ newName, setNewName, newEmail, setNewEmail, newPassword, setNewPassword,
                     newRole, setNewRole, userError, onAdd, onCancel }) {
  const { t } = useLanguage()
  return (
    <div className="bg-bg-2 rounded-xl p-4 mb-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: t('lief_field_name'), value: newName, setter: setNewName, type: 'text', ph: 'Ivan Petrović', autoComplete: 'off' },
          { label: t('lief_field_email'), value: newEmail, setter: setNewEmail, type: 'email', ph: 'ivan@firma.de', autoComplete: 'off' },
          { label: t('set_field_password'), value: newPassword, setter: setNewPassword, type: 'password', ph: t('set_password_ph'), autoComplete: 'new-password' },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs text-secondary mb-1">{f.label}</label>
            <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.ph}
                   autoComplete={f.autoComplete}
                   className="w-full bg-bg-1 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
          </div>
        ))}
        <div>
          <label className="block text-xs text-secondary mb-1">{t('set_field_role')}</label>
          <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  className="w-full bg-bg-1 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber transition-colors">
            <option value="worker">{t('sidebar_worker')}</option>
            <option value="admin">{t('sidebar_admin')}</option>
            <option value="owner">{t('sidebar_owner')}</option>
          </select>
        </div>
      </div>
      {userError && <p className="text-red text-xs">{userError}</p>}
      <div className="flex gap-2">
        <button onClick={onAdd}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
          {t('auf_add_button')}
        </button>
        <button onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm bg-bg-1 border border-border text-secondary">
          {t('common_cancel')}
        </button>
      </div>
    </div>
  )
}

function UserList({ users, confirmDelete, setConfirmDelete, changeRole, deleteUser }) {
  const { t } = useLanguage()
  return (
    <div className="divide-y divide-border">
      {users.map(u => (
        <div key={u.id} className="flex items-center gap-3 py-3">
          <div className="w-8 h-8 rounded-full bg-bg-2 flex items-center justify-center text-sm font-semibold shrink-0">
            {u.display_name?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{u.display_name}</div>
          </div>
          <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                  className={`text-xs px-2 py-1.5 rounded-lg border outline-none transition-colors shrink-0 ${
                    u.role === 'owner' ? 'bg-amber-dim border-amber/40 text-amber' : 'bg-bg-2 border-border text-secondary'
                  }`}
                  style={u.role === 'admin' ? { background: '#4a90d91a', borderColor: '#4a90d966', color: '#4a90d9' } : undefined}>
            <option value="worker">{t('sidebar_worker')}</option>
            <option value="admin">{t('sidebar_admin')}</option>
            <option value="owner">{t('sidebar_owner')}</option>
          </select>
          {confirmDelete === u.id ? (
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => deleteUser(u.id)}
                      className="text-xs bg-red text-white px-2.5 py-1.5 rounded-lg">{t('common_delete')}</button>
              <button onClick={() => setConfirmDelete(null)}
                      className="text-xs bg-bg-2 border border-border text-secondary px-2.5 py-1.5 rounded-lg">{t('common_no')}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(u.id)}
                    className="p-1.5 rounded-lg hover:bg-bg-2 transition-colors shrink-0">
              <Icon name="trash" size={14} color="#6b7480" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function FirmaCard({ firma, setFirma, onSave, saving, msg }) {
  const { t } = useLanguage()
  const up = (k, v) => setFirma(f => ({ ...f, [k]: v }))
  const fileRef = useRef(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const uploadLogo = async (file) => {
    setUploading(true); setUploadError(null)
    const ext = file.name.split('.').pop()
    const path = `logo.${ext}`
    const { error: upErr } = await supabase.storage.from('firmenlogo').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (upErr) { setUploadError(upErr.message); setUploading(false); return }
    const { data } = supabase.storage.from('firmenlogo').getPublicUrl(path)
    const url = `${data.publicUrl}?v=${Date.now()}`
    const { error: dbErr } = await supabase.from('firmendaten').update({ logo_url: url }).eq('id', 1)
    setUploading(false)
    if (dbErr) { setUploadError(dbErr.message); return }
    setFirma(f => ({ ...f, logo_url: url }))
  }

  const removeLogo = async () => {
    await supabase.from('firmendaten').update({ logo_url: '' }).eq('id', 1)
    setFirma(f => ({ ...f, logo_url: '' }))
  }

  const fields = [
    { k: 'name',    label: t('set_company_name'),   ph: 'Mustermann Lager GmbH', full: true },
    { k: 'adresse', label: t('lief_field_address'), ph: 'Musterstraße 1, 12345 Berlin', full: true },
    { k: 'telefon', label: t('lief_field_phone'),   ph: '+49 30 1234567' },
    { k: 'email',   label: t('lief_field_email'),   ph: 'einkauf@meinefirma.de' },
    { k: 'steuernummer', label: t('set_tax_number'), ph: '12/345/67890' },
    { k: 'ust_idnr',     label: t('set_vat_id'),     ph: 'DE123456789' },
    { k: 'aenderungs_pin', label: t('set_change_pin'), ph: '1234', type: 'password' },
  ]
  return (
    <Card className="p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <SectionHead icon="building" color="#e8821c" title={t('set_company_data')} />
      <p className="text-xs text-secondary mb-4 -mt-2">{t('set_company_data_desc')}</p>
      {msg && (
        <div className="flex items-center gap-2 text-green text-xs bg-green-dim rounded-xl px-3 py-2 mb-3">
          <Icon name="check" size={13} color="#4caf6e" /> {msg}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs text-secondary mb-1.5">{t('set_company_logo')}</label>
        <div className="flex items-center gap-3 flex-wrap">
          {firma.logo_url ? (
            <img src={firma.logo_url} alt="Firmenlogo" className="h-12 max-w-[140px] object-contain bg-white rounded-lg p-1.5" />
          ) : (
            <div className="h-12 w-24 rounded-lg bg-bg-2 border border-border flex items-center justify-center text-muted text-[11px]">{t('set_no_logo')}</div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="text-xs bg-bg-2 border border-border px-3 py-2 rounded-lg text-secondary disabled:opacity-60">
            {uploading ? t('set_uploading') : t('set_upload_logo')}
          </button>
          {firma.logo_url && (
            <button type="button" onClick={removeLogo} className="text-xs text-muted hover:text-red">{t('set_remove')}</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
                 onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} />
        </div>
        {uploadError && <p className="text-red text-xs mt-1.5">{uploadError}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {fields.map(f => (
          <div key={f.k} className={f.full ? 'sm:col-span-2' : ''}>
            <label className="block text-xs text-secondary mb-1">{f.label}</label>
            <input type={f.type ?? 'text'} value={firma[f.k] ?? ''} placeholder={f.ph} autoComplete="off"
                   onChange={e => up(f.k, e.target.value)}
                   className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber transition-colors" />
          </div>
        ))}
      </div>
      <button onClick={onSave} disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
        {saving ? t('common_saving') : t('common_save')}
      </button>
    </Card>
  )
}

/* ══ FIRMEN-STANDORT (Zeiterfassung GPS check-in) ══ */
function StandortCard({ firma, setFirma }) {
  const { t } = useLanguage()
  const [showMap, setShowMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const save = async (patch) => {
    setSaving(true)
    const next = { ...patch }
    await supabase.from('firmendaten').update(next).eq('id', 1)
    setFirma(f => ({ ...f, ...next }))
    setSaving(false)
    setMsg(t('set_company_data_saved')); setTimeout(() => setMsg(null), 3000)
  }

  return (
    <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <SectionHead icon="mapPin" color="#4a90d9" title={t('set_standort_titel')} />
      <p className="text-xs text-secondary mb-3 -mt-2">{t('set_standort_desc')}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowMap(true)}
                className="flex items-center gap-1.5 text-sm bg-bg-2 border border-border px-3 py-2 rounded-lg text-secondary hover:bg-bg-3 transition-colors">
          <Icon name="mapPin" size={14} color="currentColor" />
          {firma.firma_lat != null ? t('set_standort_change') : t('set_standort_pick')}
        </button>
        {firma.firma_lat != null && (
          <>
            <span className="text-[11px] font-mono text-muted">{Number(firma.firma_lat).toFixed(5)}, {Number(firma.firma_lng).toFixed(5)}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted">
              {t('auf_standort_radius')}
              <input type="number" min="30" step="10" value={firma.firma_radius ?? 120}
                     onChange={e => setFirma(f => ({ ...f, firma_radius: e.target.value }))}
                     onBlur={() => save({ firma_radius: Math.max(Number(firma.firma_radius) || 120, 30) })}
                     className="w-16 bg-bg-2 border border-border rounded-lg px-2 py-1 text-xs font-mono text-right outline-none focus:border-amber" />
              m
            </span>
          </>
        )}
        {saving && <span className="text-[11px] text-muted">…</span>}
        {msg && <span className="text-[11px] text-green">{msg}</span>}
      </div>
      {showMap && (
        <MapPicker lat={firma.firma_lat} lng={firma.firma_lng} radius={Number(firma.firma_radius) || 120}
                   onPick={(lat, lng) => save({ firma_lat: lat, firma_lng: lng })}
                   onClose={() => setShowMap(false)} />
      )}
    </Card>
  )
}

// One user line: avatar, name + role badge + contract hint, Aktiv, and
// a ⋯ menu to edit (role, rate, contract) or delete the account.
function UserRow({ u, onEdit, deleteUser, confirmDelete, setConfirmDelete }) {
  const { t } = useLanguage()
  const [menu, setMenu] = useState(false)
  const vertragHint = u.vertrag_stunden
    ? `${Number(u.vertrag_stunden).toString().replace('.', ',')} h/${u.vertrag_periode === 'tag' ? t('set_tag_short') : t('set_woche_short')}`
    : null
  return (
    <div className="relative flex items-center gap-3 py-3">
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: avColor(u.display_name) }}>
        {initialen(u.display_name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{u.display_name}</span>
          <RoleBadge role={u.role} />
        </div>
        {(u.stundensatz > 0 || vertragHint) && (
          <div className="text-[11px] text-muted truncate">
            {u.stundensatz > 0 && `${Number(u.stundensatz).toString().replace('.', ',')} €/h`}{u.stundensatz > 0 && vertragHint && ' · '}{vertragHint}
          </div>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-xs text-secondary shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(var(--color-green))' }} /> {t('set_aktiv')}
      </span>
      <button onClick={() => setMenu(m => !m)} className="p-1.5 rounded-lg hover:bg-bg-2 border border-border shrink-0">
        <Icon name="dots" size={15} color="#9aa3ad" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-bg-1 border border-border rounded-xl shadow-lg p-1">
            <button onClick={() => { onEdit(u); setMenu(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-bg-2 text-left">
              <Icon name="edit" size={13} color="#9aa3ad" /> {t('set_bearbeiten')}
            </button>
            <div className="border-t border-border my-1" />
            {confirmDelete === u.id ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="text-[11px] text-red flex-1">{t('common_delete_confirm')}</span>
                <button onClick={() => { deleteUser(u.id); setMenu(false) }} className="text-[11px] bg-red text-white px-2 py-1 rounded">{t('common_yes')}</button>
                <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-muted px-1">{t('common_no')}</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(u.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-red hover:bg-red-dim text-left">
                <Icon name="trash" size={13} color="#e0524a" /> {t('common_delete')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Small centered modal shell ── */
function Modal({ title, icon, color, onClose, children, footer }) {
  // Close only when the press STARTS on the backdrop — otherwise a drag
  // that begins inside (selecting text, dragging off a field) and ends
  // on the backdrop would fire a click there and close the dialog.
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg-1 border border-border w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: (color ?? '#4a90d9') + '1f' }}><Icon name={icon ?? 'settings'} size={14} color={color ?? '#4a90d9'} /></span>
            {title}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2"><Icon name="x" size={16} color="#9aa3ad" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        {footer && <div className="flex gap-2 px-5 pb-5">{footer}</div>}
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber'

/* ── Per-employee: role, rate, contract ── */
function MitarbeiterModal({ user, onClose, onSaved }) {
  const { t } = useLanguage()
  const [role, setRole] = useState(user.role)
  const [satz, setSatz] = useState(user.stundensatz != null ? String(user.stundensatz) : '')
  const [vertrag, setVertrag] = useState(user.vertrag_stunden != null ? String(user.vertrag_stunden) : '')
  const [periode, setPeriode] = useState(user.vertrag_periode ?? 'woche')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    await supabase.from('profiles').update({
      role, stundensatz: Math.max(Number(satz) || 0, 0),
      vertrag_stunden: vertrag === '' ? null : Math.max(Number(vertrag) || 0, 0),
      vertrag_periode: periode,
    }).eq('id', user.id)
    setBusy(false); onSaved()
  }
  return (
    <Modal title={user.display_name} icon="user" color="#4a90d9" onClose={onClose}
           footer={<><button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>{busy ? '…' : t('common_save')}</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2">{t('common_cancel')}</button></>}>
      <div>
        <label className="block text-xs text-secondary mb-1">{t('set_field_role')}</label>
        <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
          <option value="worker">{t('sidebar_worker')}</option>
          <option value="admin">{t('sidebar_admin')}</option>
          <option value="owner">{t('sidebar_owner')}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-secondary mb-1">{t('set_stundensatz')}</label>
        <div className="relative">
          <input type="number" min="0" step="0.5" value={satz} onChange={e => setSatz(e.target.value)} placeholder="0" className={`${inputCls} pr-12 font-mono`} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
        </div>
      </div>
      <div>
        <label className="block text-xs text-secondary mb-1">{t('set_vertrag')}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type="number" min="0" step="0.5" value={vertrag} onChange={e => setVertrag(e.target.value)} placeholder="40" className={`${inputCls} pr-8 font-mono`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">h</span>
          </div>
          <select value={periode} onChange={e => setPeriode(e.target.value)} className="bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber">
            <option value="tag">{t('set_pro_tag')}</option>
            <option value="woche">{t('set_pro_woche')}</option>
          </select>
        </div>
        <p className="text-[11px] text-muted mt-1">{t('set_vertrag_hint')}</p>
      </div>
    </Modal>
  )
}

/* ── Company default work-time (fallback for overtime) ── */
function ArbeitszeitConfigModal({ firma, onClose, onSaved }) {
  const { t } = useLanguage()
  const [soll, setSoll] = useState(String(firma.soll_stunden_tag ?? 8))
  const [pause, setPause] = useState(String(firma.pause_min_default ?? 30))
  const [maxUe, setMaxUe] = useState(String(firma.max_ueberstunden_tag ?? 0))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const patch = {
      soll_stunden_tag: Math.max(Number(soll) || 0, 0),
      pause_min_default: Math.max(Number(pause) || 0, 0),
      max_ueberstunden_tag: Math.max(Number(maxUe) || 0, 0),
    }
    await supabase.from('firmendaten').update(patch).eq('id', 1)
    setBusy(false); onSaved(patch)
  }
  const numField = (label, val, set, unit, hint) => (
    <div>
      <label className="block text-xs text-secondary mb-1">{label}</label>
      <div className="relative">
        <input type="number" min="0" step={unit === 'min' ? '5' : '0.5'} value={val} onChange={e => set(e.target.value)} className={`${inputCls} pr-10 font-mono`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>
      </div>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  )
  return (
    <Modal title={t('set_adv_zeit')} icon="clock" color="#4caf6e" onClose={onClose}
           footer={<><button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>{busy ? '…' : t('common_save')}</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2">{t('common_cancel')}</button></>}>
      <p className="text-xs text-secondary">{t('set_adv_zeit_sub')}</p>
      {numField(t('set_soll_tag'), soll, setSoll, 'h', t('set_soll_hint'))}
      {numField(t('set_pause_default'), pause, setPause, 'min')}
      {numField(t('set_max_ueber'), maxUe, setMaxUe, 'h', t('set_max_ueber_hint'))}
    </Modal>
  )
}

/* ── Notification preferences (saved; delivery is a future backend) ── */
function BenachrichtigungenModal({ firma, onClose, onSaved }) {
  const { t } = useLanguage()
  const init = firma.benachrichtigungen ?? {}
  const OPTS = [
    ['niedriger_bestand', t('set_notif_lowstock')],
    ['neue_bestellung', t('set_notif_order')],
    ['projekt_frist', t('set_notif_deadline')],
    ['gps_ausserhalb', t('set_notif_gps')],
  ]
  const [prefs, setPrefs] = useState(() => Object.fromEntries(OPTS.map(([k]) => [k, !!init[k]])))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    await supabase.from('firmendaten').update({ benachrichtigungen: prefs }).eq('id', 1)
    setBusy(false); onSaved({ benachrichtigungen: prefs })
  }
  return (
    <Modal title={t('set_adv_notif')} icon="alert" color="#e8821c" onClose={onClose}
           footer={<><button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>{busy ? '…' : t('common_save')}</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-secondary border border-border hover:bg-bg-2">{t('common_cancel')}</button></>}>
      <div className="space-y-1">
        {OPTS.map(([k, label]) => (
          <button key={k} onClick={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} className="w-full flex items-center justify-between gap-3 py-2.5 text-left">
            <span className="text-sm">{label}</span>
            <span className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${prefs[k] ? 'bg-green' : 'bg-bg-3'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${prefs[k] ? 'translate-x-4' : ''}`} />
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('set_notif_hint')}</p>
    </Modal>
  )
}

/* ── Security: change-PIN + roles overview ── */
function SicherheitModal({ firma, users, onClose, onSaved }) {
  const { t } = useLanguage()
  const [pin, setPin] = useState(firma.aenderungs_pin ?? '')
  const [busy, setBusy] = useState(false)
  // per-user access change
  const [uid, setUid] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [zugBusy, setZugBusy] = useState(false)
  const [zugMsg, setZugMsg] = useState(null)

  const savePin = async () => {
    setBusy(true)
    await supabase.from('firmendaten').update({ aenderungs_pin: pin.trim() }).eq('id', 1)
    setBusy(false); onSaved({ aenderungs_pin: pin.trim() })
  }
  const saveZugang = async () => {
    if (!uid || (!newEmail.trim() && !newPass)) return
    setZugBusy(true); setZugMsg(null)
    const { error } = await supabase.rpc('admin_update_user', {
      p_user_id: uid, p_email: newEmail.trim() || null, p_password: newPass || null,
    })
    setZugBusy(false)
    if (error) { setZugMsg({ err: true, text: error.message }); return }
    setNewEmail(''); setNewPass('')
    setZugMsg({ err: false, text: t('set_zugang_saved') })
    setTimeout(() => setZugMsg(null), 3500)
  }

  return (
    <Modal title={t('set_adv_security')} icon="eye" color="#9b6bd9" onClose={onClose}>
      {/* Änderungs-PIN */}
      <div>
        <label className="block text-xs text-secondary mb-1">{t('set_change_pin')}</label>
        <div className="flex gap-2">
          <input type="text" value={pin} onChange={e => setPin(e.target.value)} placeholder="1234" className={`${inputCls} font-mono flex-1`} />
          <button onClick={savePin} disabled={busy} className="px-4 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>{busy ? '…' : t('common_save')}</button>
        </div>
        <p className="text-[11px] text-muted mt-1">{t('set_pin_hint')}</p>
      </div>

      {/* Zugangsdaten ändern */}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-semibold mb-1">{t('set_zugang_titel')}</div>
        <p className="text-[11px] text-muted mb-2.5">{t('set_zugang_sub')}</p>
        <select value={uid} onChange={e => setUid(e.target.value)} className={`${inputCls} mb-2`}>
          <option value="">{t('set_zugang_select')}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
        </select>
        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t('set_zugang_new_email')} autoComplete="off" className={`${inputCls} mb-2`} />
        <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder={t('set_zugang_new_pass')} autoComplete="off" className={`${inputCls} mb-2 font-mono`} />
        {zugMsg && <p className={`text-[11px] mb-2 ${zugMsg.err ? 'text-red' : 'text-green'}`}>{zugMsg.text}</p>}
        <button onClick={saveZugang} disabled={zugBusy || !uid || (!newEmail.trim() && !newPass)}
                className="w-full py-2 rounded-xl text-sm font-semibold border border-border bg-bg-2 hover:bg-bg-3 disabled:opacity-50 transition-colors">
          {zugBusy ? '…' : t('set_zugang_save')}
        </button>
      </div>

      {/* Zugriffsrechte overview */}
      <div className="border-t border-border pt-4">
        <div className="text-xs text-secondary mb-2">{t('set_zugriffsrechte')}</div>
        <div className="space-y-1.5">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-2">
              <span className="text-sm truncate">{u.display_name}</span>
              <RoleBadge role={u.role} />
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted">{t('set_2fa_hint')}</p>
    </Modal>
  )
}

// Read-only company data with a "Bearbeiten" button that flips to the
// editable FirmaCard.
function FirmendatenView({ firma, onEdit }) {
  const { t } = useLanguage()
  const Field = ({ label, value }) => (
    <div className="min-w-0">
      <div className="text-[11px] text-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium truncate">{value || '—'}</div>
    </div>
  )
  return (
    <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <SectionHead icon="building" color="#4a90d9" title={t('set_company_data')}
        action={<button onClick={onEdit} className="flex items-center gap-1.5 text-sm bg-bg-2 border border-border px-3 py-2 rounded-lg text-secondary hover:bg-bg-3 transition-colors shrink-0"><Icon name="edit" size={13} color="currentColor" /> {t('set_bearbeiten')}</button>} />
      <p className="text-xs text-secondary mb-4 -mt-2">{t('set_firma_sub')}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Field label={t('set_company_name')} value={firma.name} />
        <Field label={t('lief_field_email')} value={firma.email} />
        <Field label={t('lief_field_address')} value={firma.adresse} />
        <Field label={t('set_vat_id')} value={firma.ust_idnr} />
        <Field label={t('lief_field_phone')} value={firma.telefon} />
        <Field label={t('set_tax_number')} value={firma.steuernummer} />
      </div>
    </Card>
  )
}

export default function EinstellungenPage({ articles, moves, setArticles, setMoves }) {
  const { t, lang, toggleLang } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [firmaEdit, setFirmaEdit]     = useState(false)
  const [showStandortMap, setShowStandortMap] = useState(false)
  const [editUser, setEditUser]       = useState(null)
  const [showZeitCfg, setShowZeitCfg] = useState(false)
  const [showNotif, setShowNotif]     = useState(false)
  const [showSec, setShowSec]         = useState(false)
  const rootRef = useRef(null)
  const [tabH, setTabH] = useState(null)
  useEffect(() => {
    // Small reserve only — internal scroll areas handle overflow, so the
    // pinned box can reach (almost) the viewport bottom without a page
    // scrollbar.
    const calc = () => { const el = rootRef.current; if (el) setTabH(Math.max(window.innerHeight - el.getBoundingClientRect().top - 12, 460)) }
    calc(); window.addEventListener('resize', calc); return () => window.removeEventListener('resize', calc)
  }, [])
  const [users, setUsers]             = useState([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail]       = useState('')
  const [newName, setNewName]         = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole]         = useState('worker')
  const [userError, setUserError]     = useState(null)
  const [userMsg, setUserMsg]         = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [firma, setFirma]             = useState({ name: '', adresse: '', telefon: '', email: '', notiz: '', steuernummer: '', ust_idnr: '', aenderungs_pin: '' })
  const [firmaSaving, setFirmaSaving] = useState(false)
  const [firmaMsg, setFirmaMsg]       = useState(null)

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    if (data) setUsers(data)
  }
  const loadFirma = async () => {
    const { data } = await supabase.from('firmendaten').select('*').eq('id', 1).single()
    if (data) setFirma(data)
  }
  useEffect(() => { loadUsers(); loadFirma() }, [])

  const saveFirma = async () => {
    setFirmaSaving(true)
    const { error } = await supabase.from('firmendaten').update({
      name: firma.name.trim(), adresse: firma.adresse.trim(),
      telefon: firma.telefon.trim(), email: firma.email.trim(),
      steuernummer: firma.steuernummer.trim(), ust_idnr: firma.ust_idnr.trim(),
      aenderungs_pin: firma.aenderungs_pin.trim(),
    }).eq('id', 1)
    setFirmaSaving(false)
    if (!error) { setFirmaMsg(t('set_company_data_saved')); setTimeout(() => setFirmaMsg(null), 3000) }
  }

  const addUser = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newName.trim()) {
      setUserError(t('set_fill_all_fields')); return
    }
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
      email: newEmail.trim(), password: newPassword,
      options: { data: { display_name: newName.trim(), role: newRole } }
    })
    if (signUpError) { setUserError(signUpError.message); setNewPassword(''); return }
    if (signUpData?.user?.id) {
      await supabase.from('profiles').upsert({
        id: signUpData.user.id, display_name: newName.trim(), role: newRole,
      })
    }
    setUserMsg(`"${newName.trim()}" ${t('set_user_added')}`)
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('worker')
    setShowAddUser(false); setUserError(null)
    setTimeout(() => setUserMsg(null), 4000)
    loadUsers()
  }

  const changeRole = async (id, role) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    loadUsers()
  }

  const deleteUser = async (id) => {
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: id })
    setConfirmDelete(null)
    if (error) { setDeleteError(error.message); return }
    setDeleteError(null); loadUsers()
  }

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(articles.map(a => ({
      Artikelnummer: a.nummer, Name: a.name, Kategorie: a.kategorie,
      Menge: a.menge, Einheit: a.einheit, Mindestbestand: a.mindestbestand,
      Lagerort: a.lagerort, Preis: a.preis, Lieferant: a.lieferant,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Artikel')
    XLSX.writeFile(wb, `Lagerbestand_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const exportJSON = () => {
    const data = { articles, moves, exportDatum: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `stockmaster_backup_${new Date().toISOString().slice(0,10)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const closeUserForm = () => { setShowAddUser(false); setUserError(null) }

  const saveStandort = async (patch) => {
    await supabase.from('firmendaten').update(patch).eq('id', 1)
    setFirma(f => ({ ...f, ...patch }))
  }
  return (
    <div ref={rootRef} className="p-3 sm:p-6 lg:p-8 xl:flex xl:flex-col xl:overflow-hidden xl:h-[var(--tab-h)]"
         style={{ '--tab-h': tabH ? `${tabH}px` : 'auto' }}>
      <div className="mb-5 xl:shrink-0">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('set_title')}</h1>
        <p className="text-secondary text-sm">{t('set_page_sub')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 xl:flex-1 xl:min-h-0 xl:grid-rows-1">
        {/* ══ LEFT — Benutzerverwaltung grows, System pinned below ══ */}
        <div className="space-y-5 xl:flex xl:flex-col xl:min-h-0">
          {/* Benutzerverwaltung */}
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:flex-1 xl:flex xl:flex-col xl:min-h-0">
            <SectionHead icon="user" color="#4a90d9" title={t('set_user_mgmt')}
              action={!showAddUser && (
                <button onClick={() => { setShowAddUser(true); setUserError(null) }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shrink-0 text-white"
                        style={{ background: '#4caf6e' }}>
                  <Icon name="plus" size={14} color="#fff" /> {t('set_add_employee')}
                </button>
              )} />
            <p className="text-xs text-secondary mb-4 -mt-2">{t('set_user_mgmt_sub')}</p>
            {userMsg && <div className="flex items-center gap-2 text-green text-sm bg-green-dim rounded-xl px-3 py-2.5 mb-4"><Icon name="check" size={14} color="#4caf6e" /> {userMsg}</div>}
            {deleteError && <div className="flex items-center gap-2 text-red text-sm bg-red-dim rounded-xl px-3 py-2.5 mb-4"><Icon name="alert" size={14} color="#e0524a" /> {deleteError}</div>}
            {showAddUser && (
              <UserForm newName={newName} setNewName={setNewName} newEmail={newEmail} setNewEmail={setNewEmail}
                        newPassword={newPassword} setNewPassword={setNewPassword} newRole={newRole} setNewRole={setNewRole}
                        userError={userError} onAdd={addUser} onCancel={closeUserForm} />
            )}
            <div className="divide-y divide-border xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
              {users.map(u => (
                <UserRow key={u.id} u={u} onEdit={setEditUser} deleteUser={deleteUser}
                         confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} />
              ))}
            </div>
          </Card>

          {/* System */}
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:shrink-0">
            <SectionHead icon="settings" color="#4a90d9" title={t('set_system')} />
            <p className="text-xs text-secondary mb-4 -mt-2">{t('set_system_sub')}</p>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">{t('set_language')}</span>
                <select value={lang} onChange={e => { if (e.target.value !== lang) toggleLang() }}
                        className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber">
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">{t('set_timezone')}</span>
                <select disabled className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-secondary outline-none">
                  <option>Europe/Berlin (UTC+2)</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">{t('set_design')}</span>
                <select value={theme} onChange={e => { if (e.target.value !== theme) toggleTheme() }}
                        className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber">
                  <option value="light">☀️ {t('theme_light_short')}</option>
                  <option value="dark">🌙 {t('theme_dark_short')}</option>
                </select>
              </div>
            </div>
          </Card>
        </div>

        {/* ══ RIGHT — fills to the same bottom as the left column ══ */}
        <div className="space-y-5 xl:flex xl:flex-col xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          {/* Firmendaten */}
          {firmaEdit
            ? <FirmaCard firma={firma} setFirma={setFirma}
                         onSave={async () => { await saveFirma(); setFirmaEdit(false) }}
                         saving={firmaSaving} msg={firmaMsg} />
            : <FirmendatenView firma={firma} onEdit={() => setFirmaEdit(true)} />}

          {/* Firmen-Standort — map preview */}
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <SectionHead icon="mapPin" color="#4a90d9" title={t('set_standort_titel')} />
            <p className="text-xs text-secondary mb-3 -mt-2">{t('set_standort_desc2')}</p>
            <StandortPreview lat={firma.firma_lat} lng={firma.firma_lng} radius={Number(firma.firma_radius) || 150} />
            <button onClick={() => setShowStandortMap(true)}
                    className="w-full flex items-center justify-center gap-2 mt-3 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-secondary hover:bg-bg-3 transition-colors">
              <Icon name="mapPin" size={15} color="currentColor" /> {t('set_standort_pick_map')}
            </button>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted">
              <span>{t('set_aktueller_radius')}:</span>
              <input type="number" min="30" step="10" value={firma.firma_radius ?? 150}
                     onChange={e => setFirma(f => ({ ...f, firma_radius: e.target.value }))}
                     onBlur={() => saveStandort({ firma_radius: Math.max(Number(firma.firma_radius) || 150, 30) })}
                     className="w-16 bg-bg-2 border border-border rounded-lg px-2 py-1 text-xs font-mono text-right outline-none focus:border-amber" />
              <span>m</span>
              <Icon name="edit" size={12} color="#6b7480" />
            </div>
            {firma.adresse && (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(var(--color-green))' }} />
                {t('set_aktueller_standort')}: {firma.adresse}
              </div>
            )}
          </Card>

          {/* Daten */}
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <SectionHead icon="box" color="#4caf6e" title={t('set_data')} />
            <p className="text-xs text-secondary mb-4 -mt-2">{t('set_data_sub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { icon: 'download', title: t('set_export_excel_label'), sub: t('set_export_excel_sub'), onClick: exportExcel },
                { icon: 'download', title: t('set_export_json_label'), sub: t('set_export_json_sub'), onClick: exportJSON },
                { icon: 'upload', title: t('set_import_open'), sub: t('set_import_sub'), onClick: () => navigate('/import') },
              ].map(b => (
                <button key={b.title} onClick={b.onClick}
                        className="flex flex-col items-start gap-1 p-3 rounded-xl bg-bg-2 border border-border hover:bg-bg-3 transition-colors text-left">
                  <Icon name={b.icon} size={16} color="#9aa3ad" />
                  <span className="text-sm font-medium mt-1">{b.title}</span>
                  <span className="text-[11px] text-muted leading-tight">{b.sub}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Erweiterte Einstellungen — grows so the column reaches the bottom */}
          <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:flex-1">
            <SectionHead icon="settings" color="#9aa3ad" title={t('set_adv_title')} />
            <p className="text-xs text-secondary mb-3 -mt-2">{t('set_adv_sub')}</p>
            <div className="divide-y divide-border -my-1">
              {[
                { icon: 'clock', color: '#4caf6e', title: t('set_adv_zeit'), sub: t('set_adv_zeit_sub'), open: () => setShowZeitCfg(true) },
                { icon: 'alert', color: '#e8821c', title: t('set_adv_notif'), sub: t('set_adv_notif_sub'), open: () => setShowNotif(true) },
                { icon: 'eye', color: '#9b6bd9', title: t('set_adv_security'), sub: t('set_adv_security_sub'), open: () => setShowSec(true) },
              ].map(r => (
                <button key={r.title} onClick={r.open}
                        className="w-full flex items-center gap-3 py-3 text-left hover:bg-bg-2/50 rounded-lg px-1 transition-colors">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: r.color + '1f' }}>
                    <Icon name={r.icon} size={15} color={r.color} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-[11px] text-muted truncate">{r.sub}</div>
                  </div>
                  <Icon name="chevronRight" size={16} color="#6b7480" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {showStandortMap && (
        <MapPicker lat={firma.firma_lat} lng={firma.firma_lng} radius={Number(firma.firma_radius) || 150}
                   title={t('set_standort_titel')}
                   onPick={(lat, lng) => saveStandort({ firma_lat: lat, firma_lng: lng })}
                   onClose={() => setShowStandortMap(false)} />
      )}
      {editUser && <MitarbeiterModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); loadUsers() }} />}
      {showZeitCfg && <ArbeitszeitConfigModal firma={firma} onClose={() => setShowZeitCfg(false)} onSaved={(patch) => { setFirma(f => ({ ...f, ...patch })); setShowZeitCfg(false) }} />}
      {showNotif && <BenachrichtigungenModal firma={firma} onClose={() => setShowNotif(false)} onSaved={(patch) => { setFirma(f => ({ ...f, ...patch })); setShowNotif(false) }} />}
      {showSec && <SicherheitModal firma={firma} users={users} onClose={() => setShowSec(false)} onSaved={(patch) => { setFirma(f => ({ ...f, ...patch })); setShowSec(false) }} />}
    </div>
  )
}
