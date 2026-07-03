import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { LanguageProvider } from './hooks/useLanguage'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'

// Lazy-load heavy pages
const UebersichtPage   = lazy(() => import('./pages/UebersichtPage'))
const BewegungPage     = lazy(() => import('./pages/BewegungPage'))
const InventurPage     = lazy(() => import('./pages/InventurPage'))
const DashboardPage    = lazy(() => import('./pages/DashboardPage'))
const ImportPage       = lazy(() => import('./pages/ImportPage'))
const EinstellungenPage = lazy(() => import('./pages/EinstellungenPage'))
const LieferantenPage   = lazy(() => import('./pages/LieferantenPage'))
const AuftraegePage     = lazy(() => import('./pages/AuftraegePage'))
const AdministrationPage = lazy(() => import('./pages/AdministrationPage'))
const DatenschutzPage    = lazy(() => import('./pages/DatenschutzPage'))
const WorkerProjectsPage = lazy(() => import('./pages/WorkerProjectsPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Strictly owner — settings, the change PIN, and user management.
function OwnerRoute({ children }) {
  const { isOwner, loading } = useAuth()
  if (loading) return <PageLoader />
  return isOwner ? children : <Navigate to="/" replace />
}

// Owner or admin — day-to-day business management pages.
function ManagerRoute({ children }) {
  const { isManager, loading } = useAuth()
  if (loading) return <PageLoader />
  return isManager ? children : <Navigate to="/" replace />
}

function AppInner() {
  const { user, loading } = useAuth()
  const [articles, setArticles] = useState([])
  const [moves, setMoves]       = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  // Load data once user is authenticated
  useEffect(() => {
    if (!user) { setArticles([]); setMoves([]); return }
    setDataLoading(true)
    Promise.all([
      supabase.from('artikel').select('*').order('nummer'),
      supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200),
    ]).then(([{ data: art }, { data: mov }]) => {
      setArticles(art ?? [])
      setMoves(mov ?? [])
      setDataLoading(false)
    })
  }, [user])

  // Real-time updates for artikel
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('artikel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'artikel' }, () => {
        supabase.from('artikel').select('*').order('nummer')
          .then(({ data }) => { if (data) setArticles(data) })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  // Real-time updates for warenbewegungen — so a booking made on one
  // device (e.g. phone) shows up in Verlauf on another (e.g. desktop)
  // without a manual refresh.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('warenbewegungen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warenbewegungen' }, () => {
        supabase.from('warenbewegungen').select('*, projekte(dokument_nr)').order('created_at', { ascending: false }).limit(200)
          .then(({ data }) => { if (data) setMoves(data) })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  if (loading) return (
    <div className="min-h-screen bg-bg-0 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-secondary text-sm">Wird geladen…</p>
      </div>
    </div>
  )

  if (!user) return <LoginPage />

  const lowStockCount = articles.filter(a => a.menge < a.mindestbestand).length

  const sharedProps = { articles, setArticles, moves, setMoves }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout lowStockCount={lowStockCount} />}>
          <Route index element={<HomePage articles={articles} moves={moves} />} />

          <Route path="/uebersicht" element={
            <Suspense fallback={<PageLoader />}>
              <UebersichtPage {...sharedProps} />
            </Suspense>
          } />

          <Route path="/bewegung" element={
            <Suspense fallback={<PageLoader />}>
              <BewegungPage {...sharedProps} />
            </Suspense>
          } />

          <Route path="/inventur" element={
            <Suspense fallback={<PageLoader />}>
              <InventurPage articles={articles} setArticles={setArticles} setMoves={setMoves} />
            </Suspense>
          } />

          <Route path="/dashboard" element={
            <ManagerRoute>
              <Suspense fallback={<PageLoader />}>
                <DashboardPage articles={articles} moves={moves} />
              </Suspense>
            </ManagerRoute>
          } />

          <Route path="/import" element={
            <ManagerRoute>
              <Suspense fallback={<PageLoader />}>
                <ImportPage setArticles={setArticles} />
              </Suspense>
            </ManagerRoute>
          } />

          <Route path="/lieferanten" element={
            <ManagerRoute>
              <Suspense fallback={<PageLoader />}>
                <LieferantenPage articles={articles} setArticles={setArticles} setMoves={setMoves} />
              </Suspense>
            </ManagerRoute>
          } />

          <Route path="/auftraege" element={
            <ManagerRoute>
              <Suspense fallback={<PageLoader />}>
                <AuftraegePage articles={articles} setArticles={setArticles} />
              </Suspense>
            </ManagerRoute>
          } />

          <Route path="/projekte" element={
            <Suspense fallback={<PageLoader />}>
              <WorkerProjectsPage />
            </Suspense>
          } />

          <Route path="/administration" element={
            <ManagerRoute>
              <Suspense fallback={<PageLoader />}>
                <AdministrationPage articles={articles} />
              </Suspense>
            </ManagerRoute>
          } />

          <Route path="/datenschutz" element={
            <Suspense fallback={<PageLoader />}>
              <DatenschutzPage />
            </Suspense>
          } />

          <Route path="/einstellungen" element={
            <OwnerRoute>
              <Suspense fallback={<PageLoader />}>
                <EinstellungenPage articles={articles} moves={moves} setArticles={setArticles} setMoves={setMoves} />
              </Suspense>
            </OwnerRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
