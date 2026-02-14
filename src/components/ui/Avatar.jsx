import { cn, getInitials } from '../../lib/utils'

const sizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
  '2xl': 'w-28 h-28 text-2xl',
}

export default function Avatar({ src, alt, size = 'md', className, status, ring }) {
  return (
    <div className={cn('relative flex-shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className={cn(
            'rounded-2xl object-cover',
            sizes[size],
            ring && 'ring-2 ring-zinc-800'
          )}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            'rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-400',
            sizes[size],
            ring && 'ring-2 ring-zinc-800'
          )}
        >
          {getInitials(alt)}
        </div>
      )}
      {status === 'online' && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-900" />
      )}
      {status === 'live' && (
        <div className="absolute -top-1 -right-1 bg-rose-600 text-[8px] font-black px-1 rounded border border-black uppercase">
          Live
        </div>
      )}
    </div>
  )
}
