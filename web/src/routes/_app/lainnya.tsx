import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowUpRightIcon, CalendarRangeIcon, GraduationCapIcon, LogOutIcon, SettingsIcon } from 'lucide-react'
import type * as React from 'react'

import { meQuery, useLogout } from '@/api/queries'
import { Brand } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useActiveSemester } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/lainnya')({
  component: MorePage,
})

const items: {
  to: '/nilai' | '/semester' | '/pengaturan'
  label: string
  description: string
  icon: React.ReactNode
  tone: string
}[] = [
  {
    to: '/nilai',
    label: 'Nilai',
    description: 'IPS, IPK, dan simulasi target',
    icon: <GraduationCapIcon />,
    tone: 'bg-violet-200 text-violet-950 dark:bg-violet-900/60 dark:text-violet-100',
  },
  {
    to: '/semester',
    label: 'Semester',
    description: 'Buat, aktifkan, dan arsipkan',
    icon: <CalendarRangeIcon />,
    tone: 'bg-sky-200 text-sky-950 dark:bg-sky-900/60 dark:text-sky-100',
  },
  {
    to: '/pengaturan',
    label: 'Pengaturan',
    description: 'Notifikasi, skala nilai, absensi, akun',
    icon: <SettingsIcon />,
    tone: 'bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100',
  },
]

function MorePage() {
  const me = useQuery(meQuery)
  const logout = useLogout()
  const router = useRouter()
  const { active } = useActiveSemester()
  const username = me.data?.user.username ?? ''

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Brand />
      </div>

      <div className="relative mb-4 overflow-hidden rounded-[2rem] bg-hero p-5 text-hero-foreground">
        <span aria-hidden className="absolute -top-8 -right-8 size-28 rounded-full bg-brand" />
        <div className="relative flex items-center gap-4">
          <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-extrabold uppercase">
            {username.slice(0, 1) || '?'}
          </span>
          <div className="min-w-0 pr-16">
            <p className="text-xs font-semibold opacity-70">Masuk sebagai</p>
            <h1 className="truncate text-xl font-extrabold tracking-tight">{username || 'Kumlod'}</h1>
            {active && <p className="truncate text-sm opacity-75">{active.name}</p>}
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <li key={item.to} className={cn(i === items.length - 1 && items.length % 2 === 1 && 'col-span-2')}>
            <Link
              to={item.to}
              className={cn('group flex h-full min-h-36 flex-col justify-between gap-4 rounded-[1.75rem] p-4 transition-transform hover:-translate-y-0.5', item.tone)}
            >
              <span className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white/60 dark:bg-black/20 [&_svg]:size-5">{item.icon}</span>
                <ArrowUpRightIcon className="size-5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </span>
              <span>
                <span className="block text-lg leading-tight font-extrabold">{item.label}</span>
                <span className="mt-0.5 block text-sm opacity-75">{item.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        disabled={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSettled: () => void router.navigate({ to: '/login' }) })}
      >
        <LogOutIcon /> {logout.isPending ? 'Keluar...' : 'Keluar'}
      </Button>
    </>
  )
}
