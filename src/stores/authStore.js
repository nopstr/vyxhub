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
        set({ user: session.user, session, profile, loading: false, initialized: true })
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
          set({ user: session.user, session, profile, loading: false })
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, session: null, profile: null, loading: false })
        } else if (event === 'PASSWORD_RECOVERY') {
          // User arrived from password reset link — session is set automatically
          set({ user: session?.user, session, loading: false })
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
