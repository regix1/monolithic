import { motion } from 'framer-motion'
import PandaStatus from './PandaStatus'

/**
 * Soft, panda-personality alert banner.
 *
 * @param {{
 *   type: 'success' | 'warning' | 'error' | 'info',
 *   title: string,
 *   description?: string,
 *   action?: { label: string, onClick: () => void },
 *   onDismiss?: () => void,
 *   className?: string,
 * }} props
 */
export default function FriendlyAlert({
  type = 'info',
  title,
  description,
  action,
  onDismiss,
  className = '',
}) {
  const styles = {
    success: {
      bg: 'bg-bamboo/8',
      border: 'border-bamboo/20',
      text: 'text-bamboo',
      mood: 'happy',
    },
    warning: {
      bg: 'bg-warn/8',
      border: 'border-warn/20',
      text: 'text-warn',
      mood: 'worried',
    },
    error: {
      bg: 'bg-err/8',
      border: 'border-err/20',
      text: 'text-err',
      mood: 'sad',
    },
    info: {
      bg: 'bg-info/8',
      border: 'border-info/20',
      text: 'text-info',
      mood: 'happy',
    },
  }

  const { bg, border, text, mood } = styles[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`rounded-2xl border ${bg} ${border} px-5 py-4 flex items-start gap-4 ${className}`}
    >
      <PandaStatus mood={mood} size={36} animate={false} className="shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${text}`}>{title}</p>
        {description && (
          <p className={`text-xs ${text} opacity-75 mt-1 leading-relaxed`}>{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${
              type === 'warning'
                ? 'bg-warn text-panda-bg hover:bg-amber-400'
                : type === 'error'
                  ? 'bg-err text-white hover:bg-red-400'
                  : 'bg-bamboo text-panda-bg hover:bg-bamboo-hover'
            }`}
          >
            {action.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-panda-dim hover:text-panda-muted hover:bg-panda-elevated/50 transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  )
}
