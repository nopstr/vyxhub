import { NavLink } from 'react-router-dom'
import { Home, PlusCircle, Mail, Unlock, User, LogIn, Star } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

export default function MobileNav() {
  const { user, profile } = useAuthStore()

  const NavItem = ({ to, icon: Icon, label, isActive: forcedActive, className: extraClass }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
          (forcedActive ?? isActive) ? 'text-white' : 'text-zinc-500', extraClass)
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

        {user ? (
          <>
            {/* 2. Messages */}
            <NavItem to="/messages" icon={Mail} label="Messages" />

            {/* 3. Create (center) */}
            {profile?.is_creator ? (
              <NavLink to="/" className="flex flex-col items-center">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center -mt-5 shadow-lg shadow-indigo-600/30">
                  <PlusCircle size={20} className="text-white" />
                </div>
              </NavLink>
            ) : (
              <NavItem to="/become-creator" icon={Star} label="Create" />
            )}

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
