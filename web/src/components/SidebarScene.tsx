import type * as React from 'react'

/**
 * Decorative "live wallpaper" for the sidebar: an anime-style rooftop scene.
 * Light mode is golden hour (clouds, birds, sakura); dark mode is night
 * (stars, crescent moon, shooting star, lit windows). Pure SVG + CSS
 * animations (see .scene-* in index.css); motion stops with reduced motion.
 */

const v = (vars: Record<string, string>) => vars as React.CSSProperties

const stars: [number, number, number, string][] = [
  [12, 10, 0.9, '0s'],
  [30, 24, 0.6, '-1.2s'],
  [48, 8, 1.1, '-2.1s'],
  [70, 18, 0.7, '-0.6s'],
  [92, 6, 0.9, '-2.7s'],
  [108, 28, 0.6, '-1.6s'],
  [126, 12, 1, '-0.3s'],
  [140, 40, 0.6, '-2.4s'],
  [196, 12, 0.9, '-1s'],
  [212, 30, 0.7, '-1.9s'],
  [186, 50, 0.6, '-0.8s'],
  [20, 44, 0.7, '-2.9s'],
  [58, 40, 0.6, '-1.4s'],
  [100, 48, 0.8, '-0.2s'],
]

const windows: [number, number, string][] = [
  [27, 92, '0s'],
  [31, 96, '-1.3s'],
  [77, 88, '-2.6s'],
  [117, 92, '-0.7s'],
  [121, 97, '-3.4s'],
  [124, 92, '-1.9s'],
  [150, 98, '-4.1s'],
  [178, 95, '-2.2s'],
  [182, 100, '-0.4s'],
]

const petals: [number, string, string][] = [
  [30, '9s', '0s'],
  [62, '11s', '-4s'],
  [95, '8s', '-6.5s'],
  [120, '12s', '-2s'],
  [148, '9.5s', '-7.5s'],
  [170, '10.5s', '-1s'],
  [196, '8.5s', '-5s'],
  [215, '11.5s', '-8.5s'],
  [238, '10s', '-3s'],
]

/** One soft cumulus cloud around 0,0. */
function Cloud({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <ellipse cx="0" cy="0" rx="22" ry="8" />
      <ellipse cx="-12" cy="-5" rx="11" ry="8" />
      <ellipse cx="7" cy="-8" rx="13" ry="10" />
      <ellipse cx="22" cy="-2" rx="10" ry="6.5" />
    </g>
  )
}

export function SidebarScene({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <svg viewBox="0 0 224 128" preserveAspectRatio="xMidYMid slice" className="scene absolute inset-0 size-full">
        <defs>
          <linearGradient id="kscene-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7cc4f2" />
            <stop offset="0.55" stopColor="#ffd8b4" />
            <stop offset="1" stopColor="#ffa9a0" />
          </linearGradient>
          <linearGradient id="kscene-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#070b26" />
            <stop offset="0.55" stopColor="#231d57" />
            <stop offset="1" stopColor="#4f3577" />
          </linearGradient>
          <radialGradient id="kscene-sun">
            <stop offset="0" stopColor="#fff4cf" />
            <stop offset="0.4" stopColor="#ffd9a0" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="kscene-moon">
            <stop offset="0" stopColor="#fff2c8" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="kscene-tail" gradientUnits="userSpaceOnUse" x1="20" y1="4" x2="44" y2="15">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
          <mask id="kscene-crescent">
            <rect width="224" height="128" fill="#fff" />
            <circle cx="171" cy="26" r="9" fill="#000" />
          </mask>
        </defs>

        {/* Golden hour */}
        <g className="dark:hidden">
          <rect width="224" height="128" fill="url(#kscene-day)" />
          <circle className="scene-glow" cx="158" cy="86" r="46" fill="url(#kscene-sun)" />
          <circle cx="158" cy="86" r="12" fill="#fff6d8" />
          {[
            ['0s', 30],
            ['-9s', 38],
          ].map(([delay, y], i) => (
            <g key={i} transform={`translate(0 ${y})`}>
              <g className="scene-fly" style={v({ '--delay': String(delay) })}>
                <path className="scene-flap" d="M0 0q2.5-2.5 5 0q2.5-2.5 5 0" fill="none" stroke="#6b5470" strokeWidth="0.9" strokeLinecap="round" />
              </g>
            </g>
          ))}
        </g>

        {/* Night */}
        <g className="hidden dark:inline">
          <rect width="224" height="128" fill="url(#kscene-night)" />
          {stars.map(([cx, cy, r, delay]) => (
            <circle key={`${cx}-${cy}`} className="scene-twinkle" style={v({ '--delay': delay })} cx={cx} cy={cy} r={r} fill="#fff" />
          ))}
          <circle className="scene-glow" cx="166" cy="30" r="30" fill="url(#kscene-moon)" />
          <circle cx="166" cy="30" r="10" fill="#fff3cf" mask="url(#kscene-crescent)" />
          <g className="scene-shoot">
            <path d="M20 4L44 15" stroke="url(#kscene-tail)" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="44" cy="15" r="1.1" fill="#fff" />
          </g>
        </g>

        {/* Clouds drift in both modes; moonlit wisps at night. */}
        <g className="fill-white opacity-90 dark:fill-[#a99ae0] dark:opacity-25">
          <g transform="translate(150 40)">
            <g className="scene-drift" style={v({ '--d': '70s', '--delay': '-20s' })}>
              <Cloud />
            </g>
          </g>
          <g transform="translate(60 22)">
            <g className="scene-drift" style={v({ '--d': '95s', '--delay': '-55s' })}>
              <Cloud scale={0.7} />
            </g>
          </g>
          <g transform="translate(205 60)">
            <g className="scene-drift" style={v({ '--d': '80s', '--delay': '-5s' })}>
              <Cloud scale={0.55} />
            </g>
          </g>
        </g>

        {/* Far city skyline */}
        <path
          className="fill-[#e8a0a8] dark:fill-[#29205a]"
          d="M0 128V104h8v-8h10v6h6V88h12v10h8v-6h10v12h6v-4h12V90h4v-6h4v6h4v10h10v-8h12v12h8V88h14v14h6v-6h10v8h12V92h10v10h8v-6h10v10h12v-8h28v30z"
        />
        <g className="hidden dark:inline">
          {windows.map(([x, y, delay]) => (
            <rect key={`${x}-${y}`} className="scene-flicker" style={v({ '--delay': delay })} x={x} y={y} width="1.8" height="2.2" fill="#ffe7a0" />
          ))}
        </g>

        {/* Rooftop wall, utility pole, and wires */}
        <g className="fill-[#4a3255] stroke-[#4a3255] dark:fill-[#0c0a20] dark:stroke-[#0c0a20]">
          <path d="M0 128V112H96V108H224V128Z" stroke="none" />
          <rect x="186" y="34" width="3" height="80" stroke="none" />
          <rect x="176" y="42" width="23" height="2.2" rx="1" stroke="none" />
          <rect x="179" y="48" width="17" height="1.8" rx="0.9" stroke="none" />
          <path d="M177 43Q100 66-10 52M177 49Q110 72-10 62M198 43Q220 49 240 47" fill="none" strokeWidth="0.7" />

          {/* A cat watching the sky */}
          <ellipse cx="52" cy="106" rx="6" ry="6.5" stroke="none" />
          <circle cx="52" cy="97.5" r="4.2" stroke="none" />
          <path d="M48.3 95.5L49 91L51.3 94.2ZM55.7 95.5L55 91L52.7 94.2Z" stroke="none" />
          <path className="scene-tail" d="M57 110C63 110 64 103 61 99" fill="none" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <g className="hidden dark:inline" fill="#ffe28a">
          <circle cx="50.4" cy="97.6" r="0.6" />
          <circle cx="53.6" cy="97.6" r="0.6" />
        </g>

        {/* Sakura petals */}
        <g className="fill-[#ffc1d4] dark:fill-[#f3c9ff]">
          {petals.map(([x, d, delay]) => (
            <g key={x} transform={`translate(${x} 0)`}>
              <path className="scene-petal" style={v({ '--d': d, '--delay': delay })} d="M0-2.2C2.2-2.2 3.2 0 0 2.6C-3.2 0-2.2-2.2 0-2.2Z" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
