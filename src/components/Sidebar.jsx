import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import Logo from './Logo'
import Tagline from './Tagline'
import StatusDot from './StatusDot'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useLanguage } from '../hooks/useLanguage'
import { useOnlinePresence } from '../hooks/useOnlinePresence'

const NAV_ITEMS = [
  { to: '/',             labelKey: 'nav_home',        icon: 'home' },
  { to: '/dashboard',    labelKey: 'nav_dashboard',   icon: 'chart',    managerOnly: true },
  { to: '/uebersicht',   labelKey: 'nav_uebersicht',  icon: 'box' },
  { to: '/bewegung',     labelKey: 'nav_bewegung',    icon: 'truck' },
  { to: '/auftraege',    labelKey: 'nav_auftraege',   icon: 'clipboard', managerOnly: true },
  { to: '/projekte',     labelKey: 'nav_projekte',    icon: 'clipboard', plainWorkerOnly: true },
  { to: '/lieferanten',  labelKey: 'nav_lieferanten', icon: 'building', managerOnly: true },
  { to: '/inventur',     labelKey: 'nav_inventur',    icon: 'filter' },
  { to: '/administration', labelKey: 'nav_administration', icon: 'download', managerOnly: true, desktopOnly: true },
  { to: '/import',       labelKey: 'nav_import',      icon: 'upload',   managerOnly: true, desktopOnly: true },
  { to: '/einstellungen',labelKey: 'nav_einstellungen', icon: 'settings', ownerOnly: true },
]

export default function Sidebar({ open, onClose, lowStockCount }) {
  const { profile, isOwner, isAdmin, isManager, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { lang, toggleLang, t } = useLanguage()
  const { roster, onlineIds } = useOnlinePresence()
  const visible = NAV_ITEMS.filter(i =>
    (!i.ownerOnly || isOwner) && (!i.managerOnly || isManager) && (!i.plainWorkerOnly || !isManager)
  )
  const roleLabel = (role) => role === 'owner' ? t('sidebar_owner') : role === 'admin' ? t('sidebar_admin') : t('sidebar_worker')

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-bg-1 border-r border-border z-50
        flex flex-col
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
          <Logo size="sm" />
          <div>
            <div className="font-extrabold text-base leading-tight tracking-tight">
              Stock<span className="text-amber">Master</span>
            </div>
            <Tagline size="sm" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {visible.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) => `
                ${item.desktopOnly ? 'hidden sm:flex' : 'flex'} items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full
                transition-colors duration-100 relative
                ${isActive
                  ? 'bg-bg-3 text-primary border-l-2 border-amber pl-[10px]'
                  : 'text-secondary hover:bg-bg-2 hover:text-primary border-l-2 border-transparent pl-[10px]'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    size={18}
                    color={isActive ? '#e8821c' : '#6b7480'}
                  />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {item.to === '/uebersicht' && lowStockCount > 0 && (
                    <span className="bg-red-dim text-red text-[11px] font-semibold px-1.5 py-0.5 rounded-full font-mono">
                      {lowStockCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Team status — who's currently logged in, live */}
        {isManager && roster.length > 0 && (
          <div className="px-3 pt-2 pb-1 border-t border-border">
            <div className="flex items-center justify-between px-1 pt-2 pb-1.5">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t('sidebar_team_title')}</span>
              <span className="text-[11px] text-muted font-mono">
                {roster.filter(u => onlineIds.has(String(u.id))).length}/{roster.length}
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {[...roster]
                .sort((a, b) => {
                  const aOn = onlineIds.has(String(a.id)), bOn = onlineIds.has(String(b.id))
                  return aOn === bOn ? 0 : aOn ? -1 : 1
                })
                .map(u => {
                  const online = onlineIds.has(String(u.id))
                  return (
                    <div key={u.id} className="flex items-center gap-2 px-1 py-1">
                      <StatusDot color={online ? '#4caf6e' : '#6b7480'} pulse={online} size={7} />
                      <span className={`flex-1 min-w-0 truncate text-xs ${online ? 'text-primary' : 'text-muted'}`}>
                        {u.display_name}
                      </span>
                      <span className="text-[10px] text-muted shrink-0">{roleLabel(u.role)}</span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Theme / language toggles */}
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} title={theme === 'dark' ? t('sidebar_theme_light') : t('sidebar_theme_dark')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-bg-2 hover:text-primary border border-border transition-colors">
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={14} color="currentColor" />
              {theme === 'dark' ? t('theme_dark_short') : t('theme_light_short')}
            </button>
            <button onClick={toggleLang} title={t('sidebar_language')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-bg-2 hover:text-primary border border-border transition-colors">
              <Icon name="globe" size={14} color="currentColor" />
              {lang.toUpperCase()}
            </button>
          </div>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-border space-y-2 mt-2">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-bg-3 flex items-center justify-center text-sm font-semibold shrink-0">
              {profile?.display_name?.charAt(0) ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{profile?.display_name}</div>
              <div className="text-[11px] text-muted">{isOwner ? t('sidebar_owner') : isAdmin ? t('sidebar_admin') : t('sidebar_worker')}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-secondary hover:bg-bg-2 hover:text-primary transition-colors"
          >
            <Icon name="logout" size={15} color="currentColor" />
            {t('sidebar_logout')}
          </button>
          <NavLink to="/datenschutz" onClick={onClose}
                   className="block text-center text-[11px] text-muted hover:text-secondary transition-colors pt-1">
            {t('nav_datenschutz')}
          </NavLink>
        </div>
      </aside>
    </>
  )
}
