import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Switch } from '@/components/ui/misc'
import { setAppearance, useAppearance, useResolvedAppearance, type Appearance } from '@/lib/appearance'
import { cn } from '@/lib/utils'

/** Quick light/dark switch. Turning it on or off overrides the system setting. */
export function DarkModeSwitch({ id, className }: { id: string; className?: string }) {
  const resolved = useResolvedAppearance()
  const dark = resolved === 'dark'
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 text-sm font-semibold">
        {dark ? <MoonIcon className="size-[1.15rem]" aria-hidden /> : <SunIcon className="size-[1.15rem]" aria-hidden />}
        Mode gelap
      </label>
      <Switch id={id} checked={dark} onCheckedChange={(on) => setAppearance(on ? 'dark' : 'light')} />
    </div>
  )
}

const options: { value: Appearance; label: string; icon: typeof SunIcon }[] = [
  { value: 'system', label: 'Sistem', icon: MonitorIcon },
  { value: 'light', label: 'Terang', icon: SunIcon },
  { value: 'dark', label: 'Gelap', icon: MoonIcon },
]

/** Three-way choice for Pengaturan: follow the system, light, or dark. */
export function AppearancePicker() {
  const appearance = useAppearance()
  return (
    <div role="radiogroup" aria-label="Mode tampilan" className="grid h-12 grid-cols-3 gap-1 rounded-full bg-muted p-1">
      {options.map((o) => {
        const on = appearance === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setAppearance(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <o.icon className="size-4" aria-hidden />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
