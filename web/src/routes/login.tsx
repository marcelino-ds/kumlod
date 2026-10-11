import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { LockIcon, UserIcon, WifiOffIcon } from 'lucide-react'
import { useState } from 'react'

import { qk, useLogin } from '@/api/queries'
import { Brand, FormError } from '@/components/common'
import { LoginIllustration } from '@/components/LoginIllustration'
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

/** Filled input with a leading icon, as in the login design. */
const inputClass = 'h-12 border-transparent bg-muted pl-11 shadow-none focus-visible:bg-card'
const iconClass = 'pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground'

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
    <main className="flex min-h-dvh items-center justify-center p-3 md:p-8">
      <div className="grid w-full max-w-4xl rounded-[2rem] bg-card p-2 shadow-xl shadow-black/[0.04] ring-1 ring-black/[0.04] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] dark:bg-[oklch(0.22_0.005_95)] dark:shadow-black/40 dark:ring-white/10">
        <div className="hidden min-h-[34rem] flex-col rounded-[1.6rem] bg-muted p-6 md:flex dark:bg-[oklch(0.27_0.006_95)]">
          <img src="/logo.svg" alt="" className="size-9 rounded-[0.7rem]" />
          <div className="flex flex-1 items-center justify-center px-2 pb-6">
            <LoginIllustration className="max-w-[19rem]" />
          </div>
        </div>

        <div className="flex flex-col justify-center px-5 py-10 md:px-12">
          <div className="mx-auto w-full max-w-xs">
            <Brand className="mb-10 md:hidden" />
            <h1 className="text-4xl font-extrabold tracking-tight">Masuk</h1>

            <form onSubmit={submit} className="mt-8 grid gap-3">
              {!online && (
                <p role="status" className="flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-200">
                  <WifiOffIcon className="size-4 shrink-0" aria-hidden /> Kamu sedang offline.
                </p>
              )}
              <div className="relative">
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <UserIcon className={iconClass} aria-hidden />
                <Input
                  id="username"
                  placeholder="Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  className={inputClass}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <LockIcon className={iconClass} aria-hidden />
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <FormError error={login.error} />
              <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base" disabled={login.isPending || !username.trim() || !password}>
                {login.isPending ? 'Memeriksa...' : 'Masuk'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
