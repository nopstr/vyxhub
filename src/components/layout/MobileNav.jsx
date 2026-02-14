import { NavLink } from 'react-router-dom'
import { Home, Search, PlusCircle, Mail, User } from 'lucide-react'
import { cn } from '../../lib/utils'

const items = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/explore', icon: Search, label: 'Explore' },
  { to: '/compose', icon: PlusCircle, label: 'Post', isAction: true },
  { to: '/messages', icon: Mail, label: 'Messages' },
  { to: '/profile', icon: User, label: 'Profile' },
]

export default function MobileNav() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/50 z-50 safe-area-bottom">
      <div className="flex justify-around items-center py-2 px-4">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors',
                item.isAction ? '' : isActive ? 'text-white' : 'text-zinc-500'
              )
            }
          >
            {item.isAction ? (
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center -mt-6 shadow-lg shadow-indigo-600/30">
                <item.icon size={22} className="text-white" />
              </div>
            ) : (
              <>
                <item.icon size={22} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
