import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps, useLocation } from '@tanstack/react-router'
import {
  BookOpenIcon,
  CalendarRangeIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  WifiOffIcon,
} from 'lucide-react'
import type * as React from 'react'

import { dashboardQuery, meQuery } from '@/api/queries'
import { DarkModeSwitch } from '@/components/AppearanceControl'
import { Brand } from '@/components/common'
import { useQuickAdd } from '@/components/QuickAddTask'
import { SidebarScene } from '@/components/SidebarScene'
import { Button } from '@/components/ui/button'
import { localDate, semesterWeek, semesterWeekLabel } from '@/lib/dates'
import { useActiveSemester, useAppSettings, useNow, useOnline } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type NavItem = { to: LinkProps['to']; label: string; icon: React.ComponentType<{ className?: string }> }

const mobileNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
  { to: '/tugas', label: 'Tugas', icon: ListTodoIcon },
  { to: '/matkul', label: 'Matkul', icon: BookOpenIcon },
  { to: '/materi', label: 'Materi', icon: FolderOpenIcon },
  { to: '/lainnya', label: 'Lainnya', icon: MenuIcon },
]

const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
  { to: '/tugas', label: 'Tugas', icon: ListTodoIcon },
  { to: '/matkul', label: 'Matkul', icon: BookOpenIcon },
  { to: '/materi', label: 'Materi', icon: FolderOpenIcon },
]

const recordNav: NavItem[] = [
  { to: '/nilai', label: 'Nilai', icon: GraduationCapIcon },
  { to: '/semester', label: 'Semester', icon: CalendarRangeIcon },
  { to: '/pengaturan', label: 'Pengaturan', icon: SettingsIcon },
]

function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="px-3 pt-3 md:px-0">
      <div
        role="status"
        className="mx-auto flex max-w-6xl items-center gap-2.5 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100"
      >
        <WifiOffIcon className="size-4 shrink-0" aria-hidden />
        Offline. Kamu lihat data terakhir; absen dan status tugas dikirim saat koneksi kembali.
      </div>
    </div>
  )
}

/** Tasks that need attention now: overdue plus due within 7 days. */
function useTaskCount() {
  const dash = useQuery(dashboardQuery)
  if (!dash.data) return undefined
  return { total: dash.data.overdue_tasks.length + dash.data.upcoming_tasks.length, overdue: dash.data.overdue_tasks.length }
}

function SideLink({ item, count }: { item: NavItem; count?: { total: number; overdue: number } }) {
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/' }}
      className="group flex h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      activeProps={{ className: 'bg-primary! text-primary-foreground!', 'aria-current': 'page' }}
    >
      <item.icon className="size-[1.15rem]" />
      <span className="flex-1">{item.label}</span>
      {count && count.total > 0 && (
        <span
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums',
            count.overdue > 0 ? 'bg-destructive text-white' : 'bg-brand text-brand-foreground',
          )}
        >
          {count.total}
          <span className="sr-only"> tugas perlu perhatian</span>
        </span>
      )}
    </Link>
  )
}

function Sidebar() {
  const count = useTaskCount()
  const { active } = useActiveSemester()
  const me = useQuery(meQuery)
  const username = me.data?.user.username ?? ''
  const { timeZone } = useAppSettings()
  const today = localDate(useNow(), timeZone)

  return (
    <aside className="sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col rounded-[2rem] bg-card p-4 shadow-xs ring-1 ring-black/[0.03] md:flex dark:ring-white/[0.06]">
      <Link to="/" className="mb-6 rounded-2xl px-2 pt-1" aria-label="Kumlod, ke Dashboard">
        <Brand />
      </Link>
      {/* Shrinks first on short screens so the menu stays fully visible. */}
      <SidebarScene className="relative mb-6 h-32 min-h-16 shrink-[100] overflow-hidden rounded-3xl ring-1 ring-black/5 dark:ring-white/10" />
      <nav aria-label="Navigasi utama" className="flex min-h-0 flex-auto flex-col gap-6 overflow-y-auto">
        <div className="grid gap-1">
          <p className="px-4 pb-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground/80 uppercase">Kuliah</p>
          {mainNav.map((item) => (
            <SideLink key={item.label} item={item} count={item.to === '/tugas' ? count : undefined} />
          ))}
        </div>
        <div className="grid gap-1">
          <p className="px-4 pb-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground/80 uppercase">Catatan</p>
          {recordNav.map((item) => (
            <SideLink key={item.label} item={item} />
          ))}
        </div>
      </nav>

      {active && (
        <Link
          to="/semester"
          className="group relative mt-4 overflow-hidden rounded-3xl bg-hero p-4 text-hero-foreground"
        >
          <span aria-hidden className="absolute -top-6 -right-6 size-20 rounded-full bg-brand" />
          <span aria-hidden className="absolute top-6 right-10 size-6 rounded-full border-4 border-[#ff6b4a]" />
          <span className="relative block text-[0.7rem] font-bold tracking-[0.14em] uppercase opacity-70">Semester aktif</span>
          <span className="relative mt-1 block pr-12 text-base leading-tight font-bold">{active.name}</span>
          <span className="relative mt-1 block text-xs font-semibold text-brand">
            {semesterWeekLabel(semesterWeek(active.start_date, active.end_date, today), active.start_date)}
          </span>
          <span className="relative mt-3 flex items-center justify-between text-xs opacity-80">
            {active.course_count} matkul · {active.total_credits} SKS
            <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      )}
      <DarkModeSwitch id="dark-mode-sidebar" className="mt-3 px-2" />
      {username && (
        <div className="mt-3 flex items-center gap-3 px-2">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-brand-foreground uppercase">
            {username.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{username}</span>
        </div>
      )}
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const quickAdd = useQuickAdd()
  // Top-level pages use the full width on large screens; detail pages and
  // forms keep the narrower reading width.
  const wide = useLocation({ select: (l) => ['/', '/tugas', '/matkul', '/materi', '/nilai', '/semester', '/pengaturan'].includes(l.pathname) })
  return (
    <div className="min-h-dvh md:flex md:gap-3 md:p-3">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:shadow"
      >
        Lewati ke konten
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="pt-safe sticky top-0 z-30">
          <OfflineBanner />
        </div>
        <main id="konten" className={cn('mx-auto w-full flex-1', wide ? 'max-w-[110rem]' : 'max-w-6xl', 'px-4 pt-6 pb-36 md:px-6 md:pt-6 md:pb-10 lg:px-8')}>
          {children}
        </main>
      </div>

      <Button
        variant="brand"
        size="icon"
        className="fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-[1.25rem] shadow-lg ring-4 ring-background md:hidden"
        onClick={() => quickAdd()}
        aria-label="Tambah tugas"
      >
        <PlusIcon className="size-6" strokeWidth={2.5} />
      </Button>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-full bg-hero p-1.5 text-hero-foreground shadow-xl md:hidden"
      >
        <ul className="grid grid-cols-5 gap-1">
          {mobileNav.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="flex h-14 flex-col items-center justify-center gap-1 rounded-full text-[0.68rem] font-semibold text-hero-foreground/65 transition-colors"
                activeProps={{ className: 'bg-brand! text-brand-foreground!', 'aria-current': 'page' }}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
