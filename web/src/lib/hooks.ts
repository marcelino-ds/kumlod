import { onlineManager, useQuery } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { ApiError } from '@/api/client'
import { semestersQuery, settingsQuery } from '@/api/queries'

/** Current time, refreshed every intervalMs. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

/** App settings plus the time zone (falls back to Asia/Jakarta while loading). */
export function useAppSettings() {
  const q = useQuery(settingsQuery)
  return { ...q, timeZone: q.data?.timezone ?? DEFAULT_TIMEZONE }
}

/** The active semester (undefined while loading, null when there is none). */
export function useActiveSemester() {
  const q = useQuery(semestersQuery)
  const active = q.data ? (q.data.find((s) => s.is_active) ?? null) : undefined
  return { ...q, active }
}

/** Whether the browser reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  )
}

/** Returns value after it stopped changing for delayMs. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return v
}

/** Field errors from a failed mutation, keyed by JSON field path. */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fields : {}
}
