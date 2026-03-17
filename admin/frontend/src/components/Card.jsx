import { motion } from 'framer-motion'

/**
 * @param {{
 *   title?: string,
 *   subtitle?: string,
 *   icon?: import('react').ComponentType<{ size?: number, className?: string }>,
 *   children?: import('react').ReactNode,
 *   className?: string,
 *   accentColor?: string,
 *   hover?: boolean,
 *   glass?: boolean,
 *   animate?: boolean,
 * }} props
 */
export default function Card({
  title,
  subtitle,
  icon: Icon,
  children,
  className = '',
  accentColor = '#4ade80',
  hover = false,
  glass = false,
  animate = true,
}) {
  const Wrapper = animate ? motion.div : 'div'
  const wrapperProps = animate
    ? {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: 'easeOut' },
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        'rounded-xl p-4 border',
        glass
          ? 'glass-card'
          : 'bg-panda-surface border-panda-border',
        hover ? 'card-hover' : '',
        className,
      ].join(' ')}
    >
      {(Icon || title || subtitle) && (
        <div className="flex items-start gap-2.5 mb-3">
          {Icon && (
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{
                backgroundColor: `${accentColor}15`,
                border: `1px solid ${accentColor}25`,
              }}
            >
              <Icon size={15} style={{ color: accentColor }} />
            </div>
          )}

          {(title || subtitle) && (
            <div className="flex-1 min-w-0 pt-0.5">
              {title && (
                <h3 className="text-sm font-semibold text-panda-text leading-tight truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-panda-muted mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {children}
    </Wrapper>
  )
}
