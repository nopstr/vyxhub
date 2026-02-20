import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from './stores/authStore'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { PageLoader } from './components/ui/Spinner'
import AgeGate from './components/AgeGate'
import ContentProtection from './components/ContentProtection'
import CookieConsent from './components/CookieConsent'

// Lazy-loaded pages for code splitting
const AuthPage = lazy(() => import('./pages/AuthPage'))
const HomePage = lazy(() => import('./pages/home/HomePage'))
const ExplorePage = lazy(() => import('./pages/explore/ExplorePage'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))
const BookmarksPage = lazy(() => import('./pages/bookmarks/BookmarksPage'))
const UnlocksPage = lazy(() => import('./pages/unlocks/UnlocksPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const CreatorDashboardPage = lazy(() => import('./pages/dashboard/CreatorDashboardPage'))
const BecomeCreatorPage = lazy(() => import('./pages/BecomeCreatorPage'))
const ReelsPage = lazy(() => import('./pages/reels/ReelsPage'))
const PostDetailPage = lazy(() => import('./pages/post/PostDetailPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const ReferralRedirect = lazy(() => import('./pages/ReferralRedirect'))

// Staff pages
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const SupportPage = lazy(() => import('./pages/admin/SupportPage'))
const ManagementPage = lazy(() => import('./pages/admin/ManagementPage'))

// Legal pages
const PrivacyPolicyPage = lazy(() => import('./pages/legal/PrivacyPolicyPage'))
const TermsPage = lazy(() => import('./pages/legal/TermsPage'))
const CompliancePage = lazy(() => import('./pages/legal/CompliancePage'))

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

function StaffRoute({ children, roles }) {
  const { user, profile, loading } = useAuthStore()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/auth" replace />
  if (!profile?.system_role || !roles.includes(profile.system_role)) {
    return <Navigate to="/" replace />
  }

  return children
}

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <ErrorBoundary>
      <AgeGate>
        <ContentProtection>
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

          {/* Legal pages — accessible without auth */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/2257" element={<CompliancePage />} />

          {/* Referral link — sets cookie and redirects to profile */}
          <Route path="/r/:username" element={<ReferralRedirect />} />

          {/* Public routes within Layout (viewable without login) */}
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="become-creator" element={<BecomeCreatorPage />} />
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
            <Route path="unlocks" element={<UnlocksPage />} />
            <Route path="bookmarks" element={<BookmarksPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="dashboard" element={<CreatorDashboardPage />} />
            <Route path="compose" element={<HomePage />} />
          </Route>

          {/* Staff routes — role-gated */}
          <Route
            element={
              <StaffRoute roles={['admin', 'support']}>
                <Layout />
              </StaffRoute>
            }
          >
            <Route path="support" element={<SupportPage />} />
          </Route>
          <Route
            element={
              <StaffRoute roles={['admin', 'manager']}>
                <Layout />
              </StaffRoute>
            }
          >
            <Route path="management" element={<ManagementPage />} />
          </Route>
          <Route
            element={
              <StaffRoute roles={['admin']}>
                <Layout />
              </StaffRoute>
            }
          >
            <Route path="admin" element={<AdminPage />} />
          </Route>

          {/* Reels - public full-screen layout */}
          <Route path="/reels" element={<ReelsPage />} />

            {/* Catch-all — show 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>

        <CookieConsent />

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
    </ContentProtection>
    </AgeGate>
    </ErrorBoundary>
  )
}