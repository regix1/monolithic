import { motion } from 'framer-motion'

/**
 * Cute inline SVG panda face with different expressions.
 *
 * @param {{
 *   mood: 'happy' | 'sleepy' | 'worried' | 'sad' | 'eating',
 *   size?: number,
 *   className?: string,
 *   animate?: boolean,
 * }} props
 */
export default function PandaStatus({ mood = 'happy', size = 48, className = '', animate = true }) {
  const Wrapper = animate ? motion.div : 'div'
  const wrapperProps = animate
    ? { animate: { y: [0, -4, 0] }, transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }
    : {}

  return (
    <Wrapper className={`inline-flex ${className}`} {...wrapperProps}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Panda is ${mood}`}
      >
        {/* Ears */}
        <circle cx="16" cy="14" r="10" fill="#3a3a3c" />
        <circle cx="48" cy="14" r="10" fill="#3a3a3c" />
        <circle cx="16" cy="14" r="6" fill="#2a2a2c" />
        <circle cx="48" cy="14" r="6" fill="#2a2a2c" />

        {/* Face */}
        <ellipse cx="32" cy="36" rx="22" ry="20" fill="#f0f0f2" />

        {/* Eye patches */}
        <ellipse cx="22" cy="30" rx="8" ry="7" fill="#3a3a3c" />
        <ellipse cx="42" cy="30" rx="8" ry="7" fill="#3a3a3c" />

        {mood === 'happy' && (
          <>
            {/* Happy closed eyes (curved smiles) */}
            <path d="M18 30 Q22 26 26 30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M38 30 Q42 26 46 30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Blush */}
            <circle cx="14" cy="38" r="4" fill="#fca5a5" opacity="0.35" />
            <circle cx="50" cy="38" r="4" fill="#fca5a5" opacity="0.35" />
            {/* Smile */}
            <path d="M26 42 Q32 48 38 42" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" fill="none" />
            {/* Nose */}
            <ellipse cx="32" cy="39" rx="3" ry="2" fill="#3a3a3c" />
          </>
        )}

        {mood === 'sleepy' && (
          <>
            {/* Sleeping closed eyes (horizontal lines) */}
            <line x1="18" y1="30" x2="26" y2="30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="38" y1="30" x2="46" y2="30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" />
            {/* Nose */}
            <ellipse cx="32" cy="39" rx="3" ry="2" fill="#3a3a3c" />
            {/* Tiny mouth */}
            <circle cx="32" cy="44" r="1.5" fill="#3a3a3c" opacity="0.5" />
            {/* Zzz */}
            <text x="46" y="16" fontSize="10" fontWeight="bold" fill="#4ade80" fontFamily="Quicksand, sans-serif" opacity="0.8">z</text>
            <text x="50" y="10" fontSize="8" fontWeight="bold" fill="#4ade80" fontFamily="Quicksand, sans-serif" opacity="0.6">z</text>
            <text x="53" y="5" fontSize="6" fontWeight="bold" fill="#4ade80" fontFamily="Quicksand, sans-serif" opacity="0.4">z</text>
          </>
        )}

        {mood === 'worried' && (
          <>
            {/* Open worried eyes */}
            <circle cx="22" cy="29" r="4" fill="#f0f0f2" />
            <circle cx="42" cy="29" r="4" fill="#f0f0f2" />
            <circle cx="22" cy="29" r="2" fill="#3a3a3c" />
            <circle cx="42" cy="29" r="2" fill="#3a3a3c" />
            {/* Raised inner eyebrows */}
            <line x1="18" y1="22" x2="24" y2="20" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" />
            <line x1="46" y1="22" x2="40" y2="20" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" />
            {/* Nose */}
            <ellipse cx="32" cy="39" rx="3" ry="2" fill="#3a3a3c" />
            {/* Small worried mouth */}
            <path d="M28 44 Q32 42 36 44" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        )}

        {mood === 'sad' && (
          <>
            {/* Sad eyes (downturned) */}
            <path d="M18 28 Q22 32 26 28" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M38 28 Q42 32 46 28" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Tear */}
            <ellipse cx="46" cy="36" rx="2" ry="3" fill="#42a5f5" opacity="0.6" />
            {/* Nose */}
            <ellipse cx="32" cy="39" rx="3" ry="2" fill="#3a3a3c" />
            {/* Frown */}
            <path d="M27 46 Q32 42 37 46" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        )}

        {mood === 'eating' && (
          <>
            {/* Happy closed eyes */}
            <path d="M18 30 Q22 26 26 30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M38 30 Q42 26 46 30" stroke="#f0f0f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Blush */}
            <circle cx="14" cy="38" r="4" fill="#fca5a5" opacity="0.35" />
            <circle cx="50" cy="38" r="4" fill="#fca5a5" opacity="0.35" />
            {/* Nose */}
            <ellipse cx="32" cy="39" rx="3" ry="2" fill="#3a3a3c" />
            {/* Eating mouth */}
            <ellipse cx="32" cy="45" rx="4" ry="3" fill="#3a3a3c" />
            {/* Bamboo stick */}
            <line x1="36" y1="44" x2="56" y2="38" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="58" cy="36" r="3" fill="#22c55e" opacity="0.7" />
            <circle cx="56" cy="40" r="2.5" fill="#4ade80" opacity="0.5" />
          </>
        )}
      </svg>
    </Wrapper>
  )
}
