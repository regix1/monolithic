import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Card that expands/collapses on click of its header. Used by the Upstream
 * page (Cache Domains, Direct-Fallback Events) and the Logs page
 * (Per-Service Breakdown).
 *
 * @param {{
 *   title: string,
 *   icon?: import('lucide-react').LucideIcon,
 *   badge?: import('react').ReactNode,
 *   defaultOpen?: boolean,
 *   children: import('react').ReactNode,
 * }} props
 */
export default function CollapsibleSection({ title, icon: Icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-panda-elevated/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={18} className="text-bamboo" />}
          <span className="text-base font-semibold text-panda-text">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {badge}
          {open ? <ChevronDown size={16} className="text-panda-dim" /> : <ChevronRight size={16} className="text-panda-dim" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-panda-border">
          {children}
        </div>
      )}
    </div>
  )
}
