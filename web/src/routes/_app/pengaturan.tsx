import { useIsMutating, useQuery } from '@tanstack/react-query'
import { createFileRoute, useBlocker } from '@tanstack/react-router'
import {
  BellRingIcon,
  CheckIcon,
  GlobeIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  UserCheckIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { client, unwrap } from '@/api/client'
import { meQuery } from '@/api/queries'
import { ErrorState, LoadingList } from '@/components/common'
import { heroChipClass, HeroStat, PageHero } from '@/components/page-hero'
import { SettingsProvider, useSettingsCtx } from '@/components/settings-kit'
import {
  AccountSection,
  AttendanceSection,
  GeneralSection,
  GradesSection,
  InstallSection,
  NotificationsSection,
  pushNeedsAttention,
  pushStateLabel,
  showInstall,
  usePushDevice,
  type PushState,
} from '@/components/settings-sections'
import { useAppSettings } from '@/lib/hooks'
import { timeZoneShort } from '@/lib/settings'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/pengaturan')({
  component: () => (
    <SettingsProvider>
      <SettingsPage />
    </SettingsProvider>
  ),
})

type NavItem = { id: string; label: string; icon: LucideIcon }

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

function SettingsPage() {
  const settings = useAppSettings()
  const push = usePushDevice()
  const { dirty } = useSettingsCtx()
  const install = useMemo(showInstall, [])

  // Warn before leaving with an unsaved grade scale, IPK, or password.
  useBlocker({
    shouldBlockFn: () => !window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?'),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  })

  const nav: NavItem[] = [
    { id: 'notifikasi', label: 'Notifikasi', icon: BellRingIcon },
    { id: 'nilai', label: 'Nilai dan IPK', icon: GraduationCapIcon },
    { id: 'absensi', label: 'Absensi', icon: UserCheckIcon },
    { id: 'umum', label: 'Tampilan dan waktu', icon: SlidersHorizontalIcon },
    { id: 'akun', label: 'Akun', icon: KeyRoundIcon },
    ...(install ? [{ id: 'install', label: 'Install', icon: SmartphoneIcon }] : []),
  ]
  const loaded = settings.data !== undefined
  const active = useActiveSection(loaded ? nav.map((n) => n.id) : [])

  // Links such as /pengaturan#baseline land once the sections exist.
  useEffect(() => {
    if (!loaded || !window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [loaded])

  return (
    <div className="mx-auto max-w-[96rem]">
      <SettingsHeader
        pushState={push.state}
        confirmed={settings.data?.grade_scale_confirmed}
        timezone={settings.data?.timezone}
        onJump={scrollTo}
      />

      <div className="grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6">
        <SectionNav items={nav} active={active} />
        {/* Two columns once the content area is wide enough (large monitors). */}
        <div className="@container min-w-0">
          {settings.data === undefined ? (
            settings.isError ? (
              <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
            ) : (
              <LoadingList rows={4} />
            )
          ) : (
            <div className="grid gap-5 @min-[66rem]:grid-cols-2 @min-[66rem]:items-start">
              <div className="grid min-w-0 gap-5">
                <NotificationsSection settings={settings.data} push={push} />
                <GradesSection settings={settings.data} />
              </div>
              <div className="grid min-w-0 gap-5">
                <AttendanceSection settings={settings.data} />
                <GeneralSection settings={settings.data} />
                <AccountSection />
                {install && <InstallSection />}
              </div>
            </div>
          )}
          <About />
        </div>
      </div>
    </div>
  )
}

/** Id of the section nearest the top of the viewport. */
function useActiveSection(ids: string[]): string | undefined {
  const [active, setActive] = useState<string>()
  const key = ids.join(',')
  useEffect(() => {
    const els = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        const first = els.find((el) => visible.has(el.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-15% 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [key])
  return active
}

// --------------------------------------------------------------- header

/** Page header card: who is signed in, save status, and what still needs attention. */
function SettingsHeader({
  pushState,
  confirmed,
  timezone,
  onJump,
}: {
  pushState: PushState
  confirmed?: boolean
  timezone?: string
  onJump: (id: string) => void
}) {
  const me = useQuery(meQuery)
  const saving = useIsMutating({ mutationKey: ['settings'] }) > 0
  const username = me.data?.user.username

  const status = (
    <>
      {saving ? <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden /> : <CheckIcon className="size-3.5 text-brand" aria-hidden />}
      {saving ? 'Menyimpan' : 'Tersimpan'}
    </>
  )

  return (
    <PageHero
      icon={SettingsIcon}
      title="Pengaturan"
      eyebrow={
        username && (
          <span className={heroChipClass}>
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            {username}
          </span>
        )
      }
      aside={
        <p role="status" className={cn(heroChipClass, 'text-hero-foreground/80')}>
          {status}
        </p>
      }
      action={
        <p role="status" className={cn(heroChipClass, 'h-9 px-4 text-hero-foreground/80')}>
          {status}
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <HeroStat
          kind="text"
          label="Notifikasi"
          hint="di perangkat ini"
          value={pushStateLabel[pushState]}
          alert={pushNeedsAttention(pushState)}
          accent={pushState === 'on' ? 'text-brand' : undefined}
          icon={BellRingIcon}
          onClick={() => onJump('notifikasi')}
        />
        <HeroStat
          kind="text"
          label="Skala nilai"
          hint={confirmed === false ? 'cocokkan dengan KHS' : 'sesuai kampus'}
          value={confirmed === undefined ? undefined : confirmed ? 'Sudah dicek' : 'Perlu dicek'}
          alert={confirmed === false}
          accent={confirmed ? 'text-brand' : undefined}
          icon={GraduationCapIcon}
          onClick={() => onJump('nilai')}
        />
        <HeroStat
          kind="text"
          label="Zona waktu"
          hint={timezone}
          value={timezone ? timeZoneShort(timezone) : undefined}
          icon={GlobeIcon}
          onClick={() => onJump('umum')}
        />
      </div>
      <p className="mt-3 hidden text-xs font-semibold text-hero-foreground/60 md:block">
        Sakelar dan pilihan tersimpan otomatis. Skala nilai, IPK, dan password pakai tombol Simpan.
      </p>
    </PageHero>
  )
}
// ------------------------------------------------------------------ nav

/** Sticky list of sections on desktop, a scrollable chip row on phones. */
function SectionNav({ items, active }: { items: NavItem[]; active?: string }) {
  return (
    <nav aria-label="Bagian pengaturan" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 lg:mx-0 lg:grid lg:gap-1 lg:overflow-visible lg:px-0">
        {items.map((item) => {
          const on = active === item.id
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => scrollTo(item.id)}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'inline-flex h-11 w-full items-center gap-2.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap shadow-xs ring-1 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 lg:shadow-none lg:ring-0',
                  on
                    ? 'bg-primary text-primary-foreground ring-transparent'
                    : 'bg-card text-muted-foreground ring-black/[0.04] hover:text-foreground lg:bg-transparent lg:hover:bg-foreground/5 dark:ring-white/[0.06]',
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function About() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => unwrap(client.GET('/api/health')), staleTime: Infinity })
  return (
    <p className="mt-6 pb-2 text-center text-xs text-muted-foreground">
      Kumlod {health.data ? `versi ${health.data.version}` : ''} · data kamu tersimpan di server sendiri
    </p>
  )
}
