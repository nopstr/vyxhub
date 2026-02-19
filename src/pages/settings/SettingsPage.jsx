import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Mail, Shield, Bell, CreditCard, LogOut,
  Camera, Save, Trash2, Eye, EyeOff, Lock,
  DollarSign, Globe, MessageCircle, Droplets, MapPin,
  Link as LinkIcon, Star, Package, Percent, ShieldCheck, Zap,
  Heart, AlertTriangle, KeyRound, Upload, Image, Film, FileText,
  CheckCircle, XCircle, Clock
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { uploadAvatar, uploadBanner, optimizeImage } from '../../lib/storage'
import { PLATFORM_FEE_PERCENT, MIN_SUBSCRIPTION_PRICE, MAX_SUBSCRIPTION_PRICE } from '../../lib/constants'

const MODEL_CATEGORIES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'couple', label: 'Couple' },
  { value: 'trans', label: 'Trans' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
]

const PAYOUT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer (ACH/SEPA)' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'crypto', label: 'Cryptocurrency (USDT/BTC)' },
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
          checked ? 'bg-indigo-600' : 'bg-zinc-700'
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
        {Icon && <Icon size={18} className="text-indigo-400" />}
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
  })
  const [saving, setSaving] = useState(false)
  const avatarRef = useRef(null)
  const bannerRef = useRef(null)

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
      await updateProfile(form)
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
            <div className="w-full h-full bg-gradient-to-br from-indigo-900/30 to-violet-900/30" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={28} className="text-white" />
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
        </div>
      </div>

      <Input
        label="Display Name"
        value={form.display_name}
        onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))}
        maxLength={50}
      />

      <Input
        label="Username"
        value={form.username}
        onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
        maxLength={30}
      />

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

      <Button onClick={handleSave} loading={saving}>
        <Save size={16} />
        Save Changes
      </Button>
    </div>
  )
}

function AccountSettings() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

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
    if (!newPassword || !confirmPassword) return toast.error('Fill in all password fields')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    setPasswordSaving(true)
    try {
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
          <Mail size={16} className="text-indigo-400" /> Change Email
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
          <KeyRound size={16} className="text-indigo-400" /> Change Password
        </h3>
        <div className="space-y-3">
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

      {/* Sign Out */}
      <div className="pt-4 border-t border-zinc-800">
        <Button variant="danger" onClick={handleSignOut}>
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>

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
    watermark_enabled: profile?.watermark_enabled ?? false,
    geoblocking_regions: profile?.geoblocking_regions || [],
    payout_method: profile?.payout_method || 'bank_transfer',
    payout_email: profile?.payout_email || '',
    amazon_wishlist_url: profile?.amazon_wishlist_url || '',
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
        watermark_enabled: form.watermark_enabled,
        geoblocking_regions: form.geoblocking_regions,
        payout_method: form.payout_method,
        payout_email: form.payout_email,
        amazon_wishlist_url: form.amazon_wishlist_url,
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
        <div className="bg-gradient-to-br from-pink-500/10 to-violet-600/10 p-6 rounded-3xl border border-pink-500/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-violet-600 rounded-2xl flex items-center justify-center">
              <Star size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Become a Creator</h3>
              <p className="text-sm text-zinc-400">Start earning by sharing exclusive content</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { icon: Percent, text: `Keep ${100 - PLATFORM_FEE_PERCENT}% of earnings` },
              { icon: DollarSign, text: 'Set your own prices' },
              { icon: ShieldCheck, text: 'Content protection' },
              { icon: Globe, text: 'Global audience' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <item.icon size={14} className="text-pink-400 flex-shrink-0" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
              <select value={form.creator_category} onChange={(e) => setForm(f => ({ ...f, creator_category: e.target.value }))} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-pink-500/50 cursor-pointer">
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
              You earn <strong className="text-emerald-400">${((parseFloat(form.subscription_price) || 0) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}/subscriber</strong> after {PLATFORM_FEE_PERCENT}% platform fee
            </p>
          </div>

          <Button onClick={handleBecomeCreator} loading={saving} className="mt-5 w-full !bg-gradient-to-r !from-pink-500 !to-violet-600">
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
    { id: 'payout', label: 'Payouts', icon: CreditCard },
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
              section === s.id ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/30 border border-zinc-800/50'
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
            <select value={form.creator_category} onChange={(e) => setForm(f => ({ ...f, creator_category: e.target.value }))} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer">
              {MODEL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tags</label>
            <input
              value={form.tags}
              onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="fitness, cosplay, lifestyle (comma separated)"
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div className="mt-2 bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/50">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Price</span>
                <span className="text-zinc-300">${parseFloat(form.subscription_price || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Platform Fee ({PLATFORM_FEE_PERCENT}%)</span>
                <span className="text-red-400">-${((parseFloat(form.subscription_price) || 0) * PLATFORM_FEE_PERCENT / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-zinc-800">
                <span className="text-zinc-400 font-medium">Your Earnings</span>
                <span className="text-emerald-400 font-bold">${((parseFloat(form.subscription_price) || 0) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}/subscriber</span>
              </div>
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
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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

          <Toggle
            checked={form.allow_free_messages}
            onChange={(v) => setForm(f => ({ ...f, allow_free_messages: v }))}
            label="Allow Free Messages"
            description="Let non-subscribers send you messages for free"
          />

          {!form.allow_free_messages && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Message Price (non-subscribers)</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="0.5"
                  value={form.message_price}
                  onChange={(e) => setForm(f => ({ ...f, message_price: e.target.value }))}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Non-subscribers pay this to send you a message</p>
            </div>
          )}

          <Toggle
            checked={form.show_activity_status}
            onChange={(v) => setForm(f => ({ ...f, show_activity_status: v }))}
            label="Show Activity Status"
            description="Let fans see when you were last active"
          />
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
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
            >
              {PAYOUT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <Input
            label="Payout Email / Account"
            icon={Mail}
            type="email"
            value={form.payout_email}
            onChange={(e) => setForm(f => ({ ...f, payout_email: e.target.value }))}
            placeholder="your@paypal.com or bank email"
          />

          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50">
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Payout Schedule</h4>
            <p className="text-xs text-zinc-500">Payouts are processed weekly on Fridays. Minimum payout threshold is $50.00. Earnings from the previous period will be included in the next cycle.</p>
          </div>

          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Percent size={14} className="text-indigo-400" />
              <h4 className="text-sm font-medium text-white">Platform Fee</h4>
            </div>
            <p className="text-xs text-zinc-400">VyxHub takes a {PLATFORM_FEE_PERCENT}% platform fee on all earnings (subscriptions, tips, PPV, custom requests). You keep {100 - PLATFORM_FEE_PERCENT}% of all revenue.</p>
          </div>
        </div>
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

  return (
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
                    ? 'text-white bg-indigo-500/10 md:border-r-2 md:border-indigo-500'
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
