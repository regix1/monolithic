import { Link } from 'react-router-dom'
import { Tag } from 'lucide-react'

/**
 * A small chip that renders a cache-service name (steam, blizzard, epic …).
 * Used in tables, banners, and any inline "owned by" indicator.
 *
 * When `to` is supplied the badge becomes a `<Link>` and gets hover affordances;
 * otherwise it renders as a passive `<span>`. Empty/falsy `service` renders as
 * a dim em-dash so a table column never collapses to nothing.
 *
 * @param {{
 *   service?: string,
 *   to?: string,
 *   dense?: boolean,
 *   tone?: 'bamboo' | 'warn' | 'err',
 *   trailing?: import('react').ReactNode,
 *   title?: string,
 * }} props
 */
export default function ServiceBadge({
  service,
  to,
  dense = false,
  tone = 'bamboo',
  trailing,
  title,
}) {
  if (!service) {
    return <span className="text-panda-dim/60 font-mono text-xs">—</span>
  }

  const padding = dense ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  const toneClasses = TONE_MAP[tone] ?? TONE_MAP.bamboo
  const interactive = to ? 'hover:bg-opacity-100 hover:border-current/60 transition-colors' : ''
  const baseClass = `inline-flex items-center gap-1 rounded-md ${toneClasses.bg} border ${toneClasses.border} ${padding} text-xs font-mono font-medium ${toneClasses.text} ${interactive}`

  const content = (
    <>
      <Tag size={10} className="opacity-70" />
      <span>{service}</span>
      {trailing != null && <span className="opacity-70">{trailing}</span>}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={baseClass} title={title ?? `View ${service} in Logs`}>
        {content}
      </Link>
    )
  }
  return (
    <span className={baseClass} title={title}>
      {content}
    </span>
  )
}

const TONE_MAP = {
  bamboo: {
    bg: 'bg-bamboo/10',
    border: 'border-bamboo/25',
    text: 'text-bamboo',
  },
  warn: {
    bg: 'bg-warn/10',
    border: 'border-warn/30',
    text: 'text-warn',
  },
  err: {
    bg: 'bg-err/10',
    border: 'border-err/30',
    text: 'text-err',
  },
}
