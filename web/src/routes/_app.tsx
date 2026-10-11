import { onlineManager, useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { meQuery, qk } from '@/api/queries'
import { AppShell } from '@/components/AppShell'
import { QuickAddProvider } from '@/components/QuickAddTask'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const qc = context.queryClient
    // A cached user (also restored from IndexedDB) lets the app open offline.
    if (qc.getQueryData(qk.me)) return
    if (!onlineManager.isOnline()) throw redirect({ to: '/login', search: { redirect: location.href } })
    try {
      await qc.fetchQuery(meQuery)
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AppLayout,
})

function AppLayout() {
  // Keeps the session check fresh; a 401 anywhere sends the user to /login.
  useQuery(meQuery)
  return (
    <QuickAddProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </QuickAddProvider>
  )
}
