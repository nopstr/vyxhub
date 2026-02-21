import { create } from 'zustand'
import { supabase } from '../lib/supabase'

let authSubscription = null

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await get().fetchProfile(session.user.id)
        if (!profile) {
          // User exists in auth session but profile is missing (e.g. deleted from DB)
          await supabase.auth.signOut()
          set({ user: null, session: null, profile: null, loading: false, initialized: true })
        } else {
          set({ user: session.user, session, profile, loading: false, initialized: true })
        }
      } else {
        set({ user: null, session: null, profile: null, loading: false, initialized: true })
      }

      // Clean up previous listener if any
      if (authSubscription) {
        authSubscription.unsubscribe()
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await get().fetchProfile(session.user.id)
          if (!profile) {
            await supabase.auth.signOut()
            set({ user: null, session: null, profile: null, loading: false })
          } else {
            set({ user: session.user, session, profile, loading: false })

            // Record session for OAuth / token-refresh sign-ins (non-blocking)
            const sessionHash = session.access_token
              ? btoa(session.access_token.slice(-32))
              : crypto.randomUUID()
            const provider = session.user.app_metadata?.provider || 'unknown'

            Promise.all([
              supabase.rpc('record_login', {
                p_user_id: session.user.id,
                p_user_agent: navigator.userAgent,
                p_method: provider,
              }),
              supabase.rpc('register_session', {
                p_user_id: session.user.id,
                p_session_hash: sessionHash,
                p_device_info: navigator.userAgent,
              }),
            ]).catch(() => {})
          }
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, session: null, profile: null, loading: false })
        } else if (event === 'PASSWORD_RECOVERY') {
          // User arrived from password reset link — session is set automatically
          // Also fetch profile so reset page has access to user data
          let profile = null
          if (session?.user) {
            profile = await get().fetchProfile(session.user.id)
          }
          set({ user: session?.user, session, profile, loading: false })
        }
      })
      authSubscription = subscription
    } catch {
      set({ loading: false, initialized: true })
    }
  },

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data
  },

  updateProfile: async (updates) => {
    const user = get().user
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    set({ profile: data })
    return data
  },

  signUp: async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
    if (error) throw error
    return data
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    // Record login and session (non-blocking)
    if (data?.user?.id) {
      const sessionHash = data.session?.access_token
        ? btoa(data.session.access_token.slice(-32))
        : crypto.randomUUID()

      Promise.all([
        supabase.rpc('record_login', {
          p_user_id: data.user.id,
          p_user_agent: navigator.userAgent,
          p_method: 'password',
        }),
        supabase.rpc('register_session', {
          p_user_id: data.user.id,
          p_session_hash: sessionHash,
          p_device_info: navigator.userAgent,
        }),
      ]).catch(() => {})
    }

    return data
  },

  signInWithOAuth: async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    // Clear subscription cache
    const { useSubscriptionCache } = await import('./subscriptionCache')
    useSubscriptionCache.getState().clear()
    set({ user: null, session: null, profile: null })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
