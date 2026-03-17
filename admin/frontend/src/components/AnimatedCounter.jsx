import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Animated count-up number component.
 * Counts from 0 to `value` on mount, then smoothly transitions to new values.
 *
 * @param {{
 *   value: number,
 *   duration?: number,
 *   decimals?: number,
 *   prefix?: string,
 *   suffix?: string,
 *   className?: string,
 *   formatter?: (n: number) => string,
 * }} props
 */
export default function AnimatedCounter({
  value,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  formatter,
}) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const fromRef = useRef(0)

  const animateTo = useCallback(
    (target) => {
      const from = fromRef.current
      startRef.current = null

      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      function step(timestamp) {
        if (!startRef.current) startRef.current = timestamp
        const elapsed = timestamp - startRef.current
        const progress = Math.min(elapsed / duration, 1)

        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = from + (target - from) * eased

        setDisplay(current)

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          fromRef.current = target
        }
      }

      rafRef.current = requestAnimationFrame(step)
    },
    [duration],
  )

  useEffect(() => {
    animateTo(value)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, animateTo])

  const formatted = formatter
    ? formatter(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString()

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
