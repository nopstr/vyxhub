import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, Bell, Mail, Unlock, Bookmark, User, Settings, PlusCircle, Zap, TrendingUp, Video, LayoutDashboard, Star, ShieldAlert, Headset, Users, Crown, Shield } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import Avatar from '../ui/Avatar'
import { cn } from '../../lib/utils'

const publicNavItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/explore', icon: TrendingUp, label: 'Explore' },
  { to: '/reels', icon: Video, label: 'Reels' },
]

const authNavItems = [
  { to: '/notifications', icon: Bell, label: 'Notifications', countKey: 'notifications' },
  { to: '/messages', icon: Mail, label: 'Messages' },
  { to: '/unlocks', icon: Unlock, label: 'My Unlocks' },
  { to: '/bookmarks', icon: Bookmark, label: 'Bookmarks' },
]

function SidebarLink({ to, icon: Icon, label, count }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200',
          isActive
            ? 'bg-indigo-600/10 text-white font-bold'
            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className="relative">
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            {count > 0 && (
              <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white px-1">
                  {count > 99 ? '99+' : count}
                </span>
              </div>
            )}
          </div>
          <span className="hidden xl:block text-[15px]">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { profile, user } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const navigate = useNavigate()

  return (
    <div className="hidden md:block w-20 xl:w-64 flex-shrink-0 border-r border-zinc-800/50">
      <nav className="sticky top-0 h-screen flex flex-col py-4 px-2 xl:px-4">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-3 px-4 py-3 mb-6">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-white/10 flex-shrink-0">
          <Zap className="text-black fill-black" size={20} />
        </div>
        <span className="hidden xl:block text-xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          HEATLY
        </span>
      </NavLink>

      {/* Navigation */}
      <div className="flex-1 space-y-1">
        {publicNavItems.map(item => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
          />
        ))}

        {user && (
          <>
            <div className="h-px bg-zinc-800/50 my-2 mx-4" />
            {authNavItems.map(item => (
              <SidebarLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                count={item.countKey === 'notifications' ? unreadCount : 0}
              />
            ))}

            {/* Heatly+ */}
            <SidebarLink to="/plus" icon={Crown} label="Heatly+" />

            <div className="h-px bg-zinc-800/50 my-2 mx-4" />
            {profile?.is_creator ? (
              <>
                <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                <SidebarLink to="/partner" icon={Shield} label="Partner" />
                <SidebarLink to="/settings" icon={Settings} label="Settings" />
              </>
            ) : (
              <>
                <SidebarLink to="/become-creator" icon={Star} label="Become a Creator" />
                <SidebarLink to="/settings" icon={Settings} label="Settings" />
              </>
            )}

            {/* Staff sections — role-based */}
            {profile?.system_role && (
              <>
                <div className="h-px bg-zinc-800/50 my-2 mx-4" />
                {['admin', 'support', 'support_lead'].includes(profile.system_role) && (
                  <SidebarLink to="/support" icon={Headset} label="Support" />
                )}
                {['admin', 'manager', 'management_lead'].includes(profile.system_role) && (
                  <SidebarLink to="/management" icon={Users} label="Management" />
                )}
                {profile.system_role === 'admin' && (
                  <SidebarLink to="/admin" icon={ShieldAlert} label="Admin" />
                )}
              </>
            )}
          </>
        )}
      </div>

      {user ? (
        <>
          {/* Create Post Button — creators only */}
          {profile?.is_creator && (
            <button
              onClick={() => navigate('/')}
              className="my-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <PlusCircle size={20} />
              <span className="hidden xl:inline">Create Post</span>
            </button>
          )}

          {/* Profile Quick Access */}
          {profile && (
            <NavLink
              to={`/@${profile.username}`}
              className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/50 transition-colors"
            >
              <Avatar src={profile.avatar_url} alt={profile.display_name} size="md" />
              <div className="hidden xl:block min-w-0">
                <p className="text-sm font-bold text-white truncate">{profile.display_name}</p>
                <p className="text-xs text-zinc-500 truncate">@{profile.username}</p>
              </div>
            </NavLink>
          )}
        </>
      ) : (
        <NavLink
          to="/auth"
          className="my-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          <User size={20} />
          <span className="hidden xl:inline">Sign In</span>
        </NavLink>
      )}
      </nav>
    </div>
  )
}
