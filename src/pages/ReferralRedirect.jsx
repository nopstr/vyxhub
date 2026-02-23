import { useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'

/**
 * /r/@username — sets a 24h referral cookie and redirects to the creator's profile.
 * The cookie is read on signup (AuthPage) to record the referral.
 */
export default function ReferralRedirect() {
  const { username } = useParams()
  const cleanUsername = username?.replace('@', '')

  useEffect(() => {
    // We don't know the creator's UUID yet — store the username in the cookie.
    // AuthPage will resolve username → id after signup via a lightweight query.
    if (cleanUsername) {
      document.cookie = `heatly_ref=${encodeURIComponent(cleanUsername)};path=/;max-age=86400;SameSite=Lax`
    }
  }, [cleanUsername])

  // Redirect to the creator's profile page
  return <Navigate to={`/@${cleanUsername}`} replace />
}
