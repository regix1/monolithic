import { motion } from 'framer-motion'
import PandaStatus from './PandaStatus'

/**
 * Friendly empty/loading/error state with panda illustration.
 *
 * @param {{
 *   type?: 'empty' | 'loading' | 'error' | 'success',
 *   title: string,
 *   description?: string,
 *   action?: { label: string, onClick: () => void },
 *   className?: string,
 *   size?: 'sm' | 'md' | 'lg',
 * }} props
 */
export default function EmptyState({
  type = 'empty',
  title,
  description,
  action,
  className = '',
  size = 'md',
}) {
  const moodMap = {
    empty: 'sleepy',
    loading: 'eating',
    error: 'sad',
    success: 'happy',
  }

  const pandaSize = { sm: 48, md: 64, lg: 80 }[size]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`flex flex-col items-center justify-center text-center py-8 px-4 ${className}`}
    >
      <PandaStatus mood={moodMap[type]} size={pandaSize} />

      <h3 className="font-display font-bold text-panda-text mt-4 text-base">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-panda-dim mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-xl bg-bamboo px-4 py-2 text-sm font-semibold text-panda-bg hover:bg-bamboo-hover transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
