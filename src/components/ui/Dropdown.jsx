import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'

export default function Dropdown({ trigger, children, align = 'right', className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus first item when dropdown opens
  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector('[role="menuitem"]')
      first?.focus()
    }
  }, [open])

  const handleKeyDown = useCallback((e) => {
    if (!open || !menuRef.current) return

    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
    const currentIndex = items.indexOf(document.activeElement)

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        // Return focus to trigger
        ref.current?.querySelector('button, [tabindex]')?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        items[(currentIndex + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        items[(currentIndex - 1 + items.length) % items.length]?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
      case 'Home':
        e.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        items[items.length - 1]?.focus()
        break
    }
  }, [open])

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <div
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {trigger}
      </div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
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
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer',
        danger
          ? 'text-red-400 hover:bg-red-500/10 focus:bg-red-500/10'
          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus:bg-zinc-800 focus:text-white'
      )}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

export function DropdownDivider() {
  return <div className="h-px bg-zinc-800 my-1" role="separator" />
}
