import { motion } from 'framer-motion'

/**
 * Chunky, satisfying toggle switch with panda personality.
 *
 * @param {{
 *   checked: boolean,
 *   onChange: (checked: boolean) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function Toggle({ checked, onChange, disabled = false }) {
  function handleClick() {
    if (!disabled) onChange(!checked)
  }

  function handleKeyDown(/** @type {import('react').KeyboardEvent} */ e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-250',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-bamboo/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panda-surface',
        checked ? 'bg-bamboo' : 'bg-panda-elevated',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <motion.span
        animate={{ x: checked ? 22 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={[
          'inline-block h-5 w-5 rounded-full shadow-lg',
          checked ? 'bg-panda-bg' : 'bg-panda-muted',
        ].join(' ')}
      />
    </button>
  )
}
