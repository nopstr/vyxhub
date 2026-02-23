import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Clock, Hash, User, ArrowRight, Trash2, Loader2, ShieldCheck } from 'lucide-react'
import { useSearchStore } from '../../stores/searchStore'
import { useAuthStore } from '../../stores/authStore'
import Avatar from './Avatar'
import { debounce, cn } from '../../lib/utils'

export default function SearchOverlay({ open, onClose, initialQuery = '' }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    suggestions,
    loadingSuggestions,
    recentSearches,
    fetchAutocomplete,
    fetchSearchHistory,
    deleteSearchItem,
    clearSearchHistory,
    clearSuggestions,
  } = useSearchStore()

  const [query, setQuery] = useState(initialQuery)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Fetch search history on open
  useEffect(() => {
    if (open && user) {
      fetchSearchHistory(user.id)
    }
  }, [open, user])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery(initialQuery)
      setActiveIndex(-1)
    } else {
      clearSuggestions()
    }
  }, [open, initialQuery])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedAutocomplete = useCallback(
    debounce((q) => fetchAutocomplete(q, user?.id), 200),
    [user]
  )

  const handleInputChange = (e) => {
    const v = e.target.value
    setQuery(v)
    setActiveIndex(-1)
    debouncedAutocomplete(v)
  }

  const executeSearch = (searchQuery) => {
    const q = searchQuery?.trim()
    if (!q) return
    onClose?.()
    if (q.startsWith('#')) {
      navigate(`/explore?tag=${encodeURIComponent(q.slice(1))}`)
    } else {
      navigate(`/explore?q=${encodeURIComponent(q)}`)
    }
  }

  const handleSelect = (item) => {
    if (item.item_type === 'creator') {
      onClose?.()
      navigate(`/@${item.sublabel?.replace('@', '')}`)
    } else if (item.item_type === 'hashtag') {
      onClose?.()
      navigate(`/explore?tag=${encodeURIComponent(item.label.replace('#', ''))}`)
    } else if (item.item_type === 'recent') {
      setQuery(item.label)
      executeSearch(item.label)
    }
  }

  const handleKeyDown = (e) => {
    const items = getDisplayItems()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && items[activeIndex]) {
        handleSelect(items[activeIndex])
      } else {
        executeSearch(query)
      }
    } else if (e.key === 'Escape') {
      onClose?.()
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex]
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const getDisplayItems = () => {
    if (query.trim().length > 0) return suggestions
    // When empty, show recent searches
    return recentSearches.map(s => ({
      item_type: 'recent',
      item_id: s.id,
      label: s.query,
      sublabel: s.result_type,
    }))
  }

  const items = getDisplayItems()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl mx-auto mt-16 md:mt-24"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search creators, posts, #hashtags..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl pl-12 pr-12 py-4 text-base text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-red-500/50 transition-colors shadow-2xl"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setActiveIndex(-1); debouncedAutocomplete(''); inputRef.current?.focus() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
          {loadingSuggestions && (
            <Loader2 size={16} className="absolute right-12 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
          )}
        </div>

        {/* Results dropdown */}
        {items.length > 0 && (
          <div
            ref={listRef}
            className="mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl py-2 max-h-[60vh] overflow-y-auto"
          >
            {/* Section header for recent */}
            {!query.trim() && items.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recent Searches</span>
                {items.length > 0 && (
                  <button
                    onClick={() => clearSearchHistory(user?.id)}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {items.map((item, idx) => (
              <div
                key={item.item_id || `${item.item_type}-${item.label}-${idx}`}
                onClick={() => handleSelect(item)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                  activeIndex === idx ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'
                )}
              >
                {/* Icon */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center">
                  {item.item_type === 'creator' ? (
                    item.avatar_url ? (
                      <Avatar src={item.avatar_url} alt={item.label} size="sm" />
                    ) : (
                      <User size={14} className="text-zinc-400" />
                    )
                  ) : item.item_type === 'hashtag' ? (
                    <Hash size={14} className="text-red-400" />
                  ) : (
                    <Clock size={14} className="text-zinc-500" />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-zinc-200 truncate">{item.label}</span>
                    {item.is_verified && <ShieldCheck size={12} className="text-red-400 flex-shrink-0" />}
                  </div>
                  {item.sublabel && (
                    <span className="text-xs text-zinc-500 truncate block">{item.sublabel}</span>
                  )}
                </div>

                {/* Action */}
                {item.item_type === 'recent' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSearchItem(item.item_id) }}
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {item.item_type !== 'recent' && (
                  <ArrowRight size={14} className="text-zinc-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state when typing but no results */}
        {query.trim().length > 0 && !loadingSuggestions && items.length === 0 && (
          <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl py-8 text-center">
            <Search size={24} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No results for "{query}"</p>
            <p className="text-xs text-zinc-600 mt-1">Press Enter to search anyway</p>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-zinc-600">
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 font-mono">Enter</kbd> select</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
