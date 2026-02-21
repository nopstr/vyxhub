import { ExternalLink, Megaphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AffiliateAdCard({ ad }) {
  const handleClick = () => {
    supabase.rpc('record_affiliate_click', { p_ad_id: ad.id }).catch(() => {})
    window.open(ad.link_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="border-b border-zinc-800/50 px-5 py-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Megaphone size={12} className="text-zinc-500" />
        <span className="text-[11px] text-zinc-500 font-medium">Sponsored</span>
      </div>
      <button
        onClick={handleClick}
        className="w-full text-left group cursor-pointer"
      >
        {ad.image_url && (
          <div className="rounded-2xl overflow-hidden mb-3 border border-zinc-800/50">
            <img
              src={ad.image_url}
              alt={ad.title}
              className="w-full h-auto max-h-72 object-cover group-hover:scale-[1.02] transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors">
              {ad.title}
            </h4>
            {ad.description && (
              <p className="text-zinc-400 text-sm mt-0.5 line-clamp-2">{ad.description}</p>
            )}
          </div>
          <ExternalLink size={16} className="text-zinc-600 group-hover:text-indigo-400 transition-colors mt-0.5 flex-shrink-0" />
        </div>
      </button>
    </div>
  )
}

export function SidebarAd({ ad }) {
  const handleClick = () => {
    supabase.rpc('record_affiliate_click', { p_ad_id: ad.id }).catch(() => {})
    window.open(ad.link_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left group cursor-pointer block"
    >
      <div className="rounded-2xl overflow-hidden border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 transition-colors">
        {ad.image_url && (
          <img
            src={ad.image_url}
            alt={ad.title}
            className="w-full h-auto object-cover"
            loading="lazy"
          />
        )}
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Megaphone size={10} className="text-zinc-500" />
            <span className="text-[10px] text-zinc-500">Sponsored</span>
          </div>
          <h4 className="font-bold text-white text-xs group-hover:text-indigo-400 transition-colors">
            {ad.title}
          </h4>
          {ad.description && (
            <p className="text-zinc-500 text-[11px] mt-0.5 line-clamp-2">{ad.description}</p>
          )}
        </div>
      </div>
    </button>
  )
}
