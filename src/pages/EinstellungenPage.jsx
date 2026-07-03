import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { useLanguage } from '../hooks/useLanguage'

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
      <h2 className="font-semibold text-sm sm:text-base mb-1">{t('set_company_data')}</h2>
      <p className="text-xs text-secondary mb-4">{t('set_company_data_desc')}</p>
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

export default function EinstellungenPage({ articles, moves, setArticles, setMoves }) {
  const { t } = useLanguage()
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

  return (
    <>
      {/* ══ MOBILE ══ */}
      <div className="sm:hidden flex flex-col h-[100dvh] overflow-y-auto">
        <div className="p-3 space-y-3">
          <h1 className="text-base font-semibold">{t('set_title')}</h1>

          {/* Users */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm">{t('set_user_mgmt')}</span>
              {!showAddUser && (
                <button onClick={() => { setShowAddUser(true); setUserError(null) }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  <Icon name="plus" size={12} color="#181c20" /> {t('common_new')}
                </button>
              )}
            </div>
            {userMsg && (
              <div className="flex items-center gap-2 text-green text-xs bg-green-dim rounded-xl px-3 py-2 mb-3">
                <Icon name="check" size={13} color="#4caf6e" /> {userMsg}
              </div>
            )}
            {deleteError && (
              <div className="flex items-center gap-2 text-red text-xs bg-red-dim rounded-xl px-3 py-2 mb-3">
                <Icon name="alert" size={13} color="#e0524a" /> {deleteError}
              </div>
            )}
            {showAddUser && (
              <UserForm
                newName={newName} setNewName={setNewName}
                newEmail={newEmail} setNewEmail={setNewEmail}
                newPassword={newPassword} setNewPassword={setNewPassword}
                newRole={newRole} setNewRole={setNewRole}
                userError={userError} onAdd={addUser} onCancel={closeUserForm}
              />
            )}
            <UserList
              users={users} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
              changeRole={changeRole} deleteUser={deleteUser}
            />
          </Card>

          <FirmaCard firma={firma} setFirma={setFirma} onSave={saveFirma} saving={firmaSaving} msg={firmaMsg} />

          {/* Export */}
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">{t('set_export_data')}</h2>
            <div className="flex flex-col gap-2">
              <button onClick={exportExcel}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-bg-2 border border-border">
                <Icon name="download" size={14} color="#9aa3ad" /> {t('set_export_excel')}
              </button>
              <button onClick={exportJSON}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-bg-2 border border-border">
                <Icon name="download" size={14} color="#9aa3ad" /> {t('set_export_json')}
              </button>
            </div>
          </Card>

          {/* Info */}
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-2">{t('set_storage_location')}</h2>
            <p className="text-xs text-secondary leading-relaxed">
              {t('set_storage_desc_mobile')}
            </p>
          </Card>
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="hidden sm:block p-6 lg:p-8">
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('set_title')}</h1>
          <p className="text-secondary text-sm">{t('set_subtitle')}</p>
        </div>
        <div className="flex gap-5 flex-wrap items-start">
          <Card className="p-5 flex-[2_1_420px] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t('set_user_mgmt')}</h2>
              {!showAddUser && (
                <button onClick={() => { setShowAddUser(true); setUserError(null) }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
                  <Icon name="plus" size={14} color="#181c20" /> {t('set_employee')}
                </button>
              )}
            </div>
            <p className="text-xs text-secondary mb-4">{t('set_user_mgmt_desc')}</p>
            {userMsg && (
              <div className="flex items-center gap-2 text-green text-sm bg-green-dim rounded-xl px-3 py-2.5 mb-4">
                <Icon name="check" size={14} color="#4caf6e" /> {userMsg}
              </div>
            )}
            {deleteError && (
              <div className="flex items-center gap-2 text-red text-sm bg-red-dim rounded-xl px-3 py-2.5 mb-4">
                <Icon name="alert" size={14} color="#e0524a" /> {deleteError}
              </div>
            )}
            {showAddUser && (
              <UserForm
                newName={newName} setNewName={setNewName}
                newEmail={newEmail} setNewEmail={setNewEmail}
                newPassword={newPassword} setNewPassword={setNewPassword}
                newRole={newRole} setNewRole={setNewRole}
                userError={userError} onAdd={addUser} onCancel={closeUserForm}
              />
            )}
            <UserList
              users={users} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
              changeRole={changeRole} deleteUser={deleteUser}
            />
          </Card>

          <div className="flex-[1_1_280px] space-y-4">
            <FirmaCard firma={firma} setFirma={setFirma} onSave={saveFirma} saving={firmaSaving} msg={firmaMsg} />
            <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h2 className="font-semibold mb-2">{t('set_export_data')}</h2>
              <p className="text-xs text-secondary mb-4">{t('set_export_desc')}</p>
              <div className="flex flex-col gap-2">
                <button onClick={exportExcel}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-primary hover:bg-bg-3 transition-colors">
                  <Icon name="download" size={15} color="#9aa3ad" /> {t('set_export_excel')}
                </button>
                <button onClick={exportJSON}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-bg-2 border border-border text-primary hover:bg-bg-3 transition-colors">
                  <Icon name="download" size={15} color="#9aa3ad" /> {t('set_export_json')}
                </button>
              </div>
            </Card>
            <Card className="p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h2 className="font-semibold mb-2">{t('set_storage_location')}</h2>
              <p className="text-xs text-secondary leading-relaxed">
                {t('set_storage_desc_mobile')}{t('set_storage_desc_extra')}
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
