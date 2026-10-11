import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'

import { PwaUpdater } from '@/components/PwaUpdater'
import { Button } from '@/components/ui/button'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: NotFound,
})

function Root() {
  return (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
      <PwaUpdater />
    </>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p aria-hidden className="text-8xl leading-none font-extrabold tracking-tighter">
        4<span className="inline-block -rotate-6 rounded-full bg-brand px-3 text-brand-foreground">0</span>4
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-sm text-muted-foreground">Link ini mungkin salah atau datanya sudah dihapus.</p>
      <Button asChild size="lg">
        <Link to="/">Kembali ke Hari Ini</Link>
      </Button>
    </div>
  )
}
