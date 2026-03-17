/** Shared Framer Motion animation variants for the panda theme */

/** Stagger container — wrap children with item variants */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

/** Fade-up item (use inside staggerContainer) */
export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/** Soft bounce entrance */
export const bounceIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
}

/** Card hover spring */
export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.015,
    y: -3,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
}

/** Page crossfade (for AnimatePresence route transitions) */
export const pageFade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

/** Collapsible section expand/collapse */
export const collapse = {
  hidden: { height: 0, opacity: 0, overflow: 'hidden' },
  visible: {
    height: 'auto',
    opacity: 1,
    overflow: 'hidden',
    transition: { duration: 0.25, ease: 'easeInOut' },
  },
}

/** Stagger wrapper item with custom index delay */
export function staggerItem(index) {
  return {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { delay: index * 0.05, duration: 0.3, ease: 'easeOut' },
    },
  }
}
