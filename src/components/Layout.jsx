import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Icon from './Icon'
import { useLanguage } from '../hooks/useLanguage'

const PAGE_TITLE_KEYS = {
  '/':              'nav_home',
  '/uebersicht':    'nav_uebersicht',
  '/bewegung':      'nav_bewegung',
  '/inventur':      'nav_inventur',
  '/dashboard':     'nav_dashboard',
  '/auftraege':     'nav_auftraege',
  '/projekte':      'nav_projekte',
  '/lieferanten':   'nav_lieferanten',
  '/import':        'nav_import',
  '/administration': 'nav_administration',
  '/datenschutz':   'nav_datenschutz',
  '/einstellungen': 'nav_einstellungen',
}

export default function Layout({ lowStockCount }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { t } = useLanguage()
  const title = PAGE_TITLE_KEYS[pathname] ? t(PAGE_TITLE_KEYS[pathname]) : 'StockMaster'

  return (
    <div className="flex h-full bg-bg-0 overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        lowStockCount={lowStockCount}
      />

      {/* Main content — offset by sidebar width on large screens */}
      <div className="flex-1 flex flex-col min-h-full min-w-0 lg:ml-60">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3.5 bg-bg-1 border-b border-border sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg bg-bg-2 border border-border"
            aria-label={t('common_open_menu')}
          >
            <Icon name="menu" size={18} color="#9aa3ad" />
          </button>
          <span className="font-semibold text-base">{title}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

