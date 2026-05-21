/**
 * Generic tab bar with severity-tinted active state. Used by:
 *   - Logs IssuesPanel (Errors / No-Slice)
 *   - Upstream Recovery Events (Direct Fallback / No-Slice)
 *
 * Each tab carries an optional icon, label, count badge, and tone.
 * `tone` picks the active-state color family:
 *   err    — red    (errors, hard failures)
 *   warn   — amber  (warnings, transient issues)
 *   bamboo — green  (healthy / success)
 *   info   — blue   (informational / neutral; default)
 *
 * @typedef {Object} TabDescriptor
 * @property {string} value                   unique tab identifier
 * @property {string} label                   visible text
 * @property {any}    [icon]                  optional lucide icon component
 * @property {number} [count]                 optional count badge (null/undefined → hidden)
 * @property {'err' | 'warn' | 'bamboo' | 'info'} [tone]
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   tabs: TabDescriptor[],
 * }} props
 */
export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="flex border-b border-panda-border">
      {tabs.map((t) => (
        <TabButton
          key={t.value}
          active={value === t.value}
          count={t.count}
          icon={t.icon}
          label={t.label}
          tone={t.tone ?? 'info'}
          onClick={() => onChange(t.value)}
        />
      ))}
    </div>
  )
}

const TONES = {
  err:    { text: 'text-err',    bg: 'bg-err/5',    underline: 'bg-err',    badge: 'bg-err/15 text-err' },
  warn:   { text: 'text-warn',   bg: 'bg-warn/5',   underline: 'bg-warn',   badge: 'bg-warn/15 text-warn' },
  bamboo: { text: 'text-bamboo', bg: 'bg-bamboo/5', underline: 'bg-bamboo', badge: 'bg-bamboo/15 text-bamboo' },
  info:   { text: 'text-info',   bg: 'bg-info/5',   underline: 'bg-info',   badge: 'bg-info/15 text-info' },
}

function TabButton({ active, count, icon: Icon, label, tone, onClick }) {
  const t = TONES[tone] ?? TONES.info
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${
        active ? `${t.text} ${t.bg}` : 'text-panda-dim hover:text-panda-text hover:bg-panda-elevated/30'
      }`}
    >
      {Icon && <Icon size={16} />}
      <span>{label}</span>
      {count != null && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-mono ${
            active ? t.badge : 'bg-panda-elevated text-panda-dim'
          }`}
        >
          {count}
        </span>
      )}
      {active && <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.underline}`} />}
    </button>
  )
}
