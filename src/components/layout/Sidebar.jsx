import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, Bell, Mail, Bookmark, User, Settings, PlusCircle, Zap, TrendingUp, Video } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import Avatar from '../ui/Avatar'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/explore', icon: TrendingUp, label: 'Explore' },
  { to: '/notifications', icon: Bell, label: 'Notifications', countKey: 'notifications' },
  { to: '/messages', icon: Mail, label: 'Messages' },
  { to: '/bookmarks', icon: Bookmark, label: 'Bookmarks' },
  { to: '/reels', icon: Video, label: 'Reels' },
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
  const { profile } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const navigate = useNavigate()

  return (
    <nav className="hidden md:flex flex-col w-20 xl:w-64 sticky top-0 h-screen py-4 px-2 xl:px-4 border-r border-zinc-800/50">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-3 px-4 py-3 mb-6">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-white/10 flex-shrink-0">
          <Zap className="text-black fill-black" size={20} />
        </div>
        <span className="hidden xl:block text-xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          VYXHUB
        </span>
      </NavLink>

      {/* Navigation */}
      <div className="flex-1 space-y-1">
        {navItems.map(item => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            count={item.countKey === 'notifications' ? unreadCount : 0}
          />
        ))}
      </div>

      {/* Create Post Button */}
      <button
        onClick={() => navigate('/compose')}
        className="my-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-600/20 cursor-pointer"
      >
        <PlusCircle size={20} />
        <span className="hidden xl:inline">Create Post</span>
      </button>

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
    </nav>
  )
}
