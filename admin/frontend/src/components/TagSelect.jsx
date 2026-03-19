import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'

export default function TagSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o)
  )

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
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) {
      updatePos()
      inputRef.current?.focus()
      window.addEventListener('scroll', updatePos, true)
      window.addEventListener('resize', updatePos)
      return () => {
        window.removeEventListener('scroll', updatePos, true)
        window.removeEventListener('resize', updatePos)
      }
    }
  }, [open, updatePos])

  function addTag(opt) {
    onChange([...selected, opt].join(','))
    setSearch('')
    inputRef.current?.focus()
  }

  function removeTag(opt) {
    onChange(selected.filter(s => s !== opt).join(','))
  }

  function handleKeyDown(e) {
    if (e.key === 'Backspace' && search === '' && selected.length > 0) {
      removeTag(selected[selected.length - 1])
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      addTag(filtered[0])
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }

  function handleTriggerClick() {
    setOpen(true)
    updatePos()
  }

  return (
    <div className="relative w-full">
      {/* Trigger — tags + inline search input */}
      <div
        ref={triggerRef}
        onClick={handleTriggerClick}
        className="w-full flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-panda-border bg-panda-elevated px-3 py-2 cursor-text transition-colors focus-within:border-bamboo"
      >
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
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (!open) { setOpen(true); updatePos() } }}
          onFocus={() => { if (!open) { setOpen(true); updatePos() } }}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? 'Type to search...' : ''}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-panda-text font-mono outline-none placeholder-panda-dim focus:outline-none [&]:outline-none"
          style={{ outline: 'none' }}
        />
        <ChevronDown size={14} className="text-panda-dim shrink-0" />
      </div>

      {/* Dropdown via portal */}
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed max-h-[240px] overflow-y-auto rounded-lg border border-panda-border bg-panda-elevated shadow-2xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          {filtered.length === 0 && selected.length < options.length ? (
            <div className="px-4 py-3 text-sm text-panda-dim">
              {search ? `No match for "${search}"` : 'All services selected'}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-panda-dim">No services available</div>
          ) : (
            filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => addTag(opt)}
                className="w-full flex items-center px-4 py-2.5 text-left text-sm font-mono text-panda-text hover:bg-panda-surface transition-colors"
              >
                {search ? (
                  <span dangerouslySetInnerHTML={{
                    __html: opt.replace(
                      new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                      '<span class="text-bamboo font-semibold">$1</span>'
                    )
                  }} />
                ) : (
                  <span>{opt}</span>
                )}
              </button>
            ))
          )}
          {selected.length > 0 && (
            <div className="border-t border-panda-border">
              <button
                type="button"
                onClick={() => { onChange(''); setSearch('') }}
                className="w-full px-4 py-2 text-left text-sm text-panda-dim hover:text-panda-text hover:bg-panda-surface transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
