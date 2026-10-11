import createClient, { type Middleware } from 'openapi-fetch'

import type { components, paths } from './schema'

export type Schemas = components['schemas']
export type Semester = Schemas['Semester']
export type Course = Schemas['Course']
export type CourseBrief = Schemas['CourseBrief']
export type Meeting = Schemas['Meeting']
export type Task = Schemas['Task']
export type TaskStatus = Schemas['TaskStatus']
export type Material = Schemas['Material']
export type Dashboard = Schemas['Dashboard']
export type Settings = Schemas['Settings']
export type GradeSummary = Schemas['GradeSummary']
export type GpaSummary = Schemas['GpaSummary']
export type AttendanceSummary = Schemas['AttendanceSummary']
export type AttendanceValue = NonNullable<Meeting['attendance']>

export const CSRF_HEADER = 'X-Requested-With'
export const CSRF_VALUE = 'kumlod'

/** An error returned by the API (or a network failure with status 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  get isNetwork() {
    return this.status === 0
  }
}

let onUnauthorized: (() => void) | null = null

/** Registers what happens when the session ends (clear caches, go to /login). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const kumlodMiddleware: Middleware = {
  onRequest({ request }) {
    request.headers.set(CSRF_HEADER, CSRF_VALUE)
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url, location.origin).pathname.startsWith('/api/auth/login')) {
      onUnauthorized?.()
    }
    return response
  },
}

export const client = createClient<paths>({ credentials: 'same-origin' })
client.use(kumlodMiddleware)

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string> } }

/** Awaits an openapi-fetch call and returns its data, throwing ApiError on failure. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let res: { data?: T; error?: unknown; response: Response }
  try {
    res = await call
  } catch {
    throw new ApiError(0, 'network', 'Tidak bisa terhubung ke server. Cek koneksi internet kamu.')
  }
  if (!res.response.ok) {
    const body = (res.error ?? {}) as ErrorBody
    throw new ApiError(
      res.response.status,
      body.error?.code ?? 'internal',
      body.error?.message ?? `Request gagal (${res.response.status})`,
      body.error?.fields ?? {},
    )
  }
  return res.data as T
}

/** Uploads a material file with progress reporting (fetch has no upload progress). */
export function uploadMaterial(
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<Material> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/materials/upload')
    xhr.withCredentials = true
    xhr.setRequestHeader(CSRF_HEADER, CSRF_VALUE)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Material)
        return
      }
      if (xhr.status === 401) onUnauthorized?.()
      const body = (xhr.response ?? {}) as ErrorBody
      reject(
        new ApiError(xhr.status, body.error?.code ?? 'internal', body.error?.message ?? `Upload gagal (${xhr.status})`, body.error?.fields ?? {}),
      )
    }
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Upload gagal. Cek koneksi internet kamu.'))
    xhr.send(form)
  })
}

/** URL of a stored file. */
export function fileUrl(fileId: string, download = false): string {
  return `/api/files/${encodeURIComponent(fileId)}${download ? '?download=true' : ''}`
}

/** Message for an unknown error value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Terjadi kesalahan'
}
