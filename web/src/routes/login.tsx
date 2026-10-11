import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { BellRingIcon, CheckIcon, MousePointer2Icon, WifiOffIcon } from 'lucide-react'
import { useState } from 'react'

import { qk, useLogin } from '@/api/queries'
import { Brand, Field, FormError } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/lib/hooks'

/** Only same-site paths are allowed as a redirect target. */
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return undefined
  }
  return value
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: safeRedirect(search.redirect) }),
  beforeLoad: ({ context, search }) => {
    if (context.queryClient.getQueryData(qk.me)) throw redirect({ href: search.redirect ?? '/' })
  },
  component: LoginPage,
})

const features = ['Absen 1 tap', 'Reminder deadline', 'Target nilai', 'Bisa offline']

function LoginPage() {
  const { redirect: target } = Route.useSearch()
  const router = useRouter()
  const login = useLogin()
  const online = useOnline()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate(
      { username: username.trim(), password },
      { onSuccess: () => router.history.push(target ?? '/') },
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-3 md:p-6">
      <div className="grid w-full max-w-5xl gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-5">
        <section className="relative overflow-hidden rounded-[2.25rem] bg-brand p-6 text-brand-foreground md:min-h-[36rem] md:p-10">
          <div aria-hidden className="dot-grid absolute inset-0 text-black/[0.07]" />
          <div aria-hidden className="absolute -right-24 -bottom-28 hidden size-80 rounded-full bg-hero md:block" />
          <div aria-hidden className="absolute top-10 right-10 hidden size-14 rounded-full border-[10px] border-[#ff6b4a] md:block" />

          <div className="relative">
            <Brand />
            <h1 className="mt-10 text-[2.6rem] leading-[0.95] font-extrabold tracking-tighter md:mt-16 md:text-6xl">
              Kuliah beres,
              <br />
              nilai{' '}
              <span className="inline-block -rotate-2 rounded-full bg-hero px-4 pb-1 text-brand">aman.</span>
            </h1>
            <p className="mt-5 max-w-sm text-base font-medium opacity-80">
              Jadwal, absen, tugas, materi, dan IPK dalam satu asisten kuliah pribadi.
            </p>
            <ul className="mt-6 flex max-w-md flex-wrap gap-2">
              {features.map((f) => (
                <li key={f} className="rounded-full bg-white/55 px-3.5 py-1.5 text-sm font-semibold dark:bg-black/15">
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Playful floating "cursors", echoing what the app does for you. */}
          <div aria-hidden className="pointer-events-none absolute right-6 bottom-8 hidden flex-col items-end gap-4 md:flex">
            <span className="flex items-center gap-1">
              <MousePointer2Icon className="size-6 -scale-x-100 fill-[#ff6b4a] text-[#ff6b4a]" />
              <span className="flex items-center gap-1.5 rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-bold text-white shadow-lg">
                <CheckIcon className="size-4" strokeWidth={3} /> Hadir
              </span>
            </span>
            <span className="mr-14 flex items-center gap-1">
              <MousePointer2Icon className="size-6 -scale-x-100 fill-sky-400 text-sky-400" />
              <span className="flex items-center gap-1.5 rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-sky-950 shadow-lg">
                <BellRingIcon className="size-4" /> Deadline H-1
              </span>
            </span>
            <span className="flex items-center gap-1">
              <MousePointer2Icon className="size-6 -scale-x-100 fill-white text-hero" />
              <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-neutral-900 shadow-lg">IPK naik!</span>
            </span>
          </div>
        </section>

        <section className="flex flex-col justify-center rounded-[2.25rem] bg-card p-6 shadow-xs ring-1 ring-black/[0.03] md:p-10 dark:ring-white/[0.06]">
          <h2 className="text-3xl font-extrabold tracking-tight">Masuk</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Selamat datang lagi. Lanjutkan dari terakhir kali kamu buka.</p>
          <form onSubmit={submit} className="mt-8 grid gap-4">
            {!online && (
              <p role="status" className="flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-200">
                <WifiOffIcon className="size-4 shrink-0" aria-hidden /> Kamu sedang offline. Login butuh koneksi.
              </p>
            )}
            <Field id="username" label="Username">
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field id="password" label="Password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <FormError error={login.error} />
            <Button type="submit" size="lg" className="mt-2 h-14 text-base" disabled={login.isPending || !username.trim() || !password}>
              {login.isPending ? 'Memeriksa...' : 'Masuk'}
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-muted-foreground">Aplikasi pribadi. Tidak ada pendaftaran publik.</p>
        </section>
      </div>
    </main>
  )
}
