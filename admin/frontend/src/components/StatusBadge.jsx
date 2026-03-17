/**
 * @param {{
 *   status: 'running' | 'stopped' | 'warning' | 'error',
 *   label?: string,
 *   showPulse?: boolean,
 * }} props
 */
export default function StatusBadge({ status, label, showPulse = true }) {
  const config = {
    running: {
      dot: 'bg-bamboo',
      pulse: 'breathe-green',
      text: 'text-bamboo',
      bg: 'bg-bamboo/10',
      border: 'border-bamboo/20',
      defaultLabel: 'Running',
    },
    stopped: {
      dot: 'bg-err',
      pulse: 'breathe-red',
      text: 'text-err',
      bg: 'bg-err/10',
      border: 'border-err/20',
      defaultLabel: 'Stopped',
    },
    warning: {
      dot: 'bg-warn',
      pulse: 'breathe-amber',
      text: 'text-warn',
      bg: 'bg-warn/10',
      border: 'border-warn/20',
      defaultLabel: 'Warning',
    },
    error: {
      dot: 'bg-err',
      pulse: 'breathe-red',
      text: 'text-err',
      bg: 'bg-err/10',
      border: 'border-err/20',
      defaultLabel: 'Error',
    },
  }

  const { dot, pulse, text, bg, border, defaultLabel } = config[status] ?? config.stopped
  const displayLabel = label ?? defaultLabel

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border',
        bg,
        border,
        text,
      ].join(' ')}
    >
      <span
        className={[
          'w-1.5 h-1.5 rounded-full shrink-0',
          dot,
          showPulse ? pulse : '',
        ].join(' ')}
      />
      {displayLabel}
    </span>
  )
}
