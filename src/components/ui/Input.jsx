import { useId } from 'react'
import { cn } from '../../lib/utils'

export default function Input({
  label,
  error,
  icon: Icon,
  className,
  containerClassName,
  id: propId,
  ...props
}) {
  const autoId = useId()
  const inputId = propId || autoId

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-zinc-400">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        )}
        <input
          id={inputId}
          className={cn(
            'w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors',
            'focus:border-red-500 focus:ring-1 focus:ring-red-500/30',
            Icon && 'pl-10',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">{error}</p>}
    </div>
  )
}

export function Textarea({
  label,
  error,
  className,
  id: propId,
  ...props
}) {
  const autoId = useId()
  const textareaId = propId || autoId

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-zinc-400">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors resize-none',
          'focus:border-red-500 focus:ring-1 focus:ring-red-500/30',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30',
          className
        )}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        {...props}
      />
      {error && <p id={`${textareaId}-error`} className="text-xs text-red-400" role="alert">{error}</p>}
    </div>
  )
}
