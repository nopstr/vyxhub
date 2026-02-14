import { useLocation } from 'react-router-dom'
import { Search, Flame, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'

function TrendingSection() {
  const trends = [
    { tag: '#SunsetVibes', posts: '12.4K' },
    { tag: '#ExclusiveDrop', posts: '8.9K' },
    { tag: '#NewCreator', posts: '5.2K' },
    { tag: '#VyxVault', posts: '3.7K' },
  ]

  return (
    <section>
      <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-4 px-1">Trending</h3>
      <div className="space-y-1">
        {trends.map(trend => (
          <div key={trend.tag} className="p-3 rounded-2xl hover:bg-zinc-800/30 cursor-pointer transition-colors">
            <p className="font-bold text-sm text-white">{trend.tag}</p>
            <p className="text-xs text-zinc-500">{trend.posts} posts</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SuggestedCreators() {
  const suggestions = [
    { name: 'Maya Rose', handle: 'mayarose', verified: true },
    { name: 'Alex Storm', handle: 'alexstorm', verified: true },
    { name: 'Luna Sky', handle: 'lunasky', verified: false },
  ]

  return (
    <section>
      <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-4 px-1">Suggested Creators</h3>
      <div className="space-y-2">
        {suggestions.map(creator => (
          <div key={creator.handle} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/30 cursor-pointer transition-colors">
            <Avatar alt={creator.name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white truncate">{creator.name}</span>
                {creator.verified && <ShieldCheck size={14} className="text-indigo-400 flex-shrink-0" />}
              </div>
              <span className="text-xs text-zinc-500">@{creator.handle}</span>
            </div>
            <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors">
              Follow
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function RightPanel() {
  const { profile } = useAuthStore()
  const location = useLocation()

  // Hide on certain pages
  if (['/messages', '/settings'].some(p => location.pathname.startsWith(p))) {
    return null
  }

  return (
    <aside className="hidden lg:block w-80 sticky top-0 h-screen overflow-y-auto no-scrollbar py-6 pl-6 pr-4 border-l border-zinc-800/50">
      {/* Search */}
      <div className="relative mb-8">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search VyxHub..."
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
        />
      </div>

      <div className="space-y-8">
        {/* Premium CTA */}
        <section className="bg-gradient-to-br from-indigo-900/30 via-violet-900/20 to-transparent p-6 rounded-3xl border border-white/5">
          <Flame className="text-indigo-400 mb-3" size={24} />
          <h3 className="text-lg font-black mb-1.5">Go Premium</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            Unlock unlimited messaging, priority support, and badge perks.
          </p>
          <button className="w-full py-2.5 bg-white text-black font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-zinc-200 transition-colors cursor-pointer">
            Upgrade
          </button>
        </section>

        <TrendingSection />
        <SuggestedCreators />

        {/* Footer Links */}
        <div className="text-[11px] text-zinc-600 space-x-2 px-1 leading-relaxed">
          <a href="/terms" className="hover:text-zinc-400">Terms</a>
          <span>·</span>
          <a href="/privacy" className="hover:text-zinc-400">Privacy</a>
          <span>·</span>
          <a href="/dmca" className="hover:text-zinc-400">DMCA</a>
          <span>·</span>
          <a href="/support" className="hover:text-zinc-400">Support</a>
          <p className="mt-2">© 2026 VyxHub</p>
        </div>
      </div>
    </aside>
  )
}
