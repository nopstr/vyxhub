import { cn } from '../../lib/utils'

export default function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-zinc-800 text-zinc-300',
    primary: 'bg-indigo-500/20 text-indigo-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    danger: 'bg-red-500/20 text-red-400',
    warning: 'bg-amber-500/20 text-amber-400',
    live: 'bg-rose-600 text-white animate-pulse',
    premium: 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-300',
    'partner-verified': 'bg-emerald-500/20 text-emerald-400',
    'partner-blue': 'bg-blue-500/20 text-blue-400',
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
