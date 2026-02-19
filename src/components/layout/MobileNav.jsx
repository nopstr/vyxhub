import { NavLink } from 'react-router-dom'
import { Home, Search, PlusCircle, Mail, User, LogIn, Star } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

const publicItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/explore', icon: Search, label: 'Explore' },
]

// Profile link must use the current user's username since route is /profile/:username
function getAuthItems(username) {
  return [
    { to: '/messages', icon: Mail, label: 'Messages' },
    { to: username ? `/@${username}` : '/auth', icon: User, label: 'Profile' },
  ]
}

export default function MobileNav() {
  const { user, profile } = useAuthStore()

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/50 z-50 safe-area-bottom">
      <div className="flex justify-around items-center py-2 px-4">
        {publicItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
                isActive ? 'text-white' : 'text-zinc-500')
            }
          >
            <item.icon size={22} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}

        {user ? (
          <>
            {profile?.is_creator ? (
              <NavLink to="/" className="flex flex-col items-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center -mt-6 shadow-lg shadow-indigo-600/30">
                  <PlusCircle size={22} className="text-white" />
                </div>
              </NavLink>
            ) : (
              <NavLink
                to="/become-creator"
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
                    isActive ? 'text-pink-400' : 'text-zinc-500')
                }
              >
                <Star size={22} />
                <span className="text-[10px] font-medium">Create</span>
              </NavLink>
            )}
            {getAuthItems(profile?.username).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
                    isActive ? 'text-white' : 'text-zinc-500')
                }
              >
                <item.icon size={22} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            ))}
          </>
        ) : (
          <NavLink
            to="/auth"
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
                isActive ? 'text-white' : 'text-zinc-500')
            }
          >
            <LogIn size={22} />
            <span className="text-[10px] font-medium">Sign In</span>
          </NavLink>
        )}
      </div>
    </div>
  )
}
