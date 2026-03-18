export default function Card({
  title,
  subtitle,
  icon: Icon,
  children,
  className = '',
  accentColor = '#4ade80',
}) {
  return (
    <div
      className={[
        'rounded-xl p-5 border bg-panda-surface border-panda-border',
        className,
      ].join(' ')}
    >
      {(Icon || title || subtitle) && (
        <div className="flex items-start gap-3 mb-4">
          {Icon && (
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              style={{
                backgroundColor: `${accentColor}15`,
                border: `1px solid ${accentColor}25`,
              }}
            >
              <Icon size={18} style={{ color: accentColor }} />
            </div>
          )}

          {(title || subtitle) && (
            <div className="flex-1 min-w-0 pt-0.5">
              {title && (
                <h3 className="text-base font-semibold text-panda-text leading-tight truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-panda-muted mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  )
}
