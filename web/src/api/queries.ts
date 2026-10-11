import { keepPreviousData, queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { clearPersistedCache } from '@/lib/persist'
import { unsubscribeDevice } from '@/lib/push'

import {
  client,
  unwrap,
  uploadMaterial,
  type AttendanceValue,
  type Dashboard,
  type Meeting,
  type Schemas,
  type Task,
  type TaskStatus,
} from './client'

export type TaskFilters = {
  semester_id?: string
  course_id?: string
  status?: TaskStatus[]
}

export type MaterialFilters = {
  semester_id?: string
  course_id?: string
  meeting_id?: string
  q?: string
}

export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  dashboard: ['dashboard'] as const,
  semesters: ['semesters'] as const,
  courses: (semesterId: string) => ['courses', semesterId] as const,
  course: (id: string) => ['course', id] as const,
  meetings: (courseId: string) => ['meetings', courseId] as const,
  grades: (courseId: string) => ['grades', courseId] as const,
  gpa: (target: number | null) => ['gpa', target] as const,
  tasks: (f: TaskFilters) => ['tasks', f] as const,
  task: (id: string) => ['task', id] as const,
  materials: (f: MaterialFilters) => ['materials', f] as const,
  pushKey: ['push-key'] as const,
}

// ---- Queries ----

export const meQuery = queryOptions({
  queryKey: qk.me,
  queryFn: () => unwrap(client.GET('/api/auth/me')),
  staleTime: 5 * 60_000,
})

export const settingsQuery = queryOptions({
  queryKey: qk.settings,
  queryFn: () => unwrap(client.GET('/api/settings')),
  staleTime: 5 * 60_000,
})

export const dashboardQuery = queryOptions({
  queryKey: qk.dashboard,
  queryFn: () => unwrap(client.GET('/api/dashboard')),
  refetchInterval: 5 * 60_000,
})

export const semestersQuery = queryOptions({
  queryKey: qk.semesters,
  queryFn: async () => (await unwrap(client.GET('/api/semesters'))).items,
})

export const coursesQuery = (semesterId: string) =>
  queryOptions({
    queryKey: qk.courses(semesterId),
    queryFn: async () =>
      (await unwrap(client.GET('/api/semesters/{semesterId}/courses', { params: { path: { semesterId } } }))).items,
    enabled: semesterId !== '',
  })

export const courseQuery = (courseId: string) =>
  queryOptions({
    queryKey: qk.course(courseId),
    queryFn: () => unwrap(client.GET('/api/courses/{courseId}', { params: { path: { courseId } } })),
  })

export const meetingsQuery = (courseId: string) =>
  queryOptions({
    queryKey: qk.meetings(courseId),
    queryFn: async () =>
      (await unwrap(client.GET('/api/courses/{courseId}/meetings', { params: { path: { courseId } } }))).items,
    enabled: courseId !== '',
  })

export const gradesQuery = (courseId: string) =>
  queryOptions({
    queryKey: qk.grades(courseId),
    queryFn: () => unwrap(client.GET('/api/courses/{courseId}/grades', { params: { path: { courseId } } })),
  })

export const gpaQuery = (target: number | null) =>
  queryOptions({
    queryKey: qk.gpa(target),
    queryFn: () =>
      unwrap(client.GET('/api/gpa', { params: { query: target === null ? {} : { target_ipk: target } } })),
    placeholderData: keepPreviousData,
  })

export const tasksQuery = (f: TaskFilters) =>
  queryOptions({
    queryKey: qk.tasks(f),
    queryFn: async () => (await unwrap(client.GET('/api/tasks', { params: { query: f } }))).items,
    placeholderData: keepPreviousData,
  })

export const taskQuery = (taskId: string) =>
  queryOptions({
    queryKey: qk.task(taskId),
    queryFn: () => unwrap(client.GET('/api/tasks/{taskId}', { params: { path: { taskId } } })),
  })

export const materialsQuery = (f: MaterialFilters) =>
  queryOptions({
    queryKey: qk.materials(f),
    queryFn: async () => (await unwrap(client.GET('/api/materials', { params: { query: f } }))).items,
    placeholderData: keepPreviousData,
  })

export const pushKeyQuery = queryOptions({
  queryKey: qk.pushKey,
  queryFn: async () => (await unwrap(client.GET('/api/push/public-key'))).public_key,
  staleTime: Infinity,
})

// ---- Invalidation ----

const keep = new Set(['me', 'settings', 'push-key', 'health'])

/** Marks every data query stale; active ones refetch. The data set is small. */
export function invalidateData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => !keep.has(String(q.queryKey[0])) })
}

function useInvalidatingMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, meta?: Record<string, unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => void invalidateData(qc), meta })
}

// ---- Attendance and task status (optimistic, retried when the connection drops) ----

export function useSetAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { meeting: Pick<Meeting, 'id' | 'course_id'>; status: AttendanceValue | null }) =>
      unwrap(
        client.PUT('/api/meetings/{meetingId}/attendance', {
          params: { path: { meetingId: v.meeting.id } },
          body: { status: v.status },
        }),
      ),
    onMutate: async ({ meeting, status }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: qk.dashboard }),
        qc.cancelQueries({ queryKey: qk.meetings(meeting.course_id) }),
      ])
      const prevDash = qc.getQueryData<Dashboard>(qk.dashboard)
      const prevMeetings = qc.getQueryData<Meeting[]>(qk.meetings(meeting.course_id))
      const patch = (m: Meeting): Meeting => (m.id === meeting.id ? { ...m, attendance: status } : m)
      if (prevDash) {
        qc.setQueryData<Dashboard>(qk.dashboard, {
          ...prevDash,
          today_meetings: prevDash.today_meetings.map((tm) => ({ ...tm, meeting: patch(tm.meeting) })),
        })
      }
      if (prevMeetings) qc.setQueryData<Meeting[]>(qk.meetings(meeting.course_id), prevMeetings.map(patch))
      return { prevDash, prevMeetings }
    },
    onError: (_err, { meeting }, ctx) => {
      if (ctx?.prevDash) qc.setQueryData(qk.dashboard, ctx.prevDash)
      if (ctx?.prevMeetings) qc.setQueryData(qk.meetings(meeting.course_id), ctx.prevMeetings)
    },
    onSettled: () => void invalidateData(qc),
  })
}

export function useSetTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) =>
      unwrap(client.PUT('/api/tasks/{taskId}/status', { params: { path: { taskId: v.id } }, body: { status: v.status } })),
    onMutate: async ({ id, status }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['tasks'] }),
        qc.cancelQueries({ queryKey: qk.dashboard }),
        qc.cancelQueries({ queryKey: qk.task(id) }),
      ])
      const patch = (t: Task): Task => (t.id === id ? { ...t, status } : t)
      const prevTasks = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      const prevDash = qc.getQueryData<Dashboard>(qk.dashboard)
      const prevTask = qc.getQueryData<Task>(qk.task(id))
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (list) => list?.map(patch))
      if (prevDash) {
        qc.setQueryData<Dashboard>(qk.dashboard, {
          ...prevDash,
          overdue_tasks: prevDash.overdue_tasks.map(patch),
          upcoming_tasks: prevDash.upcoming_tasks.map(patch),
        })
      }
      if (prevTask) qc.setQueryData<Task>(qk.task(id), patch(prevTask))
      return { prevTasks, prevDash, prevTask }
    },
    onError: (_err, { id }, ctx) => {
      ctx?.prevTasks.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.prevDash) qc.setQueryData(qk.dashboard, ctx.prevDash)
      if (ctx?.prevTask) qc.setQueryData(qk.task(id), ctx.prevTask)
    },
    onSettled: () => void invalidateData(qc),
  })
}

// ---- Auth ----

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['LoginRequest']) => unwrap(client.POST('/api/auth/login', { body })),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
    meta: { form: true },
  })
}

/** Logs out, stops push on this device, and wipes every local cache. */
export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        const endpoint = await unsubscribeDevice()
        if (endpoint) await unwrap(client.POST('/api/push/unsubscribe', { body: { endpoint } }))
      } catch {
        // Push cleanup is best effort.
      }
      await unwrap(client.POST('/api/auth/logout'))
    },
    onSettled: async () => {
      await qc.cancelQueries()
      qc.clear()
      await clearPersistedCache()
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: Schemas['ChangePasswordRequest']) => unwrap(client.PUT('/api/auth/password', { body })),
    meta: { form: true },
  })
}

// ---- Semesters ----

export const useCreateSemester = () =>
  useInvalidatingMutation((body: Schemas['SemesterCreate']) => unwrap(client.POST('/api/semesters', { body })), { form: true })

export const useUpdateSemester = () =>
  useInvalidatingMutation(
    ({ id, body }: { id: string; body: Schemas['SemesterUpdate'] }) =>
      unwrap(client.PUT('/api/semesters/{semesterId}', { params: { path: { semesterId: id } }, body })),
    { form: true },
  )

export const useActivateSemester = () =>
  useInvalidatingMutation((id: string) =>
    unwrap(client.POST('/api/semesters/{semesterId}/activate', { params: { path: { semesterId: id } } })),
  )

export const useDeleteSemester = () =>
  useInvalidatingMutation((id: string) =>
    unwrap(client.DELETE('/api/semesters/{semesterId}', { params: { path: { semesterId: id } } })),
  )

// ---- Courses, meetings, grades ----

export const useCreateCourse = () =>
  useInvalidatingMutation(
    ({ semesterId, body }: { semesterId: string; body: Schemas['CourseCreate'] }) =>
      unwrap(client.POST('/api/semesters/{semesterId}/courses', { params: { path: { semesterId } }, body })),
    { form: true },
  )

export const useUpdateCourse = () =>
  useInvalidatingMutation(
    ({ id, body }: { id: string; body: Schemas['CourseUpdate'] }) =>
      unwrap(client.PUT('/api/courses/{courseId}', { params: { path: { courseId: id } }, body })),
    { form: true },
  )

export const useDeleteCourse = () =>
  useInvalidatingMutation((id: string) =>
    unwrap(client.DELETE('/api/courses/{courseId}', { params: { path: { courseId: id } } })),
  )

export const useCreateMeeting = () =>
  useInvalidatingMutation(
    ({ courseId, body }: { courseId: string; body: Schemas['MeetingCreate'] }) =>
      unwrap(client.POST('/api/courses/{courseId}/meetings', { params: { path: { courseId } }, body })),
    { form: true },
  )

export const useGenerateMeetings = () =>
  useInvalidatingMutation((courseId: string) =>
    unwrap(client.POST('/api/courses/{courseId}/meetings/generate', { params: { path: { courseId } } })),
  )

export const useUpdateMeeting = () =>
  useInvalidatingMutation(
    ({ id, body }: { id: string; body: Schemas['MeetingUpdate'] }) =>
      unwrap(client.PUT('/api/meetings/{meetingId}', { params: { path: { meetingId: id } }, body })),
    { form: true },
  )

export const useDeleteMeeting = () =>
  useInvalidatingMutation((id: string) =>
    unwrap(client.DELETE('/api/meetings/{meetingId}', { params: { path: { meetingId: id } } })),
  )

export const useReplaceComponents = () =>
  useInvalidatingMutation(
    ({ courseId, components }: { courseId: string; components: Schemas['GradeComponentInput'][] }) =>
      unwrap(
        client.PUT('/api/courses/{courseId}/grades/components', {
          params: { path: { courseId } },
          body: { components },
        }),
      ),
    { form: true },
  )

// ---- Tasks ----

export const useCreateTask = () =>
  useInvalidatingMutation((body: Schemas['TaskCreate']) => unwrap(client.POST('/api/tasks', { body })), { form: true })

export const useUpdateTask = () =>
  useInvalidatingMutation(
    ({ id, body }: { id: string; body: Schemas['TaskUpdate'] }) =>
      unwrap(client.PUT('/api/tasks/{taskId}', { params: { path: { taskId: id } }, body })),
    { form: true },
  )

export const useDeleteTask = () =>
  useInvalidatingMutation((id: string) => unwrap(client.DELETE('/api/tasks/{taskId}', { params: { path: { taskId: id } } })))

// ---- Materials ----

export const useCreateMaterial = () =>
  useInvalidatingMutation((body: Schemas['MaterialCreate']) => unwrap(client.POST('/api/materials', { body })), { form: true })

export const useUpdateMaterial = () =>
  useInvalidatingMutation(
    ({ id, body }: { id: string; body: Schemas['MaterialUpdate'] }) =>
      unwrap(client.PUT('/api/materials/{materialId}', { params: { path: { materialId: id } }, body })),
    { form: true },
  )

export const useDeleteMaterial = () =>
  useInvalidatingMutation((id: string) =>
    unwrap(client.DELETE('/api/materials/{materialId}', { params: { path: { materialId: id } } })),
  )

export const useUploadMaterial = () =>
  useInvalidatingMutation(
    ({ form, onProgress }: { form: FormData; onProgress?: (f: number) => void }) => uploadMaterial(form, onProgress),
    { form: true },
  )

// ---- Settings and push ----

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['SettingsUpdate']) => unwrap(client.PUT('/api/settings', { body })),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s)
      void invalidateData(qc)
    },
    meta: { form: true },
  })
}

export const useSubscribePush = () =>
  useMutation({
    mutationFn: (body: Schemas['PushSubscriptionInput']) => unwrap(client.POST('/api/push/subscriptions', { body })),
  })

export const useUnsubscribePush = () =>
  useMutation({
    mutationFn: (endpoint: string) => unwrap(client.POST('/api/push/unsubscribe', { body: { endpoint } })),
  })

export const useTestPush = () => useMutation({ mutationFn: () => unwrap(client.POST('/api/push/test')) })
