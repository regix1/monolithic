import { motion, AnimatePresence } from 'framer-motion'
import PandaStatus from './PandaStatus'

/**
 * Cute confirmation modal with panda personality.
 *
 * @param {{
 *   open: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   title: string,
 *   description?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   variant?: 'danger' | 'warning' | 'default',
 * }} props
 */
export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Yes, do it!',
  cancelLabel = 'Nope, go back',
  variant = 'default',
}) {
  const confirmStyle = {
    danger: 'bg-err hover:bg-red-400 text-white',
    warning: 'bg-warn hover:bg-amber-400 text-panda-bg',
    default: 'bg-bamboo hover:bg-bamboo-hover text-panda-bg',
  }[variant]

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onCancel()}
          >
            <div className="w-full max-w-sm rounded-3xl bg-panda-surface border border-panda-border p-6 shadow-2xl">
              <div className="flex flex-col items-center text-center">
                <PandaStatus
                  mood={variant === 'danger' ? 'worried' : 'happy'}
                  size={56}
                />

                <h2 className="font-display font-bold text-panda-text text-lg mt-4">
                  {title}
                </h2>

                {description && (
                  <p className="text-sm text-panda-dim mt-2 leading-relaxed">
                    {description}
                  </p>
                )}

                <div className="flex gap-3 mt-6 w-full">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 rounded-xl border border-panda-border px-4 py-2.5 text-sm font-medium text-panda-muted hover:text-panda-text hover:bg-panda-elevated transition-all duration-200"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${confirmStyle}`}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
