import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

export default function Dropdown({ trigger, children, align = 'right', className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl py-1.5 animate-[dropdown-in_0.15s_ease-out]',
            align === 'right' && 'right-0',
            align === 'left' && 'left-0',
            className
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, icon: Icon, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer',
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
      )}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

export function DropdownDivider() {
  return <div className="h-px bg-zinc-800 my-1" />
}
