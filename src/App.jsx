import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from './stores/authStore'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { PageLoader } from './components/ui/Spinner'

// Lazy-loaded pages for code splitting
const AuthPage = lazy(() => import('./pages/AuthPage'))
const HomePage = lazy(() => import('./pages/home/HomePage'))
const ExplorePage = lazy(() => import('./pages/explore/ExplorePage'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))
const BookmarksPage = lazy(() => import('./pages/bookmarks/BookmarksPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const CreatorDashboardPage = lazy(() => import('./pages/dashboard/CreatorDashboardPage'))
const ReelsPage = lazy(() => import('./pages/reels/ReelsPage'))
const PostDetailPage = lazy(() => import('./pages/post/PostDetailPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/auth" replace />

  return children
}

function GuestRoute({ children }) {
  const { user, loading } = useAuthStore()

  if (loading) return <PageLoader />
  if (user) return <Navigate to="/" replace />

  return children
}

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Guest routes */}
            <Route
              path="/auth"
              element={
                <GuestRoute>
                  <AuthPage />
                </GuestRoute>
              }
            />

{/* Reset password - standalone route (from email link) */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Public routes within Layout (viewable without login) */}
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="post/:postId" element={<PostDetailPage />} />
            <Route path=":username" element={<ProfilePage />} />
          </Route>

          {/* Protected routes within Layout (require auth) */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="bookmarks" element={<BookmarksPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="dashboard" element={<CreatorDashboardPage />} />
            <Route path="compose" element={<HomePage />} />
          </Route>

          {/* Reels - public full-screen layout */}
          <Route path="/reels" element={<ReelsPage />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid rgba(255,255,255,0.05)',
              color: '#fafafa',
              borderRadius: '16px',
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  )
}