import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'

import { ApiError, setUnauthorizedHandler } from './api/client'
import { clearPersistedCache, PERSIST_MAX_AGE, persister } from './lib/persist'
import { routeTree } from './routeTree.gen'

import '@fontsource-variable/plus-jakarta-sans'
import './index.css'

// TanStack Query v5 assumes it starts online and only listens for changes.
// Start from the browser's state so an app opened without signal pauses
// requests (and queues attendance) instead of failing them.
onlineManager.setOnline(navigator.onLine)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: PERSIST_MAX_AGE,
      staleTime: 30_000,
      // Client errors will not fix themselves; network and server errors may.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: {
      // Retry when the signal drops; mutations pause while offline and resume after.
      retry: (count, err) => err instanceof ApiError && err.isNetwork && count < 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (err instanceof ApiError && err.status === 401) return
      if (mutation.meta?.form) return // forms show their own errors
      toast.error(err.message)
    },
  }),
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { form?: boolean }
  }
}

let redirecting = false
setUnauthorizedHandler(() => {
  if (redirecting || router.state.location.pathname === '/login') return
  redirecting = true
  const current = router.state.location.href
  void queryClient.cancelQueries()
  queryClient.clear()
  void clearPersistedCache()
  void router.navigate({ to: '/login', search: { redirect: current } }).finally(() => {
    redirecting = false
  })
})

const [, restored] = persistQueryClient({
  queryClient,
  persister,
  maxAge: PERSIST_MAX_AGE,
  buster: 'kumlod-1',
  dehydrateOptions: {
    // The offline queue lives only while the app is open (Phase 1).
    shouldDehydrateMutation: () => false,
    shouldDehydrateQuery: (q) => q.state.status === 'success',
  },
})

void restored.finally(() => {
  // Restored data shows instantly but is refetched on first use, even when it
  // looks fresh: it may predate changes made just before the last reload.
  void queryClient.invalidateQueries({ refetchType: 'none' })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
