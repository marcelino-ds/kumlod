import { cn } from '@/lib/utils'

const ink = '#1c1c1a'
const lime = '#d6f25a'
const coral = '#ff6b4a'
const sky = '#5ec8f2'
const purple = '#a78bfa'

/** Calendar cells, row by row. */
const cells = [lime, '#fff', sky, '#fff', purple, lime, '#fff', coral, '#fff', sky, lime, '#fff']

/** A 4-point sparkle centered at 0,0. */
const sparkle = 'M0-12C1-3 3-1 12 0C3 1 1 3 0 12C-1 3-3 1-12 0C-3-1-1-3 0-12z'

/** Decorative illustration for the login page: a playful class planner. */
export function LoginIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 470"
      aria-hidden
      className={cn('h-auto w-full', className)}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* Ground shadow */}
      <ellipse cx="200" cy="446" rx="150" ry="13" className="fill-black/[0.07] dark:fill-black/30" />

      {/* Planner */}
      <g transform="rotate(-6 190 255)">
        <rect x="70" y="140" width="240" height="230" rx="28" fill="#fff" stroke={ink} strokeWidth="3.5" />
        <path d="M70 168a28 28 0 0 1 28-28h184a28 28 0 0 1 28 28v34H70z" fill={coral} stroke={ink} strokeWidth="3.5" />
        <rect x="120" y="122" width="14" height="38" rx="7" fill={ink} />
        <rect x="246" y="122" width="14" height="38" rx="7" fill={ink} />
        {cells.map((fill, i) => (
          <rect
            key={i}
            x={95 + (i % 4) * 50}
            y={218 + Math.floor(i / 4) * 50}
            width="40"
            height="40"
            rx="11"
            fill={fill}
            stroke={ink}
            strokeWidth="2.5"
          />
        ))}
      </g>

      {/* Check badge */}
      <circle cx="305" cy="360" r="50" fill={lime} stroke={ink} strokeWidth="3.5" />
      <path d="M282 360l16 16 30-32" fill="none" stroke={ink} strokeWidth="9" />

      {/* Graduation cap */}
      <g transform="rotate(10 320 75)">
        {/* Lighter in dark mode so the cap doesn't vanish into the panel. */}
        <path d="M284 78v20c0 9 16 16 36 16s36-7 36-16V78l-36 15z" className="fill-[#3a3a36] dark:fill-[#6b6b64]" stroke={ink} strokeWidth="3" />
        <path d="M320 40l58 26-58 26-58-26z" className="fill-[#1c1c1a] dark:fill-[#8a8a82]" stroke={ink} strokeWidth="3" />
        <path d="M320 66l40 12v26" fill="none" stroke={lime} strokeWidth="3.5" />
        <circle cx="360" cy="108" r="6" fill={lime} />
      </g>

      {/* Bell */}
      <g transform="rotate(-14 58 95)">
        <path d="M58 62c-16 0-28 13-28 30v18l-8 12h72l-8-12V92c0-17-12-30-28-30z" fill={sky} stroke={ink} strokeWidth="3.5" />
        <circle cx="58" cy="130" r="7" fill={ink} />
        <circle cx="82" cy="66" r="8" fill={coral} stroke={ink} strokeWidth="3" />
      </g>

      {/* Little shapes */}
      <path d="M50 392v34a20 8 0 0 0 40 0v-34" fill={purple} stroke={ink} strokeWidth="3" />
      <ellipse cx="70" cy="392" rx="20" ry="8" fill="#c4b5fd" stroke={ink} strokeWidth="3" />
      <path d="M140 384L116 432a24 8 0 0 0 48 0z" fill="#34d399" stroke={ink} strokeWidth="3" />
      <circle cx="362" cy="222" r="16" fill="#ff9a3c" stroke={ink} strokeWidth="3" />
      <circle cx="356" cy="216" r="4" fill="#fff" opacity="0.8" />

      {/* Sparkles */}
      <path d={sparkle} transform="translate(36 250)" className="fill-[#1c1c1a] dark:fill-white/50" />
      <path d={sparkle} transform="translate(372 300) scale(0.7)" className="fill-[#1c1c1a] dark:fill-white/50" />
      <path d={sparkle} transform="translate(200 70) scale(0.6)" fill={coral} />
    </svg>
  )
}
