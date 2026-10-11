import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Offers a reload when a new version is ready and follows notification clicks. */
export function PwaUpdater() {
  const router = useRouter()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('Versi baru Kumlod tersedia', {
      id: 'pwa-update',
      duration: Infinity,
      action: { label: 'Muat ulang', onClick: () => void updateServiceWorker(true) },
      onDismiss: () => setNeedRefresh(false),
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null
      if (data?.type === 'navigate' && typeof data.url === 'string' && data.url.startsWith('/')) {
        router.history.push(data.url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}
