import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import Tagline from '../components/Tagline'
import { useTheme } from '../hooks/useTheme'
import { useLanguage } from '../hooks/useLanguage'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { lang, toggleLang, t } = useLanguage()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim()
    })

    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg-0 flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button onClick={toggleTheme} title={theme === 'dark' ? t('sidebar_theme_light') : t('sidebar_theme_dark')}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:bg-bg-1 hover:text-primary border border-border transition-colors">
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} color="currentColor" />
        </button>
        <button onClick={toggleLang} title={t('sidebar_language')}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-secondary hover:bg-bg-1 hover:text-primary border border-border transition-colors">
          <Icon name="globe" size={14} color="currentColor" />
          {lang.toUpperCase()}
        </button>
      </div>

      <div className="w-full max-w-sm animate-scale-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Stock<span className="text-amber">Master</span>
          </h1>
          <div className="mt-1"><Tagline size="lg" /></div>
          <p className="text-secondary text-sm mt-2">{t('login_subtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-bg-1 border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('login_email')}</label>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@firma.de"
              className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-3 text-sm outline-none focus:border-amber transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1.5">{t('login_password')}</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bg-2 border border-border rounded-xl px-3.5 py-3 pr-11 text-sm outline-none focus:border-amber transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                tabIndex={-1}
              >
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red text-sm bg-red-dim rounded-xl px-3 py-2.5">
              <Icon name="alert" size={15} color="#e0524a" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}
          >
            {loading ? t('login_loading') : t('login_button')}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          StockMaster · {lang === 'en' ? 'Warehouse Management' : 'Lagerverwaltung'}
        </p>
      </div>
    </div>
  )
}
