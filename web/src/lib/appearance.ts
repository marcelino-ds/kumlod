import { useSyncExternalStore } from 'react'

/**
 * Light/dark mode, chosen per device: follow the system, or force light or
 * dark. public/appearance-init.js applies it before the first paint and must
 * stay in sync with STORAGE_KEY and barColors.
 */
export type Appearance = 'system' | 'light' | 'dark'
export type ResolvedAppearance = 'light' | 'dark'

const STORAGE_KEY = 'kumlod-appearance'
const CHANGE_EVENT = 'kumlod-appearance-change'

/** Browser UI color, matching --background in index.css. */
const barColors: Record<ResolvedAppearance, string> = { light: '#efefeb', dark: '#0f0f0e' }

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark'
}

function storedAppearance(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isAppearance(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function resolve(appearance: Appearance): ResolvedAppearance {
  if (appearance === 'system') return media().matches ? 'dark' : 'light'
  return appearance
}

function apply(appearance: Appearance) {
  const resolved = resolve(appearance)
  const root = document.documentElement
  // Switch instantly instead of letting every colored element fade on its own.
  root.classList.add('appearance-switching')
  root.classList.toggle('dark', resolved === 'dark')
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // "Sistem" keeps one color per scheme; a forced choice uses one color for both.
    const scheme = appearance === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : resolved
    meta.content = barColors[scheme]
  }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('appearance-switching')))
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function setAppearance(appearance: Appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, appearance)
  } catch {
    // Storage unavailable: the choice still applies until reload.
  }
  apply(appearance)
  notify()
}

/** Applies the stored choice and keeps "Sistem" in step with the OS. Call once at startup. */
export function initAppearance() {
  apply(storedAppearance())
  media().addEventListener('change', () => {
    if (storedAppearance() !== 'system') return
    apply('system')
    notify()
  })
  // Another tab changed the choice.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    apply(storedAppearance())
    notify()
  })
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

/** The chosen mode: "system", "light", or "dark". */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, storedAppearance, () => 'system')
}

/** Whether the page is light or dark right now. */
export function useResolvedAppearance(): ResolvedAppearance {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light',
  )
}
