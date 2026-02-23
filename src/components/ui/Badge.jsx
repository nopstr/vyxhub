import { cn } from '../../lib/utils'

export default function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-zinc-800 text-zinc-300',
    primary: 'bg-red-500/20 text-red-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    danger: 'bg-red-500/20 text-red-400',
    warning: 'bg-amber-500/20 text-amber-400',
    live: 'bg-red-600 text-white animate-pulse',
    premium: 'bg-gradient-to-r from-red-500/20 to-orange-500/20 text-red-300',
    'partner-verified': 'bg-emerald-500/20 text-emerald-400',
    'partner-red': 'bg-red-500/20 text-red-400',
    'partner-gold': 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
