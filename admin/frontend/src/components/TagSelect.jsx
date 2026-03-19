import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'

export default function TagSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)

  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) {
      updatePos()
      window.addEventListener('scroll', updatePos, true)
      window.addEventListener('resize', updatePos)
      return () => {
        window.removeEventListener('scroll', updatePos, true)
        window.removeEventListener('resize', updatePos)
      }
    }
  }, [open, updatePos])

  function toggleOption(opt) {
    let next
    if (selected.includes(opt)) {
      next = selected.filter(s => s !== opt)
    } else {
      next = [...selected, opt]
    }
    onChange(next.join(','))
  }

  function removeTag(opt) {
    onChange(selected.filter(s => s !== opt).join(','))
  }

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { updatePos(); setOpen(o => !o) }}
        className="w-full flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-panda-border bg-panda-elevated px-3 py-2 text-left transition-colors focus:border-bamboo focus:outline-none"
      >
        {selected.length === 0 && (
          <span className="text-sm text-panda-dim">None selected</span>
        )}
        {selected.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-panda-surface border border-panda-border px-2 py-0.5 text-sm font-mono text-panda-text"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              className="text-panda-dim hover:text-err transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <ChevronDown size={14} className="ml-auto text-panda-dim shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed max-h-[240px] overflow-y-auto rounded-lg border border-panda-border bg-panda-elevated shadow-2xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-panda-dim">No services available</div>
          ) : (
            options.map(opt => {
              const isSelected = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className={[
                    'w-full flex items-center justify-between px-4 py-2.5 text-left text-sm font-mono transition-colors',
                    isSelected
                      ? 'bg-bamboo/10 text-bamboo'
                      : 'text-panda-text hover:bg-panda-surface',
                  ].join(' ')}
                >
                  <span>{opt}</span>
                  {isSelected && <span className="text-xs text-bamboo">selected</span>}
                </button>
              )
            })
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
