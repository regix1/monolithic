import { TrendingUp, TrendingDown } from 'lucide-react'
import { motion } from 'framer-motion'
import AnimatedCounter from './AnimatedCounter'

/**
 * @param {{
 *   label: string,
 *   value: string | number,
 *   icon?: import('react').ComponentType<{ size?: number, className?: string }>,
 *   trend?: 'up' | 'down',
 *   color?: string,
 *   animate?: boolean,
 *   animateValue?: boolean,
 * }} props
 */
export default function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  color = '#4ade80',
  animate = true,
  animateValue = false,
}) {
  const Wrapper = animate ? motion.div : 'div'
  const wrapperProps = animate
    ? {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.3, ease: 'easeOut' },
        whileHover: { scale: 1.02, y: -1 },
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className="bg-panda-surface border border-panda-border rounded-xl px-4 py-3 card-hover relative overflow-hidden"
    >
      {/* Corner glow */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-bl-full opacity-[0.07] pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent)` }}
      />

      {/* Top row: label + icon */}
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-xs font-medium text-panda-dim uppercase tracking-wider leading-tight">
          {label}
        </p>
        {Icon && (
          <div
            className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
            style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}
          >
            <Icon size={13} style={{ color }} />
          </div>
        )}
      </div>

      {/* Value + trend */}
      <div className="flex items-end gap-1.5">
        {animateValue && typeof value === 'number' ? (
          <AnimatedCounter
            value={value}
            className="text-xl font-bold leading-none tracking-tight font-mono"
            style={{ color }}
          />
        ) : (
          <p
            className="text-xl font-bold leading-none tracking-tight font-mono"
            style={{ color }}
          >
            {value}
          </p>
        )}

        {trend && (
          <span
            className={[
              'flex items-center gap-0.5 text-xs font-medium mb-0.5',
              trend === 'up' ? 'text-bamboo' : 'text-err',
            ].join(' ')}
          >
            {trend === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          </span>
        )}
      </div>
    </Wrapper>
  )
}
