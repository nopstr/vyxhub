import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Mail, Shield, Bell, CreditCard, LogOut,
  Camera, Save, Trash2, Eye, EyeOff, Lock,
  DollarSign, Globe, MessageCircle, Droplets, MapPin,
  Link as LinkIcon, Star, Package, ShieldCheck, Zap,
  Flame, AlertTriangle, KeyRound, Upload, Image, Film, FileText,
  CheckCircle, XCircle, Clock, Loader2, Radio, Phone
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { uploadAvatar, uploadBanner, optimizeImage } from '../../lib/storage'
import { MIN_SUBSCRIPTION_PRICE, MAX_SUBSCRIPTION_PRICE } from '../../lib/constants'

const MODEL_CATEGORIES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'couple', label: 'Couple' },
  { value: 'trans', label: 'Trans' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
]

const PAYOUT_METHODS = [
  { value: 'crypto', label: 'Cryptocurrency (USDT TRC-20)' },
  { value: 'bank_transfer', label: 'Bank Transfer (ACH/SEPA)' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise (TransferWise)' },
]

const GEO_REGIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'India', 'Brazil', 'Japan', 'South Korea', 'Russia',
  'China', 'Italy', 'Spain', 'Mexico', 'Netherlands', 'Sweden',
  'Turkey', 'Saudi Arabia', 'UAE',
]

const baseTabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'creator', label: 'Creator', icon: CreditCard },
  { id: 'billing', label: 'Billing & Subscriptions', icon: DollarSign },
]

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900/50 cursor-pointer transition-colors group">
      <div className="flex-1 pr-4">
        <span className="text-sm text-zinc-300 font-medium">{label}</span>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div
        onClick={(e) => { e.preventDefault(); onChange(!checked) }}
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0',
          checked ? 'bg-red-600' : 'bg-zinc-700'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        )} />
      </div>
    </label>
  )
}

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="mb-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-white">
        {Icon && <Icon size={18} className="text-red-400" />}
        {title}
      </h3>
      {description && <p className="text-xs text-zinc-500 mt-1">{description}</p>}
    </div>
  )
}

function ProfileSettings() {
  const { profile, updateProfile, user } = useAuthStore()
  const [form, setForm] = useState({
    display_name: profile?.display_name || '',
    username: profile?.username || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    website_url: profile?.website_url || '',
    preferred_language: profile?.preferred_language || navigator.language?.split('-')[0] || 'en',
    country_code: profile?.country_code || '',
  })
  const [saving, setSaving] = useState(false)
  const [nameChangePassword, setNameChangePassword] = useState('')
  const avatarRef = useRef(null)
  const bannerRef = useRef(null)

  // Track what changed
  const displayNameChanged = form.display_name !== (profile?.display_name || '')
  const usernameChanged = form.username !== (profile?.username || '')
  const nameFieldsChanged = displayNameChanged || usernameChanged
  const otherFieldsChanged = form.bio !== (profile?.bio || '') ||
    form.location !== (profile?.location || '') ||
    form.website_url !== (profile?.website_url || '') ||
    form.preferred_language !== (profile?.preferred_language || 'en') ||
    form.country_code !== (profile?.country_code || '')

  // Display name change rules
  const displayNameAlreadyUsedChange = profile?.display_name_changed === true
  const isDisplayNameCaseOnly = displayNameChanged && 
    form.display_name.toLowerCase() === (profile?.display_name || '').toLowerCase()

  // Username cooldown (14 days)
  const lastUsernameChange = profile?.last_username_change ? new Date(profile.last_username_change) : null
  const usernameNextChangeDate = lastUsernameChange ? new Date(lastUsernameChange.getTime() + 14 * 24 * 60 * 60 * 1000) : null
  const usernameOnCooldown = usernameNextChangeDate && usernameNextChangeDate > new Date()

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadAvatar(user.id, file)
      await updateProfile({ avatar_url: url })
      toast.success('Avatar updated!')
    } catch (err) {
      toast.error('Failed to upload avatar')
    }
  }

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadBanner(user.id, file)
      await updateProfile({ banner_url: url })
      toast.success('Banner updated!')
    } catch (err) {
      toast.error('Failed to upload banner')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // If name fields changed, require password verification
      if (nameFieldsChanged) {
        if (!nameChangePassword) {
          toast.error('Password required to change name or username')
          setSaving(false)
          return
        }

        // Verify password via re-auth
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: nameChangePassword,
        })
        if (authError) {
          toast.error('Incorrect password')
          setSaving(false)
          return
        }
      }

      // Handle display name change via RPC
      if (displayNameChanged) {
        const { data, error } = await supabase.rpc('change_display_name', {
          p_user_id: user.id,
          p_new_display_name: form.display_name,
        })
        if (error) throw error
        if (data?.change_used) {
          toast.info('Display name changed. This was your one-time change.')
        }
      }

      // Handle username change via RPC
      if (usernameChanged) {
        const { data, error } = await supabase.rpc('change_username', {
          p_user_id: user.id,
          p_new_username: form.username,
        })
        if (error) throw error
        if (data?.verification_removed) {
          toast.info('Username changed. Verification has been removed.')
        } else {
          toast.success('Username updated!')
        }
      }

      // Handle other profile fields normally
      const otherUpdates = {}
      if (form.bio !== (profile?.bio || '')) otherUpdates.bio = form.bio
      if (form.location !== (profile?.location || '')) otherUpdates.location = form.location
      if (form.website_url !== (profile?.website_url || '')) otherUpdates.website_url = form.website_url
      if (form.preferred_language !== (profile?.preferred_language || 'en')) otherUpdates.preferred_language = form.preferred_language
      if (form.country_code !== (profile?.country_code || '')) otherUpdates.country_code = form.country_code || null

      if (Object.keys(otherUpdates).length > 0) {
        await updateProfile(otherUpdates)
      }

      // Refresh profile in store
      const { data: freshProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (freshProfile) {
        useAuthStore.setState({ profile: freshProfile })
      }

      setNameChangePassword('')
      toast.success('Profile updated!')
    } catch (err) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar/Banner */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-3">Profile Photo</label>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar src={profile?.avatar_url} alt={profile?.display_name} size="xl" />
            <button
              onClick={() => avatarRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={24} className="text-white" />
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
              Change photo
            </Button>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-3">Banner</label>
        <div
          className="relative h-32 rounded-2xl bg-zinc-800 overflow-hidden group cursor-pointer"
          onClick={() => bannerRef.current?.click()}
        >
          {profile?.banner_url ? (
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-900/30 to-orange-900/30" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={28} className="text-white" />
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
        </div>
      </div>

      {/* Display Name */}
      <div>
        <Input
          label="Display Name"
          value={form.display_name}
          onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))}
          maxLength={50}
        />
        {displayNameAlreadyUsedChange && (
          <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              You've already used your one-time name change. You can still adjust <strong>capitalization</strong> (e.g. "john" → "John").
            </p>
          </div>
        )}
        {!displayNameAlreadyUsedChange && (
          <p className="text-xs text-zinc-500 mt-1.5">
            Display name can only be changed once. Capitalization changes are always allowed.
          </p>
        )}
      </div>

      {/* Username */}
      <div>
        <Input
          label="Username"
          value={form.username}
          onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
          maxLength={30}
          disabled={usernameOnCooldown}
        />
        {usernameOnCooldown && (
          <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Clock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              Username change on cooldown. Next change available: <strong>{usernameNextChangeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
            </p>
          </div>
        )}
        {!usernameOnCooldown && (
          <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <AlertTriangle size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-400">
              Usernames can only be changed once every <strong className="text-zinc-300">14 days</strong>.
              {profile?.is_verified && <span className="text-red-400"> Changing your username will <strong>remove your verification badge</strong>.</span>}
            </p>
          </div>
        )}
      </div>

      <Textarea
        label="Bio"
        value={form.bio}
        onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))}
        rows={4}
        maxLength={500}
      />

      <Input
        label="Location"
        icon={MapPin}
        value={form.location}
        onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
        placeholder="City, Country"
        maxLength={100}
      />

      <Input
        label="Website"
        icon={LinkIcon}
        value={form.website_url}
        onChange={(e) => setForm(f => ({ ...f, website_url: e.target.value }))}
        placeholder="https://yourwebsite.com"
        maxLength={200}
      />

      {/* Language & Region */}
      <div className="pt-4 border-t border-zinc-800">
        <SectionHeader icon={Globe} title="Language & Region" description="Helps surface content in your preferred language and region" />
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Preferred Language</label>
            <select
              value={form.preferred_language}
              onChange={(e) => setForm(f => ({ ...f, preferred_language: e.target.value }))}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500 transition-colors"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
              <option value="it">Italiano</option>
              <option value="nl">Nederlands</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="zh">中文</option>
              <option value="ru">Русский</option>
              <option value="ar">العربية</option>
              <option value="hi">हिन्दी</option>
              <option value="tr">Türkçe</option>
              <option value="sv">Svenska</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Country</label>
            <select
              value={form.country_code}
              onChange={(e) => setForm(f => ({ ...f, country_code: e.target.value }))}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500 transition-colors"
            >
              <option value="">Auto-detect</option>
              {GEO_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="text-xs text-zinc-500 mt-1">Used for content recommendations, not displayed publicly.</p>
          </div>
        </div>
      </div>

      {/* Password required for name changes */}
      {nameFieldsChanged && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-3">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-red-400" />
            <p className="text-sm font-medium text-red-300">Password required to change name or username</p>
          </div>
          <Input
            label="Your Password"
            icon={Lock}
            type="password"
            value={nameChangePassword}
            onChange={(e) => setNameChangePassword(e.target.value)}
            placeholder="Enter your password to confirm"
          />
        </div>
      )}

      <Button onClick={handleSave} loading={saving}>
        <Save size={16} />
        Save Changes
      </Button>
    </div>
  )
}

function AccountSettings() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [loginHistory, setLoginHistory] = useState([])
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [revokingAll, setRevokingAll] = useState(false)
  // 2FA state
  const [mfaFactors, setMfaFactors] = useState([])
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaEnrollData, setMfaEnrollData] = useState(null)
  const [mfaVerifyCode, setMfaVerifyCode] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [mfaDisabling, setMfaDisabling] = useState(false)
  // Appeal state
  const [appealReason, setAppealReason] = useState('')
  const [appealSubmitting, setAppealSubmitting] = useState(false)
  const [existingAppeal, setExistingAppeal] = useState(null)

  // Load login history, sessions, and MFA factors
  useEffect(() => {
    const loadSecurityData = async () => {
      setLoadingSessions(true)
      try {
        const [historyRes, sessionsRes, factorsRes] = await Promise.all([
          supabase.from('login_history').select('*').eq('user_id', user.id).order('login_at', { ascending: false }).limit(20),
          supabase.from('user_sessions').select('*').eq('user_id', user.id).order('last_active', { ascending: false }),
          supabase.auth.mfa.listFactors(),
        ])
        if (historyRes.data) setLoginHistory(historyRes.data)
        if (sessionsRes.data) setSessions(sessionsRes.data)
        if (factorsRes.data?.totp) setMfaFactors(factorsRes.data.totp.filter(f => f.status === 'verified'))
      } catch {} finally {
        setLoadingSessions(false)
      }
    }
    if (user?.id) loadSecurityData()
  }, [user?.id])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
    toast.success('Signed out')
  }

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return toast.error('Enter a new email')
    if (newEmail === user?.email) return toast.error('That is your current email')
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      toast.success('Verification email sent to your new address. Please confirm to complete the change.')
      setNewEmail('')
    } catch (err) {
      toast.error(err.message || 'Failed to update email')
    } finally {
      setEmailSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword) return toast.error('Enter your current password')
    if (!newPassword || !confirmPassword) return toast.error('Fill in all password fields')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    setPasswordSaving(true)
    try {
      // Verify current password first by re-authenticating
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (authError) throw new Error('Current password is incorrect')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err.message || 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return toast.error('Type DELETE to confirm')
    if (!confirm('This will permanently delete your account and all data. This action cannot be undone.')) return
    setDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_user_account', { p_user_id: user.id })
      if (error) throw error
      await signOut()
      navigate('/auth')
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  const handleRevokeSession = async (sessionId) => {
    try {
      const { error } = await supabase.rpc('revoke_session', {
        p_user_id: user.id,
        p_session_id: sessionId,
      })
      if (error) throw error
      setSessions(s => s.filter(sess => sess.id !== sessionId))
      toast.success('Session revoked')
    } catch (err) {
      toast.error(err.message || 'Failed to revoke session')
    }
  }

  const handleRevokeAllOther = async () => {
    if (!confirm('Sign out of all other devices?')) return
    setRevokingAll(true)
    try {
      // Find the current session hash
      const currentSession = sessions.find(s => s.is_current)
      const { error } = await supabase.rpc('revoke_all_other_sessions', {
        p_user_id: user.id,
        p_current_session_hash: currentSession?.session_token_hash || '',
      })
      if (error) throw error
      setSessions(s => s.filter(sess => sess.is_current))
      toast.success('All other sessions revoked')
    } catch (err) {
      toast.error(err.message || 'Failed to revoke sessions')
    } finally {
      setRevokingAll(false)
    }
  }

  // 2FA handlers
  const handleEnrollMfa = async () => {
    setMfaEnrolling(true)
    try {
      const { enrollMfa } = useAuthStore.getState()
      const data = await enrollMfa()
      setMfaEnrollData(data)
    } catch (err) {
      toast.error(err.message || 'Failed to start 2FA setup')
    } finally {
      setMfaEnrolling(false)
    }
  }

  const handleVerifyMfaEnroll = async () => {
    if (!mfaVerifyCode || mfaVerifyCode.length !== 6) return toast.error('Enter a 6-digit code')
    setMfaVerifying(true)
    try {
      const { verifyMfa, updateProfile } = useAuthStore.getState()
      await verifyMfa(mfaEnrollData.id, mfaVerifyCode)
      await updateProfile({ mfa_enabled: true })
      setMfaFactors(prev => [...prev, { id: mfaEnrollData.id, status: 'verified' }])
      setMfaEnrollData(null)
      setMfaVerifyCode('')
      toast.success('Two-factor authentication enabled!')
    } catch (err) {
      toast.error(err.message || 'Invalid code, try again')
    } finally {
      setMfaVerifying(false)
    }
  }

  const handleDisableMfa = async (factorId) => {
    if (!confirm('Disable two-factor authentication? This will make your account less secure.')) return
    setMfaDisabling(true)
    try {
      const { unenrollMfa } = useAuthStore.getState()
      await unenrollMfa(factorId)
      setMfaFactors(prev => prev.filter(f => f.id !== factorId))
      toast.success('Two-factor authentication disabled')
    } catch (err) {
      toast.error(err.message || 'Failed to disable 2FA')
    } finally {
      setMfaDisabling(false)
    }
  }

  // Appeal: check for existing pending appeal
  useEffect(() => {
    if (profile?.is_suspended || profile?.is_banned) {
      supabase
        .from('appeals')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.length) setExistingAppeal(data[0])
        })
    }
  }, [profile?.is_suspended, profile?.is_banned])

  const handleSubmitAppeal = async () => {
    if (!appealReason.trim()) return toast.error('Please provide a reason for your appeal')
    setAppealSubmitting(true)
    try {
      const appealType = profile?.is_banned ? 'ban' : 'suspension'
      const { data, error } = await supabase.rpc('submit_appeal', {
        p_appeal_type: appealType,
        p_reason: appealReason.trim(),
      })
      if (error) throw error
      toast.success('Appeal submitted successfully')
      setAppealReason('')
      setExistingAppeal({ id: data, status: 'pending', appeal_type: appealType, reason: appealReason.trim(), created_at: new Date().toISOString() })
    } catch (err) {
      toast.error(err.message || 'Failed to submit appeal')
    } finally {
      setAppealSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Current Email */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
        <p className="text-sm text-zinc-300">{user?.email}</p>
      </div>

      {/* Change Email */}
      <div className="pt-4 border-t border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
          <Mail size={16} className="text-red-400" /> Change Email
        </h3>
        <div className="space-y-3">
          <Input
            label="New Email Address"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="newemail@example.com"
          />
          <Button size="sm" onClick={handleChangeEmail} loading={emailSaving}>
            Update Email
          </Button>
          <p className="text-xs text-zinc-500">A confirmation link will be sent to both your old and new email.</p>
        </div>
      </div>

      {/* Change Password */}
      <div className="pt-4 border-t border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
          <KeyRound size={16} className="text-red-400" /> Change Password
        </h3>
        <div className="space-y-3">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
          <Button size="sm" onClick={handleChangePassword} loading={passwordSaving}>
            Update Password
          </Button>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="pt-4 border-t border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
          <ShieldCheck size={16} className="text-red-400 fill-current [&>path:last-child]:stroke-white" /> Two-Factor Authentication
        </h3>
        {mfaFactors.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-emerald-300 font-medium">2FA is enabled</p>
                <p className="text-xs text-zinc-500 mt-0.5">Your account is protected with an authenticator app.</p>
              </div>
              <button
                onClick={() => handleDisableMfa(mfaFactors[0].id)}
                disabled={mfaDisabling}
                className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer disabled:opacity-50"
              >
                {mfaDisabling ? 'Disabling...' : 'Disable'}
              </button>
            </div>
          </div>
        ) : mfaEnrollData ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
              <p className="text-sm text-zinc-300 mb-3">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
              <div className="flex justify-center mb-4">
                <img
                  src={mfaEnrollData.totp.qr_code}
                  alt="2FA QR Code"
                  className="w-48 h-48 rounded-xl bg-white p-2"
                />
              </div>
              <p className="text-xs text-zinc-500 text-center mb-1">Or enter this secret manually:</p>
              <code className="block text-xs text-red-400 text-center font-mono break-all bg-zinc-900 rounded-lg p-2">{mfaEnrollData.totp.secret}</code>
            </div>
            <Input
              label="Enter 6-digit verification code"
              value={mfaVerifyCode}
              onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="text-center tracking-[0.3em] font-mono"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleVerifyMfaEnroll} loading={mfaVerifying}>
                Verify & Enable 2FA
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setMfaEnrollData(null); setMfaVerifyCode('') }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Add an extra layer of security to your account by requiring a verification code from your authenticator app when signing in.
            </p>
            <Button size="sm" variant="secondary" onClick={handleEnrollMfa} loading={mfaEnrolling}>
              <ShieldCheck size={14} />
              Enable 2FA
            </Button>
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="pt-4 border-t border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
          <Shield size={16} className="text-red-400" /> Active Sessions
        </h3>
        {loadingSessions ? (
          <div className="flex items-center gap-2 p-4 text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-zinc-500 p-3">No active sessions tracked yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(sess => (
              <div key={sess.id} className={cn(
                "flex items-center justify-between p-3 rounded-xl border",
                sess.is_current ? "bg-red-500/10 border-red-500/20" : "bg-zinc-900/30 border-zinc-800/50"
              )}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-300 truncate">{sess.device_info || 'Unknown device'}</p>
                    {sess.is_current && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Current</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {sess.ip_address || 'Unknown IP'} · Last active {new Date(sess.last_active).toLocaleDateString()}
                  </p>
                </div>
                {!sess.is_current && (
                  <button
                    onClick={() => handleRevokeSession(sess.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium ml-3 cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
            {sessions.length > 1 && (
              <Button variant="outline" size="sm" onClick={handleRevokeAllOther} loading={revokingAll} className="mt-2">
                Sign out all other sessions
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Login History */}
      <div className="pt-4 border-t border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
          <Clock size={16} className="text-red-400" /> Login History
        </h3>
        {loadingSessions ? (
          <div className="flex items-center gap-2 p-4 text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : loginHistory.length === 0 ? (
          <p className="text-sm text-zinc-500 p-3">No login history yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {loginHistory.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="text-zinc-300">{entry.method || 'password'}</span>
                  <span className="text-zinc-600 mx-1.5">·</span>
                  <span className="text-zinc-500">{entry.ip_address || 'Unknown IP'}</span>
                </div>
                <span className="text-zinc-500 ml-3 flex-shrink-0">
                  {new Date(entry.login_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign Out */}
      <div className="pt-4 border-t border-zinc-800">
        <Button variant="danger" onClick={handleSignOut}>
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>

      {/* Appeal Section (shown when suspended/banned) */}
      {(profile?.is_suspended || profile?.is_banned) && (
        <div className="pt-4 border-t border-zinc-800">
          <div className={cn(
            'border rounded-2xl p-5',
            profile?.is_banned ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
          )}>
            <h4 className={cn('flex items-center gap-2 text-sm font-bold mb-2', profile?.is_banned ? 'text-red-400' : 'text-amber-400')}>
              <AlertTriangle size={16} />
              {profile?.is_banned ? 'Your account has been banned' : 'Your account has been suspended'}
            </h4>
            {profile?.suspension_reason && (
              <p className="text-xs text-zinc-400 mb-3">Reason: {profile.suspension_reason}</p>
            )}

            {existingAppeal ? (
              <div className="space-y-2">
                <div className={cn(
                  'text-xs px-3 py-2 rounded-xl',
                  existingAppeal.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                  existingAppeal.status === 'under_review' ? 'bg-red-500/10 text-red-400' :
                  'bg-zinc-800 text-zinc-400'
                )}>
                  <span className="font-medium">Appeal {existingAppeal.status.replace('_', ' ')}</span>
                  <span className="text-zinc-500 ml-2">
                    submitted {new Date(existingAppeal.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Your appeal is being reviewed. You will receive a notification when a decision is made.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  If you believe this action was taken in error, you can submit an appeal for review.
                </p>
                <Textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder="Explain why you believe this action should be reversed..."
                  rows={3}
                />
                <Button size="sm" onClick={handleSubmitAppeal} loading={appealSubmitting} disabled={!appealReason.trim()}>
                  Submit Appeal
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Account */}
      <div className="pt-4 border-t border-zinc-800">
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold text-red-400 mb-2">
            <Trash2 size={16} /> Delete Account
          </h4>
          <p className="text-xs text-zinc-500 mb-4">
            This will permanently delete your account, all posts, messages, subscriptions, and associated data. This action is irreversible and complies with GDPR data deletion requirements.
          </p>
          <div className="space-y-3">
            <Input
              label="Type DELETE to confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
            <Button variant="danger" size="sm" onClick={handleDeleteAccount} loading={deleting} disabled={deleteConfirm !== 'DELETE'}>
              <Trash2 size={14} />
              Permanently Delete Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreatorSettings() {
  const { profile, updateProfile } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState('general')

  const [form, setForm] = useState({
    subscription_price: profile?.subscription_price || 9.99,
    creator_category: profile?.creator_category || 'other',
    tags: profile?.tags?.join(', ') || '',
    welcome_message: profile?.welcome_message || '',
    is_accepting_customs: profile?.is_accepting_customs ?? true,
    custom_request_price: profile?.custom_request_price || 25,
    allow_free_messages: profile?.allow_free_messages ?? false,
    message_price: profile?.message_price || 5,
    show_activity_status: profile?.show_activity_status ?? true,
    read_receipts_enabled: profile?.read_receipts_enabled ?? true,
    allow_media_from_subscribers: profile?.allow_media_from_subscribers ?? true,
    allow_media_from_users: profile?.allow_media_from_users ?? false,
    allow_voice_from_subscribers: profile?.allow_voice_from_subscribers ?? true,
    allow_voice_from_users: profile?.allow_voice_from_users ?? false,
    watermark_enabled: profile?.watermark_enabled ?? false,
    geoblocking_regions: profile?.geoblocking_regions || [],
    payout_method: profile?.payout_method || 'crypto',
    payout_email: profile?.payout_email || '',
    payout_wallet_address: profile?.payout_wallet_address || '',
    amazon_wishlist_url: profile?.amazon_wishlist_url || '',
    subscription_benefits: profile?.subscription_benefits || [],
    newBenefit: '',
  })

  const handleBecomeCreator = async () => {
    setSaving(true)
    try {
      await updateProfile({
        is_creator: true,
        subscription_price: form.subscription_price,
        creator_category: form.creator_category,
      })
      toast.success('Creator profile activated!')
    } catch (err) {
      toast.error('Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      await updateProfile({
        subscription_price: parseFloat(form.subscription_price) || 9.99,
        creator_category: form.creator_category,
        tags,
        welcome_message: form.welcome_message,
        is_accepting_customs: form.is_accepting_customs,
        custom_request_price: parseFloat(form.custom_request_price) || 0,
        allow_free_messages: form.allow_free_messages,
        message_price: parseFloat(form.message_price) || 0,
        show_activity_status: form.show_activity_status,
        read_receipts_enabled: form.read_receipts_enabled,
        allow_media_from_subscribers: form.allow_media_from_subscribers,
        allow_media_from_users: form.allow_media_from_users,
        allow_voice_from_subscribers: form.allow_voice_from_subscribers,
        allow_voice_from_users: form.allow_voice_from_users,
        watermark_enabled: form.watermark_enabled,
        geoblocking_regions: form.geoblocking_regions,
        payout_method: form.payout_method,
        payout_email: form.payout_email,
        payout_wallet_address: form.payout_wallet_address,
        amazon_wishlist_url: form.amazon_wishlist_url,
        subscription_benefits: form.subscription_benefits,
      })
      toast.success('Creator settings saved!')
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Deactivate your creator profile? Existing subscribers will not be charged again. You can reactivate anytime.')) return
    setSaving(true)
    try {
      await updateProfile({ is_creator: false })
      toast.success('Creator profile deactivated')
    } catch {
      toast.error('Failed to deactivate')
    } finally {
      setSaving(false)
    }
  }

  const toggleGeoblock = (region) => {
    setForm(f => ({
      ...f,
      geoblocking_regions: f.geoblocking_regions.includes(region)
        ? f.geoblocking_regions.filter(r => r !== region)
        : [...f.geoblocking_regions, region]
    }))
  }

  if (!profile?.is_creator) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-red-500/10 to-orange-600/10 p-6 rounded-3xl border border-red-500/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center">
              <Star size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Become a Creator</h3>
              <p className="text-sm text-zinc-400">Start earning by sharing exclusive content</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { icon: DollarSign, text: 'Set your own prices' },
              { icon: ShieldCheck, text: 'Content protection' },
              { icon: Globe, text: 'Global audience' },
              { icon: Star, text: 'Fan engagement tools' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <item.icon size={14} className="text-red-400 flex-shrink-0" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
              <select value={form.creator_category} onChange={(e) => setForm(f => ({ ...f, creator_category: e.target.value }))} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer">
                {MODEL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <Input
              label="Monthly Subscription Price ($)"
              type="number"
              min={MIN_SUBSCRIPTION_PRICE}
              max={MAX_SUBSCRIPTION_PRICE}
              step="0.01"
              value={form.subscription_price}
              onChange={(e) => setForm(f => ({ ...f, subscription_price: e.target.value }))}
            />
            <p className="text-xs text-zinc-500">
              This is what fans pay monthly to access your exclusive content
            </p>
          </div>

          <Button onClick={handleBecomeCreator} loading={saving} className="mt-5 w-full !bg-gradient-to-r !from-red-500 !to-orange-600">
            <Zap size={16} className="fill-current" />
            Activate Creator Profile
          </Button>
        </div>
      </div>
    )
  }

  const creatorSections = [
    { id: 'general', label: 'General', icon: Star },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'messaging', label: 'Messaging', icon: MessageCircle },
    { id: 'privacy', label: 'Privacy & Safety', icon: Shield },
    ...(profile?.is_creator ? [{ id: 'partner', label: 'Partner', icon: ShieldCheck }] : []),
    { id: 'payout', label: 'Payouts', icon: CreditCard },
    { id: 'tax', label: 'Tax Info', icon: FileText },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
        <p className="text-sm text-emerald-400 font-medium">✓ Creator profile is active</p>
        <span className="text-xs text-zinc-500">{profile.subscriber_count || 0} subscribers</span>
      </div>

      {/* Sub-sections */}
      <div className="flex flex-wrap gap-1.5">
        {creatorSections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer',
              section === s.id ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/30 border border-zinc-800/50'
            )}
          >
            <s.icon size={13} />
            {s.label}
          </button>
        ))}
      </div>

      {/* General */}
      {section === 'general' && (
        <div className="space-y-5">
          <SectionHeader icon={Star} title="Creator Profile" description="How your profile appears to fans" />

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Creator Category</label>
            <select value={form.creator_category} onChange={(e) => setForm(f => ({ ...f, creator_category: e.target.value }))} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer">
              {MODEL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tags</label>
            <input
              value={form.tags}
              onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="fitness, cosplay, lifestyle (comma separated)"
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              maxLength={200}
            />
            <p className="text-xs text-zinc-500 mt-1">Helps fans discover your content</p>
          </div>

          <Textarea
            label="Welcome Message"
            value={form.welcome_message}
            onChange={(e) => setForm(f => ({ ...f, welcome_message: e.target.value }))}
            placeholder="Hi! Thanks for subscribing 💕 Check out my pinned post for my schedule..."
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-zinc-500 -mt-4">Sent automatically when someone subscribes</p>

          <Input
            label="Amazon Wishlist URL"
            icon={Package}
            value={form.amazon_wishlist_url}
            onChange={(e) => setForm(f => ({ ...f, amazon_wishlist_url: e.target.value }))}
            placeholder="https://www.amazon.com/hz/wishlist/..."
          />
        </div>
      )}

      {/* Pricing */}
      {section === 'pricing' && (
        <div className="space-y-5">
          <SectionHeader icon={DollarSign} title="Pricing" description="Set your subscription and content prices" />

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Monthly Subscription Price</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="number"
                min={MIN_SUBSCRIPTION_PRICE}
                max={MAX_SUBSCRIPTION_PRICE}
                step="0.01"
                value={form.subscription_price}
                onChange={(e) => setForm(f => ({ ...f, subscription_price: e.target.value }))}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1">Monthly price fans pay to access your exclusive content</p>
          </div>

          {/* Subscription Benefits */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Subscription Benefits</label>
            <p className="text-xs text-zinc-500 mb-3">List what subscribers get — shown in the subscribe popup</p>
            <div className="space-y-2">
              {form.subscription_benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    {benefit}
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, subscription_benefits: f.subscription_benefits.filter((_, idx) => idx !== i) }))}
                    className="text-zinc-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.newBenefit}
                  onChange={e => setForm(f => ({ ...f, newBenefit: e.target.value }))}
                  placeholder="e.g. Behind-the-scenes content"
                  maxLength={100}
                  className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && form.newBenefit.trim()) {
                      e.preventDefault()
                      setForm(f => ({ ...f, subscription_benefits: [...f.subscription_benefits, f.newBenefit.trim()], newBenefit: '' }))
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!form.newBenefit.trim() || form.subscription_benefits.length >= 8}
                  onClick={() => {
                    if (form.newBenefit.trim()) {
                      setForm(f => ({ ...f, subscription_benefits: [...f.subscription_benefits, f.newBenefit.trim()], newBenefit: '' }))
                    }
                  }}
                  className="px-3 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Add
                </button>
              </div>
              {form.subscription_benefits.length >= 8 && (
                <p className="text-xs text-amber-400">Maximum 8 benefits</p>
              )}
            </div>
          </div>

          <Toggle
            checked={form.is_accepting_customs}
            onChange={(v) => setForm(f => ({ ...f, is_accepting_customs: v }))}
            label="Accept Custom Requests"
            description="Allow fans to request custom content"
          />

          {form.is_accepting_customs && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Custom Request Base Price</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="number"
                  min="5"
                  max="500"
                  step="1"
                  value={form.custom_request_price}
                  onChange={(e) => setForm(f => ({ ...f, custom_request_price: e.target.value }))}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Starting price for custom content requests</p>
            </div>
          )}
        </div>
      )}

      {/* Messaging */}
      {section === 'messaging' && (
        <div className="space-y-5">
          <SectionHeader icon={MessageCircle} title="Messaging" description="Control how fans can message you" />

          {/* Message Access */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Message Access</h4>
            <Toggle
              checked={form.allow_free_messages}
              onChange={(v) => setForm(f => ({ ...f, allow_free_messages: v }))}
              label="Allow Free Messages"
              description="Let non-subscribers message you without paying"
            />

            {!form.allow_free_messages && (
              <div className="ml-1">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Message Unlock Price</label>
                <div className="relative w-36">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="0.5"
                    value={form.message_price}
                    onChange={(e) => setForm(f => ({ ...f, message_price: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">Non-subscribers pay this once to unlock messaging with you</p>
              </div>
            )}
          </div>

          {/* Media Permissions */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Media Permissions — Subscribers</h4>
            <Toggle
              checked={form.allow_media_from_subscribers}
              onChange={(v) => setForm(f => ({ ...f, allow_media_from_subscribers: v }))}
              label="Allow Photos & Videos"
              description="Subscribers can send you images and videos in chat"
            />
            <Toggle
              checked={form.allow_voice_from_subscribers}
              onChange={(v) => setForm(f => ({ ...f, allow_voice_from_subscribers: v }))}
              label="Allow Voice Messages"
              description="Subscribers can send you voice recordings"
            />
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Media Permissions — Non-Subscribers</h4>
            <Toggle
              checked={form.allow_media_from_users}
              onChange={(v) => setForm(f => ({ ...f, allow_media_from_users: v }))}
              label="Allow Photos & Videos"
              description="Non-subscribers can send you images and videos in chat"
            />
            <Toggle
              checked={form.allow_voice_from_users}
              onChange={(v) => setForm(f => ({ ...f, allow_voice_from_users: v }))}
              label="Allow Voice Messages"
              description="Non-subscribers can send you voice recordings"
            />
          </div>

          {/* Privacy */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Privacy</h4>
            <Toggle
              checked={form.read_receipts_enabled}
              onChange={(v) => setForm(f => ({ ...f, read_receipts_enabled: v }))}
              label="Read Receipts"
              description="When disabled, others won't see when you've read their messages — and you won't see theirs either"
            />
            <Toggle
              checked={form.show_activity_status}
              onChange={(v) => setForm(f => ({ ...f, show_activity_status: v }))}
              label="Show Activity Status"
              description="Let fans see when you were last active"
            />
          </div>
        </div>
      )}

      {/* Privacy & Safety */}
      {section === 'privacy' && (
        <div className="space-y-5">
          <SectionHeader icon={Shield} title="Privacy & Safety" description="Protect your content and control visibility" />

          <Toggle
            checked={form.watermark_enabled}
            onChange={(v) => setForm(f => ({ ...f, watermark_enabled: v }))}
            label="Watermark Content"
            description="Automatically add a watermark to your photos and videos"
          />

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">Geo-blocking</label>
            <p className="text-xs text-zinc-500 mb-3">Block users from specific regions from seeing your content</p>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
              {GEO_REGIONS.map(region => (
                <label
                  key={region}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors border',
                    form.geoblocking_regions.includes(region)
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-zinc-900/30 border-zinc-800/50 text-zinc-400 hover:bg-zinc-900/50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.geoblocking_regions.includes(region)}
                    onChange={() => toggleGeoblock(region)}
                    className="sr-only"
                  />
                  <Lock size={11} className={form.geoblocking_regions.includes(region) ? 'text-red-400' : 'text-zinc-600'} />
                  {region}
                </label>
              ))}
            </div>
            {form.geoblocking_regions.length > 0 && (
              <p className="text-xs text-red-400 mt-2">{form.geoblocking_regions.length} region(s) blocked</p>
            )}
          </div>
        </div>
      )}

      {/* Payouts */}
      {section === 'payout' && (
        <div className="space-y-5">
          <SectionHeader icon={CreditCard} title="Payout Settings" description="How you receive your earnings" />

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Payout Method</label>
            <select
              value={form.payout_method}
              onChange={(e) => setForm(f => ({ ...f, payout_method: e.target.value }))}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer"
            >
              {PAYOUT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {form.payout_method === 'crypto' ? (
            <>
              <Input
                label="USDT Wallet Address (TRC-20)"
                icon={Zap}
                type="text"
                value={form.payout_wallet_address}
                onChange={(e) => setForm(f => ({ ...f, payout_wallet_address: e.target.value }))}
                placeholder="T... (Tron TRC-20 address)"
              />
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                <h4 className="text-sm font-medium text-amber-400 mb-1">Crypto Payouts</h4>
                <p className="text-xs text-zinc-400">Payouts are sent as <span className="text-white font-medium">USDT (TRC-20)</span> to your Tron wallet address. Make sure the address is correct — crypto transactions are irreversible. Network fees apply.</p>
              </div>
            </>
          ) : (
            <Input
              label={form.payout_method === 'paypal' ? 'PayPal Email' : form.payout_method === 'wise' ? 'Wise Email' : 'Bank Email / Account'}
              icon={Mail}
              type="email"
              value={form.payout_email}
              onChange={(e) => setForm(f => ({ ...f, payout_email: e.target.value }))}
              placeholder={form.payout_method === 'paypal' ? 'your@paypal.com' : form.payout_method === 'wise' ? 'your@email.com' : 'your bank email'}
            />
          )}

          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50">
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Payout Schedule</h4>
            <p className="text-xs text-zinc-500">Payouts are processed once per month. Minimum payout threshold is $50.00. Funds are held for 30 days before becoming available.</p>
          </div>
        </div>
      )}

      {/* Partner Settings */}
      {section === 'partner' && profile?.is_creator && (
        <PartnerSettings profile={profile} />
      )}

      {/* Danger Zone */}
      {section === 'danger' && (
        <div className="space-y-5">
          <SectionHeader icon={AlertTriangle} title="Danger Zone" description="Irreversible actions" />

          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-red-400 mb-1">Deactivate Creator Profile</h4>
            <p className="text-xs text-zinc-500 mb-4">
              This will hide your subscription button and stop accepting new subscribers. Existing subscribers will keep access until their period ends. You can reactivate anytime.
            </p>
            <Button variant="danger" size="sm" onClick={handleDeactivate} loading={saving}>
              Deactivate Creator Profile
            </Button>
          </div>
        </div>
      )}

      {/* Tax Info */}
      {section === 'tax' && (
        <TaxInfoSection />
      )}

      {/* Save button - shown on all sections except danger */}
      {section !== 'danger' && (
        <div className="pt-4 border-t border-zinc-800/50">
          <Button onClick={handleSave} loading={saving}>
            <Save size={16} />
            Save All Settings
          </Button>
        </div>
      )}
    </div>
  )
}

function NotificationSettings() {
  const { profile, updateProfile } = useAuthStore()

  const defaults = {
    likes: true,
    comments: true,
    follows: true,
    messages: true,
    subscriptions: true,
    tips: true,
    mentions: true,
    promotions: false,
  }

  const [prefs, setPrefs] = useState({ ...defaults, ...(profile?.notification_preferences || {}) })
  const [saving, setSaving] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(profile?.push_notifications ?? true)
  const [emailEnabled, setEmailEnabled] = useState(profile?.email_notifications ?? true)
  const [digestFreq, setDigestFreq] = useState(profile?.email_digest_frequency || 'daily')
  const [pushStatus, setPushStatus] = useState(null) // 'granted', 'denied', 'default', 'unsupported'

  // Check push permission on mount
  useEffect(() => {
    if (!('Notification' in window) || !('PushManager' in window)) {
      setPushStatus('unsupported')
    } else {
      setPushStatus(Notification.permission)
    }
  }, [])

  const handleToggle = async (key, value) => {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    try {
      setSaving(true)
      await updateProfile({ notification_preferences: updated })
    } catch (err) {
      // Revert on failure
      setPrefs(prefs)
      toast.error('Failed to save notification preferences')
    } finally {
      setSaving(false)
    }
  }

  const handlePushToggle = async (enabled) => {
    setPushEnabled(enabled)
    try {
      if (enabled) {
        const { useNotificationStore } = await import('../../stores/notificationStore')
        const result = await useNotificationStore.getState().subscribeToPush(profile.id)
        if (result.error) {
          setPushEnabled(false)
          return toast.error(result.error)
        }
        setPushStatus('granted')
        toast.success('Push notifications enabled')
      } else {
        const { useNotificationStore } = await import('../../stores/notificationStore')
        await useNotificationStore.getState().unsubscribeFromPush(profile.id)
        toast.success('Push notifications disabled')
      }
      await updateProfile({ push_notifications: enabled })
    } catch (err) {
      setPushEnabled(!enabled)
      toast.error('Failed to update push notification settings')
    }
  }

  const handleEmailToggle = async (enabled) => {
    setEmailEnabled(enabled)
    try {
      await updateProfile({ email_notifications: enabled })
    } catch {
      setEmailEnabled(!enabled)
    }
  }

  const handleDigestChange = async (freq) => {
    setDigestFreq(freq)
    try {
      await updateProfile({ email_digest_frequency: freq })
      toast.success('Digest frequency updated')
    } catch {
      setDigestFreq(profile?.email_digest_frequency || 'daily')
    }
  }

  return (
    <div className="space-y-6">
      {/* Push Notifications */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-200">Push Notifications</h3>
        {pushStatus === 'unsupported' ? (
          <p className="text-xs text-zinc-500">Push notifications are not supported in this browser.</p>
        ) : pushStatus === 'denied' ? (
          <p className="text-xs text-red-400">Push notifications are blocked. Please enable them in your browser settings.</p>
        ) : (
          <Toggle
            checked={pushEnabled}
            onChange={handlePushToggle}
            label="Enable push notifications"
            description="Receive push notifications even when the app is closed"
          />
        )}
      </div>

      {/* Email Notifications */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-200">Email Notifications</h3>
        <Toggle
          checked={emailEnabled}
          onChange={handleEmailToggle}
          label="Enable email notifications"
          description="Receive email alerts for important events"
        />
        {emailEnabled && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Digest Frequency</label>
            <div className="flex gap-2">
              {[
                { value: 'realtime', label: 'Instant' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'never', label: 'Never' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleDigestChange(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    digestFreq === opt.value
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* In-App Notification Types */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-200">Notification Types</h3>
        <div className="space-y-2">
          {Object.entries(prefs).map(([key, value]) => (
            <Toggle
              key={key}
              checked={value}
              onChange={(v) => handleToggle(key, v)}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Management Upload Tab (for managed creators) ──────────────────
function ManagementUploadSettings() {
  const { profile } = useAuthStore()
  const fileInputRef = useRef(null)
  const [instructions, setInstructions] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  const fetchUploads = async () => {
    const { data } = await supabase
      .from('content_uploads')
      .select('*')
      .eq('creator_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setUploads(data || [])
    setLoadingUploads(false)
  }

  useEffect(() => { fetchUploads() }, [])

  const handleUpload = async () => {
    if (files.length === 0) return toast.error('Select files to upload')
    setUploading(true)
    try {
      for (const file of files) {
        const optimized = await optimizeImage(file)
        const ext = optimized.name.split('.').pop()
        const filePath = `${profile.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: storageErr } = await supabase.storage.from('content-uploads').upload(filePath, optimized)
        if (storageErr) throw storageErr

        const { data: { publicUrl } } = supabase.storage.from('content-uploads').getPublicUrl(filePath)

        const { error: insertErr } = await supabase.from('content_uploads').insert({
          creator_id: profile.id,
          file_url: publicUrl,
          file_type: optimized.type.startsWith('video') ? 'video' : 'image',
          instructions: instructions.trim() || null,
        })
        if (insertErr) throw insertErr
      }
      toast.success(`${files.length} file(s) uploaded for management team`)
      setFiles([])
      setInstructions('')
      fetchUploads()
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={Upload} title="Upload Content" description="Upload images, sets, and videos for your management team to post" />

      <div className="space-y-4">
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 w-full bg-zinc-900/30 border border-dashed border-zinc-700/50 rounded-2xl text-sm text-zinc-400 hover:bg-zinc-900/50 hover:border-zinc-600 transition-colors cursor-pointer"
          >
            <Upload size={18} /> Click to select images or videos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center gap-1">
                  {f.type.startsWith('video') ? <Film size={11} /> : <Image size={11} />}
                  {f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional instructions for management (e.g., 'Post this set on Friday with caption…')"
          rows={3}
          maxLength={1000}
        />

        <Button onClick={handleUpload} loading={uploading}>
          <Upload size={16} /> Upload for Management
        </Button>
      </div>

      {/* Previous uploads */}
      <div className="mt-8">
        <SectionHeader icon={FileText} title="Your Uploads" description="Track what you've sent to management" />
        {loadingUploads ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-zinc-500">No uploads yet</p>
        ) : (
          <div className="space-y-2">
            {uploads.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-zinc-900/30 border border-zinc-800/50 rounded-xl">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center">
                  {u.file_type === 'video' ? <Film size={14} className="text-zinc-500" /> : <Image size={14} className="text-zinc-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  {u.instructions && <p className="text-xs text-zinc-400 truncate">{u.instructions}</p>}
                  <p className="text-[10px] text-zinc-600">{new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-medium',
                  u.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                  u.status === 'used' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                )}>
                  {u.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')
  const { profile } = useAuthStore()

  const tabs = profile?.is_managed
    ? [...baseTabs, { id: 'management', label: 'Management', icon: Upload }]
    : baseTabs

  const content = {
    profile: <ProfileSettings />,
    account: <AccountSettings />,
    notifications: <NotificationSettings />,
    creator: <CreatorSettings />,
    billing: <BillingSettings />,
    management: <ManagementUploadSettings />,
  }

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </header>

      <div className="flex flex-col md:flex-row">
        {/* Tab List */}
        <div className="md:w-56 border-b md:border-b-0 md:border-r border-zinc-800/50">
          <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:py-2">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
                  tab === t.id
                    ? 'text-white bg-red-500/10 md:border-r-2 md:border-red-500'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'
                )}
              >
                <t.icon size={18} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 max-w-xl">
          {content[tab]}
        </div>
      </div>
    </div>
  )
}

// ─── Partner Settings (within Creator Settings) ─────────────────────────────

function PartnerSettings({ profile }) {
  const [settings, setSettings] = useState({
    livestream_enabled: false,
    livestream_price: 0,
    livestream_notify_followers: true,
    calls_enabled: false,
    call_price_per_minute: 5,
    call_availability: 'offline',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const tier = profile?.partner_tier
  const isRed = tier === 'red' || tier === 'gold'
  const isGold = tier === 'gold'

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('get_partner_status', { p_user_id: profile.id })
      if (error) throw error
      if (data?.settings) {
        setSettings(s => ({ ...s, ...data.settings }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('update_partner_settings', {
        p_livestream_enabled: settings.livestream_enabled,
        p_livestream_price: settings.livestream_price,
        p_livestream_notify: settings.livestream_notify_followers,
        p_calls_enabled: settings.calls_enabled,
        p_call_price: settings.call_price_per_minute,
        p_call_availability: settings.call_availability,
      })
      if (error) throw error
      toast.success('Partner settings saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="text-zinc-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={ShieldCheck} title="Partner Features" description="Configure your partner-exclusive features" />

      <div className={cn(
        'rounded-2xl p-4 border',
        isGold ? 'bg-amber-500/5 border-amber-500/20' :
        isRed ? 'bg-red-500/5 border-red-500/20' :
        tier === 'verified' ? 'bg-emerald-500/5 border-emerald-500/20' :
        'bg-zinc-900/50 border-zinc-800/50'
      )}>
        {tier ? (
          <>
            <p className={cn('text-sm font-medium',
              isGold ? 'text-amber-400' : isRed ? 'text-red-400' : 'text-emerald-400'
            )}>
              You're a {tier.charAt(0).toUpperCase() + tier.slice(1)} Partner
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {isGold ? 'You have access to Livestreaming, 1-on-1 Calls, and all partner features.'
                : isRed ? 'You have access to 1-on-1 Calls and priority support. Reach Gold for Livestreaming.'
                : 'You have a verified badge and priority in Explore. Grow to unlock more features.'
              }
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-zinc-300">Not yet a partner</p>
            <p className="text-xs text-zinc-500 mt-1">Reach 100 subscribers for 3 months to earn Verified status. Visit the Partner page for details.</p>
          </>
        )}
      </div>

      {/* Livestream Settings (Gold only) */}
      {isGold && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio size={16} className="text-red-400" />
            Livestreaming
          </h4>

          <div className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl">
            <div>
              <p className="text-sm font-medium text-zinc-200">Enable Livestreaming</p>
              <p className="text-xs text-zinc-500">Allow fans to watch your livestreams</p>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, livestream_enabled: !s.livestream_enabled }))}
              className={cn(
                'w-11 h-6 rounded-full transition-colors cursor-pointer relative',
                settings.livestream_enabled ? 'bg-red-500' : 'bg-zinc-700'
              )}
            >
              <div className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform',
                settings.livestream_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Livestream Price (per stream)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.livestream_price}
                onChange={(e) => setSettings(s => ({ ...s, livestream_price: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-8 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
            </div>
            <p className="text-xs text-zinc-600 mt-1">Set to $0 for free livestreams (subscribers only)</p>
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl">
            <div>
              <p className="text-sm font-medium text-zinc-200">Notify Followers</p>
              <p className="text-xs text-zinc-500">Send a notification when you go live</p>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, livestream_notify_followers: !s.livestream_notify_followers }))}
              className={cn(
                'w-11 h-6 rounded-full transition-colors cursor-pointer relative',
                settings.livestream_notify_followers ? 'bg-red-500' : 'bg-zinc-700'
              )}
            >
              <div className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform',
                settings.livestream_notify_followers ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        </div>
      )}

      {/* Call Settings (Red+) */}
      {isRed && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Phone size={16} className="text-red-400" />
            1-on-1 Video Calls
          </h4>

          <div className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl">
            <div>
              <p className="text-sm font-medium text-zinc-200">Enable Video Calls</p>
              <p className="text-xs text-zinc-500">Allow fans to book paid video calls with you</p>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, calls_enabled: !s.calls_enabled }))}
              className={cn(
                'w-11 h-6 rounded-full transition-colors cursor-pointer relative',
                settings.calls_enabled ? 'bg-amber-500' : 'bg-zinc-700'
              )}
            >
              <div className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform',
                settings.calls_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Price per Minute</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
              <input
                type="number"
                min="1"
                step="0.50"
                value={settings.call_price_per_minute}
                onChange={(e) => setSettings(s => ({ ...s, call_price_per_minute: parseFloat(e.target.value) || 1 }))}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-8 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Availability Status</label>
            <select
              value={settings.call_availability}
              onChange={(e) => setSettings(s => ({ ...s, call_availability: e.target.value }))}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
            >
              <option value="online">Online — Available for calls</option>
              <option value="busy">Busy — Not available right now</option>
              <option value="offline">Offline — Not accepting calls</option>
            </select>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-zinc-800/50">
        <Button onClick={handleSave} loading={saving}>
          <Save size={16} />
          Save Partner Settings
        </Button>
      </div>
    </div>
  )
}

// ─── Tax Info Section (within Creator Settings) ─────────────────────────────

function TaxInfoSection() {
  const [taxInfo, setTaxInfo] = useState(null)
  const [taxDocs, setTaxDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tax_form_type: 'w9',
    legal_name: '',
    business_name: '',
    tax_classification: 'individual',
    tax_id_number: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'US',
    is_us_person: true,
    signature: '',
  })

  useEffect(() => {
    fetchTaxInfo()
  }, [])

  const fetchTaxInfo = async () => {
    setLoading(true)
    try {
      const { data: info } = await supabase.from('tax_info').select('*').maybeSingle()
      if (info) {
        setTaxInfo(info)
        setForm({
          tax_form_type: info.tax_form_type || 'w9',
          legal_name: info.legal_name || '',
          business_name: info.business_name || '',
          tax_classification: info.tax_classification || 'individual',
          tax_id_number: '', // Never show stored tax ID
          address_line1: info.address_line1 || '',
          address_line2: info.address_line2 || '',
          city: info.city || '',
          state: info.state || '',
          zip_code: info.zip_code || '',
          country: info.country || 'US',
          is_us_person: info.is_us_person ?? true,
          signature: info.signature || '',
        })
      }
      const { data: docs } = await supabase.from('tax_documents').select('*').order('tax_year', { ascending: false })
      setTaxDocs(docs || [])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.legal_name.trim()) return toast.error('Legal name is required')
    if (!form.address_line1.trim()) return toast.error('Address is required')
    if (!form.city.trim() || !form.zip_code.trim()) return toast.error('City and ZIP are required')
    if (!form.signature.trim()) return toast.error('Electronic signature is required')

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('submit_tax_info', {
        p_form_type: form.tax_form_type,
        p_legal_name: form.legal_name.trim(),
        p_business_name: form.business_name.trim() || null,
        p_tax_classification: form.tax_classification,
        p_tax_id: form.tax_id_number.trim() || null,
        p_address1: form.address_line1.trim(),
        p_address2: form.address_line2.trim() || null,
        p_city: form.city.trim(),
        p_state: form.state.trim() || null,
        p_zip: form.zip_code.trim(),
        p_country: form.country,
        p_is_us: form.is_us_person,
        p_signature: form.signature.trim(),
      })
      if (error) throw error
      toast.success('Tax information submitted successfully')
      fetchTaxInfo()
    } catch (err) {
      toast.error(err.message || 'Failed to submit tax info')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>

  return (
    <div className="space-y-5">
      <SectionHeader icon={FileText} title="Tax Information" description="Required for payouts over $600/year (US)" />

      {taxInfo?.status && (
        <div className={cn(
          'rounded-xl p-3 border text-xs font-medium',
          taxInfo.status === 'approved' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' :
          taxInfo.status === 'rejected' ? 'bg-red-500/5 border-red-500/20 text-red-400' :
          taxInfo.status === 'needs_update' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
          'bg-red-500/5 border-red-500/20 text-red-400'
        )}>
          Status: {taxInfo.status === 'approved' ? '✓ Approved' : taxInfo.status === 'pending' ? '⏳ Under Review' : taxInfo.status === 'rejected' ? '✗ Rejected' : '⚠ Needs Update'}
          {taxInfo.notes && <p className="mt-1 text-zinc-500">{taxInfo.notes}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Form Type */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tax Form Type</label>
          <div className="flex gap-2">
            {[
              { value: 'w9', label: 'W-9 (US Person)' },
              { value: 'w8ben', label: 'W-8BEN (Non-US Individual)' },
              { value: 'w8bene', label: 'W-8BEN-E (Non-US Entity)' },
            ].map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, tax_form_type: t.value, is_us_person: t.value === 'w9' }))}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  form.tax_form_type === t.value ? 'bg-red-600 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Classification */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tax Classification</label>
          <select
            value={form.tax_classification}
            onChange={e => setForm(f => ({ ...f, tax_classification: e.target.value }))}
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer"
          >
            <option value="individual">Individual / Sole Proprietor</option>
            <option value="sole_proprietor">Sole Proprietor</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="trust">Trust / Estate</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Names */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Legal Name *" value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} placeholder="Full legal name" />
          <Input label="Business Name" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="If different" />
        </div>

        {/* Tax ID */}
        <Input
          label={form.is_us_person ? 'SSN / EIN' : 'Foreign Tax ID'}
          value={form.tax_id_number}
          onChange={e => setForm(f => ({ ...f, tax_id_number: e.target.value }))}
          placeholder={form.is_us_person ? 'XXX-XX-XXXX or XX-XXXXXXX' : 'Foreign tax identification number'}
          type="password"
        />

        {/* Address */}
        <Input label="Address Line 1 *" value={form.address_line1} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Street address" />
        <Input label="Address Line 2" value={form.address_line2} onChange={e => setForm(f => ({ ...f, address_line2: e.target.value }))} placeholder="Apt, suite, unit (optional)" />

        <div className="grid grid-cols-3 gap-3">
          <Input label="City *" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          <Input label="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
          <Input label="ZIP *" value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} />
        </div>

        {/* Electronic Signature */}
        <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 space-y-3">
          <h4 className="text-sm font-medium text-zinc-300">Electronic Signature</h4>
          <p className="text-xs text-zinc-500">
            By typing your name below, you certify under penalties of perjury that the information provided is correct.
          </p>
          <Input
            label="Type your full legal name"
            value={form.signature}
            onChange={e => setForm(f => ({ ...f, signature: e.target.value }))}
            placeholder="Your full legal name"
          />
        </div>

        <Button type="submit" loading={saving} className="w-full">
          <FileText size={16} /> {taxInfo ? 'Update' : 'Submit'} Tax Information
        </Button>
      </form>

      {/* Tax Documents */}
      {taxDocs.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-zinc-300">Tax Documents</h4>
          {taxDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-zinc-800/30">
              <div>
                <p className="text-sm text-zinc-300">{doc.document_type.toUpperCase()} — {doc.tax_year}</p>
                <p className="text-xs text-zinc-500">Total earnings: ${parseFloat(doc.total_earnings).toFixed(2)}</p>
              </div>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                doc.status === 'generated' || doc.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
              )}>
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BillingSettings() {
  const { profile } = useAuthStore()
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [extending, setExtending] = useState(null)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id,
          status,
          current_period_end,
          payment_method,
          creator:creator_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('subscriber_id', profile.id)
        .in('status', ['active', 'canceled'])
        .order('current_period_end', { ascending: false })

      if (error) throw error
      setSubscriptions(data || [])
    } catch (err) {
      console.error('Error fetching subscriptions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExtendCrypto = async (subId) => {
    setExtending(subId)
    try {
      const { data, error } = await supabase.rpc('extend_crypto_subscription', {
        p_subscription_id: subId
      })
      if (error) throw error
      
      toast.success('Subscription extended successfully!')
      fetchSubscriptions()
    } catch (err) {
      toast.error(err.message || 'Failed to extend subscription')
    } finally {
      setExtending(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
  }

  const isPlus = profile?.is_plus && profile?.plus_expires_at && new Date(profile.plus_expires_at) > new Date()

  return (
    <div className="space-y-8">
      {/* Heatly+ Status */}
      <section>
        <SectionHeader icon={Star} title="Heatly+ Status" description="Your premium membership" />
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                isPlus ? "bg-amber-500/10" : "bg-zinc-800"
              )}>
                <Star className={isPlus ? "text-amber-400" : "text-zinc-500"} size={24} />
              </div>
              <div>
                <h4 className="font-bold text-white">Heatly+</h4>
                <p className="text-sm text-zinc-400">
                  {isPlus 
                    ? `Active until ${new Date(profile.plus_expires_at).toLocaleDateString()}`
                    : 'Not subscribed'}
                </p>
              </div>
            </div>
            {!isPlus && (
              <Button onClick={() => window.location.href = '/plus'} variant="primary">
                Upgrade
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Creator Subscriptions */}
      <section>
        <SectionHeader icon={Users} title="Creator Subscriptions" description="Manage your active subscriptions" />
        
        {subscriptions.length === 0 ? (
          <div className="text-center py-8 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
            <p className="text-zinc-500">You don't have any active subscriptions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map(sub => {
              const isCrypto = sub.payment_method === 'crypto'
              const endDate = new Date(sub.current_period_end)
              const now = new Date()
              const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
              const canExtend = isCrypto && sub.status === 'active' && daysUntilExpiry <= 30 // Can only extend if within current month

              return (
                <div key={sub.id} className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <Avatar src={sub.creator.avatar_url} alt={sub.creator.display_name} size="md" />
                    <div>
                      <h4 className="font-bold text-white">{sub.creator.display_name}</h4>
                      <p className="text-xs text-zinc-400">@{sub.creator.username}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-md font-medium",
                          sub.status === 'active' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                        )}>
                          {sub.status.toUpperCase()}
                        </span>
                        <span className="text-xs text-zinc-500">
                          Ends {endDate.toLocaleDateString()}
                        </span>
                        {isCrypto && (
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md font-medium">
                            CRYPTO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canExtend && (
                    <Button 
                      size="sm" 
                      variant="secondary"
                      loading={extending === sub.id}
                      onClick={() => handleExtendCrypto(sub.id)}
                    >
                      Extend 1 Month
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
