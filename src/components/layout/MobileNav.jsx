import { NavLink } from 'react-router-dom'
import { Home, Search, Mail, Unlock, User, LogIn } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

export default function MobileNav() {
  const { user, profile } = useAuthStore()

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
          isActive ? 'text-white' : 'text-zinc-500')
      }
    >
      <Icon size={22} />
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/50 z-50 safe-area-bottom">
      <div className="flex justify-around items-center py-2 px-4">
        {/* 1. Home */}
        <NavItem to="/" icon={Home} label="Home" />

        {/* 2. Explore */}
        <NavItem to="/explore" icon={Search} label="Explore" />

        {user ? (
          <>
            {/* 3. Messages */}
            <NavItem to="/messages" icon={Mail} label="Messages" />

            {/* 4. Unlocks */}
            <NavItem to="/unlocks" icon={Unlock} label="Unlocks" />

            {/* 5. Profile */}
            <NavItem to={profile?.username ? `/@${profile.username}` : '/auth'} icon={User} label="Profile" />
          </>
        ) : (
          <NavItem to="/auth" icon={LogIn} label="Sign In" />
        )}
      </div>
    </div>
  )
}
