import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'

export default function TagSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Parse comma-separated string into array
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  const available = options.filter(o => !selected.includes(o))

  return (
    <div ref={ref} className="relative w-full">
      {/* Selected tags + trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-[240px] overflow-y-auto rounded-lg border border-panda-border bg-panda-elevated shadow-xl">
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
        </div>
      )}
    </div>
  )
}
