import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Mail, Shield, Bell, CreditCard, Palette, LogOut,
  Camera, Save, Trash2, Eye, EyeOff, Lock
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { uploadAvatar, uploadBanner } from '../../lib/storage'

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'creator', label: 'Creator', icon: CreditCard },
]

function ProfileSettings() {
  const { profile, updateProfile, user } = useAuthStore()
  const [form, setForm] = useState({
    display_name: profile?.display_name || '',
    username: profile?.username || '',
    bio: profile?.bio || '',
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

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
    toast.success('Signed out')
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
        <p className="text-sm text-zinc-300">{user?.email}</p>
      </div>

      <div className="pt-4 border-t border-zinc-800">
        <Button variant="danger" onClick={handleSignOut}>
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </div>
  )
}

function CreatorSettings() {
  const { profile, updateProfile } = useAuthStore()
  const [price, setPrice] = useState(profile?.subscription_price || 0)
  const [saving, setSaving] = useState(false)

  const handleBecomeCreator = async () => {
    setSaving(true)
    try {
      await updateProfile({ is_creator: true, subscription_price: price })
      toast.success('Creator profile activated!')
    } catch (err) {
      toast.error('Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {!profile?.is_creator ? (
        <div className="bg-gradient-to-br from-indigo-900/20 to-violet-900/20 p-6 rounded-3xl border border-white/5">
          <h3 className="text-lg font-bold mb-2">Become a Creator</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Start earning by sharing exclusive content with your subscribers.
          </p>
          <Input
            label="Monthly Subscription Price ($)"
            type="number"
            min="0"
            max="49.99"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
          />
          <Button onClick={handleBecomeCreator} loading={saving} variant="premium" className="mt-4">
            Activate Creator Profile
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-sm text-emerald-400 font-medium">✓ Creator profile is active</p>
          </div>
          <Input
            label="Monthly Subscription Price ($)"
            type="number"
            min="0"
            max="49.99"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
          />
          <Button
            onClick={async () => {
              setSaving(true)
              await updateProfile({ subscription_price: price })
              setSaving(false)
              toast.success('Price updated')
            }}
            loading={saving}
          >
            Update Price
          </Button>
        </>
      )}
    </div>
  )
}

function NotificationSettings() {
  const [prefs, setPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    messages: true,
    subscriptions: true,
    livestreams: true,
  })

  return (
    <div className="space-y-4">
      {Object.entries(prefs).map(([key, value]) => (
        <label key={key} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900/50 cursor-pointer transition-colors">
          <span className="text-sm text-zinc-300 capitalize">{key}</span>
          <div
            onClick={() => setPrefs(p => ({ ...p, [key]: !value }))}
            className={cn(
              'w-11 h-6 rounded-full transition-colors relative cursor-pointer',
              value ? 'bg-indigo-600' : 'bg-zinc-700'
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              value ? 'translate-x-5.5' : 'translate-x-0.5'
            )} />
          </div>
        </label>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')

  const content = {
    profile: <ProfileSettings />,
    account: <AccountSettings />,
    notifications: <NotificationSettings />,
    creator: <CreatorSettings />,
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
