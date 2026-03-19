import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

const VIEWPORT_PADDING = 8

/**
 * Enhanced dropdown with portal rendering, viewport-aware positioning,
 * click-outside dismiss, escape key, and scroll-close.
 *
 * @param {{
 *   options: { value: string, label: string, description?: string }[],
 *   value: string,
 *   onChange: (value: string) => void,
 *   placeholder?: string,
 *   className?: string,
 *   disabled?: boolean,
 *   dropdownWidth?: string,
 *   maxHeight?: string,
 * }} props
 */
export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  dropdownWidth,
  maxHeight = '280px',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [openUpward, setOpenUpward] = useState(false)
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const parsedMax = maxHeight?.endsWith('px') ? parseInt(maxHeight) : 280
    const estimatedHeight = Math.min(parsedMax, options.length * 40 + 16)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const shouldOpenUp = spaceBelow < estimatedHeight + 8 && spaceAbove > estimatedHeight + 8

    const minWidth = 220
    const maxWidth = window.innerWidth - VIEWPORT_PADDING * 2
    const width = Math.min(
      dropdownWidth ? parseInt(dropdownWidth) || rect.width : Math.max(rect.width, minWidth),
      maxWidth
    )
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_PADDING),
      window.innerWidth - width - VIEWPORT_PADDING
    )

    setOpenUpward(shouldOpenUp)
    setPosition({
      top: shouldOpenUp ? undefined : rect.bottom + 4,
      bottom: shouldOpenUp ? window.innerHeight - rect.top + 4 : undefined,
      left,
      width,
    })
  }, [isOpen, dropdownWidth, maxHeight, options.length])

  useEffect(() => {
    if (!isOpen) return

    const onClickOutside = (e) => {
      if (!dropdownRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const onEscape = (e) => { if (e.key === 'Escape') setIsOpen(false) }
    const onScroll = (e) => {
      if (dropdownRef.current?.contains(e.target)) return
      setIsOpen(false)
    }

    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [isOpen])

  const handleSelect = useCallback((val) => {
    onChange(val)
    setIsOpen(false)
  }, [onChange])

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={[
          'w-full px-3 py-2 rounded-xl border text-left flex items-center justify-between text-sm font-mono transition-all duration-150',
          isOpen
            ? 'border-bamboo bg-panda-elevated text-panda-text shadow-[0_0_0_1px_rgba(74,222,128,0.2)]'
            : 'border-panda-border bg-panda-elevated text-panda-text hover:border-panda-dim',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className={`${!selected ? 'text-panda-dim' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 ml-2 text-panda-dim transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Portal dropdown */}
      {isOpen && position && createPortal(
        <div
          ref={dropdownRef}
          className="fixed rounded-2xl border border-panda-border overflow-hidden bg-panda-surface shadow-[0_10px_40px_-5px_rgba(0,0,0,0.5),0_0_0_1px_rgba(74,222,128,0.06)] z-[100]"
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
            maxWidth: 'calc(100vw - 1rem)',
            animation: `${openUpward ? 'slideUp' : 'slideDown'} 0.15s cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight }}
          >
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={[
                    'w-full px-3 py-2.5 text-sm text-left flex items-center gap-3 transition-colors duration-100 rounded-lg mx-0.5',
                    isSelected
                      ? 'bg-bamboo/10 text-bamboo'
                      : 'text-panda-text hover:bg-panda-elevated',
                  ].join(' ')}
                  style={{ width: 'calc(100% - 4px)' }}
                >
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium font-mono truncate block ${isSelected ? 'text-bamboo' : ''}`}>
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="text-xs text-panda-dim mt-0.5 block truncate">
                        {option.description}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check size={14} className="shrink-0 text-bamboo" />
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
