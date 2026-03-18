import AnimatedCounter from './AnimatedCounter'

export default function StatCard({
  label,
  value,
  color = '#4ade80',
  animateValue = false,
}) {
  return (
    <div className="bg-panda-surface border border-panda-border rounded-xl px-5 py-4 relative overflow-hidden">
      <p className="text-sm font-medium text-panda-dim uppercase tracking-wider leading-tight mb-2">
        {label}
      </p>

      {animateValue && typeof value === 'number' ? (
        <AnimatedCounter
          value={value}
          className="text-2xl font-bold leading-none tracking-tight font-mono"
          style={{ color }}
        />
      ) : (
        <p
          className="text-2xl font-bold leading-none tracking-tight font-mono"
          style={{ color }}
        >
          {value}
        </p>
      )}
    </div>
  )
}
