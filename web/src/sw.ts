/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

// App shell: every build asset is precached so Kumlod opens offline.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Control open pages right after activation, so the first visit already works
// offline. Updates still wait for the user's "Muat ulang" (SKIP_WAITING below).
clientsClaim()

// Client-side routes load index.html; the API is never served from the cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})

type PushPayload = { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() as PushPayload) ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const title = data.title || 'Kumlod'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: data.tag,
      data: { url: data.url && data.url.startsWith('/') ? data.url : '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data as { url?: string } | null)?.url ?? '/'
  const target = new URL(path, self.location.origin)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((c) => new URL(c.url).origin === target.origin)
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'navigate', url: target.pathname + target.search })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})

// Browsers may rotate a subscription; register the new one with the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null }
  e.waitUntil(
    (async () => {
      const sub =
        e.newSubscription ??
        (e.oldSubscription
          ? await self.registration.pushManager.subscribe(e.oldSubscription.options)
          : null)
      if (!sub) return
      const json = sub.toJSON()
      await fetch('/api/push/subscriptions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kumlod' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
    })(),
  )
})
