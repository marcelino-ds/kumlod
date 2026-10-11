import { clsx, type ClassValue } from 'clsx'
import type { CSSProperties } from 'react'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sets --c so the tint-* classes in index.css pick up a course color. */
export function courseStyle(color: string | undefined | null): CSSProperties {
  return { '--c': color || '#64748b' } as CSSProperties
}

/** Formats a byte count as KB or MB with Indonesian decimals. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toLocaleString('id-ID', { maximumFractionDigits: 0 })} KB`
  return `${(kb / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
}

/** Formats a score or GPA with up to 2 decimals using a comma separator. */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('id-ID', { maximumFractionDigits: digits })
}
